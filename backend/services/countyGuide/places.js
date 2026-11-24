'use strict';

/**
 * The county pages' places: the 50 states and DC, and the counties that have a page. A county has a page when
 * config/countyLinks.json holds a link to one of its own offices; its name and borders come from the Census Bureau
 * (data/counties.json, built by build-data.cjs). Names and slugs are fixed by those files, so a page's address never
 * moves between releases.
 *
 * Words for places that aren't called counties: Louisiana's parishes, Alaska's boroughs, census areas and
 * municipality, Virginia's and three other states' independent cities, and Connecticut's planning regions, where
 * towns keep the property records.
 */

const links = require('../../config/countyLinks').table;
const census = require('./data/counties.json');

// FIPS, postal code, name. `unit`/`units` name a state's county-level places in its own words.
const STATES = [
  ['01', 'AL', 'Alabama'], ['02', 'AK', 'Alaska', 'borough', 'boroughs'], ['04', 'AZ', 'Arizona'],
  ['05', 'AR', 'Arkansas'], ['06', 'CA', 'California'], ['08', 'CO', 'Colorado'],
  ['09', 'CT', 'Connecticut', 'planning region', 'planning regions'], ['10', 'DE', 'Delaware'],
  ['11', 'DC', 'District of Columbia'], ['12', 'FL', 'Florida'], ['13', 'GA', 'Georgia'], ['15', 'HI', 'Hawaii'],
  ['16', 'ID', 'Idaho'], ['17', 'IL', 'Illinois'], ['18', 'IN', 'Indiana'], ['19', 'IA', 'Iowa'],
  ['20', 'KS', 'Kansas'], ['21', 'KY', 'Kentucky'], ['22', 'LA', 'Louisiana', 'parish', 'parishes'],
  ['23', 'ME', 'Maine'], ['24', 'MD', 'Maryland'], ['25', 'MA', 'Massachusetts'], ['26', 'MI', 'Michigan'],
  ['27', 'MN', 'Minnesota'], ['28', 'MS', 'Mississippi'], ['29', 'MO', 'Missouri'], ['30', 'MT', 'Montana'],
  ['31', 'NE', 'Nebraska'], ['32', 'NV', 'Nevada'], ['33', 'NH', 'New Hampshire'], ['34', 'NJ', 'New Jersey'],
  ['35', 'NM', 'New Mexico'], ['36', 'NY', 'New York'], ['37', 'NC', 'North Carolina'], ['38', 'ND', 'North Dakota'],
  ['39', 'OH', 'Ohio'], ['40', 'OK', 'Oklahoma'], ['41', 'OR', 'Oregon'], ['42', 'PA', 'Pennsylvania'],
  ['44', 'RI', 'Rhode Island'], ['45', 'SC', 'South Carolina'], ['46', 'SD', 'South Dakota'], ['47', 'TN', 'Tennessee'],
  ['48', 'TX', 'Texas'], ['49', 'UT', 'Utah'], ['50', 'VT', 'Vermont'], ['51', 'VA', 'Virginia'],
  ['53', 'WA', 'Washington'], ['54', 'WV', 'West Virginia'], ['55', 'WI', 'Wisconsin'], ['56', 'WY', 'Wyoming'],
];

// States where cities and towns, not counties, keep the property records (assessor, tax roll and, in Connecticut,
// the land records). A link in countyLinks.json there is one town's office, so a page says whose it is.
const TOWN_RECORDS = new Set(['CT', 'MA', 'ME', 'NH', 'RI', 'VT']);

// New England links in countyLinks.json that are a town of the same name in another county: shown nowhere.
const TOWN_ELSEWHERE = new Set(['23015', '33003', '50009']);

function slugify(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * How a county is named in a sentence. The Census writes Virginia's independent cities "Richmond city" and Alaska's
 * consolidated places "Juneau City and Borough"; their own names are "the City of Richmond" and "the City and
 * Borough of Juneau".
 */
function nameOf(censusName) {
  let name = censusName;
  let the = false;
  let m;
  if ((m = /^(.+) city$/.exec(name))) {
    name = `City of ${m[1]}`;
    the = true;
  } else if ((m = /^(.+) City and Borough$/.exec(name))) {
    name = `City and Borough of ${m[1]}`;
    the = true;
  } else if ((m = /^(.+) Municipality$/.exec(name))) {
    name = `Municipality of ${m[1]}`;
    the = true;
  } else if (/Planning Region$/.test(name) || name === 'District of Columbia') {
    the = true;
  }
  return { name, inName: the ? `the ${name}` : name };
}

const states = STATES.map(([fips, abbr, name, unit = 'county', units = 'counties']) => ({
  fips, abbr, name, slug: slugify(name), unit, units, townRecords: TOWN_RECORDS.has(abbr),
}));
const stateByFips = new Map(states.map((state) => [state.fips, state]));
const stateBySlug = new Map(states.map((state) => [state.slug, state]));

// Every county with a page, by FIPS, and by state slug then county slug.
const counties = new Map();
const bySlug = new Map();
for (const [fips, link] of Object.entries(links.counties || {})) {
  const state = stateByFips.get(fips.slice(0, 2));
  const facts = census.counties[fips];
  // A town of the same name in another county is no office of this one: no page.
  if (!state || !facts || !link || TOWN_ELSEWHERE.has(fips)) continue;
  const { name, inName } = nameOf(facts.n);
  const county = { fips, state, census: facts.n, name, inName, slug: slugify(facts.n), facts, link };
  counties.set(fips, county);
  if (!bySlug.has(state.slug)) bySlug.set(state.slug, new Map());
  const inState = bySlug.get(state.slug);
  // Census names are unique within a state ("Fairfax County", "Fairfax city"), so slugs are too.
  if (inState.has(county.slug)) throw new Error(`Two county pages share ${state.slug}/${county.slug}`);
  inState.set(county.slug, county);
}

const byName = (a, b) => a.census.localeCompare(b.census, 'en');

/** The state for a slug, or null. */
const state = (slug) => stateBySlug.get(String(slug || '').toLowerCase()) || null;

/** A county with a page, by state slug and county slug, or null. */
function county(stateSlug, countySlug) {
  return bySlug.get(String(stateSlug || '').toLowerCase())?.get(String(countySlug || '').toLowerCase()) || null;
}

/** A county with a page, by FIPS, or null. */
const countyByFips = (fips) => counties.get(fips) || null;

/** The counties of a state that have a page, by name. */
const countiesOf = (stateSlug) => [...(bySlug.get(stateSlug)?.values() || [])].sort(byName);

/** Every county with a page. */
const allCounties = () => [...counties.values()];

module.exports = {
  states, state, county, countyByFips, countiesOf, allCounties, slugify, nameOf, TOWN_RECORDS, TOWN_ELSEWHERE,
  censusSources: census.sources,
};
