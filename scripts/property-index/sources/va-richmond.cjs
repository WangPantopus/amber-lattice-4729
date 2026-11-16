'use strict';
// City of Richmond, Virginia: the City Assessor of Real Estate's Public Data Set, the free Excel file of every parcel that its Data Request page
// offers and refreshes about the 15th of each month. The page states no license and no limit on use; the city's GIS disclaimer says it assumes
// no liability for errors. Year built, finished living area, bedrooms, full and half baths, stories, legal acreage, and the
// current land, improvement and total assessments (Virginia assesses at full market value), with each parcel's own location, city and ZIP.
// Owner, mailing and association columns are never asked for.

const path = require('node:path');
const fs = require('node:fs');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { download } = require('../lib/tables.cjs');
const { sheetRows } = require('../lib/xlsx.cjs');
const { year, zipCode, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '51760';
const COUNTY = 'City of Richmond';
const PAGE = 'https://www.rva.gov/assessor-real-estate/data-request';
const COLUMNS = ['PIN', 'NBHD', 'PRIMARY_USE', 'PROP_TYPE', 'PARCEL_LOCATION', 'PARCEL_LOCATION_CITY', 'PARCEL_LOCATION_ZIP', 'STYLE', 'STORIES', 'YEAR_BUILT', 'LIVING_AREA', 'BED_COUNT', 'BATH_COUNT', 'HALF_BATH_COUNT', 'LEGAL_AC', 'ZONING', 'LEGAL_DESC', 'ASSESSMENT_DATE_1', 'ASSSESS_LAND_VALUE_1', 'ASSSESS_IMP_VALUE_1', 'ASSSESS_TOTAL_VALUE_1'];

// The Assessor's primary use codes ("120 - R Two Story"): 109-155 and 193 a single-family home by its number of stories or form, 750 a
// community land trust home on a ground lease; 160-181 two to four families; 210-212 condominium units; 3xx apartments; 101, 201 and
// 301-303 vacant residential land. The style says when a single-family home is a townhouse ("017 - Townhouse Newer", "058 - Semi-Attached
// Townhouse").
const HOUSES = new Set(['109', '110', '115', '120', '130', '150', '155', '193', '750']);
const FAMILIES = new Set(['160', '161', '170', '171', '180', '181']);
const CONDOS = new Set(['210', '211', '212']);
const VACANT = new Set(['101', '201', '301', '302', '303']);
function useOf(row, unit) {
  const code = String(row.PRIMARY_USE || '').trim().slice(0, 3);
  if (HOUSES.has(code)) return ['property', /townhouse/i.test(row.STYLE || '') ? 'townhouse' : 'house'];
  if (CONDOS.has(code)) return unit ? ['unit', 'condo'] : ['property', 'townhouse'];
  if (FAMILIES.has(code)) return ['building', 'multi_unit'];
  if (/^3[1-4]\d$/.test(code)) return ['building', 'apartment'];
  if (VACANT.has(code)) return ['parcel', null];
  return ['other', null];
}

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};
// "120 - R Two Story" -> the code and its words.
const codeOf = (value) => word(String(value || '').split(' - ')[0]);
const wordsOf = (value) => word(String(value || '').split(' - ').slice(1).join(' - '));
// The file's dates are Excel day numbers (46023 is January 1, 2026).
const dayOf = (value) => {
  const days = positive(value);
  return days && days > 20000 && days < 80000 ? new Date(Math.round((days - 25569) * 86400000)) : null;
};

// The file writes a unit after its number ("... Ave 204 Unit"); the record keeps the usual order ("... Ave Unit 204").
const lineOf = (row) => String(row.PARCEL_LOCATION ?? '').replace(/\s+/g, ' ').trim().replace(/^(.+?) (\w+) Unit$/i, '$1 Unit $2');

function siteOf(row) {
  const line = lineOf(row);
  const parsed = line ? parse(line) : null;
  if (!parsed || parsed.form !== 'street' || !parsed.number) return null;
  const { form, ...street } = parsed;
  return street;
}

function fromRow(row) {
  const address = siteOf(row);
  const parcel = word(row.PIN);
  if (!address || !parcel) return null;
  const [kind, homeType] = useOf(row, address.unit);
  const facts = { parcel_number: parcel, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  put(facts, 'address_on_record', onRecord(lineOf(row), ''));
  put(facts, 'county_use_code', codeOf(row.PRIMARY_USE));
  put(facts, 'land_use', wordsOf(row.PRIMARY_USE));
  put(facts, 'neighborhood', word(row.NBHD));
  put(facts, 'zoning', word(row.ZONING));
  put(facts, 'legal_description', word(row.LEGAL_DESC)?.slice(0, 300));
  if (home || kind === 'building') put(facts, 'year_built', year(row.YEAR_BUILT));
  if (home) {
    put(facts, 'living_sqft', positive(row.LIVING_AREA));
    put(facts, 'bedrooms', inRange(row.BED_COUNT, 15));
    const [full, half] = [inRange(row.BATH_COUNT, 12), inRange(row.HALF_BATH_COUNT, 6)];
    if (full) {
      facts.full_baths = full;
      facts.bathrooms = full + (half ? half * 0.5 : 0);
      put(facts, 'half_baths', half);
    }
    put(facts, 'stories', inRange(row.STORIES, 6));
  }
  if (kind === 'building') put(facts, 'gross_sqft', positive(row.LIVING_AREA));
  // The lot is the record's legal acreage (LEGAL_AC), never an area measured from the parcel map. A condominium unit has no lot of its own.
  if (kind !== 'unit') put(facts, 'lot_acres', positive(row.LEGAL_AC));
  const assessed = dayOf(row.ASSESSMENT_DATE_1);
  put(facts, 'value_year', assessed ? assessed.getUTCFullYear() : null);
  put(facts, 'market_value', positive(row.ASSSESS_TOTAL_VALUE_1));
  put(facts, 'market_land_value', positive(row.ASSSESS_LAND_VALUE_1));
  put(facts, 'market_building_value', positive(row.ASSSESS_IMP_VALUE_1));
  return { id: `pp:${kind}:${FIPS}:${parcel}`, kind, home_type: homeType, address: { ...address, city: String(word(row.PARCEL_LOCATION_CITY) || '').toUpperCase(), zip: zipCode(row.PARCEL_LOCATION_ZIP) }, facts };
}

async function* build({ work }) {
  const dir = path.join(work, 'va-richmond');
  // The file's address is the one the Data Request page links to today: the page links a media page, which links the workbook.
  const page = path.join(dir, 'data-request.html');
  download(PAGE, page);
  const media = /<a href="([^"]+)">\s*Property Information\s*<\/a>/i.exec(fs.readFileSync(page, 'utf8'))?.[1];
  if (!media) throw new Error('The Data Request page no longer links "Property Information"');
  const holder = path.join(dir, 'property-information.html');
  download(new URL(media, PAGE).toString(), holder);
  const link = /href="([^"]+Assessor_Public_Data_Set_(\d{4}-\d{2}-\d{2})\.xlsx)"/i.exec(fs.readFileSync(holder, 'utf8'));
  if (!link) throw new Error('The Property Information page no longer links the Public Data Set workbook');
  const file = path.join(dir, `Assessor_Public_Data_Set_${link[2]}.xlsx`);
  download(new URL(link[1], PAGE).toString(), file);
  const records = new Map();
  let noAddress = 0;
  let repeated = 0;
  for await (const row of sheetRows(file, COLUMNS, { sharedStrings: true })) {
    const record = fromRow(row);
    if (!record) noAddress += 1;
    else if (records.has(record.id)) repeated += 1;
    else records.set(record.id, record);
  }
  const list = [...records.values()];
  log(`${COUNTY}: ${list.length} parcels, ${noAddress} without a street number, ${repeated} repeated`);
  for (const building of condoBuildings(list, { fips: FIPS, county: COUNTY })) list.push(building);
  // Dated by the workbook's own date in its name.
  yield {
    fips: FIPS, state: 'VA', name: COUNTY, publisher: 'City of Richmond Assessor of Real Estate', dataset: 'Public Data Set (Property Information)', method: 'county', source: 'va-richmond', as_of: link[2], stale_after_days: 450, records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    // The workbook's column names; the assessment date's year is the year of the value.
    columns: { ...Object.fromEntries(COLUMNS.map((column) => [column, ''])), ASSESSMENT_DATE_1: 'date of the current assessment; its year is the assessment year' },
    facts: { year_built: 'YEAR_BUILT', living_sqft: 'LIVING_AREA', gross_sqft: 'LIVING_AREA', bedrooms: 'BED_COUNT', bathrooms: 'BATH_COUNT', full_baths: 'BATH_COUNT', half_baths: 'HALF_BATH_COUNT', stories: 'STORIES', lot_acres: 'LEGAL_AC', value_year: 'ASSESSMENT_DATE_1', market_value: 'ASSSESS_TOTAL_VALUE_1', market_land_value: 'ASSSESS_LAND_VALUE_1', market_building_value: 'ASSSESS_IMP_VALUE_1' },
  },
};
