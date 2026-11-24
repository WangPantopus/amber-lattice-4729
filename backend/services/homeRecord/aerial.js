'use strict';

/**
 * The picture from above: the newest federal aerial survey of the block around a home (USDA's National Agriculture
 * Imagery Program, public domain), found and cut through Microsoft's Planetary Computer, which holds every NAIP year as
 * public files, with the U.S. Geological Survey's own NAIP service as the fallback
 * (docs/research/provider-replacement/cost-and-rights.md). The caption gives USDA's Farm Service Agency the credit it asks for.
 *
 * Cached by map point, never by address, and only in this server's memory: the frame is a ~5 m map cell's
 * (geohash 9), the image is cut when a screen first asks for it and kept a while for the next one, and nothing durable
 * records which points were looked at. Apps load the image from our own API (GET /api/public/home-record/aerial.jpg,
 * the cell in the query string, which the request log leaves out), so Microsoft sees this server, never the person.
 *
 * The lot is outlined only where its parcel's shape is held. The index doesn't hold parcel shapes yet, so `outline` is
 * null for now (~/pantopus-home-record/REQUESTS.md).
 */

const { encodeGeohash, decodeGeohashBbox } = require('../../utils/geohash');
const { GeoCache } = require('../../utils/geoCache');
const logger = require('../../utils/logger');
const { countWord } = require('./words');

const STAC_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const CROP_URL = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox';
// The fallback while Planetary Computer (a free "preview" service with no uptime promise) can't answer: the U.S.
// Geological Survey's own NAIP service, public domain, often an older and softer survey.
const USGS_URL = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer';
const USGS_ID = 'usgs_naip_plus';
const CELL_PRECISION = 9;
// The frame: about 240 m across, the block around the home, at the design's 1040 x 680 shape.
const WIDTH_PX = 800;
const HEIGHT_PX = 523;
const FRAME_WIDTH_M = 240;
const FRAME_HEIGHT_M = FRAME_WIDTH_M * (HEIGHT_PX / WIDTH_PX);
const METERS_PER_DEGREE = 111320;
const SEARCH_TIMEOUT_MS = 4000;
const CROP_TIMEOUT_MS = 15000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// A NAIP item's id: state, quarter quad, resolution, date(s). Nothing else is passed to the cropper.
const ITEM_ID = /^(?:[a-z]{2}_m_\d{7}_[a-z]{2}_\d{2}_\d{1,3}_\d{8}(?:_\d{8})?|usgs_naip_plus)$/;
const CELL = /^[0-9b-hjkmnp-z]{9}$/;

const surveysAt = new GeoCache(5000);
const images = new GeoCache(300);
const cutting = new Map();

/** The frame for a map cell: its middle and the box around it, [west, south, east, north]. */
function frameOf(cell) {
  const box = decodeGeohashBbox(cell);
  const lat = (box.minLat + box.maxLat) / 2;
  const lng = (box.minLng + box.maxLng) / 2;
  const dLat = FRAME_HEIGHT_M / 2 / METERS_PER_DEGREE;
  const dLng = FRAME_WIDTH_M / 2 / (METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  return { lat, lng, bbox: [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => Math.round(n * 1e6) / 1e6) };
}

// Ray casting on a polygon's outer ring ([lng, lat] pairs).
function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function covers(geometry, [w, s, e, n]) {
  const rings = geometry?.type === 'Polygon' ? [geometry.coordinates[0]]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates.map((polygon) => polygon[0]) : [];
  return [[w, s], [e, s], [e, n], [w, n]].every((corner) => rings.some((ring) => inside(corner, ring)));
}

async function fetchWithin(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every NAIP survey whose image covers the whole frame, newest first: `{ id, date, year, gsd }`. Kept in memory a day
 * per cell. Empty where none covers it (outside the U.S., a frame across two quarter quads).
 */
async function surveys(cell) {
  const cached = surveysAt.get(cell);
  if (cached) return cached;
  let found;
  try {
    found = await planetarySurveys(cell);
  } catch (err) {
    logger.info('homeRecord.aerial_search_fallback', { error: err.message });
    found = await usgsSurveys(cell);
    // A fallback answer is kept briefly, so the newer survey comes back once Planetary Computer answers again.
    surveysAt.set(cell, found, 60 * 60 * 1000);
    return found;
  }
  surveysAt.set(cell, found, DAY_MS);
  return found;
}

/** The newest NAIP survey USGS serves at the frame's middle (one image service; its newest survey is on top). */
async function usgsSurveys(cell) {
  const { lat, lng } = frameOf(cell);
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', returnCatalogItems: 'true', returnGeometry: 'false', f: 'json',
  });
  const res = await fetchWithin(`${USGS_URL}/identify?${params}`, {}, SEARCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`USGS search ${res.status}`);
  const body = await res.json();
  const newest = (body.catalogItems?.features || []).map((feature) => feature.attributes || {})
    .filter((item) => item.Category === 1 && Number.isFinite(Number(item.acquisition_date)))
    .sort((a, b) => Number(b.acquisition_date) - Number(a.acquisition_date))[0];
  if (!newest) return [];
  const date = new Date(Number(newest.acquisition_date)).toISOString().slice(0, 10);
  return [{ id: USGS_ID, date, year: Number(date.slice(0, 4)), gsd: Number(newest.resolution_value) || null }];
}

async function planetarySurveys(cell) {
  const { bbox } = frameOf(cell);
  const res = await fetchWithin(STAC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: ['naip'], bbox, limit: 40, sortby: [{ field: 'datetime', direction: 'desc' }] }),
  }, SEARCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`NAIP search ${res.status}`);
  const body = await res.json();
  return (body.features || [])
    .filter((feature) => ITEM_ID.test(feature.id) && covers(feature.geometry, bbox) && /^\d{4}-\d{2}-\d{2}/.test(feature.properties?.datetime || ''))
    .map((feature) => ({
      id: feature.id,
      date: feature.properties.datetime.slice(0, 10),
      year: Number(feature.properties.datetime.slice(0, 4)),
      gsd: Number(feature.properties.gsd) || null,
    }))
    // Newest first; in one year (a state line, where two states' surveys overlap), the sharper one.
    .sort((a, b) => b.year - a.year || (a.gsd || 9) - (b.gsd || 9) || b.date.localeCompare(a.date));
  return found;
}

const monthYear = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

/** Our own path for a survey's image of a cell. A path on the API's host; the apps load it there. */
const imagePath = (cell, survey) => `/api/public/home-record/aerial.jpg?at=${cell}&item=${encodeURIComponent(survey.id)}`;

/**
 * The image's bytes for a cell and survey, cut once and kept in memory. Null for a cell or survey id that isn't one.
 * Concurrent asks for the same image share one cut.
 */
async function image(cell, itemId) {
  if (!CELL.test(String(cell || '')) || !ITEM_ID.test(String(itemId || ''))) return null;
  const key = `${cell}:${itemId}`;
  const cached = images.get(key);
  if (cached) return cached;
  if (cutting.has(key)) return cutting.get(key);
  const cut = (async () => {
    const { bbox } = frameOf(cell);
    const url = itemId === USGS_ID
      ? `${USGS_URL}/exportImage?${new URLSearchParams({ bbox: bbox.join(','), bboxSR: '4326', imageSR: '3857', size: `${WIDTH_PX},${HEIGHT_PX}`, format: 'jpg', f: 'image' })}`
      : `${CROP_URL}/${bbox.join(',')}/${WIDTH_PX}x${HEIGHT_PX}.jpg?${new URLSearchParams({ collection: 'naip', item: itemId, assets: 'image', asset_bidx: 'image|1,2,3' })}`;
    const res = await fetchWithin(url, {}, CROP_TIMEOUT_MS);
    if (!res.ok) throw new Error(`NAIP crop ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('NAIP crop is not a JPEG');
    images.set(key, bytes, DAY_MS);
    return bytes;
  })().finally(() => cutting.delete(key));
  return cutting.set(key, cut).get(key);
}

/**
 * The `picture` block for a home's point: the newest survey's image of the block, the survey's month and year, and the
 * lot's size from the open facts when the record gives it. Cuts the image behind the answer, so it is usually ready
 * when the screen asks. Null when no survey covers the point.
 */
async function pictureBlock(point, { lotChip = null, earlierYearsForOwner = false } = {}) {
  const cell = encodeGeohash(point.lat, point.lng, CELL_PRECISION);
  const found = await surveys(cell);
  const [newest] = found;
  if (!newest) return null;
  const earlier = earlierYearsForOwner ? yearsOf(found).length - 1 : 0;
  image(cell, newest.id).catch((err) => logger.info('homeRecord.aerial_cut_later', { error: err.message }));
  return {
    kind: 'picture',
    id: 'picture',
    above: {
      image_url: imagePath(cell, newest),
      outline: null,
      chips: [lotChip ? { at: 'bl', text: lotChip } : null, { at: 'br', text: String(newest.year) }].filter(Boolean),
    },
    street: { lat: Math.round(point.lat * 1e6) / 1e6, lng: Math.round(point.lng * 1e6) / 1e6 },
    // With no lot outline, the caption says where the home is: the frame is centered on its ~5 m map cell.
    caption: `Federal aerial survey by the U.S. Department of Agriculture, Farm Service Agency, ${monthYear(newest.date)}. This home is at the middle.${earlier > 0 ? ` ${countWord(earlier)} earlier ${earlier === 1 ? 'year is' : 'years are'} in the owner's record.` : ''}`,
  };
}

/** One survey per year (the sharpest where two states' surveys overlap), oldest first. */
function yearsOf(found) {
  const byYear = new Map();
  for (const survey of found) if (!byYear.has(survey.year)) byYear.set(survey.year, survey);
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

/**
 * How many survey years cover a home's point, for the closed item and the picture's caption: `{ count, first, last }`,
 * or null with fewer than two. A count says nothing about the home itself.
 */
async function yearsAt(point) {
  const years = yearsOf(await surveys(encodeGeohash(point.lat, point.lng, CELL_PRECISION)));
  return years.length > 1 ? { count: years.length, first: years[0].year, last: years[years.length - 1].year } : null;
}

/**
 * The owner's `photo_years` block: the block around the home in every survey year (newest last; the apps show it large
 * and the rest as buttons). Each image is cut when a screen first asks for it; the newest is cut behind the answer.
 * Null with fewer than two years (the USGS fallback serves one).
 */
async function photoYearsBlock(point) {
  const cell = encodeGeohash(point.lat, point.lng, CELL_PRECISION);
  const years = yearsOf(await surveys(cell));
  if (years.length < 2) return null;
  const newest = years[years.length - 1];
  image(cell, newest.id).catch((err) => logger.info('homeRecord.aerial_cut_later', { error: err.message }));
  return {
    kind: 'photo_years',
    id: 'lot_years',
    title: 'Your lot through the years',
    count: `${years.length} photos`,
    photos: years.map((survey) => ({ year: String(survey.year), label: monthYear(survey.date), image_url: imagePath(cell, survey), outline: null })),
    note: 'Federal aerial surveys by the U.S. Department of Agriculture, Farm Service Agency. This home is at the middle of each.',
  };
}

module.exports = { pictureBlock, photoYearsBlock, yearsAt, image, surveys, frameOf, imagePath, CELL_PRECISION };
