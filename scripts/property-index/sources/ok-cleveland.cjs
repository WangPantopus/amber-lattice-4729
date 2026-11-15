'use strict';
// Cleveland County, Oklahoma: the Cleveland County Assessor's own tax parcels joined to its appraisal records, published by the Assessor's office
// on ArcGIS Online (a dated copy; the layer's name carries the month). No terms are stated on the layer or the Assessor's site. Owner, mailing,
// grantor and grantee columns are in the layer and never asked for. TotalValue is the Assessor's fair cash value; TotalArea is the account's land
// in acres as the Assessor records it (the parcel map's own measured area is a different column and isn't read). Baths are one total in which a
// half bath is .5 and a three-quarter bath .75, as the Assessor writes them.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate, zipCode } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { isHomeSale } = require('../lib/sales.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '40027';
const COUNTY = 'Cleveland County';
const LAYER = 'https://services1.arcgis.com/kxHJSF07PF5lbQ3z/arcgis/rest/services/ClevelandTaxParcelsJune2026/FeatureServer/0';
const COLUMNS = ['UserAccount', 'AccountType', 'LandUseCode', 'PropertyStatus', 'BuildingTypeDescription', 'FormattedLocation', 'LocationCity', 'LocationZip', 'Subdivision', 'Lot', 'Neighborhood', 'TotalArea', 'TotalAreaUOM', 'YearBuilt', 'TotalFinishedArea', 'Beds', 'Baths', 'TotalValue', 'TotalLandValue', 'TotalBuildingValue', 'TotalAssessedValue', 'SalePrice', 'SaleDate', 'InstrumentType', 'SoldAsVacant', 'LegalReference'];

// Building types as the Assessor names them. A "Cancel" mobile home is one whose title was cancelled into the land: it is still the home on the
// parcel. "Addon Only" accounts hold an addition with no dwelling of their own, so they aren't read as homes.
const HOUSES = /^(CONVENTIONAL 1 STORY|1½ STORY (FIN|UNFIN)|2 STORY|2½ STORY|3 STORY|SPLIT LEVEL|METAL HOUSE|MODULAR|EARTH SHELTERED|A FRAME|CABIN|PREFAB CABIN|DOME|STORAGE LIVING)$/;
const STORIES = { 'CONVENTIONAL 1 STORY': 1, '1½ STORY FIN': 1.5, '1½ STORY UNFIN': 1.5, '2 STORY': 2, '2½ STORY': 2.5, '3 STORY': 3, 'TOWNHOUSE ONE STORY': 1, 'TOWNHOUSE TWO STORY': 2 };

function useOf(row, unit) {
  const type = String(row.BuildingTypeDescription || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (/^CONDO/.test(type)) return ['unit', 'condo'];
  if (/^(TOWNHOUSE|TOWNHOME|ROW HOUSE)/.test(type)) return ['property', 'townhouse'];
  if (/^(SINGLE|DOUBLE|TRIPLE) WIDE/.test(type)) return ['property', 'mobile_home'];
  if (/^(DUPLEX|TRIPLEX)/.test(type)) return ['building', 'multi_unit'];
  if (type === 'MULTIPLE - RESIDENTIAL') return ['building', 'apartment'];
  if (HOUSES.test(type)) return unit ? ['unit', 'condo'] : ['property', 'house'];
  const residential = /^(220|180)\b/.test(String(row.AccountType || '').trim());
  return residential && (!type || /^ADDON ONLY RES/.test(type)) ? ['parcel', null] : ['other', null];
}

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};
// "INDSE - INDIAN SPRINGS EST" is a code and its words; "  -  " says none.
const named = (text) => word(String(text ?? '').replace(/^[^-]*-\s*/, '')) || null;

function fromRow(row) {
  const line = word(String(row.FormattedLocation ?? '').replace(/,\s*Unit\s+/i, ' UNIT ').replace(/\s+/g, ' '));
  const address = line ? parse(line) : null;
  const account = word(row.UserAccount);
  if (!address || !account) return null;
  const [kind, homeType] = useOf(row, address.unit);
  const facts = { parcel_number: account, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  const type = String(row.BuildingTypeDescription || '').replace(/\s+/g, ' ').trim();
  put(facts, 'address_on_record', line);
  put(facts, 'property_class', named(row.AccountType));
  put(facts, 'land_use', named(row.LandUseCode));
  put(facts, 'subdivision', named(row.Subdivision));
  put(facts, 'neighborhood', named(row.Neighborhood));
  put(facts, 'lot_number', word(row.Lot));
  if (home || kind === 'building') {
    put(facts, 'year_built', year(row.YearBuilt));
    put(facts, 'style', type || null);
    put(facts, 'stories', STORIES[type.toUpperCase()]);
  }
  if (home) {
    put(facts, 'living_sqft', positive(row.TotalFinishedArea));
    put(facts, 'bedrooms', inRange(row.Beds, 15));
    put(facts, 'bathrooms', inRange(row.Baths, 15));
  }
  if (kind !== 'unit' && /^AC\b/i.test(String(row.TotalAreaUOM || '').trim())) put(facts, 'lot_acres', positive(row.TotalArea));
  put(facts, 'market_value', positive(row.TotalValue));
  put(facts, 'market_land_value', positive(row.TotalLandValue));
  put(facts, 'market_building_value', positive(row.TotalBuildingValue));
  put(facts, 'assessed_value', positive(row.TotalAssessedValue));
  // A sale of the bare land before the house was built isn't this home's price.
  if (isHomeSale(positive(row.SalePrice), row.InstrumentType) && !Number(row.SoldAsVacant)) {
    facts.sale_price = positive(row.SalePrice);
    put(facts, 'sale_date', isoDate(row.SaleDate));
    put(facts, 'sale_document', word(row.LegalReference));
  }
  return { id: `pp:${kind}:${FIPS}:${account}`, kind, home_type: homeType, address: { ...address, city: String(word(row.LocationCity) || '').toUpperCase(), zip: zipCode(row.LocationZip) }, facts };
}

async function* build({ work }) {
  const info = await getJson(`${LAYER}?f=json`, 'The layer\'s description');
  const asOf = isoDate(info.editingInfo?.dataLastEditDate || info.editingInfo?.lastEditDate);
  if (!asOf) throw new Error('The layer no longer says when it changed');
  const records = [];
  const seen = new Set();
  let [noAddress, inactive] = [0, 0];
  for await (const row of cached(path.join(work, 'ok-cleveland', 'parcels.jsonl.gz'), () => layerRows(LAYER, COLUMNS))) {
    if (!/^A\b/i.test(String(row.PropertyStatus || '').trim())) {
      inactive += 1;
      continue;
    }
    const record = fromRow(row);
    if (!record) noAddress += 1;
    else if (!seen.has(record.id)) {
      seen.add(record.id);
      records.push(record);
    }
  }
  log(`${COUNTY}: ${records.length} accounts, ${noAddress} without a street number, ${inactive} inactive`);
  for (const building of condoBuildings(records, { fips: FIPS, county: COUNTY })) records.push(building);
  yield {
    fips: FIPS, state: 'OK', name: COUNTY, publisher: 'Cleveland County Assessor', dataset: 'tax parcels with appraisal records', method: 'county', source: 'ok-cleveland', as_of: asOf, stale_after_days: 400, records,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: { year_built: 'YearBuilt', living_sqft: 'TotalFinishedArea', bedrooms: 'Beds', bathrooms: 'Baths', lot_acres: 'TotalArea', market_value: 'TotalValue', market_land_value: 'TotalLandValue', market_building_value: 'TotalBuildingValue', assessed_value: 'TotalAssessedValue', sale_price: 'SalePrice', sale_date: 'SaleDate' },
  },
};
