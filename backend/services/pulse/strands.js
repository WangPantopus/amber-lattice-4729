'use strict';

// Pulse, reinvented, phase 3: strands, "went because of you" (coord CONTRACT 8c; the "record of strands" table the
// founder approved, PostStrand). A follower marked Want to go on someone's post or Moment and later posted from there.
// Told to the source's author only, between people only, never shown to anyone else, and only from the follower's own
// acts. Found by a job (jobs/pulseStrands.js); nothing is pushed until the notification settings screen has a row.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const blockService = require('../blockService');
const penName = require('../penName');
const { haversineMeters } = require('../../utils/trustState');

const NEAR_M = 200;
const WANT_DAYS = 30;
const LOOK_BACK_MS = 2 * 60 * 60 * 1000;
const BATCH = 200;
const PAGE = 20;
const ZONE = 'America/Los_Angeles';
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_SELECT = 'id, user_id, content, latitude, longitude, effective_latitude, effective_longitude, location_precision, '
  + 'post_metadata, is_story, story_expires_at, archived_at, moderation_state, identity_context_type, identity_context_id, '
  + 'audience, visibility, read_scope, home_id, archive_reason, created_at, post_type, target_tier_rank';

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const momentPlace = () => require('../moments/momentPlace');
// eslint-disable-next-line global-require
const momentGuess = () => require('../moments/momentGuess');
// eslint-disable-next-line global-require
const play = () => require('./play');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** The point everyone sees: a Moment's (momentStore), a post's with the privacy floor (distanceText). */
function shownPoint(row) {
  if (row.is_story) {
    const point = momentStore().displayedPoint(row);
    return point.latitude == null ? null : point;
  }
  // eslint-disable-next-line global-require
  return require('./distanceText').displayedPoint(row);
}

/** Whether the row stands: live, not removed or held, not archived; a Moment not ended and not checking. */
function standing(row) {
  if (row.archived_at || row.moderation_state !== 'live') return false;
  if (!row.is_story) return true;
  const store = momentStore();
  return store.momentState(row) === 'live';
}

async function atHome(row) {
  if (row.is_story) return Boolean(momentStore().meta(row).at_home);
  if (row.latitude == null || row.longitude == null) return false;
  return momentPlace().isAtHome(row.user_id, row.latitude, row.longitude, { onFailure: true });
}

/** Whether `viewerId` may see `row` under today's rules (a Moment's audience and mutes; a post's read rule). */
async function maySee(row, viewerId) {
  if (row.is_story) {
    const store = momentStore();
    const ctx = await store.viewerContext(viewerId, [row.user_id]);
    return store.canSee(row, ctx);
  }
  // eslint-disable-next-line global-require
  return require('./readAccess').canReadPost(row, viewerId);
}

/** The strand that `post` (just posted by its author) makes with `source` (marked Want to go by them), or null. */
async function strandOf(post, source) {
  const store = momentStore();
  if (String(source.user_id) === String(post.user_id)) return null;
  if (penName.isPenNameRow(post) || penName.isPenNameRow(source)) return null;
  // A live guess-the-spot Moment on either side: its spot is the answer (LEAD-3 06:19). The job looks again once it ends,
  // while the post is still within its look back.
  const liveGuess = (row) => row.is_story && momentGuess().isGuess(row) && !store.hasEnded(row);
  if (liveGuess(source) || liveGuess(post)) return null;
  const [from, to] = [shownPoint(source), shownPoint(post)];
  if (!from || !to || haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude) > NEAR_M) return null;
  const [sourceOn, blocked, hiddenBySource, hiddenByFollower, homeA, homeB] = await Promise.all([
    store.reinventedOn(source.user_id),
    blockService.isBlocked(source.user_id, post.user_id),
    // Mutes count both ways, as blocks (LEAD-3 06:19).
    play().hiddenPeople(source.user_id),
    play().hiddenPeople(post.user_id),
    atHome(post),
    atHome(source),
  ]);
  if (!sourceOn || blocked || hiddenBySource.has(String(post.user_id)) || hiddenByFollower.has(String(source.user_id))
    || homeA || homeB) return null;
  if (!(await maySee(post, source.user_id))) return null;
  return {
    kind: 'went', source_post_id: source.id, source_user_id: source.user_id, follower_user_id: post.user_id, follower_post_id: post.id,
  };
}

/**
 * The job's work (jobs/pulseStrands.js): the posts and Moments of the last two hours whose authors have the switch on
 * and marked Want to go on someone else's post within 30 days before; each one that stands near what it marked makes a
 * strand. Safe to run twice (one strand per source, follower and kind). Answers how many it made.
 */
async function findNew(now = Date.now()) {
  const since = new Date(now - LOOK_BACK_MS).toISOString();
  const { data: posts, error } = await supabaseAdmin.from('Post').select(POST_SELECT)
    .gte('created_at', since).not('latitude', 'is', null).is('archived_at', null).eq('moderation_state', 'live')
    .order('created_at', { ascending: true }).limit(BATCH);
  if (error) throw new Error(`Failed to load new posts: ${error.message}`);
  const store = momentStore();
  const fresh = (posts || []).filter((row) => standing(row) && !penName.isPenNameRow(row));
  const authors = [...new Set(fresh.map((row) => String(row.user_id)))];
  const on = new Set((await Promise.all(authors.map(async (id) => ((await store.reinventedOn(id)) ? id : null)))).filter(Boolean));
  // The follower's own choice (LEAD-3 06:19): "Tell people when their post led me somewhere", on unless turned off.
  // eslint-disable-next-line global-require
  const choices = await require('./aiSetting').strandsOnFor([...on]);
  const candidates = fresh.filter((row) => on.has(String(row.user_id)) && choices.get(String(row.user_id)) !== false);
  if (!candidates.length) return 0;
  const earliest = new Date(Math.min(...candidates.map((row) => Date.parse(row.created_at))) - WANT_DAYS * DAY_MS).toISOString();
  const { data: marks, error: markError } = await supabaseAdmin.from('PostLike').select('user_id, post_id, created_at')
    .in('user_id', [...new Set(candidates.map((row) => String(row.user_id)))]).eq('reaction', 'want_to_go').gte('created_at', earliest).limit(5000);
  if (markError) throw new Error(`Failed to load Want to go marks: ${markError.message}`);
  if (!(marks || []).length) return 0;
  const { data: sources, error: sourceError } = await supabaseAdmin.from('Post').select(POST_SELECT)
    .in('id', [...new Set(marks.map((mark) => mark.post_id))]);
  if (sourceError) throw new Error(`Failed to load marked posts: ${sourceError.message}`);
  const byId = new Map((sources || []).map((row) => [row.id, row]));
  const made = [];
  for (const post of candidates) {
    const posted = Date.parse(post.created_at);
    const mine = marks.filter((mark) => String(mark.user_id) === String(post.user_id)
      && Date.parse(mark.created_at) < posted && posted - Date.parse(mark.created_at) <= WANT_DAYS * DAY_MS);
    for (const mark of mine) {
      const source = byId.get(mark.post_id);
      if (!source || source.archive_reason === 'moderation' || source.moderation_state === 'removed') continue;
      try {
        const strand = await strandOf(post, source);
        if (strand) made.push(strand);
      } catch (strandError) {
        logger.warn('[pulseStrands] pair failed', { postId: post.id, sourceId: source.id, error: strandError.message });
      }
    }
  }
  if (!made.length) return 0;
  const { data: kept, error: insertError } = await supabaseAdmin.from('PostStrand')
    .upsert(made, { onConflict: 'source_post_id,follower_user_id,kind', ignoreDuplicates: true }).select('id');
  if (insertError) throw new Error(`Failed to keep strands: ${insertError.message}`);
  return (kept || []).length;
}

// ─── Reading (the source's author; the follower's own side) ─────────────────

function labelOf(people, count, type, today) {
  const what = type === 'moment' ? 'your Moment' : 'your post';
  const first = (person) => String(person?.name || 'Someone').split(/\s+/)[0];
  if (count === 1) return `${first(people[0])} went because of ${what}.`;
  if (count === 2 && people.length === 2) return `${first(people[0])} and ${first(people[1])} went because of ${what}.`;
  return `${count} people went because of ${what}${today ? ' today' : ''}.`;
}

/**
 * GET /strands — the strands told to `userId` (their posts' followers), grouped by source and day, newest first; with
 * `side=mine`, the strands they are in. Rows whose follower post or person the reader can no longer see are left out.
 */
async function list(userId, { side, cursor } = {}) {
  const store = momentStore();
  const offset = Math.max(0, Number.parseInt(cursor || '0', 10) || 0);
  const mine = side === 'mine';
  const { data, error } = await supabaseAdmin.from('PostStrand')
    .select('id, kind, source_post_id, source_user_id, follower_user_id, follower_post_id, created_at, seen_at')
    .eq(mine ? 'follower_user_id' : 'source_user_id', userId).is('taken_back_at', null).order('created_at', { ascending: false })
    .range(offset, offset + 200);
  if (error) throw new Error(`Failed to load strands: ${error.message}`);
  const rows = data || [];
  const postIds = [...new Set(rows.flatMap((row) => [row.source_post_id, row.follower_post_id]))];
  const [{ data: posts, error: postError }, blocked] = await Promise.all([
    postIds.length ? supabaseAdmin.from('Post').select(POST_SELECT).in('id', postIds) : { data: [] },
    blockService.blockedUserIds(userId),
  ]);
  if (postError) throw new Error(`Failed to load strands' posts: ${postError.message}`);
  const byId = new Map((posts || []).map((row) => [row.id, row]));
  const other = (row) => String(mine ? row.source_user_id : row.follower_user_id);
  const ons = new Map(await Promise.all([...new Set(rows.map(other))].map(async (id) => [id, await store.reinventedOn(id)])));
  const visible = [];
  for (const row of rows) {
    const follower = byId.get(row.follower_post_id);
    const source = byId.get(row.source_post_id);
    if (!follower || !source || blocked.has(other(row)) || !ons.get(other(row))) continue;
    // The source's author sees a follower's post only as today's rules let them (it may have changed since).
    if (!mine && !(await maySee(follower, userId))) continue;
    visible.push(row);
  }
  const authors = await store.loadAuthors(visible.map((row) => (mine ? row.source_user_id : row.follower_user_id)));
  if (mine) {
    return {
      strands: visible.slice(0, PAGE).map((row) => ({
        id: row.id, kind: row.kind, source_post_id: row.source_post_id, author: authors.get(String(row.source_user_id)) || null,
        follower_post_id: row.follower_post_id, at: row.created_at,
      })),
      next_cursor: rows.length > 200 || visible.length > PAGE ? String(offset + PAGE) : null,
    };
  }
  const today = DateTime.now().setZone(ZONE).toISODate();
  const groups = new Map();
  for (const row of visible) {
    const day = DateTime.fromISO(row.created_at).setZone(ZONE).toISODate();
    const key = `${row.source_post_id}|${day}`;
    if (!groups.has(key)) groups.set(key, { source: byId.get(row.source_post_id), day, rows: [] });
    groups.get(key).rows.push(row);
  }
  const all = [...groups.values()];
  const page = all.slice(0, PAGE);
  return {
    strands: page.map((group) => {
      const type = group.source.is_story ? 'moment' : 'post';
      const people = group.rows.slice(0, 3).map((row) => authors.get(String(row.follower_user_id))).filter(Boolean);
      return {
        source: { id: group.source.id, type, caption: String(group.source.content || '').slice(0, 100) || null },
        day: group.day,
        count: group.rows.length,
        people,
        label: labelOf(people, group.rows.length, type, group.day === today),
        unseen: group.rows.some((row) => !row.seen_at),
        items: group.rows.map((row) => ({
          id: row.id, follower: authors.get(String(row.follower_user_id)) || null, follower_post_id: row.follower_post_id, at: row.created_at,
        })),
      };
    }),
    unseen_count: visible.filter((row) => !row.seen_at).length,
    next_cursor: all.length > PAGE ? String(offset + 200) : null,
  };
}

/** POST /strands/seen — { ids } or { all: true }: the source's author saw them. */
async function markSeen(userId, { ids, all } = {}) {
  let query = supabaseAdmin.from('PostStrand').update({ seen_at: new Date().toISOString() })
    .eq('source_user_id', userId).is('seen_at', null).is('taken_back_at', null);
  if (!all) {
    const chosen = (Array.isArray(ids) ? ids : []).filter((id) => UUID.test(String(id))).slice(0, 200);
    if (!chosen.length) throw fail(400, 'STRAND_INVALID', 'Send the ids of the strands seen, or all: true.');
    query = query.in('id', chosen);
  }
  const { error } = await query;
  if (error) throw new Error(`Failed to mark strands seen: ${error.message}`);
}

/**
 * DELETE /strands/:id — the follower takes back a strand they are in. Kept as taken back (never deleted), so the job,
 * which may look at the same post again, never makes it again; the source's author no longer sees it.
 */
async function remove(userId, id) {
  if (!UUID.test(String(id || ''))) throw fail(404, 'STRAND_NOT_FOUND', 'This could not be found.');
  const { data, error } = await supabaseAdmin.from('PostStrand').update({ taken_back_at: new Date().toISOString() })
    .eq('id', id).eq('follower_user_id', userId).is('taken_back_at', null).select('id');
  if (error) throw new Error(`Failed to remove the strand: ${error.message}`);
  if (!data?.length) throw fail(404, 'STRAND_NOT_FOUND', 'This could not be found.');
}

module.exports = { findNew, list, markSeen, remove, strandOf, NEAR_M, WANT_DAYS };
