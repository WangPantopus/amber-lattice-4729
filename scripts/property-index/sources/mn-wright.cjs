'use strict';
// Wright County, Minnesota: the state's open parcels (mn-parcels.cjs), with each home's year built, above-grade living area, bedrooms and
// bath total from the county's own Buildings Current layer (Wright County GIS, updated daily for its MapIt viewer, from the Assessor's
// building records). The county's data hub carries only Minnesota's standard disclaimer (Statutes 466.03, subd. 21): maps and data
// "made available to the public", no warranty. Only the parcel number, the card and the building's counts and areas are asked for. A parcel
// with more than one building card takes nothing, since its counts may be another building's.
// The bath total is the Assessor's, as it writes it: a three-quarter bath counts .75 (1.75 is a full and a three-quarter bath), as Santa
// Barbara's and El Paso's are kept. A total doesn't say its full and half baths, so it gives neither.

const path = require('node:path');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate } = require('../lib/addresses.cjs');
const { positive } = require('../lib/values.cjs');
const { fillHomes, describe, dayOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { countyParcels } = require('./mn-parcels.cjs');

const FIPS = '27171';
const COUNTY = 'Wright County';
const LAYER = 'https://services2.arcgis.com/CiQCvRGImIxsaFnM/arcgis/rest/services/Buildings_Current_MapIt/FeatureServer/0';
const COLUMNS = ['PARID', 'Card', 'YearBuilt', 'AboveGradeLivingArea', 'Bedrooms', 'Bathrooms'];

const key = (value) => String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** The Assessor's bath total, kept as written when it counts whole and quarter baths. */
function bathTotal(text) {
  const baths = Number(String(text ?? '').trim());
  return baths > 0 && baths <= 12 && (baths * 4) % 1 === 0 ? { bathrooms: baths } : {};
}

async function* build({ work }) {
  const about = await getJson(`${LAYER}?f=json`, 'The layer\'s description');
  const asOf = isoDate(about.editingInfo?.dataLastEditDate || about.editingInfo?.lastEditDate);
  if (!asOf) throw new Error('The buildings layer no longer says when it changed');
  const dwellings = new Map();
  for await (const row of cached(path.join(work, 'mn-wright', 'buildings.jsonl.gz'), () => layerRows(LAYER, COLUMNS))) {
    const parcel = key(row.PARID);
    if (!parcel) continue;
    const beds = Number(row.Bedrooms);
    const facts = {
      year_built: year(row.YearBuilt),
      living_sqft: positive(row.AboveGradeLivingArea),
      bedrooms: Number.isInteger(beds) && beds > 0 && beds <= 15 ? beds : null,
      ...bathTotal(row.Bathrooms),
    };
    // Each card is a building: a parcel with two cards is two dwellings to the fill, so it takes nothing.
    if (!dwellings.has(parcel)) dwellings.set(parcel, []);
    dwellings.get(parcel).push(facts);
  }
  log(`${COUNTY}: ${dwellings.size} parcels with a building card in the county's buildings layer`);
  const entry = await countyParcels(work, FIPS);
  const counts = fillHomes(entry.records, dwellings, { keyOf: (record) => key(record.facts.parcel_number) });
  log(describe(COUNTY, counts));
  yield {
    ...entry,
    publisher: 'Wright County and MnGeo',
    dataset: `${entry.dataset} and the county's building records of ${dayOf(asOf)}`,
    method: 'county',
    source: 'mn-wright',
    title: 'County records',
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: { year_built: 'YearBuilt', living_sqft: 'AboveGradeLivingArea', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms (a three-quarter bath as .75; a total, so no full or half count)' },
  },
};
