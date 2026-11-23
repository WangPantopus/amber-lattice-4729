#!/usr/bin/env node
// Builds the garbage pickup-day areas a county publishes (backend/utils/pickupDayAreas.js reads them) from the county's
// own public map layer, named in backend/data/pickup-days/sources.json by county FIPS code. A layer is an ArcGIS feature
// layer of polygons with a weekday field ("Monday" … "Sunday"); each polygon is the area collected on that day.
//
// Each ring is simplified (Douglas–Peucker, 1 m) and its points rounded to 0.00001° (about a metre), then written
// as <fips>.json.gz beside sources.json: { v, fips, layer, built_at, downloaded, published, scale, days, rings }, where
// each ring is [day index, x, y, dx, dy, …] in units of 1/scale degree, the first point absolute and the rest as steps.
// Only the layer's day, provider and date fields are read; nothing about a person or an address. Prints counts only.
//
//   node backend/scripts/pickup-days/build.cjs [--fips 53011] [--from <saved layer query .json>]
//     --fips  build only these counties (comma-separated; default every county in sources.json)
//     --from  read one county's features from a file saved from the layer's query (f=json, outSR=4326) instead
//
// A second county is a data task: add its entry to sources.json (its layer, the day field, the words "source" and
// "map_words" say), run this script and commit the file it writes. Needs Node 22 and nothing else.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DIR = path.join(__dirname, '..', '..', 'data', 'pickup-days');
const SOURCES = path.join(DIR, 'sources.json');
const FORMAT = 1;
const SCALE = 100000;
const TOLERANCE_M = 1;
const M_PER_DEGREE = 111320;
const PAGE = 1000;
const TRIES = 4;
const USER_AGENT = 'Pantopus pickup-day areas build (public county map data)';
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_NAMES = {
  monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU',
  mon: 'MO', tue: 'TU', tues: 'TU', wed: 'WE', thu: 'TH', thur: 'TH', thurs: 'TH', fri: 'FR', sat: 'SA', sun: 'SU',
};

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fips') opts.fips = argv[++i].split(/[\s,]+/).filter(Boolean);
    else if (arg === '--from') opts.from = argv[++i];
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (opts.fips && !opts.fips.every((f) => /^\d{5}$/.test(f))) throw new Error('--fips takes five-digit county FIPS codes');
  if (opts.from && (!opts.fips || opts.fips.length !== 1)) throw new Error('--from reads one county: name it with --fips');
  return opts;
}

async function fetchJson(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(3 * 60 * 1000) });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(`${url} answered ${JSON.stringify(body.error).slice(0, 200)}`);
      return body;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => { setTimeout(resolve, 2000 * attempt); });
    }
  }
  throw lastError;
}

/** Every feature of the layer, a page at a time, in WGS 84. */
async function layerFeatures(source) {
  const fields = [source.day_field, source.provider_field, source.downloaded_field, source.published_field].filter(Boolean);
  const features = [];
  for (let offset = 0; ; offset += PAGE) {
    const query = new URLSearchParams({
      where: '1=1', outFields: fields.join(','), returnGeometry: 'true', outSR: '4326', geometryPrecision: '6',
      orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: String(PAGE), f: 'json',
    });
    const page = await fetchJson(`${source.layer}/query?${query}`);
    features.push(...(page.features || []));
    if (!page.exceededTransferLimit || !(page.features || []).length) return features;
  }
}

/** Douglas–Peucker on a closed ring, in metres around the ring's own latitude. */
function simplify(ring, toleranceM) {
  const n = ring.length;
  if (n < 5) return ring;
  const kx = M_PER_DEGREE * Math.cos((ring[0][1] * Math.PI) / 180);
  const ky = M_PER_DEGREE;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  // A closed ring starts and ends at one point: split it at the point farthest from that one.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < n - 1; i += 1) {
    const dx = (ring[i][0] - ring[0][0]) * kx;
    const dy = (ring[i][1] - ring[0][1]) * ky;
    if (dx * dx + dy * dy > farD) { farD = dx * dx + dy * dy; far = i; }
  }
  keep[far] = 1;
  const stack = [[0, far], [far, n - 1]];
  const limit = toleranceM * toleranceM;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = ring[a][0] * kx; const ay = ring[a][1] * ky;
    const vx = ring[b][0] * kx - ax; const vy = ring[b][1] * ky - ay;
    const length = vx * vx + vy * vy;
    let worst = -1;
    let worstD = limit;
    for (let i = a + 1; i < b; i += 1) {
      const px = ring[i][0] * kx - ax; const py = ring[i][1] * ky - ay;
      const t = length ? Math.max(0, Math.min(1, (px * vx + py * vy) / length)) : 0;
      const qx = t * vx - px; const qy = t * vy - py;
      if (qx * qx + qy * qy > worstD) { worstD = qx * qx + qy * qy; worst = i; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

/** A ring as [day, x, y, dx, dy, …] in whole units of 1/SCALE degree, repeated points dropped; null if it collapses. */
function encodeRing(day, ring) {
  const out = [day];
  let px = null;
  let py = null;
  let points = 0;
  for (const [lng, lat] of ring) {
    const x = Math.round(lng * SCALE);
    const y = Math.round(lat * SCALE);
    if (x === px && y === py) continue;
    out.push(px === null ? x : x - px, py === null ? y : y - py);
    px = x;
    py = y;
    points += 1;
  }
  return points >= 4 ? out : null;
}

const isoDay = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null);

function build(fips, source, features) {
  const rings = [];
  const counts = Object.fromEntries(DAYS.map((d) => [d, 0]));
  const providers = new Set();
  let dropped = 0;
  let pointsIn = 0;
  let pointsOut = 0;
  let downloaded = null;
  let published = null;
  for (const feature of features) {
    const attributes = feature.attributes || {};
    const code = DAY_NAMES[String(attributes[source.day_field] || '').trim().toLowerCase()];
    if (!code) throw new Error(`${fips}: a feature has no weekday in ${source.day_field} (${attributes[source.day_field]})`);
    if (source.provider_field && attributes[source.provider_field]) providers.add(String(attributes[source.provider_field]));
    if (source.downloaded_field) downloaded = isoDay(attributes[source.downloaded_field]) || downloaded;
    if (source.published_field) published = isoDay(attributes[source.published_field]) || published;
    for (const ring of feature.geometry?.rings || []) {
      pointsIn += ring.length;
      const encoded = encodeRing(DAYS.indexOf(code), simplify(ring, TOLERANCE_M));
      if (!encoded) { dropped += 1; continue; }
      pointsOut += (encoded.length - 1) / 2;
      counts[code] += 1;
      rings.push(encoded);
    }
  }
  if (!rings.length) throw new Error(`${fips}: the layer gave no areas`);
  const file = {
    v: FORMAT, fips, layer: source.layer, built_at: new Date().toISOString(), downloaded, published,
    providers: [...providers].sort(), scale: SCALE, days: DAYS, rings,
  };
  const gz = zlib.gzipSync(JSON.stringify(file), { level: 9 });
  fs.writeFileSync(path.join(DIR, source.file), gz);
  console.log(JSON.stringify({
    fips, features: features.length, rings: rings.length, rings_by_day: counts, rings_dropped: dropped,
    points_in: pointsIn, points_out: pointsOut, bytes: gz.length, downloaded, published, providers: file.providers,
  }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  for (const fips of opts.fips || Object.keys(sources)) {
    const source = sources[fips];
    if (!source) throw new Error(`${fips} isn't in sources.json`);
    const features = opts.from ? JSON.parse(fs.readFileSync(opts.from, 'utf8')).features : await layerFeatures(source);
    build(fips, source, features);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
