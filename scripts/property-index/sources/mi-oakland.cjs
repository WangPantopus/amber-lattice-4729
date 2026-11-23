'use strict';
// Oakland County, Michigan: the county's open parcel service, Tax Parcel Plus. The county's Open Data terms: "retrieve, download,
// copy, modify, translate, adapt, distribute, sort, search, and reuse Open Data for any lawful purpose", with an indemnity. Owner
// names and postal addresses aren't asked for. Michigan assesses at half of market value, so these are assessed and taxable
// values, never market values. No year built or sale prices in this file. Words for a building's style are each town assessor's.
// Year built comes from the Southeast Michigan Council of Governments (SEMCOG), whose Building Points layer keeps each building's
// year "obtained from local assessing data", with the parcel's tax number. Its Copyright License Agreement grants a royalty-free
// license to reproduce, distribute, publish and display, on condition that its copyright notice is shown, so every Oakland record's
// source line carries it. A lot is the acreage of record where the county's yearly tax parcel layer gives one; elsewhere it is the
// parcel shape's area, marked as measured from the parcel map (founder, Nov 15: "Yes, label them"). Only a single-family building's year is read (no names or addresses), only for a house or unit on a
// parcel with one such building, and only where the county's record has none.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { markMapLot } = require('../lib/held.cjs');
const { isoDate, zipCode, year } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { fillHomes, describe } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '26125';
const COUNTY = 'Oakland County';
const LAYER = 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1';
// The yearly tax parcel layer: ACRESRECORDED is the acreage of record (on about one parcel in ten); ACRES is the map's.
const YEARLY_PARCELS = (year) => `https://gisservices.oakgov.com/arcgisds/rest/services/Hosted/Tax_Parcel_${year}/FeatureServer/0`;
// SEMCOG: its communities (to pick Oakland's) and its building points.
const SEMCOG_COMMUNITIES = 'https://gis.semcog.org/server/rest/services/Hosted/Community_Boundaries_2017/FeatureServer/56';
const SEMCOG_BUILDINGS = 'https://gis.semcog.org/server/rest/services/Hosted/Building_Points/FeatureServer/34';
const SEMCOG_NOTICE = 'year built: Copyright \u00a9 2019 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited.';
const SINGLE_FAMILY = 81;
const COLUMNS = ['KEYPIN', 'PIN', 'CVTTAXDESCRIPTION', 'CLASSCODE', 'SITEADDRESS', 'SITECITY', 'SITEZIP5', 'ASSESSEDVALUE', 'TAXABLEVALUE', 'NUM_BEDS', 'NUM_BATHS', 'STRUCTURE_DESC', 'LIVING_AREA_SQFT', 'Shape.area'];
// Oakland County Equalization's 2025 residential summary and Michigan Treasury's Property Class Codes.
// A 403 common element is assessed with other parcels. Class 410 covers a building on leased land or a taxable lease.
const CLASSES = { 401: 'Residential, improved', 402: 'Residential, vacant', 403: 'Residential common element, assessed with others', 407: 'Residential condominium', 410: 'Residential building on leased land or taxable lease', 201: 'Commercial, improved', 202: 'Commercial, vacant', 301: 'Industrial, improved', 302: 'Industrial, vacant', 101: 'Agricultural, improved', 102: 'Agricultural, vacant' };
const APARTMENT = /APART|MULTI ?TENANT/i;
const TWO_FAMILY = /DUPLEX/i;

function useOf(code, structure, unit) {
  const n = Number(code);
  if (n === 407 || (n === 401 && unit)) return ['unit', 'condo'];
  if (n === 402 || n === 403 || n === 102 || n === 202 || n === 302) return ['parcel', null];
  if (n === 401 || n === 101) {
    if (APARTMENT.test(structure)) return ['building', 'apartment'];
    return ['property', TWO_FAMILY.test(structure) ? 'townhouse' : 'house'];
  }
  return ['other', null];
}

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};
const styleOf = (text) => {
  const value = word(text);
  return value && !/^(OTHER|SINGLE ?FAMILY|\d+)$/i.test(value) ? value : null;
};

function fromRow(row, asOf) {
  const line = word(row.SITEADDRESS);
  const address = line ? parse(line) : null;
  const parcel = word(row.PIN) || word(row.KEYPIN);
  if (!address || !parcel) return null;
  const [kind, homeType] = useOf(row.CLASSCODE, row.STRUCTURE_DESC || '', address.unit);
  const facts = { parcel_number: parcel, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  put(facts, 'address_on_record', line);
  put(facts, 'municipality', word(row.CVTTAXDESCRIPTION));
  put(facts, 'land_use', CLASSES[Number(row.CLASSCODE)]);
  put(facts, 'county_use_code', word(row.CLASSCODE));
  if (home || kind === 'building') put(facts, 'style', styleOf(row.STRUCTURE_DESC));
  if (home) {
    put(facts, 'living_sqft', positive(row.LIVING_AREA_SQFT));
    put(facts, 'bedrooms', inRange(row.NUM_BEDS, 15));
    put(facts, 'bathrooms', inRange(row.NUM_BATHS, 15));
  }
  if (kind !== 'unit') {
    put(facts, 'lot_sqft', positive(row['Shape.area']) && Math.round(row['Shape.area']));
    if (facts.lot_sqft) facts.keypin_for_lot = word(row.KEYPIN);
  }
  put(facts, 'value_year', Number(asOf.slice(0, 4)));
  put(facts, 'assessed_value', positive(row.ASSESSEDVALUE));
  put(facts, 'taxable_value', positive(row.TAXABLEVALUE));
  return { id: `pp:${kind}:${FIPS}:${parcel}`, kind, home_type: homeType, address: { ...address, city: String(word(row.SITECITY) || '').toUpperCase(), zip: zipCode(row.SITEZIP5) }, facts };
}

// "W -13-19-476-044" (SEMCOG's local unit, then the county's number) as the county's PIN, "1319476044".
const pinKey = (text) => {
  const digits = String(text ?? '').replace(/^[^-]*-/, '').replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
};

// Each parcel's single-family buildings, as the year each states (none when SEMCOG's is 0, unknown).
async function semcogYears(work) {
  const communities = [];
  for await (const row of cached(path.join(work, 'mi-oakland', 'semcog-communities.jsonl.gz'), () => layerRows(SEMCOG_COMMUNITIES, ['semmcd', 'county'], { oid: 'objectid' }))) {
    if (Number(row.county) === Number(FIPS.slice(2)) && Number.isInteger(row.semmcd)) communities.push(row.semmcd);
  }
  const dwellings = new Map();
  if (!communities.length) return dwellings;
  const where = `build_type = ${SINGLE_FAMILY} AND demolished IS NULL AND city_id IN (${communities.join(',')})`;
  for await (const row of cached(path.join(work, 'mi-oakland', 'semcog-buildings.jsonl.gz'), () => layerRows(SEMCOG_BUILDINGS, ['apn', 'year_built'], { where, oid: 'objectid' }))) {
    const key = pinKey(row.apn);
    if (!key) continue;
    const built = Number(row.year_built) > 1700 ? year(row.year_built) : null;
    if (!dwellings.has(key)) dwellings.set(key, []);
    dwellings.get(key).push(built ? { year_built: built } : {});
  }
  return dwellings;
}

// Each parcel's acreage of record, from the newest yearly tax parcel layer the county has published.
async function recordedAcres(work, today) {
  for (let year = today.getUTCFullYear(); year >= 2025; year -= 1) {
    const url = YEARLY_PARCELS(year);
    const info = await getJson(`${url}?f=json`, 'A yearly tax parcel layer\'s description').catch(() => null);
    if (!info || info.error || !(info.fields || []).some((field) => field.name === 'acresrecorded')) continue;
    const acres = new Map();
    for await (const row of cached(path.join(work, 'mi-oakland', `recorded-acres-${year}.jsonl.gz`), () => layerRows(url, ['keypin', 'acresrecorded'], { where: 'acresrecorded > 0', oid: 'objectid' }))) {
      const value = positive(row.acresrecorded);
      if (word(row.keypin) && value) acres.set(word(row.keypin), value);
    }
    log(`${COUNTY}: acreage of record on ${acres.size} parcels (${year} tax parcels)`);
    return acres;
  }
  log(`${COUNTY}: no yearly tax parcel layer with acreage of record`);
  return new Map();
}

async function* build({ work, today }) {
  const asOf = isoDate(today.getTime());
  const records = [];
  const seen = new Set();
  let noAddress = 0;
  for await (const row of cached(path.join(work, 'mi-oakland', 'parcels.jsonl.gz'), () => layerRows(LAYER, COLUMNS, { oid: 'OBJECTID_12' }))) {
    const record = fromRow(row, asOf);
    if (!record) noAddress += 1;
    else if (!seen.has(record.id)) {
      seen.add(record.id);
      records.push(record);
    }
  }
  log(`${COUNTY}: ${records.length} parcels, ${noAddress} without a street number`);
  // A lot of record replaces the map's area; every other lot is marked as measured from the county's parcel map.
  const acres = await recordedAcres(work, today);
  let recorded = 0;
  let mapped = 0;
  for (const record of records) {
    if (record.facts.lot_sqft === undefined) continue;
    const found = acres.get(record.facts.keypin_for_lot);
    if (found) {
      delete record.facts.lot_sqft;
      record.facts.lot_acres = found;
      recorded += 1;
    } else {
      markMapLot(record, 'lot_sqft');
      mapped += 1;
    }
    delete record.facts.keypin_for_lot;
  }
  log(`${COUNTY}: ${recorded} lots of record, ${mapped} lots measured from the parcel map`);
  const dwellings = await semcogYears(work);
  log(`${COUNTY}: SEMCOG lists single-family buildings on ${dwellings.size} parcels`);
  log(describe(COUNTY, fillHomes(records, dwellings, { keyOf: (record) => pinKey(record.facts.parcel_number), only: ['year_built'] })));
  for (const building of condoBuildings(records, { fips: FIPS, county: COUNTY })) records.push(building);
  yield {
    fips: FIPS, state: 'MI', name: COUNTY, publisher: 'Oakland County', dataset: "Tax Parcel Plus, open data, with year built from SEMCOG's Building Points", method: 'county', source: 'mi-oakland', as_of: asOf, stale_after_days: 450, notice: SEMCOG_NOTICE, records,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: [LAYER, YEARLY_PARCELS(2025), SEMCOG_BUILDINGS],
    facts: { year_built: 'year_built', lot_acres: 'acresrecorded', lot_sqft: 'Shape.area', living_sqft: 'LIVING_AREA_SQFT', bedrooms: 'NUM_BEDS', bathrooms: 'NUM_BATHS', assessed_value: 'ASSESSEDVALUE', taxable_value: 'TAXABLEVALUE' },
  },
};
