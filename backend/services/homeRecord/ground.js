'use strict';

/**
 * "Ground under your home" for the confirmed owner (~/pantopus-home-record/PLAN.md 2c): free federal services, no key.
 *
 *   elevation  U.S. Geological Survey's Elevation Point Query Service, feet above sea level at the point
 *   soil       USDA's Soil Data Access: the soil map unit at the point and its main component's representative slope,
 *              drainage class and corrosion of concrete and steel. Mapped for the area, not tested at the home
 *   levee      U.S. Army Corps of Engineers' National Levee Database, leveed areas: is the point inside one
 *   dams       U.S. Army Corps of Engineers' National Inventory of Dams: dams within 10 miles, and how many FEMA's hazard
 *              potential classification rates high. Distance only: it doesn't say which way water would flow
 *
 * Each is cached by map cell, never by address, in the shared PlaceSectionCache, and read on the lookup's section budget.
 */

const { readThrough } = require('../placeSectionCache');
const { encodeGeohash } = require('../../utils/geohash');

const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;
const EPQS_URL = 'https://epqs.nationalmap.gov/v1/json';
const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
const LEVEED_AREAS_URL = 'https://geospatial.sec.usace.army.mil/dls/rest/services/NLD/Public/FeatureServer/16/query';
const DAMS_URL = 'https://geospatial.sec.usace.army.mil/dls/rest/services/NID/National_Inventory_of_Dams_Public_Service/FeatureServer/0/query';
const DAM_MILES = 10;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body?.error) throw new Error(`ArcGIS ${body.error.code || 'error'}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const cached = (cell, sectionId, fetchPayload) => readThrough({ cacheKey: `geo:${cell}`, sectionId, reuseStored: true, ttlMs: 365 * DAY_MS, fetch: fetchPayload })
  .then(({ payload }) => payload || null);

function elevation({ lat, lng }) {
  return cached(encodeGeohash(lat, lng, 8), '_elevation_ft', async () => {
    const params = new URLSearchParams({ x: String(lng), y: String(lat), wkid: '4326', units: 'Feet', includeDate: 'false' });
    const value = Number((await fetchJson(`${EPQS_URL}?${params}`))?.value);
    // The service answers -1000000 where it has no surface.
    return Number.isFinite(value) && value > -1000 ? { feet: Math.round(value) } : null;
  });
}

function soil({ lat, lng }) {
  return cached(encodeGeohash(lat, lng, 7), '_soil', async () => {
    const point = `point(${lng.toFixed(6)} ${lat.toFixed(6)})`;
    const query = 'SELECT TOP 1 mu.muname, c.compname, c.slope_r, c.drainagecl, c.corcon, c.corsteel '
      + `FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${point}') k `
      + 'JOIN mapunit mu ON mu.mukey = k.mukey JOIN component c ON c.mukey = mu.mukey '
      + "WHERE c.majcompflag = 'Yes' ORDER BY c.comppct_r DESC";
    const body = await fetchJson(SDA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query }) });
    const [names, row] = body?.Table || [];
    if (!names || !row) return null;
    const at = Object.fromEntries(names.map((name, i) => [name, row[i]]));
    return {
      unit: at.muname || null,
      slope: Number.isFinite(Number(at.slope_r)) && at.slope_r !== null ? Number(at.slope_r) : null,
      drainage: at.drainagecl || null,
      concrete: at.corcon || null,
      steel: at.corsteel || null,
    };
  });
}

function levee({ lat, lng }) {
  return cached(encodeGeohash(lat, lng, 8), '_leveed_area', async () => {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'SYSTEM_NAME', returnGeometry: 'false', f: 'json',
    });
    const body = await fetchJson(`${LEVEED_AREAS_URL}?${params}`);
    if (!Array.isArray(body?.features)) return null;
    const system = body.features[0]?.attributes?.SYSTEM_NAME;
    return { behind: body.features.length > 0, system: typeof system === 'string' && system.trim() ? system.trim() : null };
  });
}

function dams({ lat, lng }) {
  return cached(encodeGeohash(lat, lng, 6), '_dams_10mi', async () => {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      distance: String(DAM_MILES), units: 'esriSRUnit_StatuteMile', outFields: 'HAZARD_POTENTIAL', returnGeometry: 'false', f: 'json',
    });
    const body = await fetchJson(`${DAMS_URL}?${params}`);
    if (!Array.isArray(body?.features)) return null;
    const high = body.features.filter((feature) => /^high$/i.test(String(feature.attributes?.HAZARD_POTENTIAL || '').trim())).length;
    return { count: body.features.length, high };
  });
}

/** Every reading for a point, each on its own wait: `{ elevation, soil, levee, dams }`, null where a source didn't answer. */
async function readingsAt(point, within) {
  const [e, s, l, d] = await Promise.all([elevation(point), soil(point), levee(point), dams(point)].map((read) => within(read)));
  return { elevation: e, soil: s, levee: l, dams: d };
}

const answered = (read) => Boolean(read && (read.elevation || read.soil || read.levee || read.dams));

function slopeWord(percent) {
  if (percent < 3) return 'Nearly level';
  if (percent < 8) return 'Gently sloping';
  if (percent < 15) return 'Sloping';
  if (percent < 30) return 'Steep';
  return 'Very steep';
}

const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text);

/** The owner's `tiles` block from the readings. Null when no source answered. */
function groundBlock(read, { title = 'Ground under your home' } = {}) {
  if (!answered(read)) return null;
  const { soil: s } = read;
  const tiles = [
    read.elevation ? { label: 'Elevation', value: `${read.elevation.feet.toLocaleString('en-US')} ft`, line: 'Above sea level' } : null,
    s && s.slope !== null ? { label: 'Slope', value: `${Math.round(s.slope)}%`, line: slopeWord(s.slope) } : null,
    s && s.drainage ? { label: 'Soil drains', value: sentence(s.drainage.replace(/\s*drained$/i, '')), line: s.unit } : null,
    s && s.concrete ? { label: 'Wear on concrete', value: sentence(s.concrete), line: s.steel ? `On steel: ${s.steel.toLowerCase()}` : null } : null,
  ].filter(Boolean);
  const rows = [
    read.levee ? { label: 'Behind a levee', value: read.levee.behind ? (read.levee.system ? `Yes · ${read.levee.system}` : 'Yes') : 'No' } : null,
    read.dams ? {
      label: `Dams within ${DAM_MILES} miles`,
      value: read.dams.count ? `${read.dams.count}${read.dams.high ? ` · ${read.dams.high} rated high hazard potential` : ''}` : 'None',
    } : null,
  ].filter(Boolean);
  if (!tiles.length && !rows.length) return null;
  const offices = [read.elevation ? 'U.S. Geological Survey' : null, s ? 'USDA soil survey' : null, read.levee || read.dams ? 'U.S. Army Corps of Engineers' : null].filter(Boolean);
  const list = offices.length > 1 ? `${offices.slice(0, -1).join(', ')} and ${offices[offices.length - 1]}` : offices[0];
  return {
    kind: 'tiles',
    id: 'ground',
    title,
    tiles,
    rows,
    note: `${list}.${s ? ' The soil is mapped for the area, not tested at this home.' : ''}${read.dams ? ' Dams are counted by distance; a hazard rating is about what a failure would harm, not how likely one is.' : ''}`,
  };
}

module.exports = { readingsAt, groundBlock, answered };
