'use strict';
// Union County, Ohio: the County Auditor's parcels with their appraisal facts, from two of the county's own publications. The parcel layer
// "ParcelAllSaleinfoBuildingInfo" on the county's GIS server gives each parcel's site address, class, acres, appraised values, last sale with
// the Auditor's valid-sale flag, and its dwelling's year built, living area, rooms, bedrooms, full and half baths and story height. Its acres
// are blank on most platted lots, so the lot comes from the Auditor's land table ("TB_ARC_Land", one of the real estate extract files the
// county lists free on its GIS Enterprise Portal, rewritten each week), whose land lines state the acres of every lot, platted or not.
// Neither the portal, the files nor the layer states a license or a limit on use, and the county's website posts no terms of use. Owner,
// mailing and taxpayer columns are never asked for, and the extract's owner table is never opened.
// The layer repeats a parcel once per sale and per dwelling; a parcel is read once, with its largest dwelling and its latest valid sale. Its
// city and ZIP are the property's own (its mailing columns are separate and never read); a ZIP that doesn't reach into the county is kept
// out, with its city, so a stray mailing line can't place a home elsewhere; a misspelled city is left blank. Ohio appraises at full market
// value and taxes 35% of it.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { layerRows, cached } = require('../lib/services.cjs');
const { download, zipTable, zipDates } = require('../lib/tables.cjs');
const { isHomeSale } = require('../lib/sales.cjs');
const { year, isoDate, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '39159';
const COUNTY = 'Union County';
const LAYER = 'https://www7.co.union.oh.us/unioncountyohio/rest/services/ParcelAllSaleinfoBuildingInfo/MapServer/1';
const COLUMNS = ['ParcelNo', 'Acreage', 'NeighborhoodCode', 'PARCELCLASS', 'classDescription', 'Address', 'city', 'ZipCode', 'unit', 'subdivision_name', 'Condominium_name', 'schoolDistrict', 'AppraisedBuildValue', 'appraisedLandValue', 'appraisedTotalValue', 'saleDate', 'salePrice', 'typeofSale', 'isValidSale', 'yearBuilt', 'bedroom', 'FullBaths', 'halfBath', 'roomCount', 'LivingArea', 'Floor'];
const LAND = 'https://www2.co.union.oh.us/propertyinfofile/TB_ARC_Land.zip';
const LAND_TABLE = 'TB_ARC_Land/TB_ARC_Land.txt';

// Ohio's land use codes as the Auditor words them: 510-515 a single family dwelling (by lot), 550 a condominium unit, 560 and 561 a mobile
// home affixed to the land, 520-531 two and three families, 401-403 apartments, 500-505 residential vacant land. Mobile homes taxed as
// personal property (570, 571, 580) and "other residential structures" (599) stay other.
function useOf(code, unit) {
  const c = String(code || '').trim();
  if (/^51[0-5]$/.test(c)) return unit ? ['unit', 'condo'] : ['property', 'house'];
  if (c === '550') return unit ? ['unit', 'condo'] : ['property', 'townhouse'];
  if (c === '560' || c === '561') return ['property', 'mobile_home'];
  if (/^5[23][01]$/.test(c)) return ['building', 'multi_unit'];
  if (/^40[1-3]$/.test(c)) return ['building', 'apartment'];
  if (/^50[0-5]$/.test(c)) return ['parcel', null];
  return ['other', null];
}

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};

// The story height as the Auditor writes it, kept only in whole and half stories (it also writes quarter steps such as 1.25 and 1.75).
const storiesOf = (value) => {
  const height = positive(value);
  return height && height <= 4 && Number.isInteger(height * 2) ? height : null;
};

/** The layer's city column and its "CITY OH 43040" line, as the property's own city and ZIP, or neither. */
function placeOf(row, countyZips) {
  const zip = (/(\d{5})(?:-\d{4})?\s*$/.exec(String(row.ZipCode || '').trim()) || [])[1] || null;
  if (!zip || !countyZips.has(zip)) return { city: '', zip: null };
  const city = String(word(row.city) || '').toUpperCase().replace(/-\d{4}$/, '').replace(/[,\s]+(OH|OHIO)$/, '').replace(/,$/, '').trim();
  return { city, zip };
}

/**
 * A city typed by hand is sometimes misspelled ("MARSYVILLE"). A city stays only when it is the one the county's own file most often writes
 * with some ZIP in the county (Marysville for 43040, Plain City for 43064, ...); any other spelling leaves the city blank and the ZIP placing it.
 */
function keepWrittenCities(list) {
  const pairs = new Map();
  for (const { address } of list) {
    if (!address.zip || !address.city) continue;
    if (!pairs.has(address.zip)) pairs.set(address.zip, new Map());
    const cities = pairs.get(address.zip);
    cities.set(address.city, (cities.get(address.city) || 0) + 1);
  }
  const written = new Set([...pairs.values()].map((cities) => [...cities].sort((a, b) => b[1] - a[1])[0][0]));
  let blanked = 0;
  for (const { address } of list) {
    if (address.city && !written.has(address.city)) {
      address.city = '';
      blanked += 1;
    }
  }
  return blanked;
}

function siteOf(row, countyZips) {
  const line = word(row.Address);
  const parsed = line ? parse(line) : null;
  if (!parsed || parsed.form !== 'street' || !parsed.number || !(Number(parsed.number) > 0)) return null;
  const { form, ...street } = parsed;
  return { address: { ...street, ...placeOf(row, countyZips) }, line };
}

/** One parcel's rows: the first gives the parcel, the one with the most living area its dwelling, and the latest valid sale its sale. */
function fromRows(rows, land, countyZips) {
  const [first] = rows;
  const site = siteOf(first, countyZips);
  const parcel = word(first.ParcelNo);
  if (!site || !parcel) return null;
  const { address } = site;
  const code = String(first.PARCELCLASS || '').trim();
  const [kind, homeType] = useOf(code, address.unit);
  const facts = { parcel_number: parcel, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  put(facts, 'address_on_record', onRecord(site.line, ''));
  put(facts, 'county_use_code', code || null);
  put(facts, 'land_use', word(String(first.classDescription || '').replace(/^\d{3}\s+/, '')));
  put(facts, 'neighborhood', word(first.NeighborhoodCode));
  put(facts, 'subdivision', word(first.subdivision_name) || word(first.Condominium_name));
  put(facts, 'school_district', word(first.schoolDistrict));
  const dwelling = rows.reduce((best, row) => ((positive(row.LivingArea) || 0) > (positive(best.LivingArea) || 0) ? row : best), first);
  if (home || kind === 'building') {
    put(facts, 'year_built', year(dwelling.yearBuilt));
    put(facts, 'stories', storiesOf(dwelling.Floor));
  }
  if (home) {
    put(facts, 'living_sqft', positive(dwelling.LivingArea));
    put(facts, 'bedrooms', inRange(dwelling.bedroom, 15));
    put(facts, 'rooms', inRange(dwelling.roomCount, 40));
    const [full, half] = [inRange(dwelling.FullBaths, 12), inRange(dwelling.halfBath, 6)];
    if (full) {
      facts.full_baths = full;
      facts.bathrooms = full + (half ? half * 0.5 : 0);
      put(facts, 'half_baths', half);
    }
  }
  if (kind === 'building') put(facts, 'units', inRange(first.unit, 2000));
  // A condominium's parcel is its share of the complex, so a condo unit gets no lot. Otherwise the parcel's acres, or where the layer leaves
  // them blank (most platted lots), the acres the Auditor's land lines state for the parcel.
  if (kind !== 'unit' && code !== '550') put(facts, 'lot_acres', positive(first.Acreage) || positive(land.get(parcel)));
  put(facts, 'market_value', positive(first.appraisedTotalValue));
  put(facts, 'market_land_value', positive(first.appraisedLandValue));
  put(facts, 'market_building_value', positive(first.AppraisedBuildValue));
  // The latest sale the Auditor marked valid (one deed can show on several rows of the same day); a day with two prices says nothing.
  const sales = rows.filter((row) => Number(row.isValidSale) === 1 && isoDate(row.saleDate) && isHomeSale(row.salePrice, row.typeofSale));
  const latest = sales.map((row) => isoDate(row.saleDate)).sort().pop();
  const prices = new Set(sales.filter((row) => isoDate(row.saleDate) === latest).map((row) => positive(row.salePrice)));
  if (latest && prices.size === 1) {
    facts.sale_price = [...prices][0];
    facts.sale_date = latest;
  }
  return { id: `pp:${kind}:${FIPS}:${parcel}`, kind, home_type: homeType, address, facts };
}

/** Each parcel's acres as its land lines state them, summed. */
async function landAcres(zip) {
  const acres = new Map();
  for await (const row of zipTable(zip, LAND_TABLE, ['Parcel', 'Acres'], { delimiter: '|', encoding: 'utf8' })) {
    const parcel = word(row.Parcel);
    const value = positive(row.Acres);
    if (parcel && value) acres.set(parcel, (acres.get(parcel) || 0) + value);
  }
  for (const [parcel, value] of acres) acres.set(parcel, Math.round(value * 10000) / 10000);
  return acres;
}

async function* build({ work, today }) {
  const stamp = isoDate(today.getTime());
  const zip = path.join(work, 'oh-union', `land-${stamp}.zip`);
  download(LAND, zip);
  const asOf = zipDates(zip).get(LAND_TABLE);
  if (!asOf) throw new Error('The land extract no longer dates its table');
  const land = await landAcres(zip);
  const extraZips = zipsByCounty(work, ['39']).get(FIPS) || [];
  const countyZips = new Set(extraZips);
  const parcels = new Map();
  for await (const row of cached(path.join(work, 'oh-union', `parcels-${stamp}.jsonl.gz`), () => layerRows(LAYER, COLUMNS, { oid: 'objectid' }))) {
    const parcel = word(row.ParcelNo);
    if (!parcel) continue;
    if (!parcels.has(parcel)) parcels.set(parcel, []);
    parcels.get(parcel).push(row);
  }
  const list = [];
  let noAddress = 0;
  let placeLeftOut = 0;
  for (const rows of parcels.values()) {
    const record = fromRows(rows, land, countyZips);
    if (!record) noAddress += 1;
    else {
      if (!record.address.zip) placeLeftOut += 1;
      list.push(record);
    }
  }
  const blanked = keepWrittenCities(list);
  log(`${COUNTY}: ${list.length} parcels (${land.size} with land-line acres), ${noAddress} without a street number, ${placeLeftOut} with no ZIP inside the county, ${blanked} cities left blank as misspelled`);
  for (const building of condoBuildings(list, { fips: FIPS, county: COUNTY })) list.push(building);
  yield {
    fips: FIPS, state: 'OH', name: COUNTY, publisher: 'Union County Auditor', dataset: 'parcels with appraisal data and its weekly land records', method: 'county', source: 'oh-union', as_of: asOf, stale_after_days: 120, extra_zips: extraZips, records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: { year_built: 'yearBuilt', living_sqft: 'LivingArea', bedrooms: 'bedroom', bathrooms: 'FullBaths', full_baths: 'FullBaths', half_baths: 'halfBath', rooms: 'roomCount', stories: 'Floor', units: 'unit', lot_acres: 'Acreage', market_value: 'appraisedTotalValue', market_land_value: 'appraisedLandValue', market_building_value: 'AppraisedBuildValue', sale_price: 'salePrice', sale_date: 'saleDate', subdivision: 'subdivision_name', school_district: 'schoolDistrict', neighborhood: 'NeighborhoodCode' },
    land: { file: LAND, table: LAND_TABLE, facts: { lot_acres: 'Acres (summed per parcel, where the layer\'s Acreage is blank)' } },
  },
};
