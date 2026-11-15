'use strict';
// Ketchikan Gateway Borough, Alaska: the borough's address points carrying its Assessment Department's roll for each parcel
// ("AddressPoints_KetchikanAK", Ketchikan Gateway Borough GIS, hosted on ArcGIS Online by the borough's GIS contractor, Sidwell). The
// borough's GIS page says "Data layers present on the GIS Viewer are available as web map services for those that wish to utilize them";
// no license and no limit on use is posted. The borough is both the data's origin and its publisher.
// Each parcel gives its situs address (the LOC_ columns), its use in the Assessor's own words, year built, the dwelling's total area,
// bedrooms, one bath total (a half bath is .5 and a three-quarter bath .75, as the Assessor writes it), basement area, the Assessor's land
// area in acres and square feet, and the appraised land, improvement and total values (Alaska appraises at full and true value).
// Several address points can sit on one parcel with the same roll columns, so each parcel is read once. The owner's name (NLAST, NFIRST,
// NMID, Owner_*), the owner's mailing address (Address, CITY, STATE, ZIP and the unprefixed street columns), the exemptions and the
// assessed (after-exemption) values are never asked for.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate, zipCode, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '02130';
const COUNTY = 'Ketchikan Gateway Borough';
const POINTS = 'https://services2.arcgis.com/65jtiGuzdaRB5FxF/arcgis/rest/services/AddressPoints_KetchikanAK/FeatureServer/0';
const COLUMNS = ['Parcel_Num', 'LOC_STNO', 'LOC_PREDIR', 'LOC_STNAME', 'LOC_SUFFIX', 'LOC_POSTDI', 'LOC_UNIT', 'LOC_UNITTY', 'LOC_CITY', 'LOC_ZIP', 'Prop_Type', 'PropUse', 'No_Units', 'Year_Built', 'Total_Area', 'Bedrooms', 'Bathrooms', 'Bsmnt_Area', 'Bsmnt_Fin', 'Land_Sq_Ft', 'Land_Acres', 'Apr_Land_V', 'Apr_Imps', 'Total_Appr', 'Asse_Year1', 'Legal_Desc', 'Zoning_Typ'];

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};

// The Assessor's property use, in its own words ("RES SFR", "CONDO", "MBHM" for a mobile home, "RES 2-3" for two or three dwellings).
function useOf(use, unit) {
  const u = String(use || '').trim().toUpperCase();
  if (u === 'RES SFR' || u === 'RES CABIN') return unit ? ['unit', 'condo'] : ['property', 'house'];
  if (u === 'CONDO') return ['unit', 'condo'];
  if (u === 'RES TOWN') return ['property', 'townhouse'];
  if (u === 'MBHM' || u === 'RES MFG') return ['property', 'mobile_home'];
  if (u === 'RES 2-3') return ['building', 'multi_unit'];
  if (u === 'RES 4+') return ['building', 'apartment'];
  if (u === 'VACANT') return ['parcel', null];
  return ['other', null];
}

function siteOf(row) {
  const street = [row.LOC_STNO, row.LOC_PREDIR, row.LOC_STNAME, row.LOC_SUFFIX, row.LOC_POSTDI].map((part) => word(part)).filter(Boolean).join(' ');
  const unit = word(row.LOC_UNIT) || '';
  const parsed = street ? parse(street, unit) : null;
  if (!parsed || parsed.form !== 'street' || !parsed.number) return null;
  const { form, ...address } = parsed;
  // The town and ZIP come only from the parcel's situs (LOC_) columns, never from the mailing columns; a parcel whose situs has no ZIP
  // keeps none, and the borough's Census ZIPs are listed with the release. The roll writes the town as "KETCHIKAN" (once "KETCHIKAN, AK").
  return { address: { ...address, city: String(word(row.LOC_CITY) || '').replace(/,\s*AK$/i, '').toUpperCase(), zip: zipCode(row.LOC_ZIP) }, street, unit };
}

function fromRow(row) {
  const site = siteOf(row);
  const parcel = word(row.Parcel_Num);
  if (!site || !parcel) return null;
  const { address } = site;
  const [kind, homeType] = useOf(row.PropUse, address.unit);
  const facts = { parcel_number: parcel, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  put(facts, 'address_on_record', onRecord(site.street, site.unit));
  put(facts, 'land_use', word(row.PropUse));
  put(facts, 'property_class', word(row.Prop_Type));
  put(facts, 'zoning', word(row.Zoning_Typ));
  put(facts, 'legal_description', word(row.Legal_Desc)?.slice(0, 300));
  if (home || kind === 'building') put(facts, 'year_built', year(row.Year_Built));
  if (home) {
    // The roll's total area for the dwelling; its basement is a separate column.
    put(facts, 'living_sqft', positive(row.Total_Area));
    put(facts, 'bedrooms', inRange(row.Bedrooms, 15));
    put(facts, 'bathrooms', inRange(row.Bathrooms, 15));
    put(facts, 'basement_sqft', positive(row.Bsmnt_Area));
    put(facts, 'basement_finished_sqft', positive(row.Bsmnt_Fin) && positive(row.Bsmnt_Fin) <= (positive(row.Bsmnt_Area) || 0) ? positive(row.Bsmnt_Fin) : null);
  }
  if (kind === 'building') {
    put(facts, 'units', inRange(row.No_Units, 2000));
    put(facts, 'gross_sqft', positive(row.Total_Area));
  }
  // The Assessor's land area. A condominium unit's parcel is its share of the complex, and a mobile home on a numbered space in a park
  // sits on the park's land, so neither gets a lot.
  const ownLand = kind !== 'unit' && homeType !== 'townhouse' && !(homeType === 'mobile_home' && address.unit);
  if (ownLand) {
    put(facts, 'lot_acres', positive(row.Land_Acres));
    put(facts, 'lot_sqft', positive(row.Land_Sq_Ft) >= 100 ? positive(row.Land_Sq_Ft) : null);
  }
  put(facts, 'market_value', positive(row.Total_Appr));
  put(facts, 'market_land_value', positive(row.Apr_Land_V));
  put(facts, 'market_building_value', positive(row.Apr_Imps));
  put(facts, 'value_year', positive(row.Asse_Year1));
  return { id: `pp:${kind}:${FIPS}:${parcel}`, kind, home_type: homeType, address, facts };
}

async function* build({ work }) {
  const about = await getJson(`${POINTS}?f=json`, 'Ketchikan Gateway Borough\'s address point layer');
  const asOf = isoDate(about.editingInfo?.dataLastEditDate || about.editingInfo?.lastEditDate);
  if (!asOf) throw new Error('The address point layer no longer says when it changed');
  const records = new Map();
  let noAddress = 0;
  let repeated = 0;
  for await (const row of cached(path.join(work, 'ak-ketchikan', `points-${asOf}.jsonl.gz`), () => layerRows(POINTS, COLUMNS))) {
    if (!word(row.Parcel_Num)) continue;
    const record = fromRow(row);
    if (!record) noAddress += 1;
    else if (records.has(record.id)) repeated += 1;
    else records.set(record.id, record);
  }
  const list = [...records.values()];
  log(`${COUNTY}: ${list.length} parcels, ${noAddress} points without a situs street number, ${repeated} repeated points`);
  for (const building of condoBuildings(list, { fips: FIPS, county: COUNTY })) list.push(building);
  yield {
    fips: FIPS, state: 'AK', name: COUNTY, publisher: 'Ketchikan Gateway Borough', dataset: 'address points with the Assessment Department\'s roll', method: 'county', source: 'ak-ketchikan', as_of: asOf, stale_after_days: 450, extra_zips: zipsByCounty(work, ['02']).get(FIPS) || [], records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: POINTS,
    facts: { year_built: 'Year_Built', living_sqft: 'Total_Area', gross_sqft: 'Total_Area', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', basement_sqft: 'Bsmnt_Area', basement_finished_sqft: 'Bsmnt_Fin', lot_acres: 'Land_Acres', lot_sqft: 'Land_Sq_Ft', market_value: 'Total_Appr', market_land_value: 'Apr_Land_V', market_building_value: 'Apr_Imps', value_year: 'Asse_Year1', units: 'No_Units', zoning: 'Zoning_Typ', property_class: 'Prop_Type', land_use: 'PropUse' },
  },
};
