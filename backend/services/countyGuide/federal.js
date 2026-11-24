'use strict';

/**
 * Federal facts about a county for its page, each with its office and date:
 *
 *   hazards    FEMA's National Risk Index, county table: the rating for each of its 18 hazards, in FEMA's words. One
 *              public feature service (FEMA's own ArcGIS organization), no key; the whole table is read at once and
 *              kept 30 days in the shared PlaceSectionCache, the old copy served while FEMA is down.
 *   disasters  OpenFEMA's Disaster Declarations Summaries: every federal declaration naming the county, newest first.
 *              Kept 7 days per county.
 *   radon      EPA's Map of Radon Zones (1993), from the CountyRadonZone table the Place section reads.
 *   floodCost  What flood policies in the county cost, from the county benchmark nfipPremiumService.js keeps. Read from
 *              its cache only: a county page never queues a fetch, as the anonymous lookup doesn't.
 *
 * Nothing here is about one home. Every reading is a county's.
 */

const logger = require('../../utils/logger');
const supabaseAdmin = require('../../config/supabaseAdmin');
const { readThrough } = require('../placeSectionCache');
const nfip = require('../nfipPremiumService');

const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

const NRI_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';
const OPENFEMA_DECLARATIONS = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';

// FEMA's field prefix and the hazard's name, in the order FEMA lists them.
const HAZARDS = [
  ['AVLN', 'Avalanche'], ['CFLD', 'Coastal flooding'], ['CWAV', 'Cold wave'], ['DRGT', 'Drought'],
  ['ERQK', 'Earthquake'], ['HAIL', 'Hail'], ['HWAV', 'Heat wave'], ['HRCN', 'Hurricane'], ['ISTM', 'Ice storm'],
  ['IFLD', 'Inland flooding'], ['LNDS', 'Landslide'], ['LTNG', 'Lightning'], ['SWND', 'Strong wind'],
  ['TRND', 'Tornado'], ['TSUN', 'Tsunami'], ['VLCN', 'Volcanic activity'], ['WFIR', 'Wildfire'],
  ['WNTW', 'Winter weather'],
];

// FEMA's five ratings, lowest first, in its own words. "No Rating", "Not Applicable" and "Insufficient Data" are no row.
const RATINGS = ['Very Low', 'Relatively Low', 'Relatively Moderate', 'Relatively High', 'Very High'];
const RATING_WORDS = ['Very low', 'Relatively low', 'Relatively moderate', 'Relatively high', 'Very high'];

// OpenFEMA's declaration types, in FEMA's words.
const DECLARATION_TYPES = { DR: 'Major disaster', EM: 'Emergency', FM: 'Fire management' };

/** The Pacific day of an ISO time, "2026-11-23", as the page dates what it read. */
const pacificDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : null);

/** FEMA's incident types are title case ("Severe Storm"); the page writes sentence case. */
const sentenceCase = (text) => (typeof text === 'string' && text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : null);

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// The table, as { version, ratings: { fips: "0..5 per hazard" } }: a digit per hazard keeps the cached row small.
async function fetchRiskTable() {
  const ratings = {};
  let version = null;
  for (let offset = 0; offset < 10000; offset += 2000) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: ['STCOFIPS', 'NRI_VER', ...HAZARDS.map(([field]) => `${field}_RISKR`)].join(','),
      orderByFields: 'STCOFIPS',
      returnGeometry: 'false',
      resultOffset: String(offset),
      resultRecordCount: '2000',
      f: 'json',
    });
    const data = await getJson(`${NRI_URL}?${params}`);
    if (data?.error) throw new Error(`NRI ${data.error.code || 'error'}`);
    const features = Array.isArray(data?.features) ? data.features : [];
    for (const { attributes: row } of features) {
      if (!/^\d{5}$/.test(row?.STCOFIPS || '')) continue;
      ratings[row.STCOFIPS] = HAZARDS.map(([field]) => RATINGS.indexOf(row[`${field}_RISKR`]) + 1).join('');
      if (typeof row.NRI_VER === 'string' && !version) version = row.NRI_VER;
    }
    if (!data.exceededTransferLimit && features.length < 2000) break;
  }
  // A short read is a broken one: FEMA rates about 3,200 counties.
  if (Object.keys(ratings).length < 3000) throw new Error(`NRI table short: ${Object.keys(ratings).length}`);
  return { version, ratings };
}

let riskTable = { at: 0, value: null };

async function riskTableNow() {
  if (riskTable.value && Date.now() - riskTable.at < DAY_MS) return riskTable.value;
  const { payload, fetchedAt } = await readThrough({
    cacheKey: 'all',
    sectionId: '_nri_counties',
    ttlMs: 30 * DAY_MS,
    fetch: fetchRiskTable,
  });
  riskTable = { at: Date.now(), value: payload ? { ...payload, read: pacificDay(fetchedAt) } : null };
  return riskTable.value;
}

/** FEMA's ratings for a county: { version, read, rows: [{ label, level, word }] } in FEMA's order, or null. */
async function hazards(fips) {
  try {
    const table = await riskTableNow();
    const digits = table?.ratings?.[fips];
    if (!digits) return null;
    const rows = HAZARDS.flatMap(([, label], i) => {
      const level = Number(digits[i]);
      return level >= 1 && level <= 5 ? [{ label, level, word: RATING_WORDS[level - 1] }] : [];
    });
    return rows.length ? { version: table.version, read: table.read, rows } : null;
  } catch (err) {
    logger.warn('countyGuide: risk index unavailable', { error: err.message });
    return null;
  }
}

async function fetchDeclarations(fips) {
  const params = new URLSearchParams({
    $filter: `fipsStateCode eq '${fips.slice(0, 2)}' and fipsCountyCode eq '${fips.slice(2)}'`,
    $select: 'disasterNumber,declarationDate,declarationType,incidentType',
    $orderby: 'declarationDate desc',
    $top: '1000',
  });
  const data = await getJson(`${OPENFEMA_DECLARATIONS}?${params}`);
  const rows = Array.isArray(data?.DisasterDeclarationsSummaries) ? data.DisasterDeclarationsSummaries : null;
  if (!rows) throw new Error('OpenFEMA answered without declarations');
  // One line per declaration: FEMA lists a county once per program and area it designates.
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const date = typeof row.declarationDate === 'string' ? row.declarationDate.slice(0, 10) : null;
    if (!row.disasterNumber || !date || seen.has(row.disasterNumber)) continue;
    seen.add(row.disasterNumber);
    items.push({ number: row.disasterNumber, date, type: row.declarationType || null, incident: row.incidentType || null });
  }
  return { total: items.length, first: items.length ? items[items.length - 1].date : null, items: items.slice(0, 8) };
}

/** OpenFEMA's declarations for a county: { total, first, read, items: [{ number, date, type, kind, incident }] }, or null. */
async function disasters(fips) {
  try {
    const { payload, fetchedAt } = await readThrough({
      cacheKey: `county:${fips}`,
      sectionId: '_fema_declarations',
      ttlMs: 7 * DAY_MS,
      fetch: () => fetchDeclarations(fips),
      // A county FEMA has never declared is an answer, kept like any other.
      isUsable: (payload) => Boolean(payload && Array.isArray(payload.items)),
    });
    if (!payload?.total) return null;
    return {
      total: payload.total,
      first: payload.first,
      read: pacificDay(fetchedAt),
      items: payload.items.map((item) => ({
        ...item,
        incident: sentenceCase(item.incident),
        kind: DECLARATION_TYPES[item.type] || null,
        id: item.type ? `FEMA-${item.number}-${item.type}` : `FEMA-${item.number}`,
      })),
    };
  } catch (err) {
    logger.warn('countyGuide: declarations unavailable', { fips, error: err.message });
    return null;
  }
}

/** EPA's radon zone for a county (1, 2 or 3), or null. Connecticut's planning regions have none: EPA zoned its old counties. */
async function radon(fips) {
  if (/^091[1-9]0$/.test(fips)) return null;
  try {
    const { data, error } = await supabaseAdmin.from('CountyRadonZone').select('zone').eq('county_fips', fips).maybeSingle();
    if (error) throw new Error(error.message);
    const zone = Number(data?.zone);
    return zone >= 1 && zone <= 3 ? { zone } : null;
  } catch (err) {
    logger.warn('countyGuide: radon zone unavailable', { fips, error: err.message });
    return null;
  }
}

/** What flood policies in the county cost, from the benchmark's cache only: { median, p25, p75, months, read }, or null. */
async function floodCost(fips) {
  try {
    const benchmark = await nfip.getCountyBenchmark(fips, { enqueue: false });
    const data = benchmark?.status === 'ready' ? benchmark.data : null;
    if (!data || !Number.isFinite(data.premium_median)) return null;
    return {
      median: Math.round(data.premium_median),
      p25: Number.isFinite(data.premium_p25) ? Math.round(data.premium_p25) : null,
      p75: Number.isFinite(data.premium_p75) ? Math.round(data.premium_p75) : null,
      months: data.window_months || nfip.WINDOW_MONTHS,
      read: pacificDay(benchmark.fetchedAt),
    };
  } catch (err) {
    logger.warn('countyGuide: flood policy costs unavailable', { fips, error: err.message });
    return null;
  }
}

module.exports = { hazards, disasters, radon, floodCost, HAZARDS, OPENFEMA_NOTICE: nfip.OPENFEMA_NOTICE };
