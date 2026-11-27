'use strict';

// Pulse, reinvented, phase 4: live beams (coord CONTRACT 9h). "When several captures share a time and a direction, faint
// beams cross where everyone is looking." A Moment keeps the way it faced (its compass heading, rounded to 5°) only when
// it is a photo or video taken there now, not at home, not floating or shown as an area, not under a made-up name and
// not a guess spot. GET /beams finds where three or more such live Moments, by three or more people, within 15 minutes
// of each other, all point at one place. Nothing is stored; every point is the one the reader's own answer holds.

const supabaseAdmin = require('../../config/supabaseAdmin');

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

const STEP_DEG = 5;
const MAX_ACCURACY_DEG = 30;
const WINDOW_MS = 15 * 60 * 1000;
const LOOK_BACK_MS = 60 * 60 * 1000;
const REACH_M = 2000;
const CROSS_M = 150;
const MIN_MOMENTS = 3;
const MIN_PEOPLE = 3;
const MAX_BEAMS = 10;
const PAD = 0.02;
const M_PER_DEG = 111320;

/**
 * What a posted Moment keeps of `heading` ({ deg, accuracy_deg }), or nothing: kept only for a photo or video taken there
 * now, never at home, floating, shown as an area, under a made-up name or as a guess spot, and only when the compass was
 * good to 30°. Never an error: anything else is dropped.
 */
function keptPart(value, { kind, source, takenAt, shareAt, atHome, floating, showArea, underPenName, guess }) {
  if (value == null || typeof value !== 'object') return {};
  const deg = Number(value.deg);
  const accuracy = Number(value.accuracy_deg);
  if (!Number.isFinite(deg) || deg < 0 || deg >= 360 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_DEG) return {};
  if (!['photo', 'video'].includes(kind) || source !== 'gps' || takenAt || shareAt) return {};
  if (atHome || floating || showArea || underPenName || guess) return {};
  return { heading: { v: 1, deg: (Math.round(deg / STEP_DEG) * STEP_DEG) % 360 } };
}

// Flat metres around a point (small distances only).
function toXY(origin, p) {
  return {
    x: (p.longitude - origin.longitude) * M_PER_DEG * Math.cos((origin.latitude * Math.PI) / 180),
    y: (p.latitude - origin.latitude) * M_PER_DEG,
  };
}
function toLatLng(origin, xy) {
  return {
    latitude: origin.latitude + xy.y / M_PER_DEG,
    longitude: origin.longitude + xy.x / (M_PER_DEG * Math.cos((origin.latitude * Math.PI) / 180)),
  };
}
const dirOf = (deg) => ({ x: Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180) });

/** Where two rays cross, ahead of both and within reach, or null. */
function crossing(a, b) {
  const det = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(det) < 1e-6) return null;
  const dx = b.p.x - a.p.x;
  const dy = b.p.y - a.p.y;
  const t = (dx * b.d.y - dy * b.d.x) / det;
  const u = (dx * a.d.y - dy * a.d.x) / det;
  if (t < 0 || u < 0 || t > REACH_M || u > REACH_M) return null;
  return { x: a.p.x + t * a.d.x, y: a.p.y + t * a.d.y };
}

/** How far a point is from a ray (ahead of it, within reach), or Infinity. */
function offRay(ray, q) {
  const vx = q.x - ray.p.x;
  const vy = q.y - ray.p.y;
  const along = vx * ray.d.x + vy * ray.d.y;
  if (along < 0 || along > REACH_M) return Infinity;
  return Math.abs(vx * ray.d.y - vy * ray.d.x);
}

/** GET /beams for `user` in the map's `box` (CONTRACT 9h). */
async function beamsIn(user, box, now = Date.now()) {
  const store = momentStore();
  const userId = user.id;
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .is('archived_at', null).eq('moderation_state', 'live').not('post_metadata->moment->heading', 'is', null)
    .gte('created_at', new Date(now - LOOK_BACK_MS).toISOString())
    .gte('latitude', box.south - PAD).lte('latitude', box.north + PAD).gte('longitude', box.west - PAD).lte('longitude', box.east + PAD)
    .order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(`Failed to load Moments for beams: ${error.message}`);
  const rows = (data || []).filter((row) => store.momentState(row, now) === 'live');
  if (rows.length < MIN_MOMENTS) return { beams: [] };
  await store.markOwn(rows, userId);
  const [ctx, reported] = await Promise.all([store.viewerContext(userId, rows.map((r) => r.user_id), null, rows), store.reportedIds(userId)]);
  const shown = rows.filter((row) => store.isOwn(row, userId) || (store.canSee(row, ctx) && store.listedFor(row, userId) && !reported.has(row.id)));
  if (shown.length < MIN_MOMENTS) return { beams: [] };
  const answers = await store.serializeMoments(shown, userId);
  const origin = { latitude: (box.south + box.north) / 2, longitude: (box.west + box.east) / 2 };
  const rays = shown.map((row, i) => {
    const m = answers[i];
    if (!m || m.latitude == null || m.longitude == null) return null;
    return {
      id: row.id, person: String(store.authorKey(row)), at: Date.parse(store.shownAt(row)),
      point: { latitude: m.latitude, longitude: m.longitude }, p: toXY(origin, m), d: dirOf(store.meta(row).heading.deg),
    };
  }).filter(Boolean);
  const found = [];
  for (let i = 0; i < rays.length; i += 1) {
    for (let j = i + 1; j < rays.length; j += 1) {
      const a = rays[i];
      const b = rays[j];
      if (a.person === b.person || Math.abs(a.at - b.at) > WINDOW_MS) continue;
      const q = crossing(a, b);
      if (!q) continue;
      // Everyone whose line passes near this crossing, within 15 minutes of both.
      const members = rays.filter((r) => offRay(r, q) <= CROSS_M && Math.abs(r.at - a.at) <= WINDOW_MS && Math.abs(r.at - b.at) <= WINDOW_MS);
      const people = new Set(members.map((r) => r.person));
      if (members.length < MIN_MOMENTS || people.size < MIN_PEOPLE) continue;
      found.push({ q, members, people: people.size });
    }
  }
  // One beam per place: the one with the most Moments.
  found.sort((x, y) => y.members.length - x.members.length);
  const beams = [];
  for (const f of found) {
    if (beams.some((b) => Math.hypot(b.q.x - f.q.x, b.q.y - f.q.y) <= CROSS_M)) continue;
    beams.push(f);
    if (beams.length >= MAX_BEAMS) break;
  }
  return {
    beams: beams.map((b) => {
      const target = toLatLng(origin, b.q);
      const newest = Math.max(...b.members.map((r) => r.at));
      return {
        at: new Date(newest).toISOString(),
        count: b.members.length,
        people: b.people,
        target: { latitude: Math.round(target.latitude * 1000) / 1000, longitude: Math.round(target.longitude * 1000) / 1000 },
        from: b.members.map((r) => ({ moment_id: r.id, ...r.point })),
      };
    }).sort((x, y) => Date.parse(y.at) - Date.parse(x.at)),
  };
}

module.exports = { keptPart, beamsIn, crossing, offRay };
