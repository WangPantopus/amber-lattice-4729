#!/usr/bin/env node
// Builds the Sky's homes-per-cell file (backend/utils/areaCells.js reads it and describes the areas) from the 2020
// Census housing counts by block: the US Census Bureau's 2020 TIGER/Line tabulation block files, one a state, whose
// table holds each block's housing units (HOUSING20) and a point inside it (INTPTLAT20, INTPTLON20). Only that table is
// read, with range requests into each state's zip, so no block shapes are downloaded (Washington's table is 22 MB of
// its 204 MB zip). Public domain; nothing about a person or an address is read or written.
//
// Each block's homes count toward the 0.005° base cell that holds its point. Each base cell then gets the smallest of
// the five area sizes (steps) whose square holds at least AREA_MIN_HOMES homes, counting only the cells that share
// that square at that size: a post shown over a square says it came from one of those cells (a cell the rule puts in a
// smaller square would have shown that one), so they alone must hold the homes. A base cell whose square at a size
// doesn't, moves to the next size; step 5 (about 7 by 5 miles) is the largest, whatever it holds.
//
// Writes <out>/manifest.json and <out>/tiles/<version>/<lat>_<lng>.bin.gz: one 1° tile of 200 × 200 cells, a byte each (the
// step), south to north and west to east, gzip'd. Only tiles holding a block are written; a point in any other answers
// step 5. Prints counts only.
//
//   node backend/scripts/area-cells/build.cjs --out <dir> [--states 53,41] [--bbox south,west,north,east] [--cache <dir>]
//     --states  state FIPS codes (default: the 50 states, DC and Puerto Rico)
//     --bbox    keep only the tiles this box touches (a local rig's sample). Homes in states not built aren't counted,
//               so a tile across a state line reads larger areas on the side not built: never smaller.
//     --cache   keep each state's table here (tl_2020_<ss>_tabblock20.dbf) and read it from here next time
// Needs Node 22 and nothing else (.github/workflows/area-cells.yml runs it by hand). The file servers read ships in the
// repository: after a change here, rebuild it with --out backend/data/area-cells and commit it.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  baseCell, tileOf, STEP_CELLS, LARGEST_STEP, AREA_MIN_HOMES, TILE_CELLS, TILE_BYTES, FORMAT,
} = require('../../utils/areaCells');

const SOURCE_URL = 'https://www2.census.gov/geo/tiger/TIGER2020/TABBLOCK20/tl_2020_{ss}_tabblock20.zip';
const SOURCE = 'US Census Bureau, 2020 Census: TIGER/Line tabulation blocks (HOUSING20 at INTPTLAT20, INTPTLON20)';
// Changes when the rule or the source does, so servers never mix tiles of two builds.
const VERSION = 'census2020-r1';
const ALL_STATES = [
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16', '17', '18', '19', '20', '21', '22', '23',
  '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '44',
  '45', '46', '47', '48', '49', '50', '51', '53', '54', '55', '56', '72',
];
const USER_AGENT = 'Pantopus area cells build (public Census data)';
const TRIES = 4;

function parseArgs(argv) {
  const opts = { states: ALL_STATES };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--cache') opts.cache = argv[++i];
    else if (arg === '--states') opts.states = argv[++i].split(/[\s,]+/).filter(Boolean);
    else if (arg === '--bbox') {
      const [south, west, north, east] = argv[++i].split(',').map(Number);
      if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
        throw new Error('--bbox is south,west,north,east');
      }
      opts.bbox = { south, west, north, east };
    } else throw new Error(`Unknown argument ${arg}`);
  }
  if (!opts.out) throw new Error('--out <dir> is required');
  if (!opts.states.every((ss) => /^\d{2}$/.test(ss))) throw new Error('--states takes two-digit state FIPS codes');
  return opts;
}

// ─── Reading one state's table ─────────────────────────────────────────────

async function fetchRange(url, range) {
  let lastError = null;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Range: `bytes=${range}`, 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5 * 60 * 1000) });
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new Error(`${url} answered ${response.status} to a range request`);
      }
      const total = Number(/\/(\d+)$/.exec(response.headers.get('content-range') || '')?.[1]);
      return { bytes: Buffer.from(await response.arrayBuffer()), total };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => { setTimeout(resolve, 2000 * attempt); });
    }
  }
  throw lastError;
}

/** The .dbf inside a remote zip, read with range requests: its central directory, then that one member. */
async function remoteDbf(url) {
  const tail = await fetchRange(url, '-65536');
  const end = tail.bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || !Number.isFinite(tail.total)) throw new Error(`${url} isn't a zip this script reads`);
  const entries = tail.bytes.readUInt16LE(end + 10);
  const dirSize = tail.bytes.readUInt32LE(end + 12);
  const dirOffset = tail.bytes.readUInt32LE(end + 16);
  const tailStart = tail.total - tail.bytes.length;
  const dir = dirOffset >= tailStart
    ? tail.bytes.subarray(dirOffset - tailStart, dirOffset - tailStart + dirSize)
    : (await fetchRange(url, `${dirOffset}-${dirOffset + dirSize - 1}`)).bytes;
  let at = 0;
  for (let n = 0; n < entries; n += 1) {
    if (dir.readUInt32LE(at) !== 0x02014b50) throw new Error(`${url}: a damaged central directory`);
    const method = dir.readUInt16LE(at + 10);
    const packed = dir.readUInt32LE(at + 20);
    const size = dir.readUInt32LE(at + 24);
    const nameLength = dir.readUInt16LE(at + 28);
    const local = dir.readUInt32LE(at + 42);
    const name = dir.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + dir.readUInt16LE(at + 30) + dir.readUInt16LE(at + 32);
    if (!name.toLowerCase().endsWith('.dbf')) continue;
    const header = (await fetchRange(url, `${local}-${local + 29}`)).bytes;
    const start = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = (await fetchRange(url, `${start}-${start + packed - 1}`)).bytes;
    const dbf = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    if (!dbf || dbf.length !== size) throw new Error(`${url}: ${name} couldn't be read (method ${method})`);
    return dbf;
  }
  throw new Error(`${url} holds no .dbf`);
}

async function stateTable(ss, cache) {
  const file = cache ? path.join(cache, `tl_2020_${ss}_tabblock20.dbf`) : null;
  if (file && fs.existsSync(file)) return fs.readFileSync(file);
  const dbf = await remoteDbf(SOURCE_URL.replace('{ss}', ss));
  if (file) {
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(file, dbf);
  }
  return dbf;
}

/** Calls `each(homes, latitude, longitude)` for every block in a dBASE table holding the three fields. */
function eachBlock(dbf, each) {
  const records = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const recordLength = dbf.readUInt16LE(10);
  const fields = new Map();
  let offset = 1;
  for (let at = 32; at < headerLength - 1 && dbf[at] !== 0x0d; at += 32) {
    const name = dbf.subarray(at, at + 11).toString('latin1').replace(/\0.*$/s, '');
    fields.set(name, { offset, length: dbf[at + 16] });
    offset += dbf[at + 16];
  }
  const want = ['HOUSING20', 'INTPTLAT20', 'INTPTLON20'].map((name) => {
    const field = fields.get(name);
    if (!field) throw new Error(`The block table has no ${name}`);
    return field;
  });
  const read = (record, { offset: from, length }) => Number(dbf.toString('latin1', record + from, record + from + length).trim());
  for (let n = 0; n < records; n += 1) {
    const record = headerLength + n * recordLength;
    if (dbf[record] === 0x2a) continue; // deleted
    const [homes, latitude, longitude] = want.map((field) => read(record, field));
    if (Number.isFinite(homes) && Number.isFinite(latitude) && Number.isFinite(longitude)) each(homes, latitude, longitude);
  }
  return records;
}

// ─── Steps ─────────────────────────────────────────────────────────────────

/** For one tile's homes per base cell, each cell's step (1 to 5), and its step by the plain rule (for the summary). */
function tileSteps(homes) {
  const squares = STEP_CELLS.map((size) => TILE_CELLS / size);
  const squareOf = (s, cell) => {
    const size = STEP_CELLS[s];
    const row = Math.floor(cell / TILE_CELLS);
    const col = cell % TILE_CELLS;
    return Math.floor(row / size) * squares[s] + Math.floor(col / size);
  };
  const totals = squares.map((n) => new Float64Array(n * n));
  for (let cell = 0; cell < TILE_BYTES; cell += 1) {
    if (!homes[cell]) continue;
    for (let s = 0; s < STEP_CELLS.length; s += 1) totals[s][squareOf(s, cell)] += homes[cell];
  }
  // The plain rule: the smallest square holding AREA_MIN_HOMES homes.
  const plain = new Uint8Array(TILE_BYTES);
  for (let cell = 0; cell < TILE_BYTES; cell += 1) {
    let s = 0;
    while (s < LARGEST_STEP - 1 && totals[s][squareOf(s, cell)] < AREA_MIN_HOMES) s += 1;
    plain[cell] = s + 1;
  }
  // Then, smallest size first: the cells sharing a square at a size must hold AREA_MIN_HOMES between them, or move up.
  // A move only ever adds cells to a larger size, so a size once settled stays settled.
  const steps = Uint8Array.from(plain);
  for (let s = 0; s < LARGEST_STEP - 1; s += 1) {
    const group = new Float64Array(squares[s] * squares[s]);
    for (let cell = 0; cell < TILE_BYTES; cell += 1) if (steps[cell] === s + 1) group[squareOf(s, cell)] += homes[cell];
    for (let cell = 0; cell < TILE_BYTES; cell += 1) {
      if (steps[cell] === s + 1 && group[squareOf(s, cell)] < AREA_MIN_HOMES) steps[cell] = s + 2;
    }
  }
  return { steps, plain };
}

function bboxTiles(bbox) {
  if (!bbox) return null;
  const names = new Set();
  const south = Math.floor(baseCell(bbox.south) / TILE_CELLS);
  const north = Math.floor(baseCell(bbox.north) / TILE_CELLS);
  const west = Math.floor(baseCell(bbox.west) / TILE_CELLS);
  const east = Math.floor(baseCell(bbox.east) / TILE_CELLS);
  for (let lat = south; lat <= north; lat += 1) for (let lng = west; lng <= east; lng += 1) names.add(`${lat}_${lng}`);
  return names;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keep = bboxTiles(opts.bbox);
  const tiles = new Map();
  for (const ss of opts.states) {
    const dbf = await stateTable(ss, opts.cache);
    let kept = 0;
    let keptHomes = 0;
    const blocks = eachBlock(dbf, (homes, latitude, longitude) => {
      const { name, index } = tileOf(baseCell(latitude), baseCell(longitude));
      if (keep && !keep.has(name)) return;
      if (!tiles.has(name)) tiles.set(name, new Uint32Array(TILE_BYTES));
      tiles.get(name)[index] += homes;
      kept += 1;
      keptHomes += homes;
    });
    console.log(`state ${ss}: ${blocks} blocks read (${(dbf.length / 1e6).toFixed(1)} MB), ${kept} kept, ${keptHomes} homes`);
  }

  const tileDir = path.join(opts.out, 'tiles', VERSION);
  fs.mkdirSync(tileDir, { recursive: true });
  const homesByStep = new Array(LARGEST_STEP + 1).fill(0);
  const plainByStep = new Array(LARGEST_STEP + 1).fill(0);
  let movedHomes = 0;
  const names = [...tiles.keys()].sort();
  for (const name of names) {
    const homes = tiles.get(name);
    const { steps, plain } = tileSteps(homes);
    for (let cell = 0; cell < TILE_BYTES; cell += 1) {
      homesByStep[steps[cell]] += homes[cell];
      plainByStep[plain[cell]] += homes[cell];
      if (steps[cell] !== plain[cell]) movedHomes += homes[cell];
    }
    fs.writeFileSync(path.join(tileDir, `${name}.bin.gz`), zlib.gzipSync(Buffer.from(steps), { level: 9 }));
  }
  const total = homesByStep.reduce((a, b) => a + b, 0);
  fs.writeFileSync(path.join(opts.out, 'manifest.json'), `${JSON.stringify({
    v: FORMAT,
    version: VERSION,
    built_at: new Date().toISOString(),
    source: SOURCE,
    min_homes: AREA_MIN_HOMES,
    step_cells: STEP_CELLS,
    states: opts.states,
    ...(opts.bbox ? { bbox: opts.bbox } : {}),
    homes: total,
    dir: `tiles/${VERSION}`,
    tiles: names,
  }, null, 2)}\n`);
  const share = (n) => (total ? `${((100 * n) / total).toFixed(1)}%` : '0%');
  console.log(`${names.length} tiles, ${total} homes`);
  for (let s = 1; s <= LARGEST_STEP; s += 1) {
    console.log(`  step ${s}: ${share(homesByStep[s])} of homes (the plain rule alone: ${share(plainByStep[s])})`);
  }
  console.log(`  homes whose area grew so the cells sharing it hold ${AREA_MIN_HOMES} homes: ${share(movedHomes)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
