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

// The summary file's estimate column; negative values are the Census's codes for "no estimate".
function readTable(file, key) {
  const rows = lines(file);
  const header = rows[0].split('|');
  const at = header.indexOf(`${key}_E001`);
  if (at < 0) throw new Error(`${file} has no ${key}_E001 column`);
  let read = 0;
  for (const row of rows.slice(1)) {
    const cols = row.split('|');
    const match = /^0500000US(\d{5})$/.exec(cols[0]);
    if (!match || !counties[match[1]]) continue;
    const value = Number(cols[at]);
    if (Number.isFinite(value) && value > 0) {
      counties[match[1]][key === 'B25035' ? 'built' : 'value'] = value;
      read += 1;
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
