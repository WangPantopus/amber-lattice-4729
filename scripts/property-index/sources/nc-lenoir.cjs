'use strict';
// Lenoir County, North Carolina: NC OneMap's parcels (nc-onemap.cjs), with each home's bedrooms, baths, finished area and year built from
// the county GIS office's own public parcel layer (OpenGov, the Tax Department's tax-year records). No terms are posted on it or on the
// county's site. The source supplies parcel numbers, first-improvement facts, the improvement count, the tax year and the county use codes and descriptions:
// the owner and mailing columns never are. A parcel with more than one improvement takes nothing, since its counts may be another
// building's. OneMap's Lenoir file gives no property city or ZIP, so the ZIP codes that reach into the county (the Census Bureau's
// ZCTA-to-county file) are where a person's ZIP looks, as for Carteret: a list of places to look, never a fact on a record.

const path = require('node:path');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate } = require('../lib/addresses.cjs');
const { positive } = require('../lib/values.cjs');
const { fillHomes, bathFacts, describe, monthOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { countyParcels } = require('./nc-onemap.cjs');

const FIPS = '37107';
const COUNTY = 'Lenoir County';
const LAYER = 'https://services3.arcgis.com/bDx73HOFAO3oSeDq/arcgis/rest/services/OpenGov/FeatureServer/2';
const COLUMNS = ['nc_pin', 'PARCEL_NUMBER', 'TAX_YEAR', 'MULTIPLE_IMPROVEMENTS', 'F__OF_BEDROOMS', 'F__OF_BATHROOMS', 'F__OF_HALF_BATHS_1ST_IMP', 'FINISHED_AREA', 'YEAR_ACTUALLY_BUILT', 'COMPONENT_CODE', 'COMPONENT_CODE_DESC'];

// OneMap carries Lenoir's parcel number as the county's PIN or its parcel number, punctuated either way.
const key = (value) => String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^0+(?=\d)/, '');

async function* build({ work }) {
  const about = await getJson(`${LAYER}?f=json`, 'The layer\'s description');
  const asOf = isoDate(about.editingInfo?.dataLastEditDate || about.editingInfo?.lastEditDate);
  if (!asOf) throw new Error('The county\'s parcel layer no longer says when it changed');
  const dwellings = new Map();
  const add = (id, facts) => {
    const k = key(id);
    if (!k) return;
    dwellings.set(k, dwellings.has(k) ? [{}, {}] : facts);
  };
  const years = new Map();
  const useDescriptions = new Map();
  let several = 0;
  for await (const row of cached(path.join(work, 'nc-lenoir', 'parcels-with-use.jsonl.gz'), () => layerRows(LAYER, COLUMNS))) {
    // OneMap's primary use code comes from this county code list. A code with conflicting words cannot verify a description.
    const code = positive(row.COMPONENT_CODE);
    const description = row.COMPONENT_CODE_DESC?.trim();
    if (code && description) {
      if (!useDescriptions.has(code)) useDescriptions.set(code, description);
      else if (useDescriptions.get(code) !== description) useDescriptions.set(code, null);
    }
    years.set(row.TAX_YEAR, (years.get(row.TAX_YEAR) || 0) + 1);
    if (Number(row.MULTIPLE_IMPROVEMENTS) > 1) {
      // Several improvements: two dwellings as far as the fill is concerned, so nothing is taken.
      several += 1;
      add(row.nc_pin, [{}, {}]);
      add(row.PARCEL_NUMBER, [{}, {}]);
      continue;
    }
    const beds = Number(row.F__OF_BEDROOMS);
    const full = Number(row.F__OF_BATHROOMS);
    const half = Number(row.F__OF_HALF_BATHS_1ST_IMP);
    const facts = {
      year_built: year(row.YEAR_ACTUALLY_BUILT),
      living_sqft: positive(row.FINISHED_AREA),
      bedrooms: Number.isInteger(beds) && beds > 0 && beds <= 15 ? beds : null,
      ...(full > 0 ? bathFacts(full + (half > 0 ? half : 0) * 0.5, 20) : {}),
      // The county's own counts (bathFacts gives the total only).
      ...(full > 0 && full <= 20 ? { full_baths: full, ...(half > 0 && half <= 10 ? { half_baths: half } : {}) } : {}),
    };
    if (!Object.values(facts).some((value) => value !== null && value !== undefined)) continue;
    add(row.nc_pin, [facts]);
    if (key(row.PARCEL_NUMBER) !== key(row.nc_pin)) add(row.PARCEL_NUMBER, [facts]);
  }
  const taxYear = [...years].filter(([value]) => Number(value) > 2000).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!taxYear) throw new Error('The county\'s parcels no longer say their tax year');
  log(`${COUNTY}: ${dwellings.size} parcel numbers in the county's ${taxYear} parcels (${several} parcels with several improvements)`);
  const entry = await countyParcels(work, FIPS, useDescriptions);
  const counts = fillHomes(entry.records, dwellings, { keyOf: (record) => key(record.facts.parcel_number) });
  log(describe(COUNTY, counts));
  yield {
    ...entry,
    publisher: 'Lenoir County and NC OneMap',
    dataset: `${entry.dataset} and the county's ${taxYear} tax-year parcels (${monthOf(asOf)})`,
    method: 'county',
    source: 'nc-lenoir',
    title: 'County records',
    extra_zips: [...new Set([...(entry.extra_zips || []), ...(zipsByCounty(work, ['37']).get(FIPS) || [])])].sort(),
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: {
      bedrooms: 'F__OF_BEDROOMS', bathrooms: 'F__OF_BATHROOMS + F__OF_HALF_BATHS_1ST_IMP / 2', full_baths: 'F__OF_BATHROOMS', half_baths: 'F__OF_HALF_BATHS_1ST_IMP',
      living_sqft: 'FINISHED_AREA', year_built: 'YEAR_ACTUALLY_BUILT',
    },
  },
};
