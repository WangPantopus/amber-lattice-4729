'use strict';
// Orange County, Florida: the state's roll (fl-roll.cjs), with each home's bedrooms, bath total, living area and floors from the
// Property Appraiser's parcel record as Orange County Government publishes it: the "Parcels" layer of its open data map service
// ("Data made available in a public service by Orange County FL. Updated weekly."). The county government's site terms ask
// only for lawful use and disclaim warranties. The layer's BATH is the Appraiser's total, a half bath counted as .5. Owner,
// mailing, exemption and tax columns are in the layer and never asked for. Only parcels already on the roll (protected people
// removed) take a fact, and only where the roll counts one building: a second building's rooms may be in the parcel's counts.

const path = require('node:path');
const { layerRows, cached } = require('../lib/services.cjs');
const { isoDate } = require('../lib/addresses.cjs');
const { number, positive, word } = require('../lib/values.cjs');
const { fillHomes, bathFacts, describe, dayOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { countyRoll } = require('./fl-roll.cjs');

const FIPS = '12095';
const COUNTY = 'Orange County';
const LAYER = 'https://ocgis4.ocfl.net/arcgis/rest/services/AGOL_Open_Data/MapServer/56';
// PARCEL is the Appraiser's 15-digit parcel number written section, township, range, then subdivision, block and lot; the roll's
// PARCEL_ID writes the same number range, township, section first. LAST_EDITED_DATE says when a row last changed.
const COLUMNS = ['PARCEL', 'DOR_CODE', 'BEDS', 'BATH', 'LIVING_AREA', 'STYS', 'LAST_EDITED_DATE'];
const rollNumber = (parcel) => (/^\d{15}$/.test(parcel) ? parcel.slice(4, 6) + parcel.slice(2, 4) + parcel.slice(0, 2) + parcel.slice(6) : null);

const count = (value, most) => {
  const n = number(value);
  return Number.isInteger(n) && n > 0 && n <= most ? n : null;
};

async function* build({ work, today }) {
  const roll = await countyRoll(work, FIPS, today);
  // A parcel the roll counts more than one building on keeps what the roll gives.
  const several = new Set(roll.records.filter((record) => record.facts.buildings_on_parcel > 1).map((record) => record.facts.parcel_number));
  const dwellings = new Map();
  let newest = 0;
  let rows = 0;
  for await (const row of cached(path.join(work, 'fl-orange', 'parcels.jsonl.gz'), () => layerRows(LAYER, COLUMNS))) {
    rows += 1;
    if (row.LAST_EDITED_DATE > newest) newest = row.LAST_EDITED_DATE;
    const parcel = rollNumber(String(word(row.PARCEL) || ''));
    if (!parcel || several.has(parcel)) continue;
    const stories = number(row.STYS);
    const living = positive(row.LIVING_AREA);
    const facts = {
      bedrooms: count(row.BEDS, 15),
      ...bathFacts(number(row.BATH), 20),
      living_sqft: living && living < 30000 ? living : null,
      stories: stories >= 1 && stories <= 6 && (stories * 2) % 1 === 0 ? stories : null,
    };
    if (Object.values(facts).every((value) => value === null || value === undefined)) continue;
    // A parcel can have more than one row (one a land line); the same facts on each are one dwelling, different ones are left out.
    const seen = dwellings.get(parcel) || [];
    if (!seen.some((other) => JSON.stringify(other) === JSON.stringify(facts))) seen.push(facts);
    dwellings.set(parcel, seen);
  }
  const asOf = isoDate(newest);
  if (!asOf) throw new Error('The parcel layer no longer says when its rows changed');
  log(`${COUNTY}: ${rows} rows in the county's parcel layer, ${dwellings.size} parcels with building facts (newest change ${asOf}); ${several.size} parcels with more than one building left as the roll gives them`);
  const counts = fillHomes(roll.records, dwellings);
  log(describe(COUNTY, counts));
  yield {
    ...roll,
    name: COUNTY,
    publisher: 'Florida Department of Revenue and Orange County Government\'s copy of the Orange County Property Appraiser',
    dataset: `${roll.dataset} and the Property Appraiser's parcel record as of ${dayOf(asOf)}`,
    method: 'county',
    source: 'fl-orange',
    title: 'County records',
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: { bedrooms: 'BEDS', bathrooms: 'BATH (the total, a half bath as .5)', living_sqft: 'LIVING_AREA', stories: 'STYS' },
  },
};
