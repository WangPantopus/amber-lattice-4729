'use strict';
// Brunswick County, North Carolina: NC OneMap's parcels (nc-onemap.cjs), with each home's bedrooms, full and half baths, heated area and year
// built from the county GIS office's own parcel layer, which carries the Tax Office's appraisal facts for the current tax year. The layer posts
// no terms; the county's site says everything on it is public record kept under the Public Records Law (N.C.G.S. Chapter 132) and asks for no
// agreement. Only the parcel numbers, the building count and the building facts are asked for: the owner and mailing columns in the layer never
// are. A parcel the county says has more than one building gives no one home's counts. OneMap's Brunswick file has no site city or ZIP, so the
// ZIP codes that reach into the county (the Census Bureau's ZCTA-to-county file) are where a person's ZIP looks: a list of places to look, never a
// fact on a record.

const path = require('node:path');
const { getJson, layerRows, cached } = require('../lib/services.cjs');
const { year, isoDate } = require('../lib/addresses.cjs');
const { positive } = require('../lib/values.cjs');
const { fillHomes, bathFacts, describe, monthOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { zipsByCounty } = require('../lib/zcta.cjs');
const { countyParcels } = require('./nc-onemap.cjs');

const FIPS = '37019';
const COUNTY = 'Brunswick County';
const LAYER = 'https://bcgis.brunswickcountync.gov/arcgis/rest/services/Inspections/InspectionParcels_labels/MapServer/1';
const OID = 'OBJECTID_1';
const COLUMNS = ['ParcelNumber', 'PIN', 'TaxYear', 'BuildingCount', 'ActualYearBuilt', 'HeatedAreaCard', 'BedroomCountTotal', 'BathCountTotal', 'HalfBathCountTotal'];

// OneMap carries Brunswick's parcel number or its PIN, punctuated either way.
const key = (value) => String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** The newest edit the layer's rows record, as a date: the layer itself doesn't say when it changed. */
async function newestEdit() {
  const query = new URLSearchParams({
    where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'last_edited_date', outStatisticFieldName: 'newest' }]), f: 'json',
  });
  const answer = await getJson(`${LAYER}/query?${query}`, 'The layer\'s newest edit');
  return isoDate(answer.features?.[0]?.attributes?.newest);
}

async function* build({ work }) {
  const asOf = await newestEdit();
  if (!asOf) throw new Error('The parcel layer no longer says when its rows changed');
  const dwellings = new Map();
  const add = (id, facts) => {
    const k = key(id);
    if (!k) return;
    dwellings.set(k, dwellings.has(k) ? [{}, {}] : [facts]);
  };
  const taxYears = new Map();
  for await (const row of cached(path.join(work, 'nc-brunswick', 'parcels.jsonl.gz'), () => layerRows(LAYER, COLUMNS, { oid: OID }))) {
    const buildings = Number(row.BuildingCount);
    if (!(buildings >= 1)) continue;
    taxYears.set(row.TaxYear, (taxYears.get(row.TaxYear) || 0) + 1);
    const ids = key(row.PIN) === key(row.ParcelNumber) ? [row.ParcelNumber] : [row.ParcelNumber, row.PIN];
    // Its counts and areas are the parcel's buildings together: no one home's.
    if (buildings > 1) {
      for (const id of ids) dwellings.set(key(id), [{}, {}]);
      continue;
    }
    const beds = Number(row.BedroomCountTotal);
    const full = Number(row.BathCountTotal);
    const half = Number(row.HalfBathCountTotal);
    const facts = {
      year_built: year(row.ActualYearBuilt),
      living_sqft: positive(row.HeatedAreaCard),
      bedrooms: Number.isInteger(beds) && beds > 0 && beds <= 15 ? beds : null,
      ...(full > 0 ? bathFacts(full + (half > 0 ? half : 0) * 0.5, 20) : {}),
      // The county's own counts (bathFacts gives the total only).
      ...(full > 0 && full <= 20 ? { full_baths: full, ...(half > 0 && half <= 10 ? { half_baths: half } : {}) } : {}),
    };
    if (!Object.values(facts).some((value) => value !== null && value !== undefined)) continue;
    for (const id of ids) add(id, facts);
  }
  const taxYear = [...taxYears].sort((a, b) => b[1] - a[1])[0]?.[0];
  log(`${COUNTY}: ${dwellings.size} parcel numbers with buildings in the county's tax year ${taxYear} layer`);
  const entry = await countyParcels(work, FIPS);
  const counts = fillHomes(entry.records, dwellings, { keyOf: (record) => key(record.facts.parcel_number) });
  log(describe(COUNTY, counts));
  const others = entry.records.filter((record) => record.kind === 'other' && (dwellings.get(key(record.facts.parcel_number)) || []).some((found) => found.bedrooms)).length;
  log(`${COUNTY}: ${others} records OneMap doesn't call a home have a dwelling with bedrooms in the county's layer (left as they are)`);
  yield {
    ...entry,
    publisher: 'Brunswick County and NC OneMap',
    dataset: `${entry.dataset} and the county's ${monthOf(asOf)} tax year ${taxYear} building records`,
    method: 'county',
    source: 'nc-brunswick',
    title: 'County records',
    extra_zips: zipsByCounty(work, ['37']).get(FIPS) || [],
  };
}

module.exports = {
  build,
  dictionary: {
    layer: LAYER,
    facts: {
      bedrooms: 'BedroomCountTotal', bathrooms: 'BathCountTotal + HalfBathCountTotal / 2', full_baths: 'BathCountTotal', half_baths: 'HalfBathCountTotal', living_sqft: 'HeatedAreaCard', year_built: 'ActualYearBuilt',
    },
  },
};
