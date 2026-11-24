'use strict';

/**
 * FEMA's National Risk Index by census tract: how FEMA rates an area for hail, strong wind, tornado, winter weather and
 * landslide. A public feature service (FEMA's own ArcGIS organization), no key, U.S. government data; the version it
 * answers with is in every reading (`NRI_VER`, "December 2025" on November 22, 2026). FEMA says the index is for
 * planning, and the page says each rating is the area's, not a test of the home.
 *
 * Cached by tract, never by address: a fact about land, in the shared PlaceSectionCache for 180 days, the expired row
 * served while FEMA is down. A tract FEMA hasn't rated, or a rating of "No Rating" / "Insufficient Data", is no row.
 */

const { readThrough } = require('../placeSectionCache');

const NRI_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0/query';
const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

// FEMA's field prefix, our key, and the row's label.
const HAZARDS = [
  ['HAIL', 'hail', 'Hail'],
  ['SWND', 'strong_wind', 'Strong wind'],
  ['TRND', 'tornado', 'Tornado'],
  ['WNTW', 'winter_weather', 'Winter weather'],
  ['LNDS', 'landslide', 'Landslide'],
];

// FEMA's five ratings, lowest first, in its own words.
const RATINGS = {
  'Very Low': { level: 1, word: 'Very low' },
  'Relatively Low': { level: 2, word: 'Relatively low' },
  'Relatively Moderate': { level: 3, word: 'Relatively moderate' },
  'Relatively High': { level: 4, word: 'Relatively high' },
  'Very High': { level: 5, word: 'Very high' },
};

async function query(tractId) {
  const params = new URLSearchParams({
    where: `TRACTFIPS='${tractId}'`,
    outFields: ['TRACTFIPS', 'NRI_VER', ...HAZARDS.map(([field]) => `${field}_RISKR`)].join(','),
    returnGeometry: 'false',
    f: 'json',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${NRI_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(`NRI ${data.error.code || 'error'}`);
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs || attrs.TRACTFIPS !== tractId) return null;
    const ratings = {};
    for (const [field, key] of HAZARDS) {
      if (RATINGS[attrs[`${field}_RISKR`]]) ratings[key] = attrs[`${field}_RISKR`];
    }
    return Object.keys(ratings).length ? { ratings, version: typeof attrs.NRI_VER === 'string' ? attrs.NRI_VER : null } : null;
  } finally {
    clearTimeout(timer);
  }
}

/** FEMA's ratings for a tract (11-digit FIPS), or null. Throws only when FEMA can't be asked and nothing is cached. */
async function forTract(tractId) {
  if (!/^\d{11}$/.test(String(tractId || ''))) return null;
  const { payload } = await readThrough({
    cacheKey: `tract:${tractId}`,
    sectionId: '_nri_tract',
    reuseStored: true,
    ttlMs: 180 * DAY_MS,
    fetch: () => query(tractId),
  });
  return payload || null;
}

/** The meters' rows for a reading, in HAZARDS order: `{ key, label, level, word }`. */
function rows(reading) {
  if (!reading?.ratings) return [];
  return HAZARDS.flatMap(([, key, label]) => {
    const rating = RATINGS[reading.ratings[key]];
    return rating ? [{ key, label, level: rating.level, word: rating.word }] : [];
  });
}

module.exports = { forTract, rows, HAZARDS };
