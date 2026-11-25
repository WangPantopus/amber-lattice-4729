/**
 * Admin Report Review Queue
 *
 * People who report someone, a post or a task are told "We will review it shortly". This is where a platform
 * admin sees those reports and marks each one resolved (acted on) or dismissed (no violation).
 * Mount at: app.use('/api/admin/reports', require('./routes/adminReports'));
 *
 * Endpoints:
 *   GET  /?status=pending            — Reports of people, posts, replies, tasks and neighbor messages, newest first
 *   POST /:kind/:reportId/resolve    — { outcome: 'resolved' | 'dismissed' }
 *   POST /post/:reportId/remove      — take the reported post down, then close its open reports
 *   POST /reply/:reportId/remove     — take the reported reply down, then close its open reports
 *   POST /post|reply/:reportId/writer — who wrote a made-up-name post or reply ({ reason }, logged)
 *   GET  /user/:reportId/card        — the one Christmas card a "Report this card" shares (logged per opening)
 *   GET  /user/:reportId/card/media/:fileId — that card's own photo or voice
 *
 * A reply's report is a PostReport row with the reply's comment_id (and its post's post_id): it is listed as kind
 * 'reply', never as a report on its post.
 *
 * Direct-message reports arrive as reports of the person (UserReport). A neighbor-message report is a flag on
 * the message itself (NeighborMessage.reported_at, free-text report_reason) with no review status, so it is
 * listed while pending but cannot be closed here yet.
 */

const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const verifyToken = require('../middleware/verifyToken');
const { requireAdmin } = require('../middleware/verifyToken');
const penName = require('../services/penName');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');
const cardReports = require('../services/cardReports');
const cardMedia = require('../services/holidayCardMedia');

// All routes require auth + admin role
router.use(verifyToken, requireAdmin);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['pending', 'reviewed', 'resolved', 'dismissed']);
const OUTCOMES = new Set(['resolved', 'dismissed']);
const REPORT_COLUMNS = 'id, reported_by, reason, details, status, created_at, resolved_at';

// Listing reports stay out while Marketplace is not part of the launch.
// `only` narrows a table shared by two kinds: a post's own reports have no comment_id, a reply's have one.
const KINDS = {
  user: { table: 'UserReport', target: 'reported_user_id' },
  post: { table: 'PostReport', target: 'post_id', only: (q) => q.is('comment_id', null) },
  reply: { table: 'PostReport', target: 'comment_id', only: (q) => q.not('comment_id', 'is', null) },
  gig: { table: 'GigReport', target: 'gig_id' },
};
const scoped = (spec, query) => (spec.only ? spec.only(query) : query);

const excerpt = (text) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
};

async function usersById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabaseAdmin
    .from('User')
    .select('id, username, name, first_name')
    .in('id', unique);
  return Object.fromEntries((data || []).map((u) => [u.id, {
    id: u.id,
    username: u.username || null,
    name: u.name || u.first_name || null,
  }]));
}

// A reported Moment as the reviewer needs it: its kind, words and state, and short links to its picture (Moments live
// in private storage, services/moments/momentMedia.js).
async function momentsForReview(posts) {
  const moments = posts.filter((p) => p.is_story);
  if (!moments.length) return new Map();
  const { meta, momentState } = require('../services/moments/momentStore');
  const { signedLinks } = require('../services/moments/momentMedia');
  const links = await signedLinks(undefined, moments.flatMap((p) => {
    const stored = meta(p).media;
    return stored ? [stored.key, stored.poster_key].filter(Boolean) : [];
  }));
  return new Map(moments.map((p) => {
    const m = meta(p);
    return [p.id, {
      kind: m.kind || null,
      state: momentState(p),
      moderation_state: p.moderation_state,
      expires_at: p.story_expires_at,
      media_url: m.media?.key ? links.get(m.media.key) || null : null,
      poster_url: m.media?.poster_key ? links.get(m.media.poster_key) || null : null,
      check: m.check || null,
    }];
  }));
}

async function targetsFor(kind, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  if (kind === 'post') {
    const { data } = await supabaseAdmin
      .from('Post')
      .select('id, user_id, title, content, post_type, archived_at, archive_reason, created_at, is_story, story_expires_at, moderation_state, post_metadata, identity_context_type, identity_context_id')
      .in('id', unique);
    // A post under a made-up name shows the name, not its writer: who wrote it is a separate, logged look
    // (POST /post/:reportId/writer).
    const penNames = await penName.names.rowsById((data || []).filter(penName.isPenNameRow).map((p) => p.identity_context_id));
    const [authors, moments] = await Promise.all([
      usersById((data || []).map((p) => p.user_id)),
      momentsForReview(data || []).catch((err) => {
        logger.warn('Admin reports: Moment links failed', { error: err.message });
        return new Map();
      }),
    ]);
    return Object.fromEntries((data || []).map((p) => [p.id, {
      id: p.id,
      title: p.title || null,
      excerpt: excerpt(p.content),
      post_type: p.post_type || null,
      archived: Boolean(p.archived_at),
      author: penName.isPenNameRow(p) ? null : authors[p.user_id] || null,
      ...(penName.isPenNameRow(p)
        ? { made_up_name: penNames.get(String(p.identity_context_id))?.display_name || penName.present.UNKNOWN_NAME } : {}),
      ...(moments.has(p.id) ? { moment: moments.get(p.id) } : {}),
    }]));
  }
  if (kind === 'reply') {
    const { data } = await supabaseAdmin
      .from('PostComment')
      .select('id, post_id, user_id, comment, is_deleted, moderation_state, created_at, identity_context_type, identity_context_id')
      .in('id', unique);
    const replies = data || [];
    // The reply's words and its post; a reply under a made-up name shows the name, never its writer (the logged look
    // is POST /reply/:reportId/writer).
    const [{ data: posts }, authors, penNames] = await Promise.all([
      supabaseAdmin.from('Post').select('id, title, content, archived_at').in('id', [...new Set(replies.map((r) => r.post_id))]),
      usersById(replies.filter((r) => !penName.isPenNameRow(r)).map((r) => r.user_id)),
      penName.names.rowsById(replies.filter(penName.isPenNameRow).map((r) => r.identity_context_id)),
    ]);
    const postsById = new Map((posts || []).map((p) => [p.id, p]));
    return Object.fromEntries(replies.map((r) => {
      const post = postsById.get(r.post_id);
      return [r.id, {
        id: r.id,
        excerpt: excerpt(r.comment),
        deleted: Boolean(r.is_deleted),
        moderation_state: r.moderation_state,
        author: penName.isPenNameRow(r) ? null : authors[r.user_id] || null,
        ...(penName.isPenNameRow(r)
          ? { made_up_name: penNames.get(String(r.identity_context_id))?.display_name || penName.present.UNKNOWN_NAME } : {}),
        post: post ? { id: post.id, title: post.title || null, excerpt: excerpt(post.content), archived: Boolean(post.archived_at) }
          : { id: r.post_id, title: null, excerpt: '', archived: false, missing: true },
      }];
    }));
  }
  if (kind === 'gig') {
    const { data } = await supabaseAdmin
      .from('Gig')
      .select('id, user_id, title, status, created_at')
      .in('id', unique);
    const posters = await usersById((data || []).map((g) => g.user_id));
    return Object.fromEntries((data || []).map((g) => [g.id, {
      id: g.id,
      title: g.title || null,
      status: g.status || null,
      poster: posters[g.user_id] || null,
    }]));
  }
  return usersById(unique);
}


// Neighbor messages flagged by their recipient. The recipient is the reporter; the sender is reported.
async function reportedNeighborMessages(limit) {
  const { data, error, count } = await supabaseAdmin
    .from('NeighborMessage')
    .select('id, sender_user_id, recipient_user_id, category, body, report_reason, reported_at', { count: 'exact' })
    .not('reported_at', 'is', null)
    .order('reported_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`NeighborMessage: ${error.message}`);
  const rows = data || [];
  const people = await usersById(rows.flatMap((m) => [m.sender_user_id, m.recipient_user_id]));
  return {
    kind: 'message',
    count: count || 0,
    reports: rows.map((m) => ({
      kind: 'message',
      id: m.id,
      reason: 'other',
      details: m.report_reason || null,
      status: 'pending',
      created_at: m.reported_at,
      resolved_at: null,
      target_id: m.id,
      target: { id: m.id, title: m.category || null, excerpt: excerpt(m.body), author: people[m.sender_user_id] || null },
      reporter: people[m.recipient_user_id] || null,
      closable: false,
    })),
  };
}

// ============================================================
// GET / — Reports awaiting review (or in another status)
// ============================================================

router.get('/', async (req, res) => {
  try {
    const status = String(req.query.status || 'pending');
    if (!STATUSES.has(status)) {
      return res.status(400).json({ error: `status must be one of ${[...STATUSES].join(', ')}` });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const lists = await Promise.all(Object.entries(KINDS).map(async ([kind, { table, target }]) => {
      const { data, error, count } = await scoped(KINDS[kind], supabaseAdmin
        .from(table)
        .select(`${REPORT_COLUMNS}, ${target}`, { count: 'exact' })
        .eq('status', status))
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw Object.assign(new Error(`${table}: ${error.message}`), { kind });
      const rows = data || [];
      const [targets, reporters, shared] = await Promise.all([
        targetsFor(kind, rows.map((r) => r[target])),
        usersById(rows.map((r) => r.reported_by)),
        // "Report this card": the report shares one card, opened through GET /user/:reportId/card.
        kind === 'user' ? cardReports.sharedCards(rows) : new Map(),
      ]);
      return {
        kind,
        count: count || 0,
        reports: rows.map((r) => ({
          kind,
          id: r.id,
          reason: r.reason,
          details: r.details || null,
          status: r.status,
          created_at: r.created_at,
          resolved_at: r.resolved_at || null,
          target_id: r[target],
          target: targets[r[target]] || null,
          reporter: reporters[r.reported_by] || null,
          closable: true,
          ...(shared.has(r.id) ? { shared_card: shared.get(r.id) } : {}),
        })),
      };
    }));

    if (status === 'pending') lists.push(await reportedNeighborMessages(limit));

    const reports = lists
      .flatMap((l) => l.reports)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit);
    const counts = Object.fromEntries(lists.map((l) => [l.kind, l.count]));

    res.json({ status, reports, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
  } catch (err) {
    logger.error('Admin reports list error', { error: err.message });
    res.status(500).json({ error: 'Failed to load reports' });
  }
});


// ============================================================
// POST /:kind/:reportId/resolve — Close a report
// ============================================================

router.post('/:kind/:reportId/resolve', async (req, res) => {
  try {
    const { kind, reportId } = req.params;
    if (kind === 'message') {
      return res.status(409).json({ error: 'Reports on messages between homes cannot be closed here yet' });
    }
    const spec = KINDS[kind];
    if (!spec) return res.status(404).json({ error: 'Unknown report kind' });
    if (!UUID_REGEX.test(reportId)) return res.status(400).json({ error: 'Invalid report id' });
    const outcome = String((req.body && req.body.outcome) || '');
    if (!OUTCOMES.has(outcome)) {
      return res.status(400).json({ error: 'outcome must be resolved or dismissed' });
    }

    // Only an open report closes; a second click on a closed one changes nothing.
    const { data: closed, error } = await scoped(spec, supabaseAdmin
      .from(spec.table)
      .update({ status: outcome, resolved_at: new Date().toISOString() })
      .eq('id', reportId)
      .in('status', ['pending', 'reviewed']))
      .select(REPORT_COLUMNS)
      .maybeSingle();
    if (error) {
      logger.error('Admin report resolve error', { kind, reportId, error: error.message });
      return res.status(500).json({ error: 'Failed to update the report' });
    }
    if (!closed) {
      const { data: current } = await scoped(spec, supabaseAdmin
        .from(spec.table)
        .select('id, status, resolved_at')
        .eq('id', reportId))
        .maybeSingle();
      if (!current) return res.status(404).json({ error: 'Report not found' });
      return res.status(409).json({ error: `Report is already ${current.status}`, report: current });
    }

    logger.info('admin.report_closed', { kind, report_id: reportId, outcome, admin_id: req.user.id });
    // A Moment held for review (two reports, or the picture check) is live again once its reports are all closed.
    if (kind === 'post') {
      const { data: target } = await supabaseAdmin.from('PostReport').select('post_id').eq('id', reportId).maybeSingle();
      if (target?.post_id) {
        await require('../services/moments/momentStore').releaseIfReviewed(target.post_id).catch((err) => {
          logger.warn('Admin reports: Moment release failed', { reportId, error: err.message });
        });
      }
    }
    // A made-up-name reply hidden by two reports shows again once its reports were all dismissed.
    if (kind === 'reply') {
      const { data: target } = await supabaseAdmin.from('PostReport').select('comment_id').eq('id', reportId).maybeSingle();
      if (target?.comment_id) {
        await penName.standing.releaseReplyIfReviewed(target.comment_id).catch((err) => {
          logger.warn('Admin reports: reply release failed', { reportId, error: err.message });
        });
      }
    }
    res.json({ report: { kind, ...closed } });
  } catch (err) {
    logger.error('Admin report resolve error', { error: err.message });
    res.status(500).json({ error: 'Failed to update the report' });
  }
});

/**
 * Remove a reported post: it is archived with reason 'moderation', which
 * canViewPost and every feed already honour (only its author still sees it,
 * and the author can't restore it), and every open report on that post is
 * closed as resolved. Repeating it changes nothing.
 */
// Who wrote a reported made-up-name post: { reason } is required and the look is written to "IdentityAuditLog" before
// the answer is given (penName/standing.js). A post under the person's own name already shows its author in the list.
// The same for a reply: POST /reply/:reportId/writer.
const WRITER_LOOK = {
  post: { kind: 'post', column: 'post_id', notMadeUp: 'This post was not written under a made-up name.' },
  reply: { kind: 'comment', column: 'comment_id', notMadeUp: 'This reply was not written under a made-up name.' },
};
const writerLook = (kind) => async (req, res) => {
  try {
    const { reportId } = req.params;
    const spec = KINDS[kind];
    const look = WRITER_LOOK[kind];
    if (!UUID_REGEX.test(reportId)) return res.status(400).json({ error: 'Invalid report id' });
    const { data: report, error } = await scoped(spec, supabaseAdmin.from('PostReport').select('post_id, comment_id')
      .eq('id', reportId)).maybeSingle();
    if (error) throw error;
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const writerId = await penName.standing.staffLook({ req, kind: look.kind, contentId: report[look.column], reason: req.body?.reason });
    if (!writerId) return res.status(404).json({ error: look.notMadeUp });
    return res.json({ writer: (await usersById([writerId]))[writerId] || { id: writerId } });
  } catch (err) {
    if (err.status && err.code) return res.status(err.status).json({ error: err.message, code: err.code });
    logger.error('Admin made-up name writer look failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to look up the writer' });
  }
};
router.post('/post/:reportId/writer', writerLook('post'));
router.post('/reply/:reportId/writer', writerLook('reply'));

router.post('/post/:reportId/remove', async (req, res) => {
  try {
    const { reportId } = req.params;
    if (!UUID_REGEX.test(reportId)) return res.status(400).json({ error: 'Invalid report id' });

    // A reply's report (comment_id) never takes its post down: that is POST /reply/:reportId/remove.
    const { data: report, error: reportError } = await supabaseAdmin
      .from('PostReport')
      .select('id, post_id, status')
      .eq('id', reportId)
      .is('comment_id', null)
      .maybeSingle();
    if (reportError) {
      logger.error('Admin post removal: report lookup failed', { reportId, error: reportError.message });
      return res.status(500).json({ error: 'Failed to remove the post' });
    }
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const now = new Date().toISOString();
    const { data: post, error: postError } = await supabaseAdmin
      .from('Post')
      .select('id, user_id, archive_reason, is_story, identity_context_type')
      .eq('id', report.post_id)
      .maybeSingle();
    if (postError) {
      logger.error('Admin post removal: post lookup failed', { reportId, error: postError.message });
      return res.status(500).json({ error: 'Failed to remove the post' });
    }
    if (post && post.archive_reason !== 'moderation') {
      const { error: removeError } = await supabaseAdmin
        .from('Post')
        .update({ archived_at: now, archive_reason: 'moderation', updated_at: now })
        .eq('id', post.id);
      if (removeError) {
        logger.error('Admin post removal failed', { reportId, postId: post.id, error: removeError.message });
        return res.status(500).json({ error: 'Failed to remove the post' });
      }
      // The author still sees the post, so without this they'd never learn neighbors can't.
      // Neither the reporter nor the moderator is named. The apps sort notices by words in the
      // type, and one with "post" in it would show as a Reply; this one lands under System.
      // A Moment has no post page to open, so its notice links nowhere.
      notificationService.createNotification({
        userId: post.user_id,
        type: 'content_removed',
        title: post.is_story ? 'Your Moment was removed' : 'Your post was removed',
        body: 'A Pantopus moderator removed it after a report. Others can no longer see it.',
        icon: '🛡️',
        link: post.is_story ? null : `/posts/${post.id}`,
        metadata: { post_id: post.id },
        idempotencyKey: `post-removed:${post.id}`,
      }).catch((err) => {
        logger.warn('Post removal notification failed (non-blocking)', { postId: post.id, error: err.message });
      });
    }

    const { data: closed, error: closeError } = await supabaseAdmin
      .from('PostReport')
      .update({ status: 'resolved', resolved_at: now })
      .eq('post_id', report.post_id)
      .is('comment_id', null)
      .in('status', ['pending', 'reviewed'])
      .select('id');
    if (closeError) {
      logger.error('Admin post removal: closing reports failed', { reportId, error: closeError.message });
      return res.status(500).json({ error: 'The post was removed, but its reports could not be closed' });
    }

    // A removed made-up-name post is a strike on the account behind it: a warning, then no made-up name for 30 days;
    // `severe: true` in the body takes the made-up name away for good (penName/standing.js).
    let madeUpName = null;
    if (post && post.archive_reason !== 'moderation' && penName.isPenNameRow(post)) {
      madeUpName = await penName.standing.recordRemoval({ postId: post.id, severe: req.body?.severe === true })
        .catch((err) => { logger.error('Admin post removal: made-up name strike failed', { postId: post.id, error: err.message }); return null; });
    }

    logger.info('admin.post_removed', {
      report_id: reportId, post_id: report.post_id, post_found: Boolean(post),
      reports_closed: (closed || []).length, admin_id: req.user.id,
    });
    res.json({ removed: Boolean(post), post_id: report.post_id, reports_closed: (closed || []).length,
      ...(madeUpName ? { made_up_name_penalty: madeUpName } : {}) });
  } catch (err) {
    logger.error('Admin post removal error', { error: err.message });
    res.status(500).json({ error: 'Failed to remove the post' });
  }
});

/**
 * Remove a reported reply: moderation_state 'removed', which every reply list already honours (only its writer still
 * sees it, services/pulse/readAccess.js canReadReply), and every open report on that reply is closed as resolved. The
 * writer is told; a reply under a made-up name is stored under the system account, and the notice reaches its real
 * writer by the reply's id (penName/notices.js reads `comment_id` on a `comment_…` notice). A removed made-up-name
 * reply is the same strike as a post (`severe: true` for good). Repeating it changes nothing.
 */
router.post('/reply/:reportId/remove', async (req, res) => {
  try {
    const { reportId } = req.params;
    if (!UUID_REGEX.test(reportId)) return res.status(400).json({ error: 'Invalid report id' });

    const { data: report, error: reportError } = await supabaseAdmin
      .from('PostReport')
      .select('id, post_id, comment_id, status')
      .eq('id', reportId)
      .not('comment_id', 'is', null)
      .maybeSingle();
    if (reportError) {
      logger.error('Admin reply removal: report lookup failed', { reportId, error: reportError.message });
      return res.status(500).json({ error: 'Failed to remove the reply' });
    }
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const { data: reply, error: replyError } = await supabaseAdmin
      .from('PostComment')
      .select('id, post_id, user_id, is_deleted, moderation_state, identity_context_type')
      .eq('id', report.comment_id)
      .maybeSingle();
    if (replyError) {
      logger.error('Admin reply removal: reply lookup failed', { reportId, error: replyError.message });
      return res.status(500).json({ error: 'Failed to remove the reply' });
    }

    // Only the request that changed the state tells the writer and records a strike.
    let removedNow = false;
    if (reply && reply.moderation_state !== 'removed') {
      const { data: changed, error: removeError } = await supabaseAdmin
        .from('PostComment')
        .update({ moderation_state: 'removed', moderation_rule: 'report_removed' })
        .eq('id', reply.id)
        .neq('moderation_state', 'removed')
        .select('id');
      if (removeError) {
        logger.error('Admin reply removal failed', { reportId, commentId: reply.id, error: removeError.message });
        return res.status(500).json({ error: 'Failed to remove the reply' });
      }
      removedNow = Boolean(changed?.length);
    }
    if (removedNow && reply.user_id && !reply.is_deleted) {
      // The writer still sees the reply, so without this they'd never learn others can't. Neither the reporter nor
      // the moderator is named. The type has no "post" or "reply" in it, so the apps file it under System.
      notificationService.createNotification({
        userId: reply.user_id,
        type: 'comment_removed',
        title: 'Your reply was removed',
        body: 'A Pantopus moderator removed it after a report. Others can no longer see it.',
        icon: '🛡️',
        link: `/posts/${reply.post_id}`,
        metadata: { comment_id: reply.id, post_id: reply.post_id },
        idempotencyKey: `reply-removed:${reply.id}`,
      }).catch((err) => {
        logger.warn('Reply removal notification failed (non-blocking)', { commentId: reply.id, error: err.message });
      });
    }

    const now = new Date().toISOString();
    const { data: closed, error: closeError } = await supabaseAdmin
      .from('PostReport')
      .update({ status: 'resolved', resolved_at: now })
      .eq('comment_id', report.comment_id)
      .in('status', ['pending', 'reviewed'])
      .select('id');
    if (closeError) {
      logger.error('Admin reply removal: closing reports failed', { reportId, error: closeError.message });
      return res.status(500).json({ error: 'The reply was removed, but its reports could not be closed' });
    }

    let madeUpName = null;
    if (removedNow && penName.isPenNameRow(reply)) {
      madeUpName = await penName.standing.recordRemoval({ kind: 'comment', contentId: reply.id, severe: req.body?.severe === true })
        .catch((err) => { logger.error('Admin reply removal: made-up name strike failed', { commentId: reply.id, error: err.message }); return null; });
    }

    logger.info('admin.reply_removed', {
      report_id: reportId, comment_id: report.comment_id, reply_found: Boolean(reply),
      reports_closed: (closed || []).length, admin_id: req.user.id,
    });
    res.json({ removed: Boolean(reply), comment_id: report.comment_id, post_id: report.post_id,
      reports_closed: (closed || []).length, ...(madeUpName ? { made_up_name_penalty: madeUpName } : {}) });
  } catch (err) {
    logger.error('Admin reply removal error', { error: err.message });
    res.status(500).json({ error: 'Failed to remove the reply' });
  }
});

// ============================================================
// "Report this card" (memories contract section 9): the one card a report shares
// ============================================================

const cardNotShared = (res) => res.status(404).json({ error: 'This report doesn’t share a card.', code: 'REPORT_CARD_NOT_FOUND' });

/**
 * GET /user/:reportId/card — the card (or reply) this report shares, and nothing else: its picture, note, signature,
 * photo and voice, both names and its dates ({ report, card }). Each opening is written to MailEvent
 * (admin_opened_reported_card, with the admin's id and the report's); an opening that can't be logged doesn't happen.
 */
router.get('/user/:reportId/card', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const { reportId } = req.params;
    if (!UUID_REGEX.test(reportId)) return cardNotShared(res);
    const found = await cardReports.reportedPiece(reportId);
    if (!found) return cardNotShared(res);
    await cardReports.logOpening({ adminId: req.user.id, reportId, mailId: found.mail.id });
    logger.info('admin.reported_card_opened', { report_id: reportId, mail_id: found.mail.id, admin_id: req.user.id });
    const { report } = found;
    return res.json({
      report: { id: report.id, reason: report.reason, details: report.details || null, status: report.status, created_at: report.created_at },
      card: await cardReports.reviewPage(found.mail),
    });
  } catch (err) {
    logger.error('Admin reported card error', { error: err.message });
    return res.status(503).json({ error: 'Couldn’t open the card just now. Try again in a moment.' });
  }
});

/** GET /user/:reportId/card/media/:fileId — the shared card's own photo or voice (bytes, private, no-store). */
router.get('/user/:reportId/card/media/:fileId', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const { reportId } = req.params;
    if (!UUID_REGEX.test(reportId)) return cardNotShared(res);
    const found = await cardReports.reportedPiece(reportId);
    const file = found ? await cardMedia.boundFile(req.params.fileId, found.mail.id) : null;
    return file ? await cardMedia.send(req, res, file) : cardMedia.notFound(res);
  } catch (err) {
    logger.error('Admin reported card media error', { error: err.message });
    if (!res.headersSent) return res.status(503).json({ error: 'Couldn’t open it just now. Try again in a moment.' });
    return undefined;
  }
});

module.exports = router;
