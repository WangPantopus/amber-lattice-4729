// Guess the spot (Pulse, reinvented, phase 0 step 8; behind the `pulse_reinvented` switch; CONTRACT.md section 5).
// A photo or video Moment its author marked `post_metadata.moment.guess` shows its picture without where it was
// taken; a person drops one pin and learns how far off it was (distance only, no points or ranks). Guesses are rows of
// the MomentGuess table (one per person per Moment); a guessed point is never read back to anyone.
// While it is live a guess-the-spot Moment is never listed for anyone but its author (no ring on the map or a profile,
// no count, no push: its pin and place are the answer), and people whose switch is off can't open it at all
// (momentStore.canSee). Once it ends it is an ordinary ended Moment.

const { createHash } = require('node:crypto');
const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const { haversineMeters } = require('../../utils/trustState');
const { MAX_DISPLAY_OFFSET_DEGREES } = require('../../utils/locationPrivacy');
const { timezoneFromCoordinates } = require('../../utils/timezone');

const FEET_PER_M = 3.28084;
const METERS_PER_MILE = 1609.344;
const IDS_PER_READ = 100;

const meta = (row) => row?.post_metadata?.moment || {};

/** Whether the Moment is a guess-the-spot one. */
function isGuess(row) {
  return Boolean(meta(row).guess);
}

/** How far off a guess was, in words: "300 ft off", "1.2 mi off", "14 mi off". */
function distanceLabel(distanceM) {
  const miles = distanceM / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.max(50, Math.round((distanceM * FEET_PER_M) / 50) * 50).toLocaleString('en-US')} ft off`;
  if (miles < 10) return `${miles.toFixed(1)} mi off`;
  return `${Math.round(miles).toLocaleString('en-US')} mi off`;
}

/**
 * The guesses on these Moments as one reader sees them: Map(id → { count, mine: { distance_m, label } | null }).
 * Only ids of guess-the-spot Moments are read; others are left out.
 */
async function guessesFor(rows, viewerId) {
  const ids = (rows || []).filter(isGuess).map((row) => row.id);
  const out = new Map(ids.map((id) => [id, { count: 0, mine: null }]));
  for (let at = 0; at < ids.length; at += IDS_PER_READ) {
    const { data, error } = await supabaseAdmin.from('MomentGuess').select('post_id, user_id, distance_m')
      .in('post_id', ids.slice(at, at + IDS_PER_READ));
    if (error) throw new Error(`Failed to load guesses: ${error.message}`);
    for (const guess of data || []) {
      const entry = out.get(guess.post_id);
      if (!entry) continue;
      entry.count += 1;
      if (String(guess.user_id) === String(viewerId)) {
        entry.mine = { distance_m: guess.distance_m, label: distanceLabel(guess.distance_m) };
      }
    }
  }
  return out;
}

/**
 * Keeps `viewerId`'s guess (`point`) on the Moment whose answer is `answer` (the point everyone would see), once: a
 * second guess answers the first again. Returns { distance_m, label }.
 */
async function recordGuess(row, viewerId, point, answer) {
  const distance = Math.round(haversineMeters(point.latitude, point.longitude, answer.latitude, answer.longitude));
  const { error } = await supabaseAdmin.from('MomentGuess').upsert({
    post_id: row.id, user_id: viewerId, latitude: point.latitude, longitude: point.longitude, distance_m: distance,
  }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to save the guess: ${error.message}`);
  const { data, error: readError } = await supabaseAdmin.from('MomentGuess').select('distance_m')
    .eq('post_id', row.id).eq('user_id', viewerId).maybeSingle();
  if (readError || !data) throw new Error(`Failed to read the guess: ${readError?.message || 'missing'}`);
  return { distance_m: data.distance_m, label: distanceLabel(data.distance_m) };
}

// The stamps that would give the answer away before a reader has guessed.
const SPOT_STAMPS = new Set(['place', 'postmark', 'elevation', 'home_distance']);

/**
 * A serialized Moment with its spot left out (CONTRACT 5b), for a reader who hasn't guessed yet. It reads as a Moment
 * with no location (`no_location`), so an app that knows nothing of guessing (2.1.6) draws it as one instead of a pin
 * at 0, 0 with an empty place.
 */
function withoutSpot(moment) {
  return {
    ...moment,
    latitude: null,
    longitude: null,
    no_location: true,
    show_area: false,
    place_label: null,
    area: null,
    floating: false,
    altitude_ft: null,
    flying: false,
    ...(Array.isArray(moment.stamps) ? { stamps: moment.stamps.filter((stamp) => !SPOT_STAMPS.has(stamp.kind)) } : {}),
  };
}

// ─── Finding them (CONTRACT 5d): the map's guess_spots and the daily spot ─────────────────────────────────────

// A town is the label a guess-the-spot Moment kept when it was posted (its `guess.town`); where none was found, a cell
// of 0.1 degree around its point (about 11 km), so the daily spot still works without town names.
const GRID_STEP = 0.1;
const FALLBACK_ZONE = 'America/Los_Angeles';
const MAX_CANDIDATES = 500;

const cellOf = (degrees) => Math.round(degrees / GRID_STEP);

function gridKey(latitude, longitude) {
  return `g:${cellOf(latitude)}:${cellOf(longitude)}`;
}

/**
 * The box grown out to the edges of the 0.1° cells it touches (the cells gridKey names). The map lists a spot when its
 * shown point's cell overlaps the box, so the list is the same anywhere inside a cell: zooming in to a few streets, or
 * halving the box again and again, never says more than the cell about where it is.
 */
function cellBox({ south, west, north, east }) {
  return {
    south: (cellOf(south) - 0.5) * GRID_STEP,
    north: (cellOf(north) + 0.5) * GRID_STEP,
    west: (cellOf(west) - 0.5) * GRID_STEP,
    east: (cellOf(east) + 0.5) * GRID_STEP,
  };
}

/** Whether a point's 0.1° cell overlaps the box (compared cell by cell, as gridKey counts them). */
function cellOverlaps(point, { south, west, north, east }) {
  const lat = cellOf(point.latitude);
  const lng = cellOf(point.longitude);
  return lat >= cellOf(south) && lat <= cellOf(north) && lng >= cellOf(west) && lng <= cellOf(east);
}

/** The town a guess-the-spot Moment counts in: its kept town's label, else its point's cell. Null with no point. */
function townKeyOf(row, point) {
  const town = meta(row).guess?.town;
  if (typeof town === 'string' && town) return `t:${town}`;
  return point?.latitude == null ? null : gridKey(point.latitude, point.longitude);
}

/** The town a reader's point is in, worked out the same way (momentPlace.townAt; its fallback counts as none). */
async function townKeyAt(latitude, longitude) {
  const momentPlace = require('./momentPlace');
  const town = await momentPlace.townAt(latitude, longitude);
  return town && town !== momentPlace.FALLBACK_LABEL ? `t:${town}` : gridKey(latitude, longitude);
}

/** The town's local date at a point ("2026-11-27"). */
function dayAt(latitude, longitude, now = Date.now()) {
  return DateTime.fromMillis(now, { zone: timezoneFromCoordinates(latitude, longitude, FALLBACK_ZONE) }).toISODate();
}

const rank = (day, townKey, id) => createHash('sha256').update(`${day}|${townKey}|${id}`).digest('hex');

/**
 * The town's daily spot for `day`: among the town's live guess-the-spot Moments open to people nearby, the one whose
 * hash of the day, the town and its id is lowest. The same for every reader; the reader's own visibility is checked
 * after (store.canSee). Returns the row or null.
 */
async function dailyPick(townKey, day) {
  const store = require('./momentStore');
  const nowIso = new Date().toISOString();
  let query = supabaseAdmin.from('Post').select(store.MOMENT_SELECT)
    .eq('is_story', true)
    .gt('story_expires_at', nowIso)
    .is('archived_at', null)
    .eq('moderation_state', 'live')
    .eq('post_metadata->moment->>state', 'live')
    .eq('audience', 'nearby')
    .not('post_metadata->moment->guess', 'is', null)
    .limit(MAX_CANDIDATES);
  if (townKey.startsWith('t:')) {
    query = query.eq('post_metadata->moment->guess->>town', townKey.slice(2));
  } else {
    // The stored point, widened by what a shown point may move from it; the cell is checked on the shown point below.
    const [, latKey, lngKey] = townKey.split(':').map(Number);
    query = query.is('post_metadata->moment->guess->>town', null)
      .gte('latitude', (latKey - 0.5) * GRID_STEP - MAX_DISPLAY_OFFSET_DEGREES)
      .lt('latitude', (latKey + 0.5) * GRID_STEP + MAX_DISPLAY_OFFSET_DEGREES)
      .gte('longitude', (lngKey - 0.5) * GRID_STEP - MAX_DISPLAY_OFFSET_DEGREES)
      .lt('longitude', (lngKey + 0.5) * GRID_STEP + MAX_DISPLAY_OFFSET_DEGREES);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load guess-the-spot Moments: ${error.message}`);
  const live = (data || []).filter((row) => store.momentState(row) === 'live'
    && townKeyOf(row, store.displayedPoint(row)) === townKey);
  if (!live.length) return null;
  return live.reduce((best, row) => (rank(day, townKey, row.id) < rank(day, townKey, best.id) ? row : best));
}

/**
 * GET /daily-spot for `viewerId` at a point (CONTRACT 5d): { daily_spot: null | { moment_id, town, day, guessed } }.
 * Null when the town has none today or the reader may not see the one picked (blocked, muted, reported).
 */
async function dailySpotFor(viewerId, latitude, longitude) {
  const store = require('./momentStore');
  const townKey = await townKeyAt(latitude, longitude);
  const day = dayAt(latitude, longitude);
  const row = await dailyPick(townKey, day);
  if (!row) return { daily_spot: null };
  const [ctx, reported] = await Promise.all([
    store.viewerContext(viewerId, [row.user_id], null, [row]),
    store.reportedIds(viewerId),
  ]);
  if (!store.canSee(row, ctx) || reported.has(row.id)) return { daily_spot: null };
  const guesses = await guessesFor([row], viewerId);
  return {
    daily_spot: {
      moment_id: row.id,
      town: townKey.startsWith('t:') ? townKey.slice(2) : null,
      day,
      guessed: Boolean(guesses.get(row.id)?.mine),
    },
  };
}

/**
 * The map's `guess_spots` for `viewerId` in the box (CONTRACT 5d): the live guess-the-spot Moments whose 0.1° cell
 * overlaps it (cellBox) that they may see and didn't write, newest first, with no point: [{ moment_id, author, kind,
 * thumb_url, created_at, expires_at, guessed, daily }]. A small picture that can't be signed only costs the picture.
 */
async function guessSpotsIn(viewerId, box) {
  const store = require('./momentStore');
  const media = require('./momentMedia');
  const nowIso = new Date().toISOString();
  // The stored points, in the cells the box touches widened by what a shown point may move from its stored one.
  const { south, west, north, east } = cellBox(box);
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT)
    .eq('is_story', true)
    .gt('story_expires_at', nowIso)
    .is('archived_at', null)
    .eq('moderation_state', 'live')
    .eq('post_metadata->moment->>state', 'live')
    .not('post_metadata->moment->guess', 'is', null)
    .gte('latitude', south - MAX_DISPLAY_OFFSET_DEGREES).lte('latitude', north + MAX_DISPLAY_OFFSET_DEGREES)
    .gte('longitude', west - MAX_DISPLAY_OFFSET_DEGREES).lte('longitude', east + MAX_DISPLAY_OFFSET_DEGREES)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES);
  if (error) throw new Error(`Failed to load guess-the-spot Moments: ${error.message}`);
  const rows = (data || []).filter((row) => store.momentState(row) === 'live');
  if (!rows.length) return [];
  const [ctx, reported] = await Promise.all([
    store.viewerContext(viewerId, rows.map((row) => row.user_id), null, rows),
    store.reportedIds(viewerId),
  ]);
  const shown = rows.filter((row) => {
    if (store.isOwn(row, viewerId) || !store.canSee(row, ctx) || reported.has(row.id)) return false;
    const point = store.displayedPoint(row);
    return point.latitude != null && cellOverlaps(point, box);
  });
  if (!shown.length) return [];
  // Each town's daily spot, worked out the same way GET /daily-spot does it, for the towns in view.
  const towns = new Map();
  for (const row of shown) {
    const point = store.displayedPoint(row);
    const key = townKeyOf(row, point);
    if (key && !towns.has(key)) towns.set(key, dayAt(point.latitude, point.longitude));
  }
  const [authors, guesses, thumbs, picks] = await Promise.all([
    store.authorsFor(shown),
    guessesFor(shown, viewerId),
    media.signedLinks(undefined, shown.map((row) => meta(row).media?.thumb_key).filter(Boolean)).catch(() => new Map()),
    Promise.all([...towns].map(async ([key, day]) => (await dailyPick(key, day))?.id || null)),
  ]);
  const daily = new Set(picks.filter(Boolean));
  return shown.map((row) => ({
    moment_id: row.id,
    author: authors.get(String(store.authorKey(row))),
    kind: meta(row).kind,
    thumb_url: (meta(row).media?.thumb_key && thumbs.get(meta(row).media.thumb_key)) || null,
    created_at: store.shownAt(row),
    expires_at: store.answeredEnd(row),
    guessed: Boolean(guesses.get(row.id)?.mine),
    daily: daily.has(row.id),
  }));
}

module.exports = {
  isGuess, distanceLabel, guessesFor, recordGuess, withoutSpot, SPOT_STAMPS,
  townKeyOf, townKeyAt, dayAt, dailyPick, dailySpotFor, guessSpotsIn, gridKey,
};
