'use strict';

/**
 * The Sky's areas (the founder's Sky design, phase A: approximate places). A post that isn't pinned at a public place
 * "floats" over an area: the server keeps and shows only the area's point, never where the phone was.
 *
 * An area is a square of whole base cells (a base cell is 0.005°, the approx_area grid in locationPrivacy.js), in one of
 * five sizes ("steps"):
 *
 *   step 1   0.005°  about 0.35 by 0.25 mile
 *   step 2   0.01°   about 0.7 by 0.5 mile
 *   step 3   0.02°   about 1.4 by 1 mile
 *   step 4   0.05°   about 3.5 by 2.4 miles
 *   step 5   0.1°    about 7 by 5 miles (the largest: where even a 3-mile square holds fewer than 100 homes, abroad,
 *                    and wherever the count can't be read)
 *
 * A step's squares sit on multiples of its size, so every base cell is in exactly one square of each step. The point
 * shown is the centre of the square, with no secret offset, and the disc the apps draw is the circle around the square
 * (`radius_m`). Which step a place gets comes from the homes-per-cell file (scripts/area-cells/build.cjs, from the 2020
 * Census housing counts by block): one byte a base cell, the step, 0 for no count. The answer depends on the place only,
 * never on the person, the post or the time, so many posts from one spot show one area and never narrow it down.
 *
 * The file ships with the server (backend/data/area-cells: the whole US, 1,381 tiles, 5.5 MB), so every server reads the
 * same areas with nothing to publish or set. AREA_CELLS_URL points elsewhere when set (s3://bucket/prefix, with the
 * property index's read-only key, or file:///dir): manifest.json, and one gzip'd tile of 200 × 200 cells a 1° square.
 * Tiles load on first use and the newest 64 stay in memory. A tile that can't be read within 2.5 seconds and one the
 * manifest doesn't list (abroad, the open sea) answer step 5. A failed read is tried again on the next request and
 * logged once a minute at most.
 *
 * The same steps say how built-up a spot is (knownStepAt: 1 downtown to 5 in open country, null where the file can't
 * say): a Moment's "Pin it at a place" reaches less far downtown than in open country (services/moments/momentPlace.js).
 */

const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { pathToFileURL } = require('url');
const gunzipAsync = promisify(zlib.gunzip);

// Loaded on first use, so the build script (scripts/area-cells/build.cjs) runs with no packages installed.
const logger = () => require('./logger');

const BASE_CELLS_PER_DEGREE = 200;
// Each step's square, in base cells a side (steps 1 to 5). All divide 200, so no square crosses a tile's edge.
const STEP_CELLS = [1, 2, 4, 10, 20];
const LARGEST_STEP = STEP_CELLS.length;
// The smallest area holds at least this many homes (the design's decision 4: tune after measuring).
const AREA_MIN_HOMES = 100;
const TILE_CELLS = BASE_CELLS_PER_DEGREE;
const TILE_BYTES = TILE_CELLS * TILE_CELLS;
const FORMAT = 1;
const READ_DEADLINE_MS = 2500;
const KEPT_TILES = 64;
const MANIFEST_FRESH_MS = 60 * 60 * 1000;
const LOG_EVERY_MS = 60 * 1000;
// Metres in a degree of latitude, and of longitude at the equator (the radius is rounded up to 10 m, so this is plenty).
const M_PER_DEGREE = 111320;
// The file in the repository, read unless AREA_CELLS_URL points elsewhere (scripts/area-cells/build.cjs writes it).
const BUNDLED_URL = pathToFileURL(path.join(__dirname, '..', 'data', 'area-cells')).href;

/** The base cell a coordinate is in (an integer; the build and every read use this same function). */
function baseCell(value) {
  return Math.floor(value * BASE_CELLS_PER_DEGREE);
}

/** The 1° tile holding a base cell, as the file names it ("45_-123"), and the cell's place in it. */
function tileOf(cellLat, cellLng) {
  const tileLat = Math.floor(cellLat / TILE_CELLS);
  const tileLng = Math.floor(cellLng / TILE_CELLS);
  return {
    name: `${tileLat}_${tileLng}`,
    index: (cellLat - tileLat * TILE_CELLS) * TILE_CELLS + (cellLng - tileLng * TILE_CELLS),
  };
}

const round5 = (value) => Math.round(value * 1e5) / 1e5;
const clamp = (value, limit) => Math.min(Math.max(value, -limit), limit);

/**
 * The area of `step` holding the point: { latitude, longitude, step, radius_m }. The point is the square's centre to 5
 * decimals; `radius_m` is half its diagonal at that latitude, rounded up to 10 m. Pure.
 */
function pointAt(latitude, longitude, step) {
  const size = STEP_CELLS[(Number.isInteger(step) && step >= 1 && step <= LARGEST_STEP ? step : LARGEST_STEP) - 1];
  const centre = (value) => (Math.floor(baseCell(value) / size) * size + size / 2) / BASE_CELLS_PER_DEGREE;
  const lat = clamp(centre(latitude), 90);
  const lng = clamp(centre(longitude), 180);
  const degrees = size / BASE_CELLS_PER_DEGREE;
  const northSouth = degrees * M_PER_DEGREE;
  const eastWest = degrees * M_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  return {
    latitude: round5(lat),
    longitude: round5(lng),
    step: STEP_CELLS.indexOf(size) + 1,
    radius_m: Math.ceil(Math.hypot(northSouth, eastWest) / 2 / 10) * 10,
  };
}

// ─── The file ──────────────────────────────────────────────────────────────

let source = null;

function sourceFor(url) {
  if (source?.url === url) return source;
  let storage = null;
  if (url) {
    try {
      // The property index's storage: s3:// with its read-only key, or file:// for a local rig.
      storage = require('../services/propertyRecords/reader').createStorage(url);
    } catch (error) {
      logger().warn('area_cells.bad_url', { error: error.message });
    }
  }
  source = { url, storage, manifest: null, manifestAt: 0, manifestJob: null, tiles: new Map(), loggedAt: 0 };
  return source;
}

function logFailure(src, what, error) {
  const now = Date.now();
  if (now - src.loggedAt < LOG_EVERY_MS) return;
  src.loggedAt = now;
  logger().warn('area_cells.read_failed', { what, error: error?.message || String(error) });
}

async function readFile(src, name) {
  const found = await src.storage(name, { signal: AbortSignal.timeout(READ_DEADLINE_MS) });
  return found?.bytes || null;
}

function parseManifest(bytes) {
  const data = JSON.parse(bytes.toString('utf8'));
  if (data?.v !== FORMAT || !Array.isArray(data.tiles) || typeof data.dir !== 'string') {
    throw new Error('The area cells manifest is not one this server reads');
  }
  return { version: String(data.version || ''), dir: data.dir.replace(/^\/+|\/+$/g, ''), tiles: new Set(data.tiles) };
}

/** The manifest, or null when it can't be read (each request tries again; the last good one stands meanwhile). */
async function currentManifest(src) {
  const due = !src.manifest || Date.now() - src.manifestAt >= MANIFEST_FRESH_MS;
  if (due && !src.manifestJob) {
    src.manifestJob = readFile(src, 'manifest.json')
      .then((bytes) => {
        if (!bytes) throw new Error('manifest.json is missing');
        src.manifest = parseManifest(bytes);
        src.manifestAt = Date.now();
      })
      .catch((error) => logFailure(src, 'manifest', error))
      .finally(() => { src.manifestJob = null; });
  }
  if (!src.manifest && src.manifestJob) await src.manifestJob;
  return src.manifest;
}

async function parseTile(bytes) {
  const cells = await gunzipAsync(bytes);
  if (cells.length !== TILE_BYTES) throw new Error('An area cells tile is the wrong size');
  for (let at = 0; at < cells.length; at += 1) {
    if (cells[at] > LARGEST_STEP) throw new Error('An area cells tile holds a step this server does not know');
  }
  return cells;
}

/** A tile's cells (a Buffer of TILE_BYTES), most recently used kept last; throws when it can't be read. */
function tileCells(src, manifest, name) {
  const key = `${manifest.version}:${name}`;
  let job = src.tiles.get(key);
  if (job) {
    src.tiles.delete(key);
  } else {
    job = readFile(src, `${manifest.dir}/${name}.bin.gz`).then((bytes) => {
      if (!bytes) throw new Error(`Tile ${name} is missing`);
      return parseTile(bytes);
    });
    // A failed read isn't kept: the next request tries again.
    job.catch(() => src.tiles.delete(key));
  }
  src.tiles.set(key, job);
  while (src.tiles.size > KEPT_TILES) src.tiles.delete(src.tiles.keys().next().value);
  return job;
}

/**
 * The step the file gives a point, 1 to 5, or null when it can't say: no tile for the place (abroad, the open sea) or a
 * read that failed. Never throws.
 */
async function knownStepAt(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const src = sourceFor((process.env.AREA_CELLS_URL || '').trim() || BUNDLED_URL);
  if (!src.storage) return null;
  const { name, index } = tileOf(baseCell(lat), baseCell(lng));
  let timer = null;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('The area cells read took too long')), READ_DEADLINE_MS);
    });
    const step = await Promise.race([deadline, (async () => {
      const manifest = await currentManifest(src);
      if (!manifest || !manifest.tiles.has(name)) return null;
      return (await tileCells(src, manifest, name))[index];
    })()]);
    return step >= 1 && step <= LARGEST_STEP ? step : null;
  } catch (error) {
    logFailure(src, 'tile', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The step for a point from the file: 1 to 5, and 5 whenever the file can't say. Never throws. */
async function stepAt(latitude, longitude) {
  return (await knownStepAt(latitude, longitude)) ?? LARGEST_STEP;
}

/**
 * The area a point floats over: { latitude, longitude, step, radius_m } (pointAt at the step the file gives the
 * point). Never throws; a point that isn't a number has no area (null).
 */
async function areaPoint(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return pointAt(lat, lng, await stepAt(lat, lng));
}

/** What a floating post keeps in post_metadata.area. */
function areaMetadata(area) {
  return { v: FORMAT, step: area.step, radius_m: area.radius_m };
}

module.exports = {
  areaPoint,
  knownStepAt,
  pointAt,
  areaMetadata,
  baseCell,
  tileOf,
  BASE_CELLS_PER_DEGREE,
  STEP_CELLS,
  LARGEST_STEP,
  AREA_MIN_HOMES,
  TILE_CELLS,
  TILE_BYTES,
  FORMAT,
};
