'use strict';

/**
 * Who serves an address, for the home record's `rows` block "Who serves this address": its school district and its
 * electric utility. Both are read on request beside the record's other area readings, never stored per home:
 *
 *   school    the Census geocoder's school district layers (unified, or elementary and secondary where both cover the
 *             point), the same cached answer the Ballot card reads (ballot/governments.js sharedGeographies). Where the
 *             county's record names a district, the county's wins: the Census name is shown only where it names the
 *             same district (by name or district number), else the county's own words.
 *   electric  the electric retail service territories Oak Ridge National Laboratory drew for the U.S. Department of
 *             Energy (published September 30, 2024; HIFLD closed in August 2025), read from the public copy NTIA keeps
 *             on its National Broadband Availability Map account. Public domain. The shapes are approximate and overlap,
 *             so up to three utilities are listed with "or"; more than that says nothing useful, and no row is shown.
 */

const governments = require('../ballot/governments');
const { readResponse } = require('../external/cacheHelper');
const logger = require('../../utils/logger');

const ELECTRIC_URL = 'https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query';
const ELECTRIC_AS_OF = 'September 30, 2024';
const ELECTRIC_MAX = 3;
const FETCH_TIMEOUT_MS = 8000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Federal power marketers and wholesale sellers drawn over the retail utilities they supply: not who bills a home.
const WHOLESALE_TYPES = new Set(['FEDERAL', 'WHOLESALE POWER MARKETER', 'MUNICIPAL MKTG AUTHORITY']);

// Kept in capitals in a utility's or district's name.
const ACRONYMS = new Set(['PUD', 'REA', 'EMC', 'PPD', 'MWC', 'TVA', 'LLC', 'USA', 'II', 'III', 'IV', 'PSC', 'APS', 'SRP', 'PNM',
  'ISD', 'USD', 'CISD', 'CUSD', 'CSD', 'SD', 'RE', 'NYSEG', 'PECO', 'PPL', 'TXU', 'AEP', 'SMUD', 'LADWP', 'MUD', 'REC', 'RECC', 'EPB']);
const SMALL = new Set(['of', 'and', 'the', 'for', 'in', 'at', 'on', 'or']);

/** "PUD NO 1 OF CLARK COUNTY - (WA)" reads "PUD No 1 of Clark County"; a name in mixed case stays as written. */
function tidyName(raw) {
  const name = String(raw || '').replace(/\s+-\s+\([A-Z]{2}\)\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!name || /[a-z]/.test(name)) return name;
  return name.toLowerCase().split(' ').map((word, i) => {
    const upper = word.toUpperCase();
    const letters = word.replace(/[^a-z]/g, '');
    if (ACRONYMS.has(upper.replace(/[^A-Z]/g, '')) || /&/.test(word) || (letters && !/^(st|mt|ft|dr|jr|sr)$/.test(letters) && !/[aeiouy]/.test(letters))) return upper;
    if (i > 0 && SMALL.has(word)) return word;
    return word.replace(/(^|[-/(])([a-z])/g, (m, lead, c) => lead + c.toUpperCase());
  }).join(' ');
}

const firstRow = (geo, pattern) => {
  const key = Object.keys(geo || {}).find((k) => pattern.test(k));
  const rows = key && geo[key];
  return Array.isArray(rows) && rows[0] && rows[0].NAME && !/not defined/i.test(rows[0].NAME) ? rows[0] : null;
};

/** The Census districts at a point: `[{ level: 'unified' | 'elementary' | 'secondary', name }]`, or null unanswered. */
async function schoolsAt(point) {
  const geo = await governments.sharedGeographies(point.lat, point.lng);
  if (!geo) return null;
  const unified = firstRow(geo, /Unified School Districts$/);
  if (unified) return [{ level: 'unified', name: String(unified.NAME).trim() }];
  return [
    ['elementary', firstRow(geo, /Elementary School Districts$/)],
    ['secondary', firstRow(geo, /Secondary School Districts$/)],
  ].filter(([, found]) => found).map(([level, found]) => ({ level, name: String(found.NAME).trim() }));
}

/** The utilities whose territories cover a point (names, wholesale sellers left out where a retail one is there). */
async function electricAt(point) {
  // Rounded to about 11 m: the territories are drawn far coarser, and a cached answer never holds an exact point.
  const params = new URLSearchParams({
    geometry: `${point.lng.toFixed(4)},${point.lat.toFixed(4)}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME,TYPE',
    returnGeometry: 'false',
    f: 'json',
  });
  const url = `${ELECTRIC_URL}?${params}`;
  const { response } = await readResponse({
    provider: 'ORNL_ELECTRIC_TERRITORIES', url, maxAgeMs: YEAR_MS,
    isUsable: (data) => !data?.error && Array.isArray(data?.features),
    fetch: async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body?.error) throw new Error(`ArcGIS error ${body.error.code ?? ''}`.trim());
      return body;
    },
  });
  const all = (response?.features || []).map((f) => ({ name: tidyName(f?.attributes?.NAME), type: String(f?.attributes?.TYPE || '').toUpperCase() }))
    .filter((each) => each.name);
  const retail = all.filter((each) => !WHOLESALE_TYPES.has(each.type));
  return [...new Set((retail.length ? retail : all).map((each) => each.name))];
}

// District names compared without their kind words: "COLO SPGS SCHOOL DISTRICT #11" and "Colorado Springs School
// District 11" are one district by number; "HAZELWOOD" and "Hazelwood School District" by name.
const KIND_WORDS = /\b(school|schools|district|dist|public|isd|usd|csd|cusd|sd|independent|unified|union|consolidated|joint|community|county|city|no|the|of|and|elementary|elem|high|secondary|central|area|regional|reorganized|unit|local|village|common|township|twp|valley)\b/g;
const bare = (name) => String(name || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(KIND_WORDS, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
const districtNumber = (name) => (String(name || '').match(/(?:#|\bno\.?\s*|\bdistrict\s+)(\d+)\b/i) || [])[1] || null;
// A county value that names a district, not only a code ("1-271" is Minnesota's code for a district).
const namesDistrict = (value) => /[a-z]{3,}/i.test(String(value || '').replace(/\b(sd|isd|usd|dist|no)\b/gi, ''));

function sameDistrict(county, census) {
  const a = bare(county);
  const b = bare(census);
  if (a && b && (a === b || a.includes(b) || b.includes(a))) return true;
  const n = districtNumber(county);
  return Boolean(n) && n === districtNumber(census);
}

const SCHOOL_LABELS = { unified: 'School district', elementary: 'Elementary district', secondary: 'High school district' };

/** The school rows and whose they are: `{ rows, from: 'county' | 'census' | 'both' }`, or null with nothing to show. */
function schoolRows(census, copy) {
  const county = typeof copy?.facts?.school_district === 'string' && namesDistrict(copy.facts.school_district)
    ? copy.facts.school_district.trim() : null;
  const found = Array.isArray(census) ? census : [];
  const label = (each) => (found.length > 1 ? SCHOOL_LABELS[each.level] : 'School district');
  const censusRows = found.map((each) => ({ label: label(each), value: each.name, mono: false, chip: null }));
  if (county) {
    if (found.some((each) => sameDistrict(county, each.name))) return { rows: censusRows, from: 'both' };
    return { rows: [{ label: 'School district', value: tidyName(county), mono: false, chip: null }], from: 'county' };
  }
  return censusRows.length ? { rows: censusRows, from: 'census' } : null;
}

const or = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0]);

/**
 * The `rows` block, or null when neither reading answered. `read`: `{ school, electric }` from the record's readings;
 * `copy`: the county record's served copy, or null.
 */
function servesBlock(read, copy) {
  const school = schoolRows(read?.school, copy);
  const electric = Array.isArray(read?.electric) && read.electric.length && read.electric.length <= ELECTRIC_MAX ? read.electric : null;
  const rows = [
    ...(school ? school.rows : []),
    electric ? { label: 'Electric service', value: or(electric), mono: false, chip: null } : null,
  ].filter(Boolean);
  if (!rows.length) return null;
  const county = copy?.publisher ? `${copy.publisher}'s records` : 'the county\'s records';
  const schoolNote = !school ? null
    : school.from === 'county' ? `School district from ${county}.`
      : school.from === 'both' ? `School district from the U.S. Census Bureau's boundaries, as ${county} also name it.`
        : 'School district from the U.S. Census Bureau\'s boundaries.';
  const electricNote = electric
    ? `Electric service from the U.S. Department of Energy's map of utility service areas by Oak Ridge National Laboratory, as of ${ELECTRIC_AS_OF}. Its areas are approximate${electric.length > 1 ? ' and overlap here' : ''}; the utility can confirm it serves this address.`
    : null;
  return {
    kind: 'rows',
    id: 'serves',
    title: 'Who serves this address',
    lead: null,
    rows,
    note: [schoolNote, electricNote].filter(Boolean).join(' '),
    action: null,
  };
}

/** Both readings for a point, each through `within` (the record's section budget). */
async function readingsAt(point, within) {
  const [school, electric] = await Promise.all([
    within(schoolsAt(point)),
    within(electricAt(point).catch((err) => {
      logger.info('homeRecord.electric_failed', { error: err?.message });
      return null;
    })),
  ]);
  return { school, electric };
}

module.exports = { readingsAt, servesBlock, schoolRows, electricAt, schoolsAt, tidyName };
