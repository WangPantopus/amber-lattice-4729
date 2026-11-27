'use strict';

// Pulse, reinvented, phase 3: "Your day" at 8 pm and "Tonight in <town>" (coord CONTRACT 8k; board B12). No new table.
// Your day: the photos and the path are on the phone; the server trims the path (no point near a home, ~10 m rounding,
// never kept) and keeps the approved day on the Moments the person posts (`your_day`). Tonight in <town>: a read of
// the town's Moments of that day shared with people nearby, only where a town has enough. Nothing is pushed.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const penName = require('../penName');
const parsePostGISPoint = require('../../utils/parsePostGISPoint');
const { haversineMeters } = require('../../utils/trustState');

const MAX_POINTS = 500;
const KEPT_POINTS = 200;
// The path leaves out anything near a home: more than the home rule's 60 m, so it never leads to a door.
const HOME_CLEAR_M = 200;
const FILM_MIN = 8;
const FILM_PEOPLE = 4;
const ZONE = 'America/Los_Angeles';
const NEAR = [-1, 0, 1];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

async function homePoints(userId) {
  // eslint-disable-next-line global-require
  const ids = await require('../../utils/homeMailAccess').householdHomeIdsOrThrow(userId);
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from('Home').select('location').in('id', ids);
  if (error) throw new Error(`Failed to read homes: ${error.message}`);
  return (data || []).map((h) => parsePostGISPoint(h.location)).filter(Boolean);
}

/** The path the app may draw and post: no point within HOME_CLEAR_M of a home, rounded to ~10 m, in time order. */
async function trimPath(userId, points) {
  if (!Array.isArray(points) || points.length > MAX_POINTS) throw fail(400, 'YOUR_DAY_INVALID', `Send up to ${MAX_POINTS} points.`);
  const clean = points.map((p) => ({ latitude: Number(p?.latitude), longitude: Number(p?.longitude), at: Date.parse(p?.at || '') }))
    .filter((p) => Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 && Number.isFinite(p.at));
  // A home that can't be read leaves no path at all (never a path that might lead home).
  const homes = await homePoints(userId).catch(() => null);
  if (homes === null) throw fail(503, 'YOUR_DAY_UNAVAILABLE', "Your day couldn't be checked right now. Try again in a little while.");
  return clean
    .filter((p) => !homes.some((h) => haversineMeters(p.latitude, p.longitude, h.latitude, h.longitude) <= HOME_CLEAR_M))
    .sort((a, b) => a.at - b.at)
    .map((p) => ({ latitude: Math.round(p.latitude * 10000) / 10000, longitude: Math.round(p.longitude * 10000) / 10000, at: new Date(p.at).toISOString() }));
}

/** POST /your-day/path — { points }: the trimmed path, never kept. */
async function path(userId, body) {
  return { path: await trimPath(userId, body?.points) };
}

/** What a posted Moment keeps (`your_day` sent): { your_day, kept_post_at }, the path trimmed again here. */
async function keptPart(userId, value, { underPenName }) {
  if (value == null) return {};
  if (typeof value !== 'object' || !DATE.test(String(value.date || ''))) throw fail(400, 'YOUR_DAY_INVALID', 'Send your_day with its date (YYYY-MM-DD).');
  const trimmed = !underPenName && Array.isArray(value.path) ? (await trimPath(userId, value.path)).slice(0, KEPT_POINTS) : null;
  return { your_day: { v: 1, date: value.date, ...(trimmed?.length ? { path: trimmed } : {}) }, kept_post_at: new Date().toISOString() };
}

async function visible(rows, viewerId) {
  const store = momentStore();
  const standing = rows.filter((row) => !row.archived_at && row.moderation_state === 'live');
  if (!standing.length) return [];
  const [ctx, reported] = await Promise.all([store.viewerContext(viewerId, standing.map((r) => r.user_id), null, standing), store.reportedIds(viewerId)]);
  return standing.filter((row) => store.isOwn(row, viewerId) || (store.canSee(row, ctx) && !reported.has(row.id)));
}

/** GET /your-day/:user/:date — that person's approved day, as the reader may see it (only if they may see its first). */
async function view(userId, date, viewerId) {
  const store = momentStore();
  if (!UUID.test(String(userId || '')) || !DATE.test(String(date || ''))) throw fail(404, 'YOUR_DAY_NOT_FOUND', 'This day could not be found.');
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true).eq('user_id', userId)
    .eq('post_metadata->moment->your_day->>date', date).order('created_at', { ascending: true }).limit(100);
  if (error) throw new Error(`Failed to load the day: ${error.message}`);
  const rows = (data || []).filter((r) => !penName.isPenNameRow(r));
  const first = rows.find((r) => store.meta(r).your_day?.path) || rows[0];
  if (!first || !(await visible([first], viewerId)).length) throw fail(404, 'YOUR_DAY_NOT_FOUND', 'This day could not be found.');
  const shown = await visible(rows, viewerId);
  return { day: { date, path: store.meta(first).your_day.path || [], moments: await store.serializeMoments(shown, viewerId, { keptPosts: true }) } };
}

/** POST /town-film — { latitude, longitude } in the body, never kept: tonight's film of the town, or null. */
async function townFilm(viewerId, body, now = Date.now()) {
  const store = momentStore();
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (body?.latitude == null || body?.longitude == null || !(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) {
    throw fail(400, 'TOWN_FILM_INVALID', 'Send where you are as latitude and longitude.');
  }
  const local = DateTime.fromMillis(now, { zone: ZONE });
  if (local.hour < 20 && local.hour >= 4) return { film: null };
  const day = local.hour < 4 ? local.minus({ days: 1 }).startOf('day') : local.startOf('day');
  const cell = (v) => Math.floor(v * 10);
  const [lo, hi] = [Math.min(...NEAR), Math.max(...NEAR)];
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true).eq('audience', 'nearby')
    .gte('created_at', day.toUTC().toISO()).lt('created_at', day.plus({ days: 1 }).toUTC().toISO())
    .gte('latitude', (cell(latitude) + lo) / 10).lt('latitude', (cell(latitude) + hi + 1) / 10)
    .gte('longitude', (cell(longitude) + lo) / 10).lt('longitude', (cell(longitude) + hi + 1) / 10)
    .is('archived_at', null).eq('moderation_state', 'live').order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(`Failed to load the town's day: ${error.message}`);
  const sealedOrGuess = (row) => {
    const m = store.meta(row);
    // eslint-disable-next-line global-require
    return (m.seal && require('./seal').isSealed(row)) || (require('../moments/momentGuess').isGuess(row) && !store.hasEnded(row));
  };
  const candidates = (data || []).filter((row) => !penName.isPenNameRow(row) && !store.meta(row).at_home && !sealedOrGuess(row)
    && ['photo', 'video'].includes(store.meta(row).kind));
  const authors = [...new Set(candidates.map((r) => String(r.user_id)))];
  const on = new Set((await Promise.all(authors.map(async (id) => ((await store.reinventedOn(id)) ? id : null)))).filter(Boolean));
  const rows = await visible(candidates.filter((r) => on.has(String(r.user_id))), viewerId);
  const people = new Set(rows.map((r) => String(r.user_id)));
  if (rows.length < FILM_MIN || people.size < FILM_PEOPLE) return { film: null };
  // eslint-disable-next-line global-require
  const town = await require('../moments/momentPlace').townAt(latitude, longitude).catch(() => null);
  return {
    film: {
      town: town || null, date: day.toISODate(), count: rows.length, people: people.size,
      moments: await store.serializeMoments(rows, viewerId, { keptPosts: true, keptEnded: false }),
    },
  };
}

module.exports = { path, keptPart, view, townFilm, trimPath, HOME_CLEAR_M };
