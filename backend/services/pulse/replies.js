'use strict';

// Pulse, reinvented, phase 3: replies people can see on a Moment (coord CONTRACT 8a; founder's decision 3). On a Friends
// Moment they show under it; on a Nearby Moment only if its author chose so for that Moment; never on a made-up-name
// Moment. They are kept as Pulse replies are (PostComment on the Moment's own row) and use Pulse's report flow
// (postReportService) and remove (is_deleted). Today's reply routes never open a Moment (readAccess.canReadPost refuses
// every Moment row), so nothing of today's shows them. Today's private reply to chat stays as it is.

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const postReportService = require('../postReportService');

const PAGE = 30;
const MAX_TEXT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Required when used: momentStore requires this file for its answers.
// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const play = () => require('./play');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * Whether a Moment would show its replies by its own settings: never under a made-up name; else its author's choice, or
 * Friends by default. `shownNow` adds the author's switch.
 */
function shownOn(row) {
  const store = momentStore();
  // eslint-disable-next-line global-require
  if (require('../penName').isPenNameRow(row)) return false;
  const chosen = store.meta(row).replies_shown;
  return typeof chosen === 'boolean' ? chosen : row.audience === 'connections';
}

/**
 * Whether a Moment shows its replies now (LEAD-3, 05:09): only while the switch is on for its author too, so nobody
 * writes where the author can neither see nor remove it. The switch read is cached per person. Turned off, the replies
 * stay stored and hidden.
 */
async function shownNow(row) {
  return shownOn(row) && momentStore().reinventedOn(row.user_id);
}

/** The choice to keep when a Moment is posted (`replies_shown` in the body), or nothing to keep. */
function choiceAtPosting(value, { penName }) {
  if (penName || typeof value !== 'boolean') return {};
  return { replies_shown: value };
}

/** Live replies on these Moments that this reader may see, counted by Moment id; one read for the page. */
async function countsFor(rows, viewerId) {
  const showing = await Promise.all(rows.map((row) => shownNow(row)));
  const shown = rows.filter((_, index) => showing[index]);
  const counts = new Map(shown.map((row) => [row.id, { shown: true, count: 0, pins: 0 }]));
  if (!shown.length) return counts;
  const ids = shown.map((row) => row.id);
  const [{ data, error }, pinRows, hidden] = await Promise.all([
    supabaseAdmin.from('PostComment').select('id, post_id, user_id').in('post_id', ids)
      .eq('is_deleted', false).eq('moderation_state', 'live').limit(5000),
    // Pins (CONTRACT 8b) are replies too: which of these replies are pins, read alongside.
    supabaseAdmin.from('PostPin').select('reply_id').in('post_id', ids).limit(5000),
    play().hiddenPeople(viewerId),
  ]);
  if (error) throw new Error(`Failed to count the replies: ${error.message}`);
  const pinIds = new Set((pinRows.data || []).map((pin) => pin.reply_id));
  for (const reply of data || []) {
    if (hidden.has(String(reply.user_id))) continue;
    const entry = counts.get(reply.post_id);
    entry.count += 1;
    if (pinIds.has(reply.id)) entry.pins += 1;
  }
  return counts;
}

/** A Moment's `replies` as a reader gets it (CONTRACT 8a). */
function repliesOf(row, counts) {
  const store = momentStore();
  const entry = counts.get(row.id) || { shown: false, count: 0, pins: 0 };
  return { shown: entry.shown, count: entry.count, pins: entry.pins, can_reply: entry.shown && store.momentState(row) === 'live' };
}

async function openFor(id, viewerId, liveOnly = true) {
  if (!UUID.test(String(id || ''))) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  return momentStore().openMoment(id, viewerId, { liveOnly });
}

/** GET /moments/:id/replies — the replies this reader may see, oldest first. */
async function list(id, viewerId, cursor) {
  const store = momentStore();
  const row = await openFor(id, viewerId);
  if (!(await shownNow(row))) return { replies: [], next_cursor: null };
  const offset = Math.max(0, Number.parseInt(cursor || '0', 10) || 0);
  const [{ data, error }, hidden] = await Promise.all([
    supabaseAdmin.from('PostComment').select('id, user_id, comment, created_at, moderation_state')
      .eq('post_id', row.id).eq('is_deleted', false).order('created_at', { ascending: true }).range(offset, offset + PAGE),
    play().hiddenPeople(viewerId),
  ]);
  if (error) throw new Error(`Failed to load the replies: ${error.message}`);
  const own = store.isOwn(row, viewerId);
  const page = (data || []).slice(0, PAGE).filter((reply) => (reply.moderation_state === 'live' || String(reply.user_id) === String(viewerId))
    && !hidden.has(String(reply.user_id)));
  const authors = await store.loadAuthors(page.map((reply) => reply.user_id));
  return {
    replies: page.map((reply) => {
      const mine = String(reply.user_id) === String(viewerId);
      return { id: reply.id, text: reply.comment, at: reply.created_at, author: authors.get(String(reply.user_id)) || null, mine, can_remove: mine || own };
    }),
    next_cursor: (data || []).length > PAGE ? String(offset + PAGE) : null,
  };
}

/** POST /moments/:id/replies — { text }: a reply people can see, under the reader's own name. */
async function create(id, user, text) {
  const store = momentStore();
  const words = typeof text === 'string' ? text.trim() : '';
  if (!words || words.length > MAX_TEXT) throw fail(400, 'REPLY_INVALID', `Write a reply of up to ${MAX_TEXT} characters.`);
  const row = await openFor(id, user.id);
  if (!(await shownNow(row))) throw fail(403, 'REPLIES_CLOSED', "Replies aren't shown on this Moment. Send a private reply instead.");
  if (store.momentState(row) !== 'live') throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  const { data, error } = await supabaseAdmin.from('PostComment')
    .insert({ post_id: row.id, user_id: user.id, comment: words }).select('id, user_id, comment, created_at').single();
  if (error) {
    if (/POST_COMMENT_RATE_LIMIT/.test(error.message || '')) throw fail(429, 'REPLY_RATE_LIMIT', 'You are replying too quickly. Please wait a moment.');
    throw new Error(`Failed to keep the reply: ${error.message}`);
  }
  const authors = await store.loadAuthors([user.id]);
  logger.info('moments.reply_shown_added', { momentId: row.id });
  return { reply: { id: data.id, text: data.comment, at: data.created_at, author: authors.get(String(user.id)) || null, mine: true, can_remove: true } };
}

async function replyOn(row, replyId) {
  if (!UUID.test(String(replyId || ''))) throw fail(404, 'REPLY_NOT_FOUND', 'This reply could not be found.');
  const { data, error } = await supabaseAdmin.from('PostComment')
    .select('id, post_id, user_id, moderation_state, identity_context_type, identity_context_id')
    .eq('id', replyId).eq('post_id', row.id).eq('is_deleted', false).maybeSingle();
  if (error) throw new Error(`Failed to load the reply: ${error.message}`);
  if (!data) throw fail(404, 'REPLY_NOT_FOUND', 'This reply could not be found.');
  return data;
}

/** DELETE /moments/:id/replies/:reply — its writer, or the Moment's author, removes it. */
async function remove(id, replyId, viewerId) {
  const store = momentStore();
  if (!UUID.test(String(id || ''))) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const row = await store.loadMoment(id);
  if (!row) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  await store.markOwn([row], viewerId);
  const reply = await replyOn(row, replyId);
  if (String(reply.user_id) !== String(viewerId) && !store.isOwn(row, viewerId)) throw fail(404, 'REPLY_NOT_FOUND', 'This reply could not be found.');
  const { error } = await supabaseAdmin.from('PostComment').update({ is_deleted: true }).eq('id', reply.id);
  if (error) throw new Error(`Failed to remove the reply: ${error.message}`);
  // A pin (CONTRACT 8b) is a reply: its voice or cutout file goes with it, whoever removes it. A failure is left to the
  // cleanup job, which deletes the files of removed pins.
  // eslint-disable-next-line global-require
  await require('./pins').replyRemoved(reply.id).catch((pinError) => logger.warn('moments.pin_file_left', { replyId: reply.id, error: pinError.message }));
  logger.info('moments.reply_shown_removed', { momentId: row.id, by_author: store.isOwn(row, viewerId) });
}

/** POST /moments/:id/replies/:reply/report — Pulse's reply report: the same reasons and the same review queue. */
async function report(id, replyId, viewerId, { reason, details }) {
  if (!postReportService.REPORT_REASONS.includes(reason)) throw fail(400, 'REPORT_INVALID', 'Choose a reason.');
  const row = await openFor(id, viewerId, false);
  const reply = await replyOn(row, replyId);
  if (String(reply.user_id) === String(viewerId)) throw fail(400, 'REPORT_INVALID', "You can't report your own reply.");
  await postReportService.fileReplyReport({ reply, userId: viewerId, reason, details: typeof details === 'string' ? details : null });
}

/** POST /moments/:id/replies-shown — { shown }: the author's choice for this Moment. */
async function setShown(id, viewerId, shown) {
  const store = momentStore();
  if (!UUID.test(String(id || ''))) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const row = await store.ownMoment(id, viewerId);
  if (!row) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  // eslint-disable-next-line global-require
  if (require('../penName').isPenNameRow(row)) throw fail(400, 'PEN_NAME_NO_REPLIES', 'A Moment under a made-up name takes no replies people can see.');
  const updated = await store.updateMoment(row, { moment: { replies_shown: Boolean(shown) } });
  if (!updated) throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  return updated;
}

module.exports = { shownOn, shownNow, choiceAtPosting, countsFor, repliesOf, list, create, remove, report, setShown, openFor };
