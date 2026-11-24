'use strict';

/**
 * The part of a home's record anyone who looks up its address sees (~/pantopus-home-record/SPEC.md, sections 2 and 4):
 *
 *   facts    the county record's fixed list only (rule 4): home type, year built, living area, lot size, bedrooms,
 *            bathrooms, stories. Never a fact marked `value` or `owner` in propertyRecords/facts.js.
 *   meters   the area's ratings the lookup already composes (FEMA's flood map, USGS seismic design, USFS wildfire
 *            hazard, today's air) and FEMA's National Risk Index by tract (riskIndex.js), each on the lookup's own time
 *            budget: a slow source is left out, never waited on.
 *   closed   one item for each thing the record really holds for this home and opens for its confirmed owner (rule 1),
 *            with a name and one line, never a value (rule 2).
 */

const { FACTS } = require('../propertyRecords/facts');
const similarHomes = require('../propertyRecords/similarHomes');
const valueEstimate = require('../propertyRecords/valueEstimate');
const { geocodeToTractCached } = require('../ai/neighborhoodProfileService');
const adapters = require('../placeSectionAdapters');
const placeIntelligenceService = require('../placeIntelligenceService');
const { encodeGeohash } = require('../../utils/geohash');
const logger = require('../../utils/logger');
const riskIndex = require('./riskIndex');
const recordingAlerts = require('./recordingAlerts');
const { positive, grouped, countWord, dateLabel, plural, HOME_TYPES, AREA_NOTE, PRIVACY_NOTE, PROMISE } = require('./words');

// The open facts (rule 4). Anything else on the record stays on the server.
const OPEN_FACTS = ['year_built', 'living_sqft', 'lot_acres', 'lot_sqft', 'bedrooms', 'bathrooms', 'stories'];
for (const name of OPEN_FACTS) {
  if (!FACTS[name] || FACTS[name].value || FACTS[name].owner) throw new Error(`homeRecord: ${name} can't be an open fact`);
}

/** "Clark County Assessor's records · updated Nov 17, 2026". */
function recordSource(copy) {
  const whose = copy.match === 'building_only' || copy.match === 'ambiguous' ? ' for the building' : '';
  const updated = dateLabel(copy.as_of);
  return [`${copy.publisher}'s records${whose}`, updated ? `updated ${updated}` : null, copy.notice || null].filter(Boolean).join(' · ');
}

function lotTile(facts) {
  const acres = positive(facts.lot_acres);
  const sqft = positive(facts.lot_sqft);
  // Under a tenth of an acre reads better in square feet.
  if (sqft && (!acres || acres < 0.1)) return { label: 'Lot', value: grouped(Math.round(sqft)), unit: 'sq ft' };
  if (acres) return { label: 'Lot', value: grouped(acres, 2), unit: acres === 1 ? 'acre' : 'acres' };
  return null;
}

/** The `facts` block: up to three tiles and one line, from the open facts only. Null when the record gives none. */
function factsBlock(copy) {
  if (!copy?.facts) return null;
  const facts = Object.fromEntries(OPEN_FACTS.filter((name) => copy.facts[name] !== undefined).map((name) => [name, copy.facts[name]]));
  const year = positive(facts.year_built);
  const living = positive(facts.living_sqft);
  const tiles = [
    year && year >= 1600 && year <= 2200 ? { label: 'Built', value: String(Math.round(year)), unit: null } : null,
    living ? { label: 'Living area', value: grouped(Math.round(living)), unit: 'sq ft' } : null,
    lotTile(facts),
  ].filter(Boolean);
  const bedrooms = positive(facts.bedrooms);
  const bathrooms = positive(facts.bathrooms);
  const stories = positive(facts.stories);
  const parts = [
    HOME_TYPES[copy.home_type] || null,
    bedrooms ? plural(Math.round(bedrooms), 'bedroom', 'bedrooms') : null,
    bathrooms ? plural(bathrooms, 'bathroom', 'bathrooms') : null,
    stories ? plural(stories, 'story', 'stories') : null,
  ].filter(Boolean);
  if (!tiles.length && parts.length < 2) return null;
  return { kind: 'facts', id: 'facts', tiles, line: parts.length ? parts.join(' · ') : null, source: recordSource(copy) };
}

const toneOf = (level) => (level <= 2 ? 'low' : level === 3 ? 'mid' : 'high');
const row = (label, level, word) => ({ label, level, tone: toneOf(level), word });

const SEISMIC = { A: [1, 'Very low'], B: [2, 'Low'], C: [3, 'Moderate'], D: [4, 'High'], E: [5, 'Very high'] };
const AQI = { good: 1, moderate: 2, unhealthy_sensitive: 3, unhealthy: 4, very_unhealthy: 5, hazardous: 5 };

function floodRow(flood) {
  if (!flood?.flood_zone) return null;
  const zone = String(flood.flood_zone);
  const risk = placeIntelligenceService.floodRiskLevel(zone);
  if (risk === 'high') return row('Flood', 5, `High · Zone ${zone}`);
  if (risk === 'moderate') return row('Flood', 3, `Moderate · Zone ${zone}`);
  return row('Flood', 1, `Minimal · Zone ${zone}`);
}

const dataOf = (envelopes, id) => {
  const env = Array.isArray(envelopes) ? envelopes.find((each) => each?.id === id) : null;
  return env && ['ready', 'stale', 'partial'].includes(env.status) ? env.data : null;
};

function seismicRow(envelopes) {
  const sdc = String(dataOf(envelopes, 'seismic')?.design_category || '').toUpperCase();
  return SEISMIC[sdc] ? row('Earthquake', SEISMIC[sdc][0], `${SEISMIC[sdc][1]} · Category ${sdc}`) : null;
}

function wildfireRow(envelopes) {
  const data = dataOf(envelopes, 'wildfire');
  if (!data) return null;
  const level = Number(data.hazard_class);
  if (data.burnable && level >= 1 && level <= 5) return row('Wildfire', level, data.hazard_label);
  return data.burnable === false ? row('Wildfire', 1, 'Not burnable here') : null;
}

function airRow(aqi) {
  if (!aqi || aqi.aqi == null || !aqi.category) return null;
  const category = placeIntelligenceService.mapAqiCategory(aqi.category);
  return row('Air today', AQI[category] || 1, String(aqi.category));
}

// Who each row's rating comes from, for the block's note.
function sourcesNote({ flood, seismic, wildfire, nri, air }) {
  const offices = [];
  if (flood && nri) offices.push(`FEMA's flood map and National Risk Index${nri.version ? ` (${nri.version})` : ''}`);
  else if (flood) offices.push('FEMA\'s flood map');
  else if (nri) offices.push(`FEMA's National Risk Index${nri.version ? ` (${nri.version})` : ''}`);
  if (seismic) offices.push('U.S. Geological Survey');
  if (wildfire) offices.push('U.S. Forest Service');
  if (air) offices.push(air.is_estimate ? 'NOAA\'s air quality model' : 'EPA\'s AirNow');
  const list = offices.length > 1 ? `${offices.slice(0, -1).join(', ')} and ${offices[offices.length - 1]}` : offices[0];
  return `${AREA_NOTE} ${list}.`;
}

/**
 * The area's readings for a point, each on the lookup's section budget. `flood(lat, lng)` is the lookup's own cached
 * flood reader (routes/public.js), so this page and the lookup share one cache.
 */
async function readings(point, { flood }) {
  const ms = placeIntelligenceService.sectionBudgetMs();
  const within = (promise) => placeIntelligenceService.withinBudget(promise, ms).catch((err) => {
    if (err?.message !== 'over budget') logger.info('homeRecord.reading_failed', { error: err?.message });
    return null;
  });
  // The adapters take a "home": a point named by its ~1 km cell, never by an address.
  const home = { id: `record:${encodeGeohash(point.lat, point.lng, 6)}`, map_center_lat: point.lat, map_center_lng: point.lng };
  const { fetchAQI } = require('../context/aqiProvider');
  const [floodReading, seismic, wildfire, air, nri] = await Promise.all([
    within(Promise.resolve().then(() => flood(point.lat, point.lng))),
    within(adapters.composeSeismic(home)),
    within(adapters.composeWildfire(home)),
    within(fetchAQI(point.lat, point.lng)),
    within(geocodeToTractCached(point.lat, point.lng).then((tract) => (tract ? riskIndex.forTract(tract.tractId) : null))),
  ]);
  return { flood: floodReading, seismic, wildfire, air, nri };
}

/** The `meters` block from the area's readings. Null when no source answered in time. */
function metersBlock(read) {
  const nri = Object.fromEntries(riskIndex.rows(read.nri).map((each) => [each.key, row(each.label, each.level, each.word)]));
  const shown = {
    flood: floodRow(read.flood),
    seismic: seismicRow(read.seismic),
    wildfire: wildfireRow(read.wildfire),
    air: airRow(read.air),
  };
  const groups = [
    { title: 'Weather', rows: [nri.hail, nri.strong_wind, nri.tornado, nri.winter_weather] },
    { title: 'Ground and fire', rows: [shown.flood, shown.wildfire, shown.seismic, nri.landslide] },
    { title: 'Air', rows: [shown.air] },
  ].map((group) => ({ ...group, rows: group.rows.filter(Boolean) })).filter((group) => group.rows.length);
  if (!groups.length) return null;
  return {
    kind: 'meters',
    id: 'around',
    title: 'Around this address',
    groups,
    note: sourcesNote({
      flood: shown.flood, seismic: shown.seismic, wildfire: shown.wildfire, air: shown.air ? read.air : null,
      nri: Object.keys(nri).length ? read.nri : null,
    }),
  };
}

// "Price, date and document number".
function listWords(parts) {
  const words = parts.filter(Boolean);
  if (!words.length) return null;
  const text = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function yearsOnRecord(current, history) {
  const years = new Set((Array.isArray(history) ? history : []).filter((entry) => Array.isArray(entry) && positive(entry[1])).map((entry) => entry[0]));
  if (Number.isInteger(current?.year) && positive(current.amount)) years.add(current.year);
  return years.size;
}

const LOWEST_SALE_PRICE = 1000;

/**
 * What the record holds for this home that opens for its owner, as `closed_group` items (SPEC rule 1: only where we hold
 * it; rule 2: a name and one line). `extras`: what was read beside the record ({ similar, estimate }).
 */
function closedItems(copy, { similar = null, estimate = null, years = null, ground = null } = {}) {
  const facts = copy?.facts || {};
  const exact = copy?.match === 'exact';
  const money = [];
  const changes = [];
  const house = [];
  const protect = [];

  // Never how many lines or what kinds (rule 2): `since` is when the county's table begins, not this home's first line.
  const history = facts.recorded_history;
  if (history && Array.isArray(history.lines) && history.lines.length) {
    const since = /^\d{4}$/.test(String(history.since || '')) ? ` since ${history.since}` : '';
    money.push({ icon: 'history', title: 'Recorded history', line: `The county's recorded lines for this home${since}` });
  }
  const valueYears = yearsOnRecord({ year: facts.value_year, amount: facts.market_value || facts.assessed_value }, facts.value_history);
  if (valueYears) money.push({ icon: 'trend', title: 'County value, year by year', line: `${valueYears} ${valueYears === 1 ? 'year' : 'years'} on record` });
  const price = positive(facts.sale_price) >= LOWEST_SALE_PRICE && !(positive(facts.sale_parcels) > 1);
  const saleLine = listWords([price ? 'price' : null, facts.sale_date || facts.sale_month ? 'date' : null, facts.sale_document ? 'document number' : null]);
  if (saleLine && (price || facts.sale_date || facts.sale_month)) money.push({ icon: 'tag', title: 'Last sale', line: saleLine });
  const taxYears = yearsOnRecord({ year: facts.tax_year, amount: facts.tax_amount }, facts.tax_history);
  if (taxYears) money.push({ icon: 'bank', title: 'Property tax, year by year', line: `${taxYears} ${taxYears === 1 ? 'year' : 'years'} on record` });
  if (similar) {
    money.push({ icon: 'bars', title: estimate ? 'Estimate and similar homes' : 'Similar homes', line: `Beside ${similar.homes} similar homes on this street` });
  } else if (estimate) {
    money.push({ icon: 'bars', title: 'Pantopus estimate', line: 'A range from county values and public sales' });
  }
  if (exact && Array.isArray(facts.exemptions)) {
    money.push({ icon: 'shield', title: 'Exemptions on file', line: 'Whether the county shows a property tax exemption on this home' });
  }

  // Survey years cover the point, record or not: a count and the span, nothing about the home.
  if (years && years.count > 1) {
    changes.push({ icon: 'image', title: 'Your lot through the years', line: `${years.count} photos from above, ${years.first} to ${years.last}` });
  }

  // Only the parts that answered for this point are named.
  const groundParts = ground ? [
    ground.soil ? 'soil' : null, ground.soil && ground.soil.slope !== null ? 'slope' : null, ground.elevation ? 'elevation' : null,
    ground.levee ? 'levees' : null, ground.dams ? 'dams' : null,
  ].filter(Boolean) : [];
  if (groundParts.length) house.push({ icon: 'layers', title: 'Ground under your home', line: listWords(groundParts) });

  if (positive(facts.year_built)) {
    house.push({ icon: 'home', title: 'Roof, heating, water heater, panel', line: 'Ages against their typical service life' });
  }
  if (typeof facts.zoning === 'string' && facts.zoning.trim()) {
    house.push({ icon: 'layers', title: 'Lot and zoning', line: 'The zoning code on the county\'s record' });
  }

  if (recordingAlerts.forCounty(copy?.jurisdiction)) {
    protect.push({ icon: 'mail', title: 'Recording alerts', line: 'The county emails you when a document is recorded' });
  }
  // The owner's card figures from the county's last sale price, so it shows where one is held.
  if (price) protect.push({ icon: 'percent', title: 'Mortgage insurance', line: 'When the law lets you ask to drop it' });

  return [
    { id: 'closed_money', title: 'Ownership and money', items: money },
    { id: 'closed_changes', title: 'Changes over time', items: changes },
    { id: 'closed_house', title: 'The house and the ground', items: house },
    { id: 'closed_protect', title: 'Protect it', items: protect },
  ].filter((group) => group.items.length).map((group) => ({ kind: 'closed_group', ...group, chip: 'For the owner' }));
}

/**
 * The closed part for someone who isn't the confirmed owner: the intro, the groups, the promise with the viewer's own
 * next step, and the privacy note. Nothing at all when the record holds nothing to open.
 */
function closedPart(groups, { button, alt }) {
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (!count) return [];
  return [
    {
      kind: 'intro',
      id: 'more',
      title: 'There is more in this home\'s record',
      body: `${countWord(count)} more ${count === 1 ? 'part is' : 'parts are'} ready. ${count === 1 ? 'It belongs' : 'They belong'} to the owner, and ${count === 1 ? 'it is' : 'they are'} free.`,
    },
    ...groups,
    { kind: 'promise', id: 'promise', ...PROMISE, button, alt: alt || null },
    { kind: 'note', id: 'privacy', icon: 'eye_off', text: PRIVACY_NOTE },
  ];
}

/** Similar homes and the estimate, for the closed items' lines: read only, each on its own short wait. */
async function extrasFor(copy, home) {
  const [similar, estimate] = await Promise.all([
    similarHomes.forHome(home, copy).catch(() => null),
    valueEstimate.forCopy(copy, home).catch(() => null),
  ]);
  return { similar, estimate };
}

/** "Lot · 0.21 acres" for the picture's chip, from the open facts; null without a lot size. */
function lotChip(copy) {
  const tile = copy?.facts ? lotTile(copy.facts) : null;
  return tile ? `Lot \u00b7 ${tile.value} ${tile.unit}` : null;
}

/** The header's chip: where the record was found. */
function foundChip(copy) {
  if (!copy?.publisher) return null;
  const county = copy.facts?.county && typeof copy.facts.county === 'string' ? copy.facts.county : null;
  const name = county && !/county|parish|borough/i.test(county) ? `${county} County` : county;
  return { tone: 'success', text: `Found in ${name || copy.publisher}'s records` };
}

module.exports = { lotChip, factsBlock, readings, metersBlock, closedItems, closedPart, extrasFor, foundChip, recordSource, OPEN_FACTS };
