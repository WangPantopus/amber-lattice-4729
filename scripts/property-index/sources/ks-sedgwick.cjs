'use strict';
// Sedgwick County, Kansas: the Sedgwick County Appraiser's parcel records as the City of Wichita republishes them ("City of Wichita Parcels",
// updated as the city or county updates their records, with a full refresh each month). The Appraiser is the data's origin and the city
// publishes this copy. The city's catalog entry puts the parcel database under the Open Data Commons Public Domain Dedication and License 1.0 and
// asks users to follow K.S.A. 45-230, which bars selling or giving lists of names and addresses from public records for sales solicitation:
// Pantopus reads no names, so no list of names and addresses exists, and it uses these records only to show a home its own record,
// never for solicitation. The county itself offers its parcels free on its GIS Data Layers page, weekly.
// Each parcel gives its site address and ZIP, land use, appraised land, improvement and total values, and the main dwelling's year built,
// living area, bedrooms, full and half baths, rooms, basement, style, quality and condition. Its only lot figure is the county's mapped
// parcel acres (ParcAcresC), which the source line names. Owner and mailing columns are never asked for.

const path = require('node:path');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate, onRecord } = require('../lib/addresses.cjs');
const { positive, put, word } = require('../lib/values.cjs');
const { mapLot } = require('../lib/held.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { condoBuildings } = require('../lib/condos.cjs');
const { log } = require('../lib/log.cjs');

const FIPS = '20173';
const COUNTY = 'Sedgwick County';
const PARCELS = 'https://gismaps.wichita.gov/ageweb/rest/services/COWGIS/Property_and_Location/MapServer/4';
const COLUMNS = ['PIN', 'Prop_Addr', 'Prop_AddrUnit', 'Prop_City', 'Prop_zip', 'ParcAcresC', 'Nbrhd', 'Class', 'FunctionDs', 'LandVal', 'ImprVal', 'TotVal', 'YrBuilt', 'SFLA', 'GrndFLSF', 'BedRooms', 'FullBath', 'HalfBath', 'TotalRooms', 'StyleDs', 'ArchStyleDs', 'QualRateDs', 'CDUDs', 'LivingUnits', 'BsmtTypeDs', 'BasementSF', 'FinishBsmtSF', 'MultBldgD', 'Legal'];

const inRange = (value, most) => {
  const count = positive(value);
  return count && count <= most ? count : null;
};

// The Appraiser's land-use function says what the parcel is (its Land-Based Classification Standards words).
function useOf(fn, unit) {
  const f = String(fn || '').trim().toLowerCase();
  if (f === 'single family residence (detached)') return ['property', 'house'];
  if (f === 'single family condo unit' || f.startsWith('townhouse unit')) return unit ? ['unit', 'condo'] : ['property', 'townhouse'];
  if (f === 'manufactured home site') return ['property', 'mobile_home'];
  if (/^(duplex|triplex|fourplex|multiple dwelling parcel|dwelling converted to apartments)$/.test(f)) return ['building', 'multi_unit'];
  if (/apartment/.test(f)) return ['building', 'apartment'];
  return ['other', null];
}

// "1.5 Story Finished" -> 1.5; split levels and bi-levels carry no story count.
const storiesOf = (style) => {
  const m = /^(\d(?:\.\d)?) Story/.exec(String(style || '').trim());
  return m && Number(m[1]) > 0 && Number(m[1]) <= 4 ? Number(m[1]) : null;
};

function fromRow(row) {
  const unit = word(row.Prop_AddrUnit) || '';
  // The street line repeats the unit at its end: "123 N MAIN ST 4" with unit "4".
  let street = String(row.Prop_Addr ?? '').replace(/\s+/g, ' ').trim();
  if (unit && street.toUpperCase().endsWith(` ${unit.toUpperCase()}`)) street = street.slice(0, -(unit.length + 1)).trim();
  const address = parse(street, unit);
  const parcel = word(row.PIN);
  if (!address || !parcel) return null;
  const [kind, homeType] = useOf(row.FunctionDs, address.unit);
  const facts = { parcel_number: parcel, county: COUNTY, fips: FIPS };
  const home = kind === 'property' || kind === 'unit';
  put(facts, 'address_on_record', onRecord(street, unit));
  put(facts, 'land_use', word(row.FunctionDs));
  put(facts, 'neighborhood', word(row.Nbrhd));
  put(facts, 'legal_description', word(row.Legal)?.slice(0, 300));
  if (home || kind === 'building') {
    put(facts, 'year_built', year(row.YrBuilt));
    put(facts, 'style', word(row.ArchStyleDs));
    put(facts, 'quality', word(row.QualRateDs));
    put(facts, 'stories', storiesOf(row.StyleDs));
  }
  if (home) {
    put(facts, 'living_sqft', positive(row.SFLA));
    put(facts, 'ground_floor_sqft', positive(row.GrndFLSF));
    put(facts, 'basement_sqft', positive(row.BasementSF));
    put(facts, 'basement_finished_sqft', positive(row.FinishBsmtSF));
    put(facts, 'bedrooms', inRange(row.BedRooms, 15));
    const [full, half] = [inRange(row.FullBath, 12), inRange(row.HalfBath, 8)];
    put(facts, 'full_baths', full);
    put(facts, 'half_baths', half);
    if (full || half) facts.bathrooms = (full || 0) + 0.5 * (half || 0);
    put(facts, 'rooms', inRange(row.TotalRooms, 40));
    put(facts, 'condition', word(row.CDUDs));
  }
  if (kind === 'building') put(facts, 'units', inRange(row.LivingUnits, 2000));
  // The county's mapped parcel acres; a condominium or townhouse unit's own sliver of land isn't its lot.
  if (kind !== 'unit' && homeType !== 'townhouse') put(facts, 'lot_acres', positive(row.ParcAcresC));
  // Kansas appraised (market) values, land and improvements.
  put(facts, 'market_value', positive(row.TotVal));
  put(facts, 'market_land_value', positive(row.LandVal));
  put(facts, 'market_building_value', positive(row.ImprVal));
  const zip = /^\d{5}$/.test(String(row.Prop_zip ?? '').trim()) ? String(row.Prop_zip).trim() : null;
  return { id: `pp:${kind}:${FIPS}:${parcel}`, kind, home_type: homeType, address: { ...address, city: String(row.Prop_City ?? '').replace(/\s+/g, ' ').trim().toUpperCase(), zip }, facts, ...mapLot(facts, 'lot_acres') };
}

async function* build({ work, today }) {
  const dir = path.join(work, 'ks-sedgwick');
  const records = new Map();
  let noAddress = 0;
  let repeated = 0;
  for await (const row of cached(path.join(dir, 'parcels.jsonl.gz'), () => layerRows(PARCELS, COLUMNS, { pageSize: 2000 }))) {
    const record = fromRow(row);
    if (!record) noAddress += 1;
    else if (records.has(record.id)) repeated += 1;
    else records.set(record.id, record);
  }
  const list = [...records.values()];
  log(`${COUNTY}: ${list.length} parcels, ${noAddress} without a street number, ${repeated} repeated`);
  for (const building of condoBuildings(list, { fips: FIPS, county: COUNTY })) list.push(building);
  // "From the City of Wichita's copy of the Sedgwick County Appraiser's parcel records (lot sizes are the county's mapped acres)".
  yield {
    fips: FIPS, state: 'KS', name: COUNTY, publisher: 'the City of Wichita\'s copy of the Sedgwick County Appraiser', dataset: 'parcel records (lot sizes are the county\'s mapped acres)', method: 'county', source: 'ks-sedgwick', as_of: isoDate(today.getTime()), stale_after_days: 120, extra_zips: zipsByCounty(work, ['20']).get(FIPS) || [], records: list,
  };
}

module.exports = {
  build,
  dictionary: {
    layer: PARCELS,
    facts: { year_built: 'YrBuilt', living_sqft: 'SFLA', ground_floor_sqft: 'GrndFLSF', basement_sqft: 'BasementSF', basement_finished_sqft: 'FinishBsmtSF', bedrooms: 'BedRooms', bathrooms: 'FullBath', full_baths: 'FullBath', half_baths: 'HalfBath', rooms: 'TotalRooms', lot_acres: 'ParcAcresC', market_value: 'TotVal', market_land_value: 'LandVal', market_building_value: 'ImprVal' },
  },
};
