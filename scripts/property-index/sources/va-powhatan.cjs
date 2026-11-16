'use strict';
// Powhatan County, Virginia: the county's own assessment tables (its Vision appraisal system), published as one public feature service on the
// county's ArcGIS organization and edited as the Assessor's records change. No license and no limit on use is posted with them; the county's
// GIS data request form calls its maps and data a public information service and disclaims liability. Each home's year built (the
// depreciation table), finished living area, bedrooms, full and half baths, stories and rooms (the residential construction table), the
// parcel's land acres and its current land, building and total assessments (Virginia assesses at full market value), with the parcel's own
// location. Owner, mailing and ownership tables are never asked for. Parcels the county marks to keep off the internet carry no facts here.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate, zipCode, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '51145';
const COUNTY = 'Powhatan County';
const SERVICE = 'https://services5.arcgis.com/nip9boeHfv9Av5yj/arcgis/rest/services/Vision_Powhatan/FeatureServer';
const TABLES = {
  realmast: { id: 13, columns: ['REM_PID', 'REM_ALT_PRCL_ID', 'REM_PRCL_LOCN', 'REM_PRCL_LOCN_CITY', 'REM_PRCL_LOCN_ZIP', 'REM_USE_CODE', 'REM_INET_SUPPRESS'] },
  parcel: { id: 11, columns: ['PRC_PID', 'PRC_TTL_LND_AREA_ACRES', 'PRC_TTL_ASSESS', 'PRC_TTL_ASSESS_LND', 'PRC_TTL_ASSESS_BLDG', 'PRC_TTL_ASSESS_IMPROVEMENTS'] },
  construction: { id: 4, columns: ['CNS_PID', 'CNS_BID', 'CNS_STYLE_DESC', 'CNS_IS_CMRCL'] },
  residential: { id: 6, columns: ['CNS_PID', 'CNS_BID', 'CNS_AREA_LIVING', 'CNS_NUM_BEDRM', 'CNS_NUM_BATHRM', 'CNS_NUM_HALF_BATHS', 'CNS_STORIES', 'CNS_NUM_RMS', 'CNS_EXT_WALL_1_DESC', 'CNS_ROOF_COVER_DESC', 'CNS_HEAT_TYPE_DESC', 'CNS_AC_TYPE_DESC'] },
  depreciation: { id: 5, columns: ['CNS_PID', 'CNS_BID', 'CNS_AYB'] },
};

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};
// A description column now and then holds a bare code.
const said = (value) => (/[A-Z]{2}/i.test(String(value ?? '')) ? word(value) : null);

// The county's use codes: 200 single family suburban, 500 and 600 agricultural and undeveloped land (20-99 and 100+ acres), 300 multi-family,
// 400 commercial and industrial, 7xx public and exempt; the letter says R with a residence, V vacant, C commercial, U a condominium. A farm
// with a residence is a home. The building's style says when a home is a manufactured home ("Double Wide", "Single Wide") or a townhouse.
function useOf(code, style) {
  const c = String(code || '').trim().toUpperCase();
  if (/^[256]00R$/.test(c)) {
    if (/wide/i.test(style || '')) return ['property', 'mobile_home'];
    if (/town ?house/i.test(style || '')) return ['property', 'townhouse'];
    return ['property', 'house'];
  }
  if (c === '300R' || c === '300C') return ['building', 'multi_unit'];
  if (/^[256]00V$/.test(c)) return ['parcel', null];
  return ['other', null];
}

function siteOf(row) {
  const line = String(row.REM_PRCL_LOCN ?? '').replace(/\s+/g, ' ').trim();
  const parsed = line ? parse(line) : null;
  if (!parsed || parsed.form !== 'street' || !parsed.number) return null;
  const { form, ...street } = parsed;
  return street;
}

async function table(work, name) {
  const { id, columns } = TABLES[name];
  const rows = [];
  for await (const row of cached(path.join(work, 'va-powhatan', `${name}.jsonl.gz`), () => layerRows(`${SERVICE}/${id}`, columns, { pageSize: 2000 }))) rows.push(row);
  if (!rows.length) throw new Error(`The ${name} table came back empty`);
  return rows;
}

async function* build({ work, today }) {
  const realmast = await table(work, 'realmast');
  const parcels = new Map((await table(work, 'parcel')).map((row) => [String(row.PRC_PID), row]));
  // Each parcel's main residence: its residential building with the most finished area, and that building's style and year.
  const styles = new Map((await table(work, 'construction')).map((row) => [`${row.CNS_PID}:${row.CNS_BID}`, row]));
  const built = new Map((await table(work, 'depreciation')).map((row) => [`${row.CNS_PID}:${row.CNS_BID}`, row]));
  const residences = new Map();
  for (const row of await table(work, 'residential')) {
    const key = String(row.CNS_PID);
    const held = residences.get(key);
    if (!held || (positive(row.CNS_AREA_LIVING) || 0) > (positive(held.CNS_AREA_LIVING) || 0)) residences.set(key, row);
  }
  // The site city and ZIP are blank on many parcels and now and then misspelled: a ZIP is kept only where it reaches into the county
  // (the Census ZIP file), and a city only where the file spells it the same way on many parcels.
  const censusZips = zipsByCounty(work, ['51']).get(FIPS) || [];
  const zipSet = new Set(censusZips);
  const cityCounts = new Map();
  for (const row of realmast) {
    const city = String(word(row.REM_PRCL_LOCN_CITY) || '').toUpperCase();
    if (city) cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
  }
  const records = new Map();
  let noAddress = 0;
  let repeated = 0;
  let suppressed = 0;
  for (const row of realmast) {
    const address = siteOf(row);
    const pid = String(row.REM_PID ?? '');
    // The tax map number ("053-12A"); the PID only links the tables.
    const parcelNumber = word(row.REM_ALT_PRCL_ID);
    if (!address || !parcelNumber) { noAddress += 1; continue; }
    const residence = residences.get(pid);
    const key = residence ? `${pid}:${residence.CNS_BID}` : null;
    const style = key ? styles.get(key)?.CNS_STYLE_DESC : null;
    const [kind, homeType] = useOf(row.REM_USE_CODE, style);
    const zip = zipCode(row.REM_PRCL_LOCN_ZIP);
    const city = String(word(row.REM_PRCL_LOCN_CITY) || '').toUpperCase();
    const where = { ...address, city: zip && zipSet.has(zip) && (cityCounts.get(city) || 0) >= 50 ? city : '', zip: zip && zipSet.has(zip) ? zip : '' };
    const id = `pp:${kind}:${FIPS}:${parcelNumber}`;
    if (records.has(id)) { repeated += 1; continue; }
    if (Number(row.REM_INET_SUPPRESS) === 1) {
      suppressed += 1;
      records.set(id, { id, kind, address: where, facts: {}, restricted: true });
      continue;
    }
    const facts = { parcel_number: parcelNumber, county: COUNTY, fips: FIPS };
    put(facts, 'address_on_record', onRecord(row.REM_PRCL_LOCN, ''));
    put(facts, 'county_use_code', word(row.REM_USE_CODE));
    const home = kind === 'property';
    if (home && residence) {
      put(facts, 'year_built', year(built.get(key)?.CNS_AYB));
      put(facts, 'living_sqft', positive(residence.CNS_AREA_LIVING));
      put(facts, 'bedrooms', inRange(residence.CNS_NUM_BEDRM, 15));
      const [full, half] = [inRange(residence.CNS_NUM_BATHRM, 12), inRange(residence.CNS_NUM_HALF_BATHS, 6)];
      if (full) {
        facts.full_baths = full;
        facts.bathrooms = full + (half ? half * 0.5 : 0);
        put(facts, 'half_baths', half);
      }
      put(facts, 'stories', inRange(residence.CNS_STORIES, 5));
      put(facts, 'rooms', inRange(residence.CNS_NUM_RMS, 40));
      put(facts, 'exterior_walls', said(residence.CNS_EXT_WALL_1_DESC));
      put(facts, 'roof_cover', said(residence.CNS_ROOF_COVER_DESC));
      put(facts, 'heating', said(residence.CNS_HEAT_TYPE_DESC));
      put(facts, 'cooling', said(residence.CNS_AC_TYPE_DESC));
    }
    const parcel = parcels.get(pid);
    if (parcel) {
      put(facts, 'lot_acres', positive(parcel.PRC_TTL_LND_AREA_ACRES));
      put(facts, 'market_value', positive(parcel.PRC_TTL_ASSESS));
      put(facts, 'market_land_value', positive(parcel.PRC_TTL_ASSESS_LND));
      put(facts, 'market_building_value', positive(parcel.PRC_TTL_ASSESS_IMPROVEMENTS) || positive(parcel.PRC_TTL_ASSESS_BLDG));
    }
    records.set(id, { id, kind, home_type: homeType, address: where, facts });
  }
  const list = [...records.values()];
  log(`${COUNTY}: ${list.length} parcels, ${noAddress} without a street number, ${repeated} repeated, ${suppressed} kept off the internet by the county`);
  // The tables don't say when they last changed, so the release is dated by the day they were read.
  yield {
    fips: FIPS, state: 'VA', name: COUNTY, publisher: 'Powhatan County', dataset: 'assessment tables (Vision)', method: 'county', source: 'va-powhatan', as_of: isoDate(today.getTime()), stale_after_days: 450, extra_zips: censusZips, records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    // The tax parcel layer (0) carries the value columns' own names ("Total Assessed Value"); the county's parcel viewer web map labels
    // CNS_AYB "Year Built".
    layer: [`${SERVICE}/13`, `${SERVICE}/11`, `${SERVICE}/6`, `${SERVICE}/5`, `${SERVICE}/0`],
    columns: { CNS_AYB: 'Year Built (the county\'s parcel viewer web map)' },
    facts: { year_built: 'CNS_AYB', living_sqft: 'CNS_AREA_LIVING', bedrooms: 'CNS_NUM_BEDRM', bathrooms: 'CNS_NUM_BATHRM', full_baths: 'CNS_NUM_BATHRM', half_baths: 'CNS_NUM_HALF_BATHS', stories: 'CNS_STORIES', rooms: 'CNS_NUM_RMS', lot_acres: 'PRC_TTL_LND_AREA_ACRES', market_value: 'PRC_TTL_ASSESS', market_land_value: 'PRC_TTL_ASSESS_LND', market_building_value: 'PRC_TTL_ASSESS_IMPROVEMENTS' },
  },
};
