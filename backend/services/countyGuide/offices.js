'use strict';

/**
 * A county's own offices, for its page: the property search link config/countyLinks.json holds for it, named for
 * where it came from, and the rows read by hand on each office's own site (data/offices.json: recorder, treasurer,
 * parcel map, permits, the free recording alert). Pantopus never reads these pages; a person opens them.
 *
 * Only a link's search page is used, never the table's per-parcel pattern, so no link a search engine can follow
 * names a home.
 */

const links = require('../../config/countyLinks').table;
const handRead = require('./data/offices.json');
const { TOWN_ELSEWHERE } = require('./places');

// Words in a directory listing that name an office, and the office's own name for the shorthand.
const OFFICE_WORDS = /(Assessor|Appraiser|Appraisal District|Auditor|Treasurer|Revenue|Valuation|Equalization|Lister|Tax|Collector|Recorder|Clerk|Commission)/;
const SHORTHAND = { 'Property Valuation': 'Property Valuation Administrator' };

function dateWords(iso) {
  const at = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(at.getTime()) ? null
    : at.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const TABLE_READ = dateWords(links.built || '2026-11-07');

// Where each kind of link came from, in a line for the page.
const FROM = {
  netr: `Listed in NETR Online's public records directory, read ${TABLE_READ}.`,
  wp9: `The county's own site, as a public search engine listed it on ${TABLE_READ}.`,
  'search-index': `The office's own site, as a public search engine listed it on ${TABLE_READ}.`,
  webmap: "Linked from the county's own published parcel map.",
  'ct-cama': "From Connecticut's 2026 Parcel and CAMA Data on data.ct.gov.",
};

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const httpsOnly = (url) => typeof url === 'string' && /^https:\/\//.test(url) && !url.includes('{');

/** The short name a directory uses for a county: "Orleans" for Orleans Parish, "Live Oak" for Live Oak County. */
const shortName = (census) => census.replace(/ (County|Parish|Borough|Census Area|Municipality|city|City and Borough|Planning Region)$/, '');

/** The office behind a county's property search link, in its own words where the listing gives them, or null. */
function officeName(county, link) {
  const ref = typeof link.ref === 'string' ? link.ref.trim().replace(/\s+/g, ' ') : '';
  if (link.src === 'netr' && ref) {
    const short = shortName(county.census);
    if (county.state.townRecords) {
      // In these states the listing is a town's own office: say whose.
      const town = ref.replace(/ (City )?(Assessor|Assessor\/Tax Collector|Assessors)$/, '');
      return town && town !== ref ? `${town}'s assessor` : ref;
    }
    if (ref.startsWith(`${short} `)) {
      // "Richmond City Assessor" for the City of Richmond is its Assessor, not "City of Richmond City Assessor".
      const rest = ref.slice(short.length + 1).replace(/^City (?=\S)/, county.name.startsWith('City of') ? '' : 'City ');
      if (OFFICE_WORDS.test(rest)) return `${county.name} ${SHORTHAND[rest] || rest}`;
    }
    return OFFICE_WORDS.test(ref) && !ref.includes(' - ') ? ref : null;
  }
  const named = typeof link.name === 'string' ? link.name.replace(/^the /, '') : '';
  return named && named !== county.census ? named : county.name;
}

/** The property search row, or null where the table's link can't be shown. */
function propertySearch(county) {
  const link = county.link;
  if (TOWN_ELSEWHERE.has(county.fips) || !httpsOnly(link.url)) return null;
  // Where the office's own site was read, its name as the office gives it, and the day it was read.
  const entry = handRead.counties?.[county.fips];
  const named = typeof entry?.property_search_office === 'string' && entry.property_search_office ? entry.property_search_office : null;
  const read = named ? dateWords(entry.read) : null;
  return {
    id: 'property_search',
    title: 'Property search',
    office: named || officeName(county, link),
    url: link.url,
    host: host(link.url),
    from: read ? `Read on the office's own site, ${read}.` : FROM[link.src] || null,
  };
}

/** Connecticut: each town's own property cards, by town. */
function towns(county) {
  const list = county.link.towns;
  if (!list || typeof list !== 'object') return [];
  return Object.values(list)
    .filter((town) => town && typeof town.name === 'string' && httpsOnly(town.url))
    .map((town) => ({ name: town.name, url: town.url, host: host(town.url) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** The rows read by hand on each office's own site, in the file's order. */
function readByHand(county) {
  const entry = handRead.counties?.[county.fips];
  if (!entry || !Array.isArray(entry.rows)) return [];
  const read = dateWords(entry.read);
  return entry.rows.filter((row) => httpsOnly(row.url) && row.title && row.office).map((row) => ({
    id: row.id,
    title: row.title,
    office: row.office,
    url: row.url,
    host: host(row.url),
    ...(row.line ? { line: row.line } : {}),
    // The question this office answers, as read on its site (questions.js).
    ...(row.q && row.a ? { q: row.q, a: row.a } : {}),
    from: read ? `Read on the office's own site, ${read}.` : null,
  }));
}

/** The county's offices for its page: the property search first, then the rows read by hand. */
function officesOf(county) {
  const search = propertySearch(county);
  const rows = [...(search ? [search] : []), ...readByHand(county)];
  return { rows, towns: towns(county) };
}

/** Whether the hand-read file has a row of this kind for the county. */
const hasRow = (county, id) => Boolean(handRead.counties?.[county.fips]?.rows?.some((row) => row.id === id));

module.exports = { officesOf, hasRow, dateWords, host };
