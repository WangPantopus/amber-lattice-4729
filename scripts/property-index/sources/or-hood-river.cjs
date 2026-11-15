'use strict';
// Hood River County, Oregon: the county's own tax lots with the Assessor's facts, which Hood River County GIS publishes on the county's
// ArcGIS Online each October as a layer named for the year ("Historical Tax Lots 2026", layer HISTORICAL_TAXLOTS_OCT_2026; one a year
// since 2019, same columns). The county's open data site says it makes no representation or warranty, disclaims liability, and that "The
// user of this digital product hereby agrees to, and shall, indemnify, hold harmless, and defend the County of Hood River" against claims
// arising from its use; using the layer accepts that. No license and no limit on reuse is posted; the Assessor sells its full roll
// dataset, which isn't used here. Year built, square feet (the county's maps label it "Sq. Feet" beside year built, bedrooms and baths),
// bedrooms, the bath total (a half bath counts .5), the Assessor's acres for the lot, the real market value (land and improvements) and the
// assessed value. The layer's city, state and ZIP columns are a mailing address, so they are never asked for, nor is its agent column;
// the address and town come from the situs line.
// Each run reads the newest year's layer, so next October's is found by its name; the release is dated by the layer's own edit date.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '41027';
const COUNTY = 'Hood River County';
const SERVICES = 'https://services7.arcgis.com/xtfQPw7zwSRPkcfN/arcgis/rest/services';
const YEARLY = /^HISTORICAL_TAXLOTS_OCT_(\d{4})$/i;
// The layer read in November 2026, for the dictionary check only: builds look for the newest year.
const CHECKED_LAYER = `${SERVICES}/Historical_Tax_Lots_2026/FeatureServer/71`;
const NEEDED = ['ACCOUNT', 'MAPTAXLOT', 'SITUS', 'PROP_CLASS', 'PROPERTY_C', 'TAXLOT_ACRES', 'BUILD_CLASS', 'YEAR_BUILT', 'SQ_FT', 'BEDS', 'BATH', 'ASSESS_VALUE', 'IMPROVE_VALUE', 'LAND_VALUE', 'TOTAL_RMV'];
const COLUMNS = NEEDED;

const count = (value, most) => {
  const n = positive(value);
  return n && n <= most ? n : null;
};

// Oregon's property classes: the first digit says residential (1), commercial (2), industrial (3), tract (4), farm (5), forest (6),
// multiple housing (7) or recreation (8); exempt classes are 9xx. The class's own words come with each lot. A residential building class
// on the lot means the Assessor records a home on it.
function useOf(row) {
  const words = String(row.PROP_CLASS ?? '').toUpperCase();
  const cls = Number(row.PROPERTY_C);
  const homeOnLot = Boolean(word(row.BUILD_CLASS));
  if (/CONDOMINIUM/.test(words)) return ['unit', 'condo'];
  if (homeOnLot && [1, 4, 5, 6, 8].includes(Math.floor(cls / 100))) return ['property', 'house'];
  if (Math.floor(cls / 100) === 7) return ['building', 'multi_unit'];
  if (/VACANT/.test(words)) return ['parcel', null];
  return ['other', null];
}

// The situs line is the number and street, then a comma and the town ("..., HOOD RIVER").
function siteOf(row) {
  const line = String(row.SITUS ?? '').replace(/\s+/g, ' ').trim();
  const [street, town] = line.split(/\s*,\s*/);
  const parsed = street ? parse(street) : null;
  if (!parsed || parsed.form !== 'street' || !parsed.number) return null;
  const { form, ...address } = parsed;
  return { ...address, city: String(town || '').toUpperCase() };
}

function fromRow(row) {
  const address = siteOf(row);
  const account = word(row.ACCOUNT);
  if (!address || !account) return null;
  const [kind, homeType] = useOf(row);
  const facts = { parcel_number: word(row.MAPTAXLOT) || account, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  put(facts, 'address_on_record', onRecord(row.SITUS, ''));
  put(facts, 'property_class', word(row.PROP_CLASS)?.replace(/\s+/g, ' '));
  if (home) {
    put(facts, 'year_built', year(row.YEAR_BUILT));
    put(facts, 'living_sqft', positive(row.SQ_FT));
    put(facts, 'bedrooms', count(row.BEDS, 15));
    put(facts, 'bathrooms', count(row.BATH, 15));
  }
  if (kind !== 'unit') put(facts, 'lot_acres', positive(row.TAXLOT_ACRES));
  put(facts, 'market_value', positive(row.TOTAL_RMV));
  put(facts, 'market_land_value', positive(row.LAND_VALUE));
  put(facts, 'market_building_value', positive(row.IMPROVE_VALUE));
  put(facts, 'assessed_value', positive(row.ASSESS_VALUE));
  return { id: `pp:${kind}:${FIPS}:${account}`, kind, home_type: homeType, address: { ...address, zip: null }, facts };
}

// A service that doesn't answer is skipped: only the yearly tax lot layers matter here.
async function peek(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Pantopus property index (public records)' }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) return null;
    const data = await response.json();
    return data.error ? null : data;
  } catch {
    return null;
  }
}

/** The newest year's tax lot layer with the Assessor's columns. */
async function newestYear() {
  const list = await getJson(`${SERVICES}?f=json`, 'Hood River County\'s map service list');
  const candidates = (list.services || [])
    .filter((service) => service.type === 'FeatureServer' && /histor/i.test(service.name) && /tax_?lots?/i.test(service.name))
    .map((service) => ({ name: service.name, year: Number((/(?:19|20)\d{2}/.exec(service.name) || [])[0]) }))
    .filter((service) => service.year)
    .sort((a, b) => b.year - a.year);
  for (const service of candidates) {
    const info = await peek(`${SERVICES}/${service.name}/FeatureServer?f=json`);
    for (const layer of info?.layers || []) {
      const match = YEARLY.exec(layer.name || '');
      if (!match || Number(match[1]) !== service.year) continue;
      const url = `${SERVICES}/${service.name}/FeatureServer/${layer.id}`;
      const about = await peek(`${url}?f=json`);
      const names = new Set((about?.fields || []).map((field) => field.name));
      if (NEEDED.every((name) => names.has(name))) {
        return { url, year: service.year, asOf: isoDate(about.editingInfo?.dataLastEditDate || about.editingInfo?.lastEditDate) };
      }
    }
  }
  throw new Error('Hood River County no longer publishes a yearly tax lot layer with the Assessor\'s columns');
}

async function* build({ work }) {
  const layer = await newestYear();
  if (!layer.asOf) throw new Error('The tax lot layer no longer says when it changed');
  log(`${COUNTY}: reading the ${layer.year} tax lots (${layer.asOf})`);
  const records = new Map();
  let noAddress = 0;
  let repeated = 0;
  for await (const row of cached(path.join(work, 'or-hood-river', `taxlots-${layer.year}.jsonl.gz`), () => layerRows(layer.url, COLUMNS))) {
    const record = fromRow(row);
    if (!record) noAddress += 1;
    else if (records.has(record.id)) repeated += 1;
    else records.set(record.id, record);
  }
  const list = [...records.values()];
  log(`${COUNTY}: ${list.length} accounts, ${noAddress} without a street number, ${repeated} repeated`);
  for (const building of condoBuildings(list, { fips: FIPS, county: COUNTY })) list.push(building);
  yield {
    fips: FIPS, state: 'OR', name: COUNTY, publisher: 'Hood River County GIS', dataset: `tax lots with the Assessor's facts (${layer.year})`, method: 'county', source: 'or-hood-river', as_of: layer.asOf, stale_after_days: 450, extra_zips: zipsByCounty(work, ['41']).get(FIPS) || [], records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: CHECKED_LAYER,
    facts: { year_built: 'YEAR_BUILT', living_sqft: 'SQ_FT', bedrooms: 'BEDS', bathrooms: 'BATH', lot_acres: 'TAXLOT_ACRES', market_value: 'TOTAL_RMV', market_land_value: 'LAND_VALUE', market_building_value: 'IMPROVE_VALUE', assessed_value: 'ASSESS_VALUE', property_class: 'PROP_CLASS' },
  },
};
