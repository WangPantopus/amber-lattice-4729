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
const pfas = require('./pfas');
const noise = require('./noise');
const recordingAlerts = require('./recordingAlerts');
const { positive, grouped, countWord, dateLabel, plural, HOME_TYPES, AREA_NOTE, PRIVACY_NOTE, PROMISE, OWNER_PROMISE } = require('./words');

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

// A no-break space keeps a code with its word ("Zone X", "Category D") on one line in every app at phone width.
const NBSP = ' ';

function floodRow(flood) {
  if (!flood?.flood_zone) return null;
  const zone = String(flood.flood_zone);
  const risk = placeIntelligenceService.floodRiskLevel(zone);
  if (risk === 'high') return row('Flood', 5, `High · Zone${NBSP}${zone}`);
  if (risk === 'moderate') return row('Flood', 3, `Moderate · Zone${NBSP}${zone}`);
  return row('Flood', 1, `Minimal · Zone${NBSP}${zone}`);
}

const dataOf = (envelopes, id) => {
  const env = Array.isArray(envelopes) ? envelopes.find((each) => each?.id === id) : null;
  return env && ['ready', 'stale', 'partial'].includes(env.status) ? env.data : null;
};

function seismicRow(envelopes) {
  const sdc = String(dataOf(envelopes, 'seismic')?.design_category || '').toUpperCase();
  return SEISMIC[sdc] ? row('Earthquake', SEISMIC[sdc][0], `${SEISMIC[sdc][1]} · Category${NBSP}${sdc}`) : null;
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

// "CAMAS MUNICIPAL WATER SEWER SYSTEM" reads "Camas Municipal Water Sewer System".
const sentenceName = (name) => String(name).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  .replace(/(?!^)\b(Of|And|The|For)\b/g, (word) => word.toLowerCase());

// Who each row's rating comes from, for the block's note.
function sourcesNote({ flood, seismic, wildfire, nri, air, water, noise: loud }) {
  const version = nri?.version ? ` (${nri.version})` : '';
  const offices = [];
  if (flood && nri) offices.push(`FEMA's flood map and National Risk Index${version}`);
  else if (flood) offices.push('FEMA\'s flood map');
  else if (nri) offices.push(`FEMA's National Risk Index${version}`);
  if (seismic) offices.push('U.S. Geological Survey');
  if (wildfire) offices.push('U.S. Forest Service');
  if (air) offices.push(air.is_estimate ? 'NOAA\'s air quality model' : 'EPA\'s AirNow');
  if (loud) offices.push(`the U.S. Department of Transportation's ${loud.year} noise map`);
  if (water) offices.push(`EPA's 2023-2025 PFAS tests of ${water.system ? sentenceName(water.system) : 'the water system'}`);
  const list = offices.length > 1 ? `${offices.slice(0, -1).join(', ')} and ${offices[offices.length - 1]}` : offices[0];
  // What a row is not, where a reader could take it for this home's own.
  const caveats = [
    loud ? 'Noise is modelled from roads, rail and flights, not measured here.' : null,
    water ? 'PFAS results are the water system\'s, not this home\'s tap.' : null,
  ].filter(Boolean);
  return [AREA_NOTE, `${list}.`, ...caveats].join(' ');
}

/**
 * PFAS for the water system that serves the point: the system from the drinking-water section's own reading (EPA's
 * service-area map, cached by point), only where the map places the point in it, never a county's guess.
 */
async function waterAt(home) {
  const envelopes = await adapters.composeDrinkingWater(home);
  const data = dataOf(envelopes, 'drinking_water');
  if (!data?.pws_id || data.match === 'county' || data.match === 'none') return null;
  const result = await pfas.forSystem(data.pws_id);
  return result ? { ...result, system: data.utility_name || result.system } : null;
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
  const [floodReading, seismic, wildfire, air, nri, water, loud] = await Promise.all([
    within(Promise.resolve().then(() => flood(point.lat, point.lng))),
    within(adapters.composeSeismic(home)),
    within(adapters.composeWildfire(home)),
    within(fetchAQI(point.lat, point.lng)),
    within(geocodeToTractCached(point.lat, point.lng).then((tract) => (tract ? riskIndex.forTract(tract.tractId) : null))),
    within(waterAt(home)),
    within(noise.bandAt(point)),
  ]);
  return { flood: floodReading, seismic, wildfire, air, nri, water, noise: loud };
}

/** The `meters` block from the area's readings. Null when no source answered in time. */
function metersBlock(read) {
  const nri = Object.fromEntries(riskIndex.rows(read.nri).map((each) => [each.key, row(each.label, each.level, each.word)]));
  // Modelled for the area by the U.S. DOT, so the word says so.
  const heard = read.noise ? row('Noise', read.noise.level, `${read.noise.word} \u00b7 modelled`) : null;
  const pfasRow = pfas.meterRow(read.water);
  const water = pfasRow ? row(pfasRow.label, pfasRow.level, pfasRow.word) : null;
  const shown = {
    flood: floodRow(read.flood),
    seismic: seismicRow(read.seismic),
    wildfire: wildfireRow(read.wildfire),
    air: airRow(read.air),
  };
  const groups = [
    { title: 'Weather', rows: [nri.hail, nri.strong_wind, nri.tornado, nri.winter_weather] },
    { title: 'Ground and fire', rows: [shown.flood, shown.wildfire, shown.seismic, nri.landslide] },
    { title: 'Air, noise and water', rows: [heard, shown.air, water] },
  ].map((group) => ({ ...group, rows: group.rows.filter(Boolean) })).filter((group) => group.rows.length);
  if (!groups.length) return null;
  return {
    kind: 'meters',
    id: 'around',
    title: 'Around this address',
    groups,
    note: sourcesNote({
      flood: shown.flood, seismic: shown.seismic, wildfire: shown.wildfire, air: shown.air ? read.air : null, water: water ? read.water : null,
      noise: heard ? read.noise : null,
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

/** The permits lines the record can show: each with an issue date and a word (facts.js `permits`), newest first. */
function permitLines(facts) {
  const lines = Array.isArray(facts?.permits?.lines) ? facts.permits.lines : [];
  return lines.filter((line) => line && /^\d{4}-\d{2}/.test(String(line.issued || '')) && typeof line.word === 'string' && line.word.trim());
}

/**
 * What the record holds for this home beyond the open part, as `closed_group` items (SPEC rule 1: only where we hold
 * it; rule 2: a name and one line, never a value). Each item says which half it belongs to (SPEC section 8):
 *   county   the county record's public half: opens for a signed-in buyer where the county is on `buyer_report`
 *   federal  federal data about the point (photos, ground): opens for a signed-in buyer everywhere
 *   owner    the owner's own half: only ever the confirmed owner's
 * `extras`: what was read beside the record ({ similar, estimate, years, ground }).
 */
function closedItems(copy, { similar = null, estimate = null, years = null, ground = null } = {}) {
  const facts = copy?.facts || {};
  const exact = copy?.match === 'exact';
  const items = [];
  const add = (group, part, icon, title, line, buyerLine = line) => items.push({ group, part, icon, title, line, buyerLine });

  // Never how many lines or what kinds (rule 2): `since` is when the county's table begins, not this home's first line.
  const history = facts.recorded_history;
  if (history && Array.isArray(history.lines) && history.lines.length) {
    const since = /^\d{4}$/.test(String(history.since || '')) ? ` since ${history.since}` : '';
    add('money', 'county', 'history', 'Recorded history', `The county's recorded lines for this home${since}`);
  }
  const valueYears = yearsOnRecord({ year: facts.value_year, amount: facts.market_value || facts.assessed_value }, facts.value_history);
  if (valueYears) add('money', 'county', 'trend', 'County value, year by year', `${valueYears} ${valueYears === 1 ? 'year' : 'years'} on record`);
  const price = positive(facts.sale_price) >= LOWEST_SALE_PRICE && !(positive(facts.sale_parcels) > 1);
  const saleLine = listWords([price ? 'price' : null, facts.sale_date || facts.sale_month ? 'date' : null, facts.sale_document ? 'document number' : null]);
  if (saleLine && (price || facts.sale_date || facts.sale_month)) add('money', 'county', 'tag', 'Last sale', saleLine);
  const taxYears = yearsOnRecord({ year: facts.tax_year, amount: facts.tax_amount }, facts.tax_history);
  if (taxYears) add('money', 'county', 'bank', 'Property tax, year by year', `${taxYears} ${taxYears === 1 ? 'year' : 'years'} on record`);
  if (similar) {
    add('money', 'county', 'bars', estimate ? 'Estimate and similar homes' : 'Similar homes', `Beside ${similar.homes} similar homes on this street`);
  } else if (estimate) {
    add('money', 'county', 'bars', 'Pantopus estimate', 'A range from county values and public sales');
  }

  // Survey years cover the point, record or not: a count and the span, nothing about the home.
  if (years && years.count > 1) {
    add('changes', 'federal', 'image', 'Your lot through the years', `${years.count} photos from above, ${years.first} to ${years.last}`);
  }

  // The county's permits on the home's account (held under new_columns): how many, with dates, as drawn.
  const permitCount = permitLines(facts).length;
  if (permitCount) add('changes', 'county', 'wrench', 'Permits', `${permitCount} on record, with dates`);

  // Only the parts that answered for this point are named.
  const groundParts = ground ? [
    ground.soil ? 'soil' : null, ground.soil && ground.soil.slope !== null ? 'slope' : null, ground.elevation ? 'elevation' : null,
    ground.levee ? 'levees' : null, ground.dams ? 'dams' : null,
  ].filter(Boolean) : [];
  if (groundParts.length) add('house', 'federal', 'layers', 'Ground under your home', listWords(groundParts));

  if (positive(facts.year_built)) add('house', 'county', 'home', 'Roof, heating, water heater, panel', 'Ages against their typical service life');
  if (typeof facts.zoning === 'string' && facts.zoning.trim()) add('house', 'county', 'layers', 'Lot and zoning', 'The zoning code on the county\'s record');

  // The owner's own half (SPEC section 8): never opened for anyone else.
  if (exact && Array.isArray(facts.exemptions)) {
    add('owner', 'owner', 'shield', 'Exemptions on file', 'Whether a property tax exemption is on this home', 'Tax exemptions on this home');
  }
  if (recordingAlerts.forCounty(copy?.jurisdiction)) {
    add('owner', 'owner', 'mail', 'Recording alerts', 'The county emails you when a document is recorded', null);
  }
  // The owner's card figures from the county's last sale price, so it shows where one is held.
  if (price) add('owner', 'owner', 'percent', 'Mortgage insurance', 'When the law lets you ask to drop it', 'When the law lets the owner ask to drop it');
  return items;
}

const GROUPS = [
  ['money', 'Ownership and money'],
  ['changes', 'Changes over time'],
  ['house', 'The house and the ground'],
];

// Items as `closed_group` blocks, in the drawn order of groups.
function groupsOf(items, { idPrefix, chip, owner = null }) {
  const blocks = GROUPS.map(([group, title]) => ({ id: `${idPrefix}_${group}`, title, items: items.filter((item) => item.group === group) }));
  if (owner) blocks.push({ id: owner.id, title: owner.title, items: items.filter((item) => item.group === 'owner') });
  return blocks.filter((group) => group.items.length).map((group) => ({
    kind: 'closed_group',
    id: group.id,
    title: group.title,
    chip,
    items: group.items.map(({ icon, title, line }) => ({ icon, title, line })),
  }));
}

const privacyNote = (text) => ({ kind: 'note', id: 'privacy', icon: 'eye_off', text });

// A home that isn't the viewer's: "the", not "your" (the lookup and the buyer; members and owners keep "your").
const NOT_YOURS = { 'Your lot through the years': 'The lot through the years', 'Ground under your home': 'Ground under the home' };
const forOthers = (item) => (NOT_YOURS[item.title] ? { ...item, title: NOT_YOURS[item.title] } : item);

/**
 * The closed part for a person with this Home who isn't its confirmed owner (`member`): everything else is the owner's,
 * one promise with their own next step. Nothing at all when the record holds nothing to open.
 */
function memberClosed(items, { button, alt }) {
  const groups = groupsOf(items, { idPrefix: 'closed', chip: 'For the owner', owner: { id: 'closed_protect', title: 'Protect it' } });
  const count = items.length;
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
    privacyNote(PRIVACY_NOTE),
  ];
}

// What an account opens, in a buyer's words, for the account promise's body: only what is held.
const ACCOUNT_WORDS = {
  'Recorded history': 'history', 'County value, year by year': 'values', 'Property tax, year by year': 'property tax',
  'Your lot through the years': 'photos through the years', 'Ground under your home': 'the ground under it', Permits: 'permits',
};

/**
 * The signed-out lookup's closed part (SPEC section 8): what a free account opens (the federal parts everywhere, the
 * county record's public half where its county is on `buyer_report`), then what only the owner sees, each with its
 * own way in. With nothing for an account to open, the member's layout.
 */
function lookupClosed(items, { countyOpen, ownerButton, ownerAlt }) {
  const opens = (item) => item.part === 'federal' || (item.part === 'county' && countyOpen);
  const account = items.filter(opens);
  const owners = items.filter((item) => !opens(item));
  if (!account.length) return memberClosed(items.map(forOthers), { button: ownerButton, alt: ownerAlt });
  const words = [...new Set(account.map((item) => ACCOUNT_WORDS[item.title]).filter(Boolean))];
  const body = [
    `${countWord(items.length)} more ${items.length === 1 ? 'part is' : 'parts are'} ready.`,
    `${countWord(account.length)} ${account.length === 1 ? 'opens' : 'open'} with a free account.`,
    owners.length ? `${countWord(owners.length)} ${owners.length === 1 ? 'belongs' : 'belong'} to the owner.` : null,
  ].filter(Boolean).join(' ');
  return [
    { kind: 'intro', id: 'more', title: 'There is more in this home\'s record', body },
    ...groupsOf(account.map(forOthers), { idPrefix: 'closed', chip: 'Free with an account' }),
    {
      kind: 'promise',
      id: 'account',
      title: 'Open the public record, free',
      body: `Create a free account to see ${words.length ? `this home's ${listWords(words).toLowerCase()}` : 'more of this home\'s record'}. No payment, no card.`,
      steps: [],
      button: { label: 'Create a free account', url: '/auth/sign-up' },
      alt: { lead: 'Already have one?', label: 'Sign in', url: '/auth/sign-in' },
    },
    ...(owners.length ? [
      ...groupsOf(owners.map(forOthers), { idPrefix: 'owner', chip: 'For the owner', owner: { id: 'closed_protect', title: 'Only the owner sees' } }),
      { kind: 'promise', id: 'promise', ...OWNER_PROMISE, button: ownerButton, alt: ownerAlt || null },
    ] : []),
    privacyNote('No owner\'s name is shown to anyone. What an owner adds is seen only by that owner.'),
  ];
}

/**
 * A signed-in buyer's closed part (SPEC section 8): what stays closed (the owner's own half, and the county record where
 * its county isn't on `buyer_report`), the buying promise and the note. The owner's half rides as names and lines only.
 */
function buyerClosed(items, { countyOpen }) {
  const closed = items.filter((item) => item.part === 'owner' || (item.part === 'county' && !countyOpen))
    .filter((item) => item.part !== 'owner' || item.buyerLine)
    .map((item) => (item.part === 'owner' ? { ...item, line: item.buyerLine } : forOthers(item)));
  return [
    ...groupsOf(closed, { idPrefix: 'owner', chip: 'For the owner', owner: { id: 'closed_owner', title: 'Only the owner sees' } }),
    {
      kind: 'promise',
      id: 'buying',
      title: 'Buying this home?',
      body: 'When you close, claim it here. The public record becomes yours, and the owner\'s half opens for you.',
      steps: [
        { title: 'Show your closing statement', line: 'The document you are handed at closing.' },
        { title: 'Confirm it\'s you', line: 'A photo of your ID and a selfie.' },
        { title: 'We check it, usually within hours', line: 'Then this home\'s whole record is yours.' },
      ],
      button: { label: 'Claim this home', url: '/homes/claim-owner' },
      alt: null,
    },
    privacyNote('These are public records. No owner\'s name is shown, and nothing an owner added is here.'),
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

/** "Clark County", from the copy's county fact; null without one. */
function countyName(copy) {
  const county = copy?.facts?.county && typeof copy.facts.county === 'string' ? copy.facts.county : null;
  return county && !/county|parish|borough/i.test(county) ? `${county} County` : county;
}

/** The header's chip: where the record was found. */
function foundChip(copy) {
  if (!copy?.publisher) return null;
  return { tone: 'success', text: `Found in ${countyName(copy) || copy.publisher}'s records` };
}

/**
 * The lot's outline for the picture from above: `{ ring, from }`, where a served copy holds the lot's ring (router.js
 * `lot_rings`, from the county's open parcel map). Null otherwise. Public map data: drawn in every state.
 */
function lotOutline(copy) {
  if (!Array.isArray(copy?.lot_ring) || copy.lot_ring.length < 4) return null;
  return { ring: copy.lot_ring, from: `${countyName(copy) || copy.publisher || 'the county'}'s parcel map` };
}

module.exports = { lotChip, lotOutline, permitLines, factsBlock, readings, metersBlock, closedItems, memberClosed, lookupClosed, buyerClosed, extrasFor, foundChip, recordSource, OPEN_FACTS };
