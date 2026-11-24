'use strict';

/**
 * Transportation noise at a point: the U.S. Department of Transportation's National Transportation Noise Map (Bureau of
 * Transportation Statistics, 2022: road, rail and aviation together, 24-hour average sound level), a U.S. government
 * work for "unrestricted public use" with credit to BTS. BTS serves it only as map tiles, with no point query, so this
 * reads the one tile pixel at the point (zoom 12, about 38 m) and matches its colour to the band the service's own legend
 * gives that colour. Under the map's lowest band (45 dB) the tile is clear.
 *
 * BTS says the map is modelled and not meant to judge one location's noise, so the row is the area's band and the note
 * says it is modelled, not measured at the home. Cached by map cell (~38 m), never by address.
 */

const sharp = require('sharp');
const { readThrough } = require('../placeSectionCache');
const { encodeGeohash } = require('../../utils/geohash');

const SERVICE = 'https://tiles.arcgis.com/tiles/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Noise_2022_CONUS_aviation_rail_road/MapServer';
const ZOOM = 12;
const FETCH_TIMEOUT_MS = 6000;
const DAY_MS = 24 * 60 * 60 * 1000;
// The map's lower 48 states: elsewhere a clear pixel says nothing.
const CONUS = { south: 24.4, north: 49.5, west: -125, east: -66.9 };

// Each band, lowest first: the legend's label (matched to the legend the service returns), our words and meter level.
const BANDS = [
  { label: '45.0 - 49.9', word: '45 to 50 dB', level: 1 },
  { label: '50.0 - 54.9', word: '50 to 55 dB', level: 2 },
  { label: '55.0 - 59.9', word: '55 to 60 dB', level: 3 },
  { label: '60.0 - 69.9', word: '60 to 70 dB', level: 4 },
  { label: '70.0 - 79.9', word: '70 to 80 dB', level: 5 },
  { label: '80.0 - 89.9', word: '80 to 90 dB', level: 5 },
  { label: '> 90.0', word: 'Over 90 dB', level: 5 },
];
const QUIET = { word: 'Under 45 dB', level: 1 };

async function fetchWithin(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`BTS noise ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function pixelOf(png, x, y) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (Math.min(y, info.height - 1) * info.width + Math.min(x, info.width - 1)) * 4;
  return [...data.slice(at, at + 4)];
}

// The legend's colour for each band, read from the service once a day (so a restyled map still reads right).
let legend = null;
async function legendColours() {
  if (legend && legend.until > Date.now()) return legend.colours;
  const body = await (await fetchWithin(`${SERVICE}/legend?f=json`)).json();
  const entries = (body.layers || []).flatMap((layer) => layer.legend || []).filter((entry) => entry.label && entry.imageData);
  const colours = [];
  for (const band of BANDS) {
    const entry = entries.find((each) => each.label.replace(/\s+/g, ' ').trim() === band.label);
    if (!entry) continue;
    const [r, g, b] = await pixelOf(Buffer.from(entry.imageData, 'base64'), 10, 10);
    colours.push({ band, rgb: [r, g, b] });
  }
  if (colours.length < BANDS.length - 1) throw new Error('BTS noise legend changed');
  legend = { colours, until: Date.now() + DAY_MS };
  return colours;
}

function tileAt(lat, lng) {
  const n = 2 ** ZOOM;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { tx: Math.floor(x), ty: Math.floor(y), px: Math.floor((x - Math.floor(x)) * 256), py: Math.floor((y - Math.floor(y)) * 256) };
}

/** The noise band at a point: `{ word, level, year }`, or null outside the lower 48 or when BTS can't be read. */
async function bandAt({ lat, lng }) {
  if (lat < CONUS.south || lat > CONUS.north || lng < CONUS.west || lng > CONUS.east) return null;
  const { payload } = await readThrough({
    cacheKey: `geo:${encodeGeohash(lat, lng, 8)}`,
    sectionId: '_noise_2022',
    reuseStored: true,
    ttlMs: 180 * DAY_MS,
    fetch: async () => {
      const { tx, ty, px, py } = tileAt(lat, lng);
      const [colours, tile] = await Promise.all([legendColours(), fetchWithin(`${SERVICE}/tile/${ZOOM}/${ty}/${tx}`)]);
      const [r, g, b, a] = await pixelOf(Buffer.from(await tile.arrayBuffer()), px, py);
      if (a < 128) return { ...QUIET, year: 2022 };
      // The nearest legend colour; a pixel far from every band (a border, an edge blend) says nothing.
      const nearest = colours.map((entry) => ({ ...entry, d: (entry.rgb[0] - r) ** 2 + (entry.rgb[1] - g) ** 2 + (entry.rgb[2] - b) ** 2 }))
        .sort((x, y) => x.d - y.d)[0];
      return nearest && nearest.d < 60 ** 2 ? { word: nearest.band.word, level: nearest.band.level, year: 2022 } : null;
    },
  });
  return payload || null;
}

module.exports = { bandAt };
