'use strict';

// Pulse, reinvented, phase 3: Retake (coord CONTRACT 8e; board B13). Stand where someone stood and add your frame; readers
// drag through the frames by date and season. A Retake is its first Moment (the start, `retake.title`) and the Moments
// that joined it (frames, `retake.of`); both stay, kept as posts that stay. No new table: everything rides Moments, and
// each frame is seen only by whom its own audience allows.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const penName = require('../penName');
const { haversineMeters } = require('../../utils/trustState');

const NEAR_M = 60;
const AGAIN_MS = 6 * 60 * 60 * 1000;
const MAX_FRAMES = 200;
const ZONE = 'America/Los_Angeles';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOW_SOURCES = ['gps', 'capture'];

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const momentGuess = () => require('../moments/momentGuess');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** What the post asks: { title } to start one, { of } to add a frame, or null. Throws 400 on a bad field. */
function parse(body) {
  const title = body?.retake?.title;
  const of = body?.retake_of;
  if (title == null && of == null) return null;
  if (title != null && of != null) throw fail(400, 'RETAKE_INVALID', 'Start a Retake or add a frame, not both.');
  if (of != null) {
    if (!UUID.test(String(of))) throw fail(400, 'RETAKE_INVALID', 'Send the Retake as the id of its first Moment.');
    return { of: String(of).toLowerCase() };
  }
  const name = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 60) throw fail(400, 'RETAKE_INVALID', 'Name the Retake in up to 60 characters.');
  return { title: name };
}

/**
 * The checks every Retake Moment passes, start or frame (`ask` from parse): a photo taken now with an exact place, not
 * at home, not under a made-up name, not shared later, not a guess spot.
 */
function checkPosting(ask, { kind, source, shareAt, floating, showArea, atHome, underPenName, guess }) {
  if (!ask) return;
  if (kind !== 'photo') throw fail(400, 'RETAKE_INVALID', 'A Retake is made of photos.');
  if (!NOW_SOURCES.includes(source) || shareAt) throw fail(400, 'RETAKE_INVALID', 'A Retake frame is taken where you stand, now.');
  if (floating || showArea) throw fail(400, 'RETAKE_INVALID', 'A Retake needs the exact spot, not an area.');
  if (underPenName) throw fail(400, 'RETAKE_INVALID', "A Retake shows who stood there, so it can't be under a made-up name.");
  if (guess) throw fail(400, 'RETAKE_INVALID', "A Retake can't also be a guess the spot.");
  if (atHome) throw fail(422, 'RETAKE_AT_HOME', "A Retake can't start or be added at your home.");
}

const startIdOf = (row) => {
  const r = momentStore().meta(row).retake;
  if (!r) return null;
  return r.of || (r.title ? row.id : null);
};

/** Whether `viewerId` may see `row` (its audience, blocks, mutes, reports), ended or not, unless deleted or held. */
async function visibleRows(rows, viewerId) {
  const store = momentStore();
  const standing = rows.filter((row) => !row.archived_at && row.moderation_state === 'live');
  if (!standing.length) return [];
  const [ctx, reported] = await Promise.all([
    store.viewerContext(viewerId, standing.map((r) => r.user_id), null, standing), store.reportedIds(viewerId)]);
  // Listed as lists show them (listedFor): never another's unopened relic or live guess spot (CONTRACT 8g, 5b).
  return standing.filter((row) => store.isOwn(row, viewerId)
    || (store.canSee(row, ctx) && store.listedFor(row, viewerId) && !reported.has(row.id)));
}

async function loadStart(id) {
  const store = momentStore();
  const row = await store.loadMoment(id);
  if (!row) return null;
  return store.meta(row).retake?.title ? row : (store.meta(row).retake?.of ? store.loadMoment(store.meta(row).retake.of) : null);
}

/**
 * A frame's checks that need the start (`of`): the start stands and the poster may see it; the frame is within NEAR_M
 * of the start's point; the poster's last frame of it is over 6 hours old. Answers the start's id.
 */
async function checkFrame(userId, of, point) {
  const store = momentStore();
  const start = await loadStart(of);
  if (!start || !(await visibleRows([start], userId)).length) throw fail(404, 'RETAKE_NOT_FOUND', 'This Retake could not be found.');
  const at = store.displayedPoint(start);
  if (at.latitude == null || point?.latitude == null
    || haversineMeters(at.latitude, at.longitude, point.latitude, point.longitude) > NEAR_M) {
    throw fail(422, 'RETAKE_TOO_FAR', 'Stand where the first picture was taken to add your frame.');
  }
  if (await tooSoon(userId, start)) {
    throw fail(429, 'RETAKE_TOO_SOON', 'You added a frame here a little while ago. Come back later in the day.');
  }
  return start.id;
}

/**
 * Whether `userId` added to this Retake in the last 6 hours (a frame of theirs, or the start itself if it is theirs):
 * the one rule behind both the refusal (429 RETAKE_TOO_SOON) and the Retake's `can_add`, so the two always agree.
 */
async function tooSoon(userId, start) {
  if (String(start.user_id) === String(userId) && Date.now() - Date.parse(start.created_at) < AGAIN_MS) return true;
  const { data, error } = await supabaseAdmin.from('Post').select('created_at').eq('is_story', true).eq('user_id', userId)
    .eq('post_metadata->moment->retake->>of', start.id).gte('created_at', new Date(Date.now() - AGAIN_MS).toISOString()).limit(1);
  if (error) throw new Error(`Failed to read your frames: ${error.message}`);
  return Boolean((data || []).length);
}

/** The kept part of a Retake Moment: { retake, kept_post_at } (it stays, as "Keep this?" keeps one). */
function keptPart(ask, startId) {
  const now = new Date().toISOString();
  return { retake: ask.title ? { v: 1, title: ask.title } : { v: 1, of: startId }, kept_post_at: now };
}

async function framesOf(startIds) {
  const store = momentStore();
  if (!startIds.length) return [];
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .in('post_metadata->moment->retake->>of', startIds).order('created_at', { ascending: true }).limit(MAX_FRAMES);
  if (error) throw new Error(`Failed to load the Retake's frames: ${error.message}`);
  return data || [];
}

/** The `retake` of each of these rows for `viewerId` (CONTRACT 8e), by row id; one read for the page. */
async function summariesFor(rows, viewerId) {
  const store = momentStore();
  const out = new Map();
  const startIds = [...new Set(rows.map(startIdOf).filter(Boolean))];
  if (!startIds.length) return out;
  const known = new Map(rows.filter((r) => startIds.includes(r.id)).map((r) => [r.id, r]));
  const missing = startIds.filter((id) => !known.has(id));
  const [more, frames] = await Promise.all([
    missing.length ? supabaseAdmin.from('Post').select(store.MOMENT_SELECT).in('id', missing).then(({ data }) => data || []) : [],
    framesOf(startIds),
  ]);
  for (const row of more) known.set(row.id, row);
  const shown = new Set((await visibleRows([...known.values(), ...frames], viewerId)).map((r) => r.id));
  const authors = await store.loadAuthors([...known.values()].map((r) => r.user_id));
  for (const row of rows) {
    const startId = startIdOf(row);
    const start = known.get(startId);
    if (!start) continue;
    const parts = [start, ...frames.filter((f) => store.meta(f).retake.of === startId)].filter((r) => shown.has(r.id));
    out.set(row.id, {
      start_id: startId,
      title: store.meta(start).retake.title,
      started_by: authors.get(String(start.user_id)) || null,
      started_at: start.created_at,
      frames: parts.length,
      people: new Set(parts.map((r) => String(r.user_id))).size,
      is_start: row.id === startId,
    });
  }
  return out;
}

// Seasons follow the place (LEAD-3 06:53): south of the equator they flip.
const FLIP = { winter: 'summer', spring: 'fall', summer: 'winter', fall: 'spring' };
function seasonOf(iso, latitude = null) {
  const month = DateTime.fromISO(iso).setZone(ZONE).month;
  const north = [12, 1, 2].includes(month) ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall';
  return Number(latitude) < 0 ? FLIP[north] : north;
}

/** GET /retakes/:id — the Retake (from its start or any frame) as `viewerId` may see it. */
async function view(id, viewerId) {
  const store = momentStore();
  if (!UUID.test(String(id || ''))) throw fail(404, 'RETAKE_NOT_FOUND', 'This Retake could not be found.');
  const start = await loadStart(id);
  if (!start || !(await visibleRows([start], viewerId)).length) throw fail(404, 'RETAKE_NOT_FOUND', 'This Retake could not be found.');
  const frames = await visibleRows([start, ...await framesOf([start.id])].filter((r) => !penName.isPenNameRow(r)), viewerId);
  // eslint-disable-next-line global-require
  const media = require('../moments/momentMedia');
  const keyOf = (row, which) => (store.meta(row).purged_at ? null : store.meta(row).media?.[which] || null);
  const [authors, links, wants, soon] = await Promise.all([
    store.loadAuthors(frames.map((r) => r.user_id)),
    media.signedLinks(undefined, frames.flatMap((r) => [keyOf(r, 'thumb_key'), keyOf(r, 'key')]).filter(Boolean)),
    supabaseAdmin.from('PostLike').select('id', { count: 'exact', head: true }).eq('post_id', start.id).eq('reaction', 'want_to_go'),
    // The same 6-hour rule the posting refuses with (RETAKE_TOO_SOON), read beside the others.
    tooSoon(viewerId, start),
  ]);
  const liveGuess = momentGuess().isGuess(start) && !store.hasEnded(start);
  const canAdd = !liveGuess && !soon;
  return {
    retake: {
      start_id: start.id,
      title: store.meta(start).retake.title,
      place_label: start.location_name || null,
      started_by: authors.get(String(start.user_id)) || null,
      started_at: start.created_at,
      frames: frames.map((row) => ({
        id: row.id,
        author: authors.get(String(row.user_id)) || null,
        at: row.created_at,
        date_label: DateTime.fromISO(row.created_at).setZone(ZONE).toFormat('LLL d'),
        weather: store.meta(row).stamp_values?.weather?.kind || null,
        season: seasonOf(row.created_at, start.latitude),
        thumb_url: links.get(keyOf(row, 'thumb_key')) || links.get(keyOf(row, 'key')) || null,
        media_url: links.get(keyOf(row, 'key')) || null,
      })),
      want_to_go: wants.count || 0,
      can_add: canAdd,
    },
  };
}

module.exports = { parse, checkPosting, checkFrame, keptPart, summariesFor, view, startIdOf, NEAR_M };
