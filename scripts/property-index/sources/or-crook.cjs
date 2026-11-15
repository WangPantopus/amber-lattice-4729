'use strict';
// Crook County, Oregon: the Assessor's tables that Crook County GIS publishes beside its tax lots ("TaxlotandTables" on the county's own
// GIS server, its OpenData folder), tax year 2026. The county's GIS pages carry a disclaimer only (the data is for reference purposes);
// no license and no limit on use is posted. Tables read, joined on the Assessor's account number:
// - Property General Information: each account's roll type, property class (Oregon's class numbers with the Assessor's words) and the
//   Assessor's land size in acres. Its owner, mailing and in-care-of columns are never asked for.
// - Addresses: each account's situs address with its town and ZIP.
// - Improvements: one row per floor of each improvement (first floor, second floor, loft, attic, basement, garage, carport), with the
//   statistical class in words ("RES One story", "RES Two story with basement", "MS Double wide"), the floor's size, its finished area,
//   year built, and the bedrooms and full and half baths counted on that floor. A dwelling's bedrooms and baths are the sums over its
//   floors; its living area is the sum of its first floor, second floor and loft, plus an attic's finished area (a one-and-a-half story
//   house's upper floor is recorded as a finished attic); the basement, garage and carport are kept apart.
// - Values: the real market value (land, improvements, total) and the assessed value for the tax year.
// Town lots are often priced per lot with no acres, so many houses in Prineville have no lot size; the tax lot map's own acreage isn't read.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate, zipCode, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '41013';
const COUNTY = 'Crook County';
const BASE = 'https://gis.crookcountyor.gov/server/rest/services/OpenData/TaxlotandTables/MapServer';
const TABLES = {
  general: [`${BASE}/2`, ['MAPTAXLOT', 'ACCOUNT', 'ROLL_TYPE', 'PROPERTY_CLASS', 'CLASS_DESCRIPTION', 'SUBDIVISION', 'LAND_SIZE_ACRES', 'CODE_AREA']],
  addresses: [`${BASE}/7`, ['ACCOUNT', 'NUMBER', 'DIR', 'STREET', 'TYPE', 'UNIT', 'CITY', 'ZIP']],
  improvements: [`${BASE}/3`, ['ACCOUNT', 'IMPR_ID', 'STAT_CLASS_DESC', 'FLOOR_TYPE', 'FLOOR_SIZE_SQFT', 'FINISHED_SIZE', 'BEDROOM', 'FULL_BATH', 'HALF_BATH', 'YEAR_BUILT']],
  values: [`${BASE}/10`, ['ACCOUNT', 'RMV_LAND', 'RMV_IMPR', 'RMV_TOTAL', 'AV_TOTAL', 'TAX_YEAR']],
};

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};
const sum = (rows, column) => rows.reduce((total, row) => total + (positive(row[column]) || 0), 0);

// The statistical class's own words: RES ... = a house, MS ... = a manufactured home, Duplex/Triplex/Fourplex, Apartment.
function classOf(words) {
  const w = String(words || '').trim();
  if (/^RES /i.test(w)) return 'house';
  if (/^MS /i.test(w)) return 'mobile_home';
  if (/^(Duplex|Triplex|Fourplex)$/i.test(w)) return 'multi_unit';
  if (/^Apartment/i.test(w)) return 'apartment';
  return null;
}

// "RES One and 1/2 story w/basement" -> 1.5
function storiesOf(words) {
  const w = String(words || '').toLowerCase();
  if (/one and 1\/2 story/.test(w)) return 1.5;
  if (/\btwo story/.test(w)) return 2;
  if (/\bone story/.test(w)) return 1;
  return null;
}

/** One dwelling from its floor rows. */
function dwellingOf(rows) {
  const floors = (pattern) => rows.filter((row) => pattern.test(String(row.FLOOR_TYPE || '')));
  const above = floors(/^(First Floor|Second Floor|Loft)$/);
  const attic = floors(/^Attic$/).reduce((total, row) => total + Math.min(positive(row.FINISHED_SIZE) || 0, positive(row.FLOOR_SIZE_SQFT) || 0), 0);
  const basement = floors(/^Basement$/);
  const years = [...floors(/^First Floor$/), ...above].map((row) => year(row.YEAR_BUILT)).filter(Boolean);
  const basementFinished = basement.reduce((total, row) => total + Math.min(positive(row.FINISHED_SIZE) || 0, positive(row.FLOOR_SIZE_SQFT) || 0), 0);
  return {
    type: classOf(rows[0].STAT_CLASS_DESC),
    words: word(rows[0].STAT_CLASS_DESC),
    living: sum(above, 'FLOOR_SIZE_SQFT') + attic,
    basement: sum(basement, 'FLOOR_SIZE_SQFT'),
    basementFinished,
    garage: sum(floors(/^Garage$/), 'FLOOR_SIZE_SQFT'),
    carport: sum(floors(/^Carport$/), 'FLOOR_SIZE_SQFT'),
    bedrooms: sum(rows, 'BEDROOM'),
    full: sum(rows, 'FULL_BATH'),
    half: sum(rows, 'HALF_BATH'),
    year: years.length ? years[0] : null,
  };
}

// An account's main dwelling: its largest house, else its largest manufactured home, else its multi-family building.
function mainDwelling(dwellings) {
  for (const types of [['house'], ['mobile_home'], ['multi_unit', 'apartment']]) {
    const these = dwellings.filter((d) => types.includes(d.type)).sort((a, b) => b.living - a.living);
    if (these.length) return these[0];
  }
  return null;
}

function siteOf(row) {
  const street = [row.NUMBER, row.DIR, row.STREET, row.TYPE].map((part) => word(part)).filter(Boolean).join(' ');
  const unit = word(row.UNIT) || '';
  const parsed = street ? parse(street, unit) : null;
  if (!parsed || parsed.form !== 'street' || !parsed.number) return null;
  const { form, ...address } = parsed;
  return { address: { ...address, city: String(word(row.CITY) || '').toUpperCase(), zip: zipCode(row.ZIP) }, street, unit };
}

function fromAccount(account, general, site, dwelling, value) {
  const { address } = site;
  const classWords = word(general.CLASS_DESCRIPTION);
  let kind;
  let homeType = null;
  // The Assessor has no condominium class here; a unit number on a house's address stays part of its address.
  if (dwelling && (dwelling.type === 'house' || dwelling.type === 'mobile_home')) [kind, homeType] = ['property', dwelling.type];
  else if (dwelling) [kind, homeType] = ['building', dwelling.type];
  else kind = /unimp/i.test(classWords || '') ? 'parcel' : 'other';
  const facts = { parcel_number: word(general.MAPTAXLOT) || account, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  put(facts, 'address_on_record', onRecord(site.street, site.unit));
  put(facts, 'property_class', classWords && [word(general.PROPERTY_CLASS), classWords].filter(Boolean).join(' '));
  put(facts, 'subdivision', word(general.SUBDIVISION));
  put(facts, 'tax_code_area', word(general.CODE_AREA));
  if (dwelling) {
    put(facts, 'building_type', dwelling.words);
    put(facts, 'year_built', dwelling.year);
  }
  if (home) {
    put(facts, 'living_sqft', dwelling.living || null);
    put(facts, 'stories', storiesOf(dwelling.words));
    put(facts, 'basement_sqft', dwelling.basement || null);
    put(facts, 'basement_finished_sqft', dwelling.basementFinished || null);
    put(facts, 'garage_sqft', dwelling.garage || null);
    put(facts, 'carport_sqft', dwelling.carport || null);
    put(facts, 'bedrooms', inRange(dwelling.bedrooms, 15));
    const [full, half] = [inRange(dwelling.full, 12), inRange(dwelling.half, 8)];
    put(facts, 'full_baths', full);
    put(facts, 'half_baths', half);
    if (full || half) facts.bathrooms = (full || 0) + 0.5 * (half || 0);
  }
  if (kind === 'building') put(facts, 'gross_sqft', dwelling.living || null);
  if (kind !== 'unit') put(facts, 'lot_acres', positive(general.LAND_SIZE_ACRES));
  if (value) {
    put(facts, 'market_value', positive(value.RMV_TOTAL));
    put(facts, 'market_land_value', positive(value.RMV_LAND));
    put(facts, 'market_building_value', positive(value.RMV_IMPR));
    put(facts, 'assessed_value', positive(value.AV_TOTAL));
    put(facts, 'value_year', positive(value.TAX_YEAR));
  }
  return { id: `pp:${kind}:${FIPS}:${account}`, kind, home_type: homeType, address, facts };
}

async function* build({ work, today }) {
  const dir = path.join(work, 'or-crook');
  const read = (name) => cached(path.join(dir, `${name}.jsonl.gz`), () => layerRows(...TABLES[name]));
  // An account split over two tax lots has a row for each; its land size is the sum.
  const generals = new Map();
  for await (const row of read('general')) {
    const account = word(row.ACCOUNT);
    if (!account) continue;
    const seen = generals.get(account);
    if (!seen) generals.set(account, { ...row });
    else seen.LAND_SIZE_ACRES = (positive(seen.LAND_SIZE_ACRES) || 0) + (positive(row.LAND_SIZE_ACRES) || 0);
  }
  const sites = new Map();
  for await (const row of read('addresses')) {
    const account = word(row.ACCOUNT);
    if (account && !sites.has(account)) {
      const site = siteOf(row);
      if (site) sites.set(account, site);
    }
  }
  const floors = new Map();
  for await (const row of read('improvements')) {
    if (!classOf(row.STAT_CLASS_DESC)) continue;
    const key = `${word(row.ACCOUNT)}|${row.IMPR_ID}`;
    if (!floors.has(key)) floors.set(key, []);
    floors.get(key).push(row);
  }
  const dwellings = new Map();
  for (const [key, rows] of floors) {
    const account = key.split('|')[0];
    if (!dwellings.has(account)) dwellings.set(account, []);
    dwellings.get(account).push(dwellingOf(rows));
  }
  const values = new Map();
  for await (const row of read('values')) if (word(row.ACCOUNT)) values.set(word(row.ACCOUNT), row);
  const list = [];
  let noAddress = 0;
  for (const [account, general] of generals) {
    const site = sites.get(account);
    if (!site) {
      noAddress += 1;
      continue;
    }
    list.push(fromAccount(account, general, site, mainDwelling(dwellings.get(account) || []), values.get(account)));
  }
  log(`${COUNTY}: ${list.length} accounts with a situs address, ${noAddress} without; ${dwellings.size} accounts with a dwelling`);
  for (const building of condoBuildings(list, { fips: FIPS, county: COUNTY })) list.push(building);
  // The Assessor's tables are current, so the release is dated by the day they were read.
  yield {
    fips: FIPS, state: 'OR', name: COUNTY, publisher: 'Crook County GIS', dataset: 'the Assessor\'s tax lot tables', method: 'county', source: 'or-crook', as_of: isoDate(today.getTime()), stale_after_days: 120, extra_zips: zipsByCounty(work, ['41']).get(FIPS) || [], records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: Object.values(TABLES).map(([url]) => url),
    // The basement, garage and carport sizes are FLOOR_SIZE_SQFT on the floor rows whose FLOOR_TYPE says Basement, Garage or Carport, which
    // a column-name check can't see, so they aren't listed here.
    facts: { year_built: 'YEAR_BUILT', living_sqft: 'FLOOR_SIZE_SQFT', basement_finished_sqft: 'FINISHED_SIZE', bedrooms: 'BEDROOM', bathrooms: 'FULL_BATH', full_baths: 'FULL_BATH', half_baths: 'HALF_BATH', building_type: 'STAT_CLASS_DESC', lot_acres: 'LAND_SIZE_ACRES', market_value: 'RMV_TOTAL', market_land_value: 'RMV_LAND', market_building_value: 'RMV_IMPR', assessed_value: 'AV_TOTAL', value_year: 'TAX_YEAR', property_class: 'CLASS_DESCRIPTION', subdivision: 'SUBDIVISION', tax_code_area: 'CODE_AREA' },
  },
};
