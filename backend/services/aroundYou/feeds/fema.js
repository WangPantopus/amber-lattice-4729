/**
 * Federal disaster declarations for a region's county, from OpenFEMA (read once a run for the whole country: every
 * county named in a declaration of the last 30 days). One row per declaration and region; a statewide declaration
 * (designated area "Statewide") counts for every region in that state, and a tribal area (county code 000 too) for
 * none, since no region is placed in one. The body says plainly
 * whether help for people and households is open (individual assistance or individual and household programs) or
 * only help for public agencies. Link: the declaration's page at fema.gov.
 */

const { readJson } = require('./http');
const { dayLabel } = require('./place');
const { stateName } = require('../../../utils/usState');
const { STATE_BY_FIPS } = require('../../nfipPremiumService');

const SOURCE = 'fema:declarations';
const API = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';
const DAYS = 30;
const DAY_MS = 24 * 3_600_000;
const NAMED_STORMS = ['hurricane', 'tropical storm', 'typhoon'];

async function readDeclarations(now = Date.now()) {
  const since = new Date(now - DAYS * DAY_MS).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    $filter: `declarationDate ge '${since}T00:00:00.000Z'`,
    $select: [
      'disasterNumber', 'declarationType', 'declarationDate', 'incidentType', 'declarationTitle', 'fipsStateCode',
      'fipsCountyCode', 'designatedArea', 'iaProgramDeclared', 'ihProgramDeclared', 'paProgramDeclared',
    ].join(','),
    $top: '5000',
  });
  const data = await readJson(`${API}?${params}`);
  return Array.isArray(data?.DisasterDeclarationsSummaries) ? data.DisasterDeclarationsSummaries : [];
}

function titleCase(text) {
  return text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

// "SEVERE STORMS AND FLOODING" -> "severe storms and flooding"; "HURRICANE ISAIAS" -> "hurricane Isaias"; a fire
// management declaration's title is the fire's name: "BEAR GULCH FIRE" -> "Bear Gulch Fire".
function what(row) {
  const raw = String(row.declarationTitle || row.incidentType || 'disaster').replace(/\s+/g, ' ').trim();
  if (row.declarationType === 'FM') return titleCase(raw);
  const title = raw.toLowerCase();
  const storm = NAMED_STORMS.find((kind) => title.startsWith(`${kind} `));
  if (!storm) return title;
  const name = title.slice(storm.length + 1).replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  return `${storm} ${name}`;
}

function countyLabel(region) {
  const name = String(region.county_name || '').trim();
  if (!name) return 'this county';
  return /\b(county|parish|borough|municipality|census area|city)$/i.test(name) ? name : `${name} County`;
}

function declarationRows(region, declarations) {
  if (!/^\d{5}$/.test(String(region.county_fips || ''))) return [];
  const stateCode = region.county_fips.slice(0, 2);
  const countyCode = region.county_fips.slice(2);
  const seen = new Set();
  const rows = [];
  for (const row of declarations) {
    if (String(row.fipsStateCode).padStart(2, '0') !== stateCode) continue;
    const statewide = /^statewide$/i.test(String(row.designatedArea || '').trim());
    if (!statewide && String(row.fipsCountyCode).padStart(3, '0') !== countyCode) continue;
    const number = Number(row.disasterNumber);
    if (!Number.isFinite(number) || seen.has(number)) continue;
    seen.add(number);
    const county = statewide ? (stateName(STATE_BY_FIPS[stateCode]) || 'the state') : countyLabel(region);
    const kind = row.declarationType === 'EM' ? 'emergency' : 'disaster';
    const title = row.declarationType === 'FM'
      ? `Federal fire help approved for ${county}: ${what(row)}`
      : `Federal ${kind} declared for ${county}: ${what(row)}`;
    const people = row.iaProgramDeclared || row.ihProgramDeclared;
    const help = people
      ? 'Help for people and households is open: apply at DisasterAssistance.gov or call 1-800-621-3362.'
      : 'This help is for public agencies only (cleanup and repairs to public roads and buildings); help for households has not been opened.';
    const declared = row.declarationDate ? `Declared ${dayLabel(new Date(row.declarationDate), 'UTC', { year: true })}. ` : '';
    rows.push({
      source: SOURCE,
      feedId: `${number}`,
      category: 'safety',
      priority: 1,
      title,
      body: `${declared}${help}`,
      url: `https://www.fema.gov/disaster/${number}`,
    });
  }
  return rows;
}

module.exports = { SOURCE, readDeclarations, declarationRows, what };
