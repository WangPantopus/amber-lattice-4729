'use strict';

/**
 * The public street nearest a point: the spot on its centre line closest to the point, from OpenStreetMap through
 * the Overpass servers the place picker asks (plans/planPlaces.js). A Moment that shows only its area stands over a
 * street close to the middle of its quarter-mile cell instead of in somebody's yard (services/moments/momentPlace.js,
 * founder 2026-11-17).
 *
 * Asked once per point and kept: a month in the place cache (streets change rarely), the answer "no street here"
 * included. A failed ask isn't kept and isn't asked again for a minute. The caller says how long it will wait; a
 * slower answer is still fetched and kept for the next ask.
 *
 * The data is © OpenStreetMap contributors under the ODbL; the maps the point is drawn on already credit it.
 */

const logger = require('../../utils/logger');
const placeSectionCache = require('../placeSectionCache');
const { askServers } = require('../plans/planPlaces');

const USER_AGENT = 'Pantopus/1.0 (a street near a point)';
const LOG_PREFIX = 'geo.streets';
const SECTION_ID = 'geo_street_point_osm_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 60 * 1000;
const METERS_PER_DEGREE = 111320;
// The streets people live and walk on: no motorways or their ramps, no driveways or parking aisles (service), no
// footpaths or tracks.
const KINDS = ['residential', 'living_street', 'unclassified', 'tertiary', 'secondary', 'primary'];

const memo = new Map();
const inflight = new Map();
const failedUntil = new Map();

function overpassQuery(latitude, longitude, radiusM) {
  return `[out:json][timeout:20];
way["highway"~"^(${KINDS.join('|')})$"](around:${Math.round(radiusM)},${latitude.toFixed(5)},${longitude.toFixed(5)});
out tags geom 200;`;
}

/**
 * The spot on the ways' lines closest to the point, { latitude, longitude, distance_m, name }, or null when no way
 * has a line. Private and closed streets are left out. Pure.
 */
function nearestOn(elements, latitude, longitude) {
  const eastWest = METERS_PER_DEGREE * Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  let best = null;
  for (const way of elements || []) {
    const line = way?.geometry;
    const access = way?.tags?.access;
    if (!Array.isArray(line) || access === 'private' || access === 'no') continue;
    for (let at = 0; at + 1 < line.length; at += 1) {
      const ax = (line[at].lon - longitude) * eastWest;
      const ay = (line[at].lat - latitude) * METERS_PER_DEGREE;
      const dx = (line[at + 1].lon - longitude) * eastWest - ax;
      const dy = (line[at + 1].lat - latitude) * METERS_PER_DEGREE - ay;
      const length = dx * dx + dy * dy;
      const along = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
      const x = ax + along * dx;
      const y = ay + along * dy;
      const distance = Math.hypot(x, y);
      if (Number.isFinite(distance) && (!best || distance < best.distance_m)) {
        best = {
          latitude: latitude + y / METERS_PER_DEGREE,
          longitude: longitude + x / eastWest,
          distance_m: Math.round(distance),
          name: way.tags?.name ? String(way.tags.name).slice(0, 80) : null,
        };
      }
    }
  }
  return best && best.distance_m >= 0 ? best : null;
}

/** The answer for a key, from the memory, the place cache or Overpass (one fetch per key at a time). */
function lookUp(key, latitude, longitude, radiusM) {
  if (memo.has(key)) return Promise.resolve(memo.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const row = await placeSectionCache.readRow(key, SECTION_ID);
    const kept = row?.payload && typeof row.payload === 'object' ? row.payload : null;
    if (kept && Date.parse(row.expires_at) > Date.now()) return kept;
    if ((failedUntil.get(key) || 0) > Date.now()) {
      if (kept) return kept;
      throw new Error('The streets here just failed to load');
    }
    try {
      const elements = await askServers(overpassQuery(latitude, longitude, radiusM),
        { logPrefix: LOG_PREFIX, userAgent: USER_AGENT });
      const found = nearestOn(elements, latitude, longitude);
      const answer = found && found.distance_m <= radiusM ? found : { none: true };
      await placeSectionCache.writeRow(key, SECTION_ID, answer, CACHE_TTL_MS, new Date().toISOString());
      failedUntil.delete(key);
      return answer;
    } catch (error) {
      failedUntil.set(key, Date.now() + FAILURE_COOLDOWN_MS);
      logger.warn(`${LOG_PREFIX}.fetch_failed`, { error: error.message });
      // A month-old answer beats none.
      if (kept) return kept;
      throw error;
    }
  })().then((answer) => {
    memo.set(key, answer);
    if (memo.size > 5000) memo.delete(memo.keys().next().value);
    return answer;
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/**
 * The spot on a public street closest to the point, within `radiusM` of it: { latitude, longitude, distance_m, name },
 * or null when there is none, the streets can't be read, or the answer takes longer than `waitMs` (it is still fetched
 * and kept, so the next ask has it). Never throws.
 */
async function streetPointNear({ latitude, longitude, radiusM, waitMs = 3000 }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !(radiusM > 0)) return null;
  const key = `street:${latitude.toFixed(5)}:${longitude.toFixed(5)}:${Math.round(radiusM)}`;
  const job = lookUp(key, latitude, longitude, radiusM).catch(() => null);
  let timer = null;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
    timer.unref?.();
  });
  const answer = await Promise.race([job, late]);
  clearTimeout(timer);
  if (!answer || answer.none || !Number.isFinite(answer.latitude) || !Number.isFinite(answer.longitude)) return null;
  return answer;
}

module.exports = { streetPointNear, nearestOn, overpassQuery };
