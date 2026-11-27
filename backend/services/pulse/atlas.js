'use strict';

// Pulse, reinvented, phase 1: My Atlas (coord CONTRACT 6e, GET /api/reinvented/atlas and DELETE /atlas/:id). Every
// Moment a person posted while their `pulse_reinvented` switch was on is kept (`post_metadata.moment.kept`, set at
// posting in routes/moments.js; jobs/momentsCleanup leaves its files), and listed here for them alone, live or ended,
// with its picture. "Delete for good" ends it, removes its files and the row's picture keys at once.

const supabaseAdmin = require('../../config/supabaseAdmin');
const store = require('../moments/momentStore');
const penName = require('../penName');
const { MAX_DISPLAY_OFFSET_DEGREES } = require('../../utils/locationPrivacy');

const DEFAULT_LIMIT = 30;
const MAX_IN_BOX = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

// Kept, never deleted (today's Delete or Delete for good both archive it) and never removed by moderation.
const keptOnly = (query) => query.eq('is_story', true)
  .eq('post_metadata->moment->>kept', 'true')
  .is('archived_at', null);

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ v: 1, at: row.created_at, id: row.id })).toString('base64url');
}

function decodeCursor(text) {
  if (text == null || text === '') return null;
  try {
    const state = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    if (state?.v === 1 && typeof state.at === 'string' && !Number.isNaN(Date.parse(state.at)) && UUID.test(String(state.id))) {
      return state;
    }
  } catch {
    // falls through
  }
  throw fail(400, 'INVALID_CURSOR', 'This list has changed. Pull to refresh.');
}

// Newest first, then by id: the order of the list and of its cursor.
function newerFirst(a, b) {
  const byTime = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (byTime) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function belowCursor(row, cursor) {
  if (!cursor) return true;
  const at = Date.parse(row.created_at);
  const mark = Date.parse(cursor.at);
  return at < mark || (at === mark && row.id < cursor.id);
}

/** The caller's own kept Moments under their own account, newest first, below the cursor or in the box. */
async function ownRows(userId, { cursor, box, size }) {
  let query = keptOnly(supabaseAdmin.from('Post').select(store.MOMENT_SELECT)).eq('user_id', userId);
  if (box) {
    query = query.gte('latitude', box.south - MAX_DISPLAY_OFFSET_DEGREES).lte('latitude', box.north + MAX_DISPLAY_OFFSET_DEGREES)
      .gte('longitude', box.west - MAX_DISPLAY_OFFSET_DEGREES).lte('longitude', box.east + MAX_DISPLAY_OFFSET_DEGREES);
  }
  if (cursor) query = query.lte('created_at', cursor.at);
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(size + 1);
  if (error) throw new Error(`Failed to load your Atlas: ${error.message}`);
  return (data || []).filter((row) => belowCursor(row, cursor));
}

/** The caller's own kept Moments under their made-up name (only their own lists ever hold them), as ownRows. */
async function penNameRows(userId, { cursor, box, size }) {
  const owned = await penName.owner.owned(userId, 'post', { before: cursor ? cursor.at : null, limit: Math.min(size + 1, 200) });
  if (!owned.length) return [];
  let query = keptOnly(supabaseAdmin.from('Post').select(store.MOMENT_SELECT))
    .in('id', owned.map((row) => row.id)).eq('identity_context_type', penName.KIND);
  if (box) {
    query = query.gte('latitude', box.south - MAX_DISPLAY_OFFSET_DEGREES).lte('latitude', box.north + MAX_DISPLAY_OFFSET_DEGREES)
      .gte('longitude', box.west - MAX_DISPLAY_OFFSET_DEGREES).lte('longitude', box.east + MAX_DISPLAY_OFFSET_DEGREES);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load your Atlas: ${error.message}`);
  return (data || []).filter((row) => belowCursor(row, cursor));
}

function inBox(moment, box) {
  return moment.latitude != null && moment.longitude != null
    && moment.latitude >= box.south && moment.latitude <= box.north
    && moment.longitude >= box.west && moment.longitude <= box.east;
}

/**
 * GET /api/reinvented/atlas for `userId` (CONTRACT 6e): by date (`cursor`, `limit`) or in a box (`box`, up to 500).
 * Each Moment as GET /api/moments/:id answers its author, its picture kept for them after it ended.
 */
async function atlasFor(userId, { cursor: cursorText = null, limit = DEFAULT_LIMIT, box = null } = {}) {
  const cursor = box ? null : decodeCursor(cursorText);
  const size = box ? MAX_IN_BOX : limit;
  const [own, underPenName] = await Promise.all([
    ownRows(userId, { cursor, box, size }),
    penNameRows(userId, { cursor, box, size }),
  ]);
  const rows = [...own, ...underPenName].sort(newerFirst);
  const page = rows.slice(0, size);
  const moments = await store.serializeMoments(page, userId, { keptEnded: true });
  if (box) return { moments: moments.filter((moment) => inBox(moment, box)), next_cursor: null };
  return { moments, next_cursor: rows.length > size ? encodeCursor(page[page.length - 1]) : null };
}

/**
 * DELETE /api/reinvented/atlas/:id — Delete for good (CONTRACT 6e): the author's own Moment ends if it hasn't, its
 * files go and the row keeps no picture keys. A Moment a review holds keeps its files until the review is done.
 */
async function deleteForGood(userId, id) {
  if (!UUID.test(String(id))) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const row = await store.ownMoment(id, userId);
  if (!row) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  if (await store.filesHeld(row)) {
    throw fail(409, 'MOMENT_HELD', 'This Moment is being reviewed. You can delete it for good once the review is done.');
  }
  if (!row.archived_at) await store.deleteMoment(row);
  const current = await store.loadMoment(id) || row;
  if (!store.meta(current).purged_at && !(await store.purgeFiles(current))) {
    throw fail(409, 'MOMENT_HELD', 'This Moment is being reviewed. You can delete it for good once the review is done.');
  }
  const purged = await store.loadMoment(id) || current;
  await store.updateMoment(purged, { moment: { media: null, deleted_for_good_at: new Date().toISOString() } });
}

module.exports = { atlasFor, deleteForGood };
