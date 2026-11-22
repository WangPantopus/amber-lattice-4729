'use strict';

/**
 * Garbage pickup days from a county's own public map (PICKUPDAY, 2026-11-21): the weekday areas a county publishes,
 * looked up at a home's point. The address calendar (services/addressCalendarService.js) offers that day as a general,
 * unconfirmed date for the address, naming the source, and the household confirms or changes it.
 *
 * Sources are keyed by county FIPS code in data/pickup-days/sources.json; each one's areas ship in the repository as
 * data/pickup-days/<fips>.json.gz, written by scripts/pickup-days/build.cjs from the county's layer. Nothing calls a
 * county's server while a person waits: a county's file is read on its first lookup and kept in memory.
 *
 * The day at a point:
 *   • inside exactly one day's area: that day;
 *   • inside no area (a road, a park, a shop): the day of the areas within NEAR_M metres, only when they all agree;
 *   • otherwise (inside two days' areas, or areas nearby that disagree, or nothing near): no day.
 * An area's holes count (each day's rings are read even-odd, as the layer draws them).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const DIR = path.join(__dirname, '..', 'data', 'pickup-days');
const SOURCES = require('../data/pickup-days/sources.json');
const FORMAT = 1;
const NEAR_M = 40;
const M_PER_DEGREE = 111320;
// The lookup grid: about 1.1 by 0.8 km in Washington. Each cell lists the areas whose box (plus NEAR_M) touches it.
const CELL_DEGREES = 0.01;
const RETRY_AFTER_MS = 10 * 60 * 1000;
const logger = () => require('./logger');
const gunzip = promisify(zlib.gunzip);

const loads = new Map();

/** The registry entry for a county, or null. */
function sourceFor(fips) {
  return (typeof fips === 'string' && Object.prototype.hasOwnProperty.call(SOURCES, fips)) ? SOURCES[fips] : null;
}

function cellOf(value, scale) {
  return Math.floor(value / scale / CELL_DEGREES);
}

/** A county's areas in memory: every point in one array, ring boxes, and the grid. */
function index(file) {
  const { scale, rings } = file;
  let points = 0;
  for (const ring of rings) points += (ring.length - 1) / 2;
  const xy = new Int32Array(points * 2);
  const start = new Int32Array(rings.length + 1);
  const day = new Uint8Array(rings.length);
  const box = new Int32Array(rings.length * 4);
  let at = 0;
  let maxLat = 0;
  rings.forEach((ring, r) => {
    day[r] = ring[0];
    start[r] = at;
    let x = 0;
    let y = 0;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 1; i < ring.length; i += 2) {
      x += ring[i];
      y += ring[i + 1];
      xy[at * 2] = x;
      xy[at * 2 + 1] = y;
      at += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    box.set([minX, minY, maxX, maxY], r * 4);
    maxLat = Math.max(maxLat, Math.abs(maxY / scale), Math.abs(minY / scale));
  });
  start[rings.length] = at;
  // NEAR_M in the file's units, east-west at the area's widest latitude so no near area is missed.
  const marginY = Math.ceil((NEAR_M / M_PER_DEGREE) * scale);
  const marginX = Math.ceil((NEAR_M / (M_PER_DEGREE * Math.cos((maxLat * Math.PI) / 180))) * scale);
  const cells = new Map();
  for (let r = 0; r < rings.length; r += 1) {
    const x0 = cellOf(box[r * 4] - marginX, scale); const x1 = cellOf(box[r * 4 + 2] + marginX, scale);
    const y0 = cellOf(box[r * 4 + 1] - marginY, scale); const y1 = cellOf(box[r * 4 + 3] + marginY, scale);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        const key = `${cx},${cy}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(r);
      }
    }
  }
  const grid = new Map();
  for (const [key, list] of cells) grid.set(key, Int32Array.from(list));
  return { scale, days: file.days, xy, start, day, box, grid, marginX, marginY };
}

async function readCounty(fips, source) {
  const raw = await gunzip(await fs.promises.readFile(path.join(DIR, source.file)));
  const file = JSON.parse(raw.toString('utf8'));
  if (file.v !== FORMAT || file.fips !== fips || !Array.isArray(file.rings) || !Number.isFinite(file.scale)) {
    throw new Error(`pickup-day areas for ${fips} are not format ${FORMAT}`);
  }
  return index(file);
}

/** The county's areas, read once (a failed read is tried again after ten minutes). */
function areasFor(fips) {
  const source = sourceFor(fips);
  if (!source) return Promise.resolve(null);
  const held = loads.get(fips);
  if (held && (!held.failedAt || Date.now() - held.failedAt < RETRY_AFTER_MS)) return held.promise;
  const entry = { failedAt: null, promise: null };
  entry.promise = readCounty(fips, source).catch((error) => {
    entry.failedAt = Date.now();
    logger().warn('pickupDayAreas: areas unreadable', { fips, error: error.message });
    return null;
  });
  loads.set(fips, entry);
  return entry.promise;
}

/** Whether the point is inside ring r (even-odd), and its distance in metres to the ring's edge if within reach. */
function ringAt(areas, r, px, py, kx, ky, reach) {
  const { xy, start } = areas;
  const from = start[r];
  const to = start[r + 1];
  let inside = false;
  let nearest = Infinity;
  for (let i = from, j = to - 1; i < to; j = i, i += 1) {
    const xi = xy[i * 2]; const yi = xy[i * 2 + 1];
    const xj = xy[j * 2]; const yj = xy[j * 2 + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    if (reach) {
      const ax = (xj - px) * kx; const ay = (yj - py) * ky;
      const vx = (xi - xj) * kx; const vy = (yi - yj) * ky;
      const length = vx * vx + vy * vy;
      const t = length ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / length)) : 0;
      const dx = ax + t * vx; const dy = ay + t * vy;
      const d = dx * dx + dy * dy;
      if (d < nearest) nearest = d;
    }
  }
  return { inside, metres: Math.sqrt(nearest) };
}

/**
 * The weekday at a point in a county's areas.
 * @returns {{ weekday: string, how: 'inside'|'near' } | null}
 */
function dayIn(areas, lat, lng) {
  const { scale, box, day, days, grid, marginX, marginY } = areas;
  const px = lng * scale;
  const py = lat * scale;
  const ring = grid.get(`${cellOf(px, scale)},${cellOf(py, scale)}`);
  if (!ring) return null;
  // Metres per file unit at this latitude.
  const ky = M_PER_DEGREE / scale;
  const kx = (M_PER_DEGREE * Math.cos((lat * Math.PI) / 180)) / scale;
  const parity = new Uint8Array(days.length);
  const near = new Set();
  for (const r of ring) {
    const minX = box[r * 4]; const minY = box[r * 4 + 1]; const maxX = box[r * 4 + 2]; const maxY = box[r * 4 + 3];
    if (px < minX - marginX || px > maxX + marginX || py < minY - marginY || py > maxY + marginY) continue;
    const within = px >= minX && px <= maxX && py >= minY && py <= maxY;
    const reach = !near.has(day[r]);
    const at = ringAt(areas, r, px, py, kx, ky, reach);
    if (within && at.inside) parity[day[r]] ^= 1;
    if (reach && at.metres <= NEAR_M) near.add(day[r]);
  }
  const inside = [];
  parity.forEach((odd, d) => { if (odd) inside.push(d); });
  if (inside.length === 1) return { weekday: days[inside[0]], how: 'inside' };
  if (inside.length > 1) return null;
  if (near.size === 1) return { weekday: days[[...near][0]], how: 'near' };
  return null;
}

/**
 * The pickup day a county's public map gives a point, or null (no source for the county, no point, the file
 * unreadable, or no single day there).
 * @returns {Promise<{ weekday: string, how: 'inside'|'near', fips: string, source: object } | null>}
 */
async function pickupDayAt(fips, lat, lng) {
  const source = sourceFor(fips);
  if (!source || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const areas = await areasFor(fips);
  if (!areas) return null;
  const found = dayIn(areas, lat, lng);
  return found ? { ...found, fips, source } : null;
}

module.exports = { pickupDayAt, sourceFor, NEAR_M };
