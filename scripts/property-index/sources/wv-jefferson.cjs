'use strict';
// Jefferson County, West Virginia: the state's parcel summary (wv-parcels.cjs), with each home's bedrooms and baths, and its year built and
// living area where the state's copy lacks them, from the county's own parcel service (Base_Parcels on the county GIS server), the County
// Assessor's tax-year records. No terms are posted on the service. Only the parcel number, the living-unit count, the counts, area, year
// and tax year are asked for: the owner, mailing and deed columns never are. A parcel with more than one living unit takes nothing.

const path = require('node:path');
const { layerRows, cached } = require('../lib/services.cjs');
const { year } = require('../lib/addresses.cjs');
const { positive } = require('../lib/values.cjs');
const { fillHomes, bathFacts, describe } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { countyParcels } = require('./wv-parcels.cjs');

const FIPS = '54037';
const COUNTY = 'Jefferson County';
const LAYER = 'https://gisarcweb.jeffersoncountywv.org/gisarcweb/rest/services/Base/Base_Parcels/MapServer/0';
const COLUMNS = ['Parcel_ID', 'TAX_YEAR', 'LIVING_UNI', 'BEDROOMS', 'FULL_BATHS', 'HALF_BATHS', 'YEAR_BUILT', 'SFLA'];

// The state writes the county's parcel ID with the county's number before it and a special-district suffix after it: 07002900120000 is
// 19070029001200000000 there.
const stateId = (parcelId) => (/^[0-9A-Z]{14}$/.test(parcelId) ? `19${parcelId}0000` : null);

async function* build({ work }) {
  const dwellings = new Map();
  const years = new Map();
  let several = 0;
  for await (const row of cached(path.join(work, 'wv-jefferson', 'parcels.jsonl.gz'), () => layerRows(LAYER, COLUMNS))) {
    const id = stateId(String(row.Parcel_ID ?? '').trim().toUpperCase());
    if (!id) continue;
    years.set(row.TAX_YEAR, (years.get(row.TAX_YEAR) || 0) + 1);
    if (Number(row.LIVING_UNI) > 1 || dwellings.has(id)) {
      // Several living units (or the parcel twice): two dwellings as far as the fill is concerned, so nothing is taken.
      several += 1;
      dwellings.set(id, [{}, {}]);
      continue;
    }
    const beds = Number(row.BEDROOMS);
    const full = Number(row.FULL_BATHS);
    const half = Number(row.HALF_BATHS);
    const facts = {
      year_built: year(row.YEAR_BUILT),
      living_sqft: positive(row.SFLA),
      bedrooms: Number.isInteger(beds) && beds > 0 && beds <= 15 ? beds : null,
      ...(full > 0 ? bathFacts(full + (half > 0 ? half : 0) * 0.5, 20) : {}),
      // The county's own counts (bathFacts gives the total only).
      ...(full > 0 && full <= 20 ? { full_baths: full, ...(half > 0 && half <= 10 ? { half_baths: half } : {}) } : {}),
    };
    dwellings.set(id, [facts]);
  }
  const taxYear = [...years].filter(([value]) => Number(value) > 2000).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!taxYear) throw new Error('The county\'s parcels no longer say their tax year');
  log(`${COUNTY}: ${dwellings.size} parcels in the county's ${taxYear} tax-year parcels (${several} with several living units)`);
  const entry = await countyParcels(work, FIPS);
  const counts = fillHomes(entry.records, dwellings);
  log(describe(COUNTY, counts));
  yield {
    ...entry,
    publisher: 'Jefferson County and the WV GIS Technical Center',
    dataset: `${entry.dataset} and the county's ${taxYear} tax-year parcels`,
    method: 'county',
    source: 'wv-jefferson',
    title: 'County records',
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: {
      bedrooms: 'BEDROOMS', bathrooms: 'FULL_BATHS + HALF_BATHS / 2', full_baths: 'FULL_BATHS', half_baths: 'HALF_BATHS', year_built: 'YEAR_BUILT', living_sqft: 'SFLA',
    },
  },
};
