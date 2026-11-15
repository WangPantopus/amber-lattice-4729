'use strict';
// Johnston County, North Carolina: NC OneMap's parcels (nc-onemap.cjs), with each home's bedrooms, baths, heated area and year built from the
// county GIS office's Appraisal Map Layers, its public ArcGIS service of the Tax Administration's appraisal records (posted September 2025).
// The county's data page says "Users are free to utilize this data as they wish". Its monthly attribute file sits in a folder the county's
// robots.txt closes to scripts, so it isn't read. Only the parcel numbers, the building counts and areas are asked for: the owner and mailing
// columns in the layer never are. The layer gives one building per parcel and doesn't say when a parcel has more than one.
// OneMap's Johnston file holds the owner's mailing city and ZIP where the property's should be (one home in ten carries a ZIP outside the
// county, a third of those another state's), so every record's city and ZIP are left blank, as nc-iredell's and nc-lincoln's are, and
// the ZIP codes that reach into the county (the Census Bureau's ZCTA-to-county file) are where a person's ZIP looks: a list of places to
// look, never a fact on a record.

const path = require('node:path');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate } = require('../lib/addresses.cjs');
const { positive } = require('../lib/values.cjs');
const { fillHomes, bathFacts, describe, monthOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { countyParcels } = require('./nc-onemap.cjs');

const FIPS = '37101';
const COUNTY = 'Johnston County';
const LAYER = 'https://services.arcgis.com/klfX5Vz1Hy74tGIF/arcgis/rest/services/Appraisal_Map_Layers/FeatureServer/0';
const COLUMNS = ['TAG', 'PIN', 'BEDROOMS', 'FULL_BATHS', 'HALF_BATHS', 'HEATED_AREA', 'YEAR_BUILT'];

// OneMap carries Johnston's parcel number as the county's tag or its PIN, punctuated either way.
const key = (value) => String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

async function* build({ work }) {
  const about = await getJson(`${LAYER}?f=json`, 'The layer\'s description');
  const asOf = isoDate(about.editingInfo?.dataLastEditDate || about.editingInfo?.lastEditDate);
  if (!asOf) throw new Error('The appraisal layer no longer says when it changed');
  const dwellings = new Map();
  const add = (id, facts) => {
    const k = key(id);
    if (!k) return;
    dwellings.set(k, dwellings.has(k) ? [{}, {}] : [facts]);
  };
  for await (const row of cached(path.join(work, 'nc-johnston', 'appraisal.jsonl.gz'), () => layerRows(LAYER, COLUMNS))) {
    const beds = Number(row.BEDROOMS);
    const full = Number(row.FULL_BATHS);
    const half = Number(row.HALF_BATHS);
    const facts = {
      year_built: year(row.YEAR_BUILT),
      living_sqft: positive(row.HEATED_AREA),
      bedrooms: Number.isInteger(beds) && beds > 0 && beds <= 15 ? beds : null,
      ...(full > 0 ? bathFacts(full + (half > 0 ? half : 0) * 0.5, 20) : {}),
      // The county's own counts (bathFacts gives the total only).
      ...(full > 0 && full <= 20 ? { full_baths: full, ...(half > 0 && half <= 10 ? { half_baths: half } : {}) } : {}),
    };
    if (!Object.values(facts).some((value) => value !== null && value !== undefined)) continue;
    add(row.TAG, facts);
    if (key(row.PIN) !== key(row.TAG)) add(row.PIN, facts);
  }
  log(`${COUNTY}: ${dwellings.size} parcel numbers with building facts in the county's appraisal layer`);
  const entry = await countyParcels(work, FIPS);
  for (const record of entry.records) if (record.address) record.address = { ...record.address, city: '', zip: null };
  const counts = fillHomes(entry.records, dwellings, { keyOf: (record) => key(record.facts.parcel_number) });
  log(describe(COUNTY, counts));
  yield {
    ...entry,
    publisher: 'Johnston County and NC OneMap',
    dataset: `${entry.dataset} and the county's ${monthOf(asOf)} appraisal records`,
    method: 'county',
    source: 'nc-johnston',
    title: 'County records',
    extra_zips: zipsByCounty(work, ['37']).get(FIPS) || [],
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: {
      bedrooms: 'BEDROOMS', bathrooms: 'FULL_BATHS + HALF_BATHS / 2', full_baths: 'FULL_BATHS', half_baths: 'HALF_BATHS', living_sqft: 'HEATED_AREA', year_built: 'YEAR_BUILT',
    },
  },
};
