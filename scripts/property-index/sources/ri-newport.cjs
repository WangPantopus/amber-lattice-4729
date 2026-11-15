'use strict';
// Newport County, Rhode Island: the City of Newport's own assessment extract. Rhode Island assesses by city and town, so the City's Tax
// Assessor keeps this record; the City's GIS office publishes its CAMA extract on the City's ArcGIS Online as a table named for its date
// ("CAMA_2026Data_20260217"), inside a planning map service. It covers the city, not the county's other towns, whose lookups get no record.
// The City's map notice says the data is provided "as is", isn't guaranteed and isn't a survey; no license and no limit on use is posted.
// Year built, finished area, bedrooms, the City's bath total (a half bath counts .5) with its full and half bath counts, story height,
// style, land area in acres, and the full-value assessment (land, buildings, total). The extract's sale dates are blank, so no sale is
// read. Owner, mailing, previous-owner, grantor and grantee columns are never asked for.
// Each run reads the newest table of that name the City's GIS office has published, so next year's extract is found by its name; the
// release is dated by the extract's own date.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, zipCode, onRecord, realUnit } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '44005';
const COUNTY = 'Newport County';
const SERVICES = 'https://services2.arcgis.com/URasD5e1uL7MfVOn/arcgis/rest/services';
const EXTRACT = /^CAMA_(\d{4})Data_(\d{4})(\d{2})(\d{2})$/i;
// The extract read in November 2026 (CAMA_2026Data_20260217), for the dictionary check only: builds look for the newest one.
const CHECKED_EXTRACT = `${SERVICES}/Planning_Pop_Denisty_WFL1/FeatureServer/6`;
const COLUMNS = ['PropertyID', 'YearID', 'ParcelID', 'LandUseCode', 'TotalLandArea', 'Baths', 'Beds', 'FullBath', 'AdditionalFullBath', 'HalfBath', 'AdditionalHalfBath', 'ThreeQuarterBath', 'AdditionalThreeQuarterBath',
  'YearBuilt', 'EffectiveYearBuilt', 'BuildingTypeDescription', 'StreetNumber', 'StreetName', 'FormattedLocation', 'LocationCity', 'LocationZip', 'Zone1', 'TotalLandValue', 'TotalBuildingValue', 'TotalValue',
  'TotalFinishedArea', 'StoryHeight', 'QualityDescription', 'ResidentialUnits'];

// The extract writes an empty value as the word NULL and numbers as text.
const text = (value) => {
  const said = word(value);
  return said && !/^(NULL|-|\s*-\s*)$/i.test(said) ? said : null;
};
const count = (value, most) => {
  const n = positive(text(value));
  return n && n <= most ? n : null;
};
// Codes carry their own words: "35 - Resident Single Family", "B- - Ave-Good". The words after " - " are the City's.
const words = (value) => {
  const said = text(value);
  if (!said) return null;
  const parts = said.split(/\s+-\s+/);
  const rest = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
  return rest && !/^\d+$/.test(rest) ? rest : null;
};

/** The City's use words say what each property is. */
function useOf(row) {
  const use = (words(row.LandUseCode) || '').toUpperCase();
  if (/CONDO MAIN/.test(use)) return ['other', null];
  if (/RES(IDENT)?\s+CONDO|^RES CONDO/.test(use)) return ['unit', 'condo'];
  if (/SINGLE FAM|ESTATE|SEASON/.test(use)) return ['property', 'house'];
  if (/2-3 FAMILY|4-5 FAMILY/.test(use)) return ['building', 'multi_unit'];
  if (/APARTMENT/.test(use)) return ['building', 'apartment'];
  if (/VAC|VCT/.test(use)) return ['parcel', null];
  return ['other', null];
}

// The location line is the number and street, sometimes with the unit ("UNIT 3", "#3") or a second number after a comma.
function siteOf(row) {
  const line = String(text(row.FormattedLocation) || '').replace(/\s+/g, ' ').trim();
  const unitMatch = /(?:,\s*|\s)(?:UNIT|APT|#)\s*([\w-]+)\s*$/i.exec(line);
  const unit = unitMatch ? realUnit(unitMatch[1]) : null;
  const street = unitMatch ? line.slice(0, unitMatch.index) : line;
  const first = street.split(',')[0].trim();
  const parsed = parse(first, unit || undefined)
    || parse(`${String(text(row.StreetNumber) || '').trim()} ${String(text(row.StreetName) || '').trim()}`, unit || undefined);
  if (!parsed || parsed.form !== 'street' || !parsed.number) return null;
  const { form, ...address } = parsed;
  return address;
}

function fromRow(row) {
  const address = siteOf(row);
  const parcel = text(row.ParcelID);
  if (!address || !parcel) return null;
  const [kind, homeType] = useOf(row);
  const facts = { parcel_number: parcel, county: COUNTY, fips: FIPS, municipality: 'Newport' };
  const home = kind === 'property' || kind === 'unit';
  const built = home || kind === 'building';
  put(facts, 'address_on_record', onRecord(text(row.FormattedLocation), ''));
  put(facts, 'land_use', words(row.LandUseCode));
  put(facts, 'zoning', words(row.Zone1) || text(row.Zone1));
  if (built) {
    put(facts, 'year_built', year(text(row.YearBuilt)));
    put(facts, 'effective_year_built', year(text(row.EffectiveYearBuilt)));
    put(facts, 'style', text(row.BuildingTypeDescription));
    put(facts, 'quality', words(row.QualityDescription) || text(row.QualityDescription));
    const stories = /^(\d+(?:\.\d+)?)/.exec(String(text(row.StoryHeight) || ''));
    put(facts, 'stories', stories && Number(stories[1]) > 0 && Number(stories[1]) <= 6 ? Number(stories[1]) : null);
  }
  if (home) {
    put(facts, 'living_sqft', positive(text(row.TotalFinishedArea)));
    put(facts, 'bedrooms', count(row.Beds, 15));
    // The City's own total; its full and half counts are kept only when they add up to it.
    const total = positive(text(row.Baths));
    if (total && total <= 15) {
      facts.bathrooms = total;
      const full = (count(row.FullBath, 12) || 0) + (count(row.AdditionalFullBath, 12) || 0);
      const half = (count(row.HalfBath, 6) || 0) + (count(row.AdditionalHalfBath, 6) || 0);
      const threeQuarter = (count(row.ThreeQuarterBath, 6) || 0) + (count(row.AdditionalThreeQuarterBath, 6) || 0);
      if (!threeQuarter && full && full + half * 0.5 === total) {
        facts.full_baths = full;
        put(facts, 'half_baths', half || null);
      }
    }
  }
  if (kind === 'building') {
    put(facts, 'gross_sqft', positive(text(row.TotalFinishedArea)));
    put(facts, 'units', count(row.ResidentialUnits, 500));
  }
  // A condominium unit's land is the complex's, so it gets no lot.
  if (kind !== 'unit') put(facts, 'lot_acres', positive(text(row.TotalLandArea)));
  put(facts, 'market_value', positive(text(row.TotalValue)));
  put(facts, 'market_land_value', positive(text(row.TotalLandValue)));
  put(facts, 'market_building_value', positive(text(row.TotalBuildingValue)));
  const zip = String(text(row.LocationZip) || '').padStart(5, '0');
  return { id: `pp:${kind}:${FIPS}:${parcel}${address.unit ? `:${address.unit}` : ''}`, kind, home_type: homeType, address: { ...address, city: 'NEWPORT', zip: zipCode(zip) }, facts };
}

// A service that doesn't answer is skipped: only the extract matters here.
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

/** The newest CAMA extract table the City's GIS office has published, by the date in its name. */
async function newestExtract() {
  const list = await getJson(`${SERVICES}?f=json`, 'The City of Newport\'s map service list');
  let best = null;
  for (const service of list.services || []) {
    if (service.type !== 'FeatureServer') continue;
    const info = await peek(`${SERVICES}/${service.name}/FeatureServer?f=json`);
    for (const layer of [...(info?.layers || []), ...(info?.tables || [])]) {
      const match = EXTRACT.exec(layer.name || '');
      if (!match) continue;
      const date = `${match[2]}-${match[3]}-${match[4]}`;
      if (!best || date > best.date) best = { url: `${SERVICES}/${service.name}/FeatureServer/${layer.id}`, date, name: layer.name };
    }
  }
  if (!best) throw new Error('The City of Newport no longer publishes a CAMA extract table');
  return best;
}

async function* build({ work }) {
  const extract = await newestExtract();
  log(`${COUNTY}: reading ${extract.name}`);
  const records = new Map();
  let noAddress = 0;
  let repeated = 0;
  const file = path.join(work, 'ri-newport', `${extract.name}.jsonl.gz`);
  for await (const row of cached(file, () => layerRows(extract.url, COLUMNS))) {
    const record = fromRow(row);
    if (!record) noAddress += 1;
    else if (records.has(record.id)) repeated += 1;
    else records.set(record.id, record);
  }
  const list = [...records.values()];
  log(`${COUNTY}: ${list.length} City of Newport properties, ${noAddress} without a street number, ${repeated} repeated`);
  for (const building of condoBuildings(list, { fips: FIPS, county: COUNTY })) list.push(building);
  yield {
    fips: FIPS, state: 'RI', name: COUNTY, publisher: 'City of Newport', dataset: 'Tax Assessor\'s CAMA extract', method: 'county', source: 'ri-newport', as_of: extract.date, stale_after_days: 450, records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: CHECKED_EXTRACT,
    facts: { year_built: 'YearBuilt', effective_year_built: 'EffectiveYearBuilt', living_sqft: 'TotalFinishedArea', gross_sqft: 'TotalFinishedArea', bedrooms: 'Beds', bathrooms: 'Baths', full_baths: ['FullBath', 'AdditionalFullBath'], half_baths: ['HalfBath', 'AdditionalHalfBath'], stories: 'StoryHeight', style: 'BuildingTypeDescription', quality: 'QualityDescription', units: 'ResidentialUnits', lot_acres: 'TotalLandArea', market_value: 'TotalValue', market_land_value: 'TotalLandValue', market_building_value: 'TotalBuildingValue', land_use: 'LandUseCode', zoning: 'Zone1' },
  },
};
