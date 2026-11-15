'use strict';
// Summit County, Colorado: the State's Colorado Public Parcels (co-parcels.cjs), with each home's year built, living area, bedrooms and
// baths from Summit County's assessor parcels as the Town of Breckenridge publishes them for the whole county (its CountyParcel service).
// The record is the County Assessor's; the town is this copy's publisher. Neither the town's service nor the county posts terms limiting
// reuse (the county's map pages say they are for display and not for legal conveyance). Only the parcel numbers, the structure count and
// the building's counts and areas are asked for: the owner and mailing columns never are. A parcel with more than one structure takes
// nothing, since its counts may be another building's.
// The Assessor counts full, three-quarter, half and quarter baths apart; the total adds them as wa-skagit's does (a three-quarter bath is
// .75, a quarter bath .25). Its TotBath column is a count of bathroom rooms, not a total, so it isn't read.

const path = require('node:path');
const { layerRows, cached } = require('../lib/services.cjs');
const { year } = require('../lib/addresses.cjs');
const { positive } = require('../lib/values.cjs');
const { fillHomes, describe } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { countyParcels } = require('./co-parcels.cjs');

const FIPS = '08117';
const COUNTY = 'Summit County';
const LAYER = 'https://maps.townofbreckenridge.com/arcgis/rest/services/CountyParcel/FeatureServer/0';
const COLUMNS = ['PPI', 'Schedule', 'TaxYear', 'NumStruct', 'YearBuilt', 'SqeFtLiving', 'NumBedRms', 'FullBath', 'TqtrBaths', 'HalfBaths', 'QtrBaths'];

const key = (value) => String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^0+(?=\d)/, '');
const count = (value, most) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= most ? n : null;
};

/** The bath total from the Assessor's own counts, and those counts. */
function baths(row) {
  const full = count(row.FullBath, 20);
  const threeQuarter = count(row.TqtrBaths, 20);
  const half = count(row.HalfBaths, 20);
  const quarter = count(row.QtrBaths, 20);
  if ([full, threeQuarter, half, quarter].some((n) => n === null)) return {};
  const total = full + threeQuarter * 0.75 + half * 0.5 + quarter * 0.25;
  if (!(total > 0) || total > 20) return {};
  const facts = { bathrooms: total };
  if (full) facts.full_baths = full;
  if (threeQuarter) facts.three_quarter_baths = threeQuarter;
  if (half) facts.half_baths = half;
  return facts;
}

async function* build({ work }) {
  const dwellings = new Map();
  const years = new Map();
  let several = 0;
  const add = (id, facts) => {
    const k = key(id);
    if (!k) return;
    dwellings.set(k, dwellings.has(k) ? [{}, {}] : facts);
  };
  for await (const row of cached(path.join(work, 'co-summit', 'parcels.jsonl.gz'), () => layerRows(LAYER, COLUMNS, { oid: 'OBJECTID_1' }))) {
    years.set(row.TaxYear, (years.get(row.TaxYear) || 0) + 1);
    if (Number(row.NumStruct) > 1) {
      // Several structures: two dwellings as far as the fill is concerned, so nothing is taken.
      several += 1;
      add(row.PPI, [{}, {}]);
      add(row.Schedule, [{}, {}]);
      continue;
    }
    const beds = Number(row.NumBedRms);
    const facts = {
      year_built: year(row.YearBuilt),
      living_sqft: positive(row.SqeFtLiving),
      bedrooms: Number.isInteger(beds) && beds > 0 && beds <= 15 ? beds : null,
      ...baths(row),
    };
    if (!facts.year_built && !facts.living_sqft && !facts.bedrooms && !facts.bathrooms) continue;
    add(row.PPI, [facts]);
    if (key(row.Schedule) !== key(row.PPI)) add(row.Schedule, [facts]);
  }
  const taxYear = [...years].filter(([value]) => Number(value) > 2000).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!taxYear) throw new Error('The county\'s parcels no longer say their tax year');
  log(`${COUNTY}: ${dwellings.size} parcel numbers in the county's ${taxYear} assessor parcels (${several} parcels with several structures)`);
  const entry = await countyParcels(work, FIPS);
  const counts = fillHomes(entry.records, dwellings, { keyOf: (record) => key(record.facts.parcel_number) });
  log(describe(COUNTY, counts));
  yield {
    ...entry,
    publisher: 'Summit County Assessor, through the Town of Breckenridge and the State of Colorado (OIT)',
    dataset: `${entry.dataset} and the county's ${taxYear} assessor parcels`,
    method: 'county',
    source: 'co-summit',
    title: 'County records',
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: {
      year_built: 'YearBuilt', living_sqft: 'SqeFtLiving', bedrooms: 'NumBedRms', bathrooms: 'FullBath + 0.75 TqtrBaths + 0.5 HalfBaths + 0.25 QtrBaths',
      full_baths: 'FullBath', three_quarter_baths: 'TqtrBaths', half_baths: 'HalfBaths',
    },
  },
};
