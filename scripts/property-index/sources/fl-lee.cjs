'use strict';
// Lee County, Florida: the state's roll (fl-roll.cjs), with each home's heated area, bedrooms and baths from the county's
// public "Lee County Parcels" layer (the Property Appraiser's records joined to parcels by Lee County GIS, updated nightly;
// its terms only disclaim warranties and liability and set no limit on use). The layer is one row per parcel, condominium
// units included, each unit with its own heated area. Only the columns below are asked for: the layer's owner, mailing and
// sale columns never reach this machine. Only parcels already on the roll (protected people removed) take a fact.

const path = require('node:path');
const { layerRows, cached } = require('../lib/services.cjs');
const { number, positive, word } = require('../lib/values.cjs');
const { fillHomes, bathFacts, describe, monthOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { countyRoll } = require('./fl-roll.cjs');

const FIPS = '12071';
const COUNTY = 'Lee County';
const LAYER = 'https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Lee_County_Parcels/FeatureServer/0';
const PAGE = 'https://www.arcgis.com/home/item.html?id=a69c335ad6e54fc0872f7ed47208f11e';
const COLUMNS = ['STRAP', 'DORCODE', 'BLDGCOUNT', 'MINBUILTY', 'MAXBUILTY', 'HEATEDAREA', 'BEDROOMS', 'BATHROOMS'];
// The Department of Revenue's use codes that are one home: a house, a mobile home, a condominium or a cooperative unit.
// A duplex's or a small apartment building's counts are its homes' sum.
const DWELLING = new Set(['01', '02', '04', '05']);

async function* build({ work, today }) {
  const asOf = today.toISOString().slice(0, 10);
  const dwellings = new Map();
  let several = 0;
  for await (const row of cached(path.join(work, 'fl-lee', `parcels-${asOf}.jsonl.gz`), () => layerRows(LAYER, COLUMNS))) {
    if (!DWELLING.has(word(row.DORCODE))) continue;
    // A parcel's counts are its buildings' sum: a guest house's rooms aren't the home's.
    if (number(row.BLDGCOUNT) !== 1) {
      several += number(row.BLDGCOUNT) > 1 ? 1 : 0;
      continue;
    }
    const key = word(row.STRAP);
    if (!key) continue;
    const built = positive(row.MINBUILTY);
    const beds = positive(row.BEDROOMS);
    const heated = positive(row.HEATEDAREA);
    // "Total Number of Bathrooms": a half bath counts a half, so 2.5 is a total, never split into full and half baths.
    const found = {
      year_built: built && built === positive(row.MAXBUILTY) && built >= 1800 && built <= today.getFullYear() + 1 ? built : null,
      living_sqft: heated && heated < 30000 ? heated : null,
      bedrooms: beds && beds <= 15 && Number.isInteger(beds) ? beds : null,
      ...bathFacts(number(row.BATHROOMS), 20),
    };
    if (!dwellings.has(key)) dwellings.set(key, []);
    dwellings.get(key).push(found);
  }
  log(`${COUNTY}: ${dwellings.size} one-building homes in the county's parcel layer; ${several} parcels with more than one building left out`);
  const roll = await countyRoll(work, FIPS, today);
  const counts = fillHomes(roll.records, dwellings, {
    // The layer's year is the roll's: when both give one and they differ, the parcel's building isn't the one the roll counts.
    agrees: (facts, found) => !facts.year_built || !found.year_built || facts.year_built === found.year_built,
  });
  log(describe(COUNTY, counts));
  yield {
    ...roll,
    name: COUNTY,
    publisher: 'Florida Department of Revenue and Lee County',
    dataset: `${roll.dataset} and ${monthOf(asOf)} building data`,
    method: 'county',
    source: 'fl-lee',
    title: 'County records',
  };
}

module.exports = {
  build,
  dictionary: {
    page: PAGE,
    facts: { year_built: 'MINBUILTY (one building)', living_sqft: 'HEATEDAREA', bedrooms: 'BEDROOMS', bathrooms: 'BATHROOMS (total; a half bath counts 0.5)' },
  },
};
