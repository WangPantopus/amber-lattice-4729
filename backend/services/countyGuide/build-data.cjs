#!/usr/bin/env node
'use strict';

/**
 * Builds data/counties.json, the county pages' fixed facts, from the Census Bureau's public files (no key, U.S.
 * government works). Run by hand when the Census publishes a new year; the page names each file and its year.
 *
 *   node backend/services/countyGuide/build-data.cjs <folder>
 *
 * <folder> holds, as downloaded from www2.census.gov:
 *   2025_Gaz_counties_national.txt  geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_counties_national.zip
 *   county_adjacency2025.txt        geo/docs/reference/county_adjacency/county_adjacency2025.txt
 *   acsdt5y2024-b25035.dat          programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/ (median year built)
 *   acsdt5y2024-b25077.dat          the same folder (median value, owner-occupied homes)
 *
 * Each county keeps its Census name, the counties that border it (by FIPS) and the two survey medians. Puerto Rico's
 * municipios and the island areas are left out: the pages cover the 50 states and DC.
 *
 * The same two summary files also fill the medians of each city in data/cities.json (its place GEOID), which is
 * otherwise read by hand and left as it is.
 */

const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: build-data.cjs <folder with the Census files>');
  process.exit(1);
}

const lines = (file) => fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/).filter(Boolean);
const inStates = (fips) => /^\d{5}$/.test(fips) && Number(fips.slice(0, 2)) <= 56;

const counties = {};
for (const line of lines('2025_Gaz_counties_national.txt').slice(1)) {
  const cols = line.split('|');
  const fips = cols[1];
  if (inStates(fips)) counties[fips] = { n: cols[4].trim(), near: [] };
}

for (const line of lines('county_adjacency2025.txt').slice(1)) {
  const [, fips, , neighbor] = line.split('|');
  if (fips !== neighbor && counties[fips] && counties[neighbor] && !counties[fips].near.includes(neighbor)) {
    counties[fips].near.push(neighbor);
  }
}

const citiesFile = path.join(__dirname, 'data', 'cities.json');
const cityData = fs.existsSync(citiesFile) ? JSON.parse(fs.readFileSync(citiesFile, 'utf8')) : null;
const cities = cityData?.cities || {};

// A median that falls in the open-ended lowest or highest interval of the table's distribution has no number of its
// own: the summary file writes a code just past the interval's edge (1938 for "1939 or earlier", 2021 for "2020 or
// later"; 9999 for "under $10,000", 2000001 for "$2,000,000 or more") and the margin of error -333333333, "the median
// falls in the lowest interval or highest interval of an open-ended distribution" (census.gov, "Notes on ACS Estimate
// and Annotation Values"). Such a median is kept as the interval's edge and the side it is on, never as a year or value.
const OPEN_ENDED = -333333333;
const EDGES = { B25035: [1939, 2020], B25077: [10000, 2000000] };

// The summary file's estimate column; negative values are the Census's codes for "no estimate". Counties (summary
// level 050) and the cities in data/cities.json (places, level 160).
function readTable(file, key) {
  const rows = lines(file);
  const header = rows[0].split('|');
  const at = header.indexOf(`${key}_E001`);
  const moeAt = header.indexOf(`${key}_M001`);
  if (at < 0 || moeAt < 0) throw new Error(`${file} has no ${key}_E001 or ${key}_M001 column`);
  const field = key === 'B25035' ? 'built' : 'value';
  const [low, high] = EDGES[key];
  let read = 0;
  for (const row of rows.slice(1)) {
    const cols = row.split('|');
    const match = /^(0500000|1600000)US(\d{5}|\d{7})$/.exec(cols[0]);
    const target = match && (match[1] === '0500000' ? counties[match[2]] : cities[match[2]]);
    if (!target) continue;
    const value = Number(cols[at]);
    delete target[`${field}_open`];
    if (Number.isFinite(value) && value > 0) {
      if (Number(cols[moeAt]) === OPEN_ENDED) {
        const below = value <= low;
        target[field] = below ? low : high;
        target[`${field}_open`] = below ? 'below' : 'above';
      } else {
        target[field] = value;
      }
      if (match[1] === '0500000') read += 1;
    }
  }
  return read;
}

const built = readTable('acsdt5y2024-b25035.dat', 'B25035');
const value = readTable('acsdt5y2024-b25077.dat', 'B25077');
for (const county of Object.values(counties)) county.near.sort();

const out = {
  v: 1,
  built: new Date().toISOString().slice(0, 10),
  sources: {
    names: "U.S. Census Bureau, 2025 Gazetteer Files (counties)",
    near: 'U.S. Census Bureau, County Adjacency File, 2025',
    homes: 'U.S. Census Bureau, American Community Survey 2020-2024 5-year estimates, tables B25035 (median year structure built) and B25077 (median value, owner-occupied housing units)',
    homes_survey: '2020-2024',
  },
  counties: Object.fromEntries(Object.entries(counties).sort(([a], [b]) => (a < b ? -1 : 1))),
};
const target = path.join(__dirname, 'data', 'counties.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(out)}\n`);
console.log(`${Object.keys(counties).length} counties; median year built for ${built}, median value for ${value}; wrote ${target}`);
if (cityData) {
  fs.writeFileSync(citiesFile, `${JSON.stringify(cityData, null, 2)}\n`);
  const filled = Object.values(cities).filter((city) => city.built || city.value).length;
  console.log(`${Object.keys(cities).length} cities; medians for ${filled}; wrote ${citiesFile}`);
}
