'use strict';
// DeKalb County, Georgia: the county's tax parcels, CC BY 4.0, credit DeKalb County GIS. Addresses, class, zoning, acreage and values; its year built
// and building area columns are empty. Owner, mailing and tax columns are in the layer and never asked for. Georgia assesses at 40% of the appraised
// value. The layer repeats a parcel's shape for each condo unit, each with its own row.
// Each home's year built, living area, bedrooms and baths come from the county GIS office's PARCEL_TAX_JOIN, its public copy of the Property
// Appraisal and Assessment office's 2024 dwelling records (posted once, March 2025): only the parcel number, the card and the dwelling's counts
// and areas are asked for, never its owner, mailing or tax columns. A home built after 2024 gets nothing from it. A parcel with more than one
// dwelling card (or one row per condo unit under one parcel number) takes nothing, since the counts may be another dwelling's.

const path = require('node:path');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate, zipCode, realUnit, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { mapLot } = require('../lib/held.cjs');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { condoBuildings } = require('../lib/condos.cjs');
const { fillHomes, bathFacts, describe } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '13089';
const COUNTY = 'DeKalb County';
const LAYER = 'https://services2.arcgis.com/IxVN2oUE9EYLSnPE/arcgis/rest/services/Parcels/FeatureServer/0';
const COLUMNS = ['PARCELID', 'LOWPARCELI', 'UNIT', 'BUILDING', 'SITEADDRES', 'UNIT_NO', 'UNIT_TYPE', 'CITY', 'ZIP', 'CVTTXDSCRP', 'CLASSDSCRP', 'ACREAGE', 'ZONING', 'SUBDIVISIO', 'TOTAPR1', 'LNDVALUE', 'CNTASSDVAL'];
// The county GIS office's copy of the Assessor's 2024 dwelling records (iasWorld DWELDAT): YRBLT, SFLA (living area), RMBED, FIXBATH (full baths),
// FIXHALF (half baths), CARD (dwelling card), TAXYR.
const DWELLINGS = 'https://services2.arcgis.com/IxVN2oUE9EYLSnPE/arcgis/rest/services/PARCEL_TAX_JOIN/FeatureServer/0';
const DWELLING_COLUMNS = ['PARCELID', 'CARD', 'RMBED', 'FIXBATH', 'FIXHALF', 'YRBLT', 'SFLA', 'TAXYR'];
const CLASS_WORDS = { R3: 'Residential', R4: 'Residential, small tract', R9: 'Residential, multi-family', C3: 'Commercial', C4: 'Commercial, small tract', E1: 'Exempt', E2: 'Exempt', I3: 'Industrial' };

function useOf(code, hasUnit) {
  const c = String(code ?? '').trim();
  if (c === 'R3' || c === 'R4') return hasUnit ? ['unit', 'condo'] : ['property', 'house'];
  if (c === 'R9') return ['building', 'apartment'];
  return ['other', null];
}

function fromRow(row) {
  const unit = realUnit(word(row.UNIT_NO) || word(row.UNIT));
  // The site address carries its city after the street, before the comma ("1234 X RD DECATUR, GA ..."): left there, the city reads as part of
  // the street's name, and a person's own address finds nothing.
  const city = String(word(row.CITY) || '').toUpperCase();
  let line = String(row.SITEADDRES ?? '').split(',')[0].replace(/\s+/g, ' ').trim();
  if (city && line.toUpperCase().endsWith(` ${city}`)) line = line.slice(0, -(city.length + 1)).trim();
  const address = line ? parse(line, unit) : null;
  const parcel = word(row.PARCELID) || word(row.LOWPARCELI);
  if (!address || !parcel) return null;
  const code = word(row.CLASSDSCRP);
  const [kind, homeType] = useOf(code, address.unit);
  const facts = { parcel_number: parcel, county: COUNTY, fips: FIPS };
  put(facts, 'address_on_record', onRecord(line, unit));
  put(facts, 'land_use', CLASS_WORDS[code]);
  put(facts, 'county_use_code', code);
  put(facts, 'zoning', word(row.ZONING));
  put(facts, 'subdivision', word(row.SUBDIVISIO));
  put(facts, 'municipality', word(row.CVTTXDSCRP));
  if (kind !== 'unit') put(facts, 'lot_acres', positive(row.ACREAGE));
  put(facts, 'market_value', positive(row.TOTAPR1));
  put(facts, 'assessed_value', positive(row.CNTASSDVAL));
  return { id: `pp:${kind}:${FIPS}:${parcel}`, kind, home_type: homeType, address: { ...address, city: String(word(row.CITY) || '').toUpperCase(), zip: zipCode(row.ZIP) }, facts, ...mapLot(facts, 'lot_acres') };
}

async function* build({ work }) {
  const about = await getJson(`${LAYER}?f=json`, 'The layer\'s description');
  const asOf = isoDate(about.editingInfo?.dataLastEditDate || about.editingInfo?.lastEditDate);
  if (!asOf) throw new Error('The layer no longer says when it changed');
  const records = [];
  const seen = new Set();
  let noAddress = 0;
  for await (const row of cached(path.join(work, 'ga-dekalb', 'parcels.jsonl.gz'), () => layerRows(LAYER, COLUMNS, { oid: 'FID' }))) {
    const record = fromRow(row);
    if (!record) noAddress += 1;
    else if (!seen.has(record.id)) {
      seen.add(record.id);
      records.push(record);
    }
  }
  log(`${COUNTY}: ${records.length} parcels, ${noAddress} without a street number`);
  const { dwellings, taxYear } = await dwellingsOf(work);
  const counts = fillHomes(records, dwellings);
  log(describe(COUNTY, counts));
  for (const building of condoBuildings(records, { fips: FIPS, county: COUNTY })) records.push(building);
  yield {
    fips: FIPS, state: 'GA', name: COUNTY, publisher: 'DeKalb County GIS', dataset: `tax parcels and the county's ${taxYear} building records`, method: 'county', source: 'ga-dekalb', as_of: asOf, stale_after_days: 730, records,
  };
}

/** Each parcel's dwellings, as the facts the Assessor's dwelling card gives, and the tax year the cards are from. */
async function dwellingsOf(work) {
  const dwellings = new Map();
  const years = new Map();
  for await (const row of cached(path.join(work, 'ga-dekalb', 'dwellings.jsonl.gz'), () => layerRows(DWELLINGS, DWELLING_COLUMNS))) {
    const parcel = word(row.PARCELID);
    if (!parcel) continue;
    years.set(row.TAXYR, (years.get(row.TAXYR) || 0) + 1);
    const beds = Number(row.RMBED);
    const full = Number(row.FIXBATH);
    const half = Number(row.FIXHALF);
    const facts = {
      year_built: year(row.YRBLT),
      living_sqft: positive(row.SFLA),
      bedrooms: Number.isInteger(beds) && beds > 0 && beds <= 15 ? beds : null,
      ...(full > 0 ? bathFacts(full + (half > 0 ? half : 0) * 0.5, 20) : {}),
      // The card's own counts (bathFacts gives the total only).
      ...(full > 0 && full <= 20 ? { full_baths: full, ...(half > 0 && half <= 10 ? { half_baths: half } : {}) } : {}),
    };
    if (!dwellings.has(parcel)) dwellings.set(parcel, []);
    dwellings.get(parcel).push(facts);
  }
  const taxYear = [...years].filter(([value]) => Number(value) > 2000).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!taxYear) throw new Error('The dwelling records no longer say their tax year');
  log(`${COUNTY}: ${dwellings.size} parcels with a dwelling card in the ${taxYear} building records`);
  return { dwellings, taxYear };
}

module.exports = {
  build,
  dictionary: {
    layer: [LAYER, DWELLINGS],
    facts: {
      lot_acres: 'ACREAGE', market_value: 'TOTAPR1', assessed_value: 'CNTASSDVAL', zoning: 'ZONING', subdivision: 'SUBDIVISIO', municipality: 'CVTTXDSCRP', land_use: 'CLASSDSCRP',
      year_built: 'YRBLT (2024 building records)', living_sqft: 'SFLA', bedrooms: 'RMBED', bathrooms: 'FIXBATH + FIXHALF / 2', full_baths: 'FIXBATH', half_baths: 'FIXHALF',
    },
  },
};
