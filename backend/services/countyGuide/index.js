'use strict';

/**
 * The county pages' answers (routes/countyGuide.js): one county, one state, and the list of every page for the
 * sitemap. Public, the same for everyone, cached here and by the web for a day, so a visit to a page costs the
 * backend nothing. Each answer holds only what is real for its place, each part with its office and date; a part
 * with nothing real is left out.
 *
 * Which counties have a page: the ones whose records are live (the switch file, through propertyRecords/router.js),
 * then each state in BATCHES as it is released. A county off both has no page yet.
 */

const places = require('./places');
const { officesOf, allReadByHand } = require('./offices');
const { holdsFor, isLive } = require('./holds');
const federal = require('./federal');
const { questionsOf } = require('./questions');
const cities = require('./cities');
const { programForState, CHECKED_AT: EXEMPTIONS_READ } = require('../../data/homesteadPrograms');
const { appealForState, CHECKED_AT: APPEALS_READ } = require('../../data/appealPrograms');

// Released states, by postal code, in the order they went out. Live counties have pages whatever this says. A state
// release would show links from NETR Online's directory where no office was read by hand, and the founder decided on
// November 23 to keep those off ("Keep them off"), so states stay closed: release county by county below.
const BATCHES = [];

// Released counties, by FIPS: each one's every office row was read by hand on the office's own site
// (data/offices.json), so its page shows no directory link. A county listed here without that has no page.
const COUNTIES = [
  // November 23, 2026: Pierce and Kitsap counties, WA (Clark County, WA is live).
  '53053', '53035',
  // November 23, 2026, second: King and Skagit, WA; Multnomah, OR; Riverside and San Joaquin, CA; Hillsborough, FL;
  // Dallas, Harris and Fort Bend, TX; Ramsey, MN.
  '53033', '53057', '41051', '06065', '06077', '12057', '48113', '48201', '48157', '27123',
  // November 23, 2026, third: Summit, OH; Sonoma and Solano, CA; Berks, PA; Osceola, FL.
  '39153', '06097', '06095', '42011', '12097',
  // November 23, 2026, fourth: Stark and Delaware, OH; Chesterfield and Henrico, VA; Cumberland and Iredell, NC;
  // Boulder, CO; Alachua and St. Johns, FL; Cumberland, PA.
  '39151', '39041', '51041', '51087', '37051', '37097', '08013', '12001', '12109', '42041',
  // November 23, 2026, fifth: Broomfield and Mesa, CO; Martin, FL; Woodbury, IA; Scott, MN; Carteret, Lincoln and
  // Sampson, NC; Fairfield and Greene, OH; Johnson, TX; Roanoke County, VA.
  '08014', '08077', '12085', '19193', '27139', '37031', '37109', '37163', '39045', '39057', '48251', '51161',
  // November 23, 2026, sixth (live counties with a search-engine-listed link, now read in full): Los Angeles, CA;
  // Cook, IL; Miami-Dade, FL; Clark, NV; Franklin, OH.
  '06037', '17031', '12086', '32003', '39049',
  // Walla Walla, WA: its property search and recorder, beside the treasurer row read before.
  '53071',
  // November 23, 2026, seventh (live counties with a search-engine-listed link, now read in full): San Bernardino, CA;
  // Mecklenburg, NC; Allegheny and Montgomery, PA; Denver, CO; Dane, WI; Oklahoma, OK; Jackson, MO; Denton, TX.
  '06071', '37119', '42003', '42091', '08031', '55025', '40109', '29095', '48121',
  // November 23, 2026, eighth: Sarasota and Seminole, FL; Adams, CO; the District of Columbia; Charlottesville, VA.
  '12115', '12117', '08001', '11001', '51540',
];

// COUNTY_GUIDE_STATES (postal codes, comma-separated) adds states for a rig's or staging's checks; production follows
// BATCHES and COUNTIES alone, so a release is a reviewed change here.
const released = new Set([
  ...BATCHES.flat(),
  ...String(process.env.COUNTY_GUIDE_STATES || '').split(',').map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)),
]);
const releasedCounties = new Set(COUNTIES);

const ANSWER_TTL_MS = 6 * 60 * 60 * 1000;
const INCOMPLETE_TTL_MS = 10 * 60 * 1000;
const answers = new Map();

/** Whether a county has a page now. */
const published = (county) => Boolean(county) && (isLive(county.fips) || released.has(county.state.abbr)
  || (releasedCounties.has(county.fips) && allReadByHand(county)));

const statePart = (state) => ({ slug: state.slug, name: state.name, abbr: state.abbr, unit: state.unit, units: state.units });

const countyPart = (county) => ({
  fips: county.fips,
  slug: county.slug,
  name: county.name,
  in_name: county.inName,
  census_name: county.census,
});

/** The counties bordering this one that have a page, across state lines too. */
function nearOf(county) {
  return (county.facts.near || [])
    .map((fips) => places.countyByFips(fips))
    .filter(published)
    .map((near) => ({ slug: near.slug, name: near.name, state_slug: near.state.slug, state_abbr: near.state.abbr }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** The state's exemption program, only where the table holds the state's own page for it. */
function exemptionOf(state) {
  const program = programForState(state.abbr);
  if (!program.curated) return null;
  return { label: program.label, filing: program.filing, note: program.note, source_name: program.source_name, source_url: program.source_url, read: EXEMPTIONS_READ };
}

/** How a value is appealed in the state, only where the table holds it. */
function appealOf(state) {
  const appeal = appealForState(state.abbr);
  return appeal ? { note: appeal.note, source: appeal.source, read: APPEALS_READ } : null;
}

const openSide = (side) => (side === 'below' || side === 'above' ? side : null);

/** The Census's medians for the county, from the survey named in data/counties.json. */
function homesOf(county) {
  const { built, value } = county.facts;
  if (!built && !value) return null;
  return {
    median_year_built: built || null,
    // 'below' or 'above' where the median falls in the survey's open-ended lowest or highest interval (build-data.cjs):
    // the number is then that interval's edge, "1939 or earlier", not a year.
    median_year_built_open: built ? openSide(county.facts.built_open) : null,
    median_value: value || null,
    median_value_open: value ? openSide(county.facts.value_open) : null,
    survey: places.censusSources.homes_survey,
    source: 'U.S. Census Bureau, American Community Survey 5-year estimates',
    url: 'https://data.census.gov/',
  };
}

async function compose(county) {
  const offices = officesOf(county);
  const read = await Promise.all([
    federal.hazards(county.fips),
    federal.disasters(county.fips),
    federal.radon(county.fips),
    federal.floodCost(county.fips),
  ]);
  const holds = await holdsFor(county);
  // A part that couldn't be read just now is left out of this answer, which is then kept only briefly.
  const incomplete = read.some(federal.isUnread);
  const [hazards, disasters, radon, floodCost] = read.map((part) => (federal.isUnread(part) ? null : part));
  const exemption = exemptionOf(county.state);
  const appeal = appealOf(county.state);
  return {
    v: 1,
    ...(incomplete ? { incomplete: true } : {}),
    // The day the answer was made, Pacific time.
    built: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
    state: statePart(county.state),
    county: countyPart(county),
    live: isLive(county.fips),
    town_records: county.state.townRecords,
    // A row's question rides in `questions`, not twice.
    offices: { rows: offices.rows.map(({ q, a, ...row }) => row), towns: offices.towns },
    holds,
    hazards: hazards ? { ...hazards, source: 'FEMA, National Risk Index', url: 'https://hazards.fema.gov/nri/' } : null,
    disasters: disasters ? { ...disasters, source: 'FEMA, Disaster Declarations Summaries (OpenFEMA)', url: 'https://www.fema.gov/disaster/declarations', notice: federal.OPENFEMA_NOTICE } : null,
    radon: radon ? { ...radon, source: "EPA's Map of Radon Zones (1993)", url: 'https://www.epa.gov/radon/epa-map-radon-zones' } : null,
    flood_cost: floodCost ? { ...floodCost, source: 'FEMA, National Flood Insurance Program policies (OpenFEMA)', notice: federal.OPENFEMA_NOTICE } : null,
    exemption,
    appeal,
    homes: homesOf(county),
    questions: questionsOf(county, { offices, hazards, disasters, radon, exemption, appeal }),
    cities: cities.citiesOf(county).map((city) => ({ slug: city.slug, name: city.name })),
    near: nearOf(county),
  };
}

/** The answer for one county's page, or null when it has none. */
async function countyAnswer(stateSlug, countySlug) {
  const county = places.county(stateSlug, countySlug);
  if (!published(county)) return null;
  const kept = answers.get(county.fips);
  if (kept && Date.now() - kept.at < kept.ttl) return kept.answer;
  const pending = compose(county);
  // Concurrent asks share one composition.
  answers.set(county.fips, { at: Date.now(), ttl: ANSWER_TTL_MS, answer: pending });
  try {
    const answer = await pending;
    answers.set(county.fips, { at: Date.now(), ttl: answer.incomplete ? INCOMPLETE_TTL_MS : ANSWER_TTL_MS, answer });
    return answer;
  } catch (err) {
    answers.delete(county.fips);
    throw err;
  }
}

/** A released city whose county has a page, by slugs, or null. */
function cityOf(stateSlug, countySlug, citySlug) {
  const county = places.county(stateSlug, countySlug);
  return published(county) ? cities.city(county, citySlug) : null;
}

/** The answer for one city's page: the city's own offices, the Census's figures for it, and its county. Null when it has none. */
function cityAnswer(stateSlug, countySlug, citySlug) {
  const city = cityOf(stateSlug, countySlug, citySlug);
  if (!city) return null;
  const { county } = city;
  return {
    v: 1,
    built: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
    state: statePart(county.state),
    county: countyPart(county),
    city: { geoid: city.geoid, slug: city.slug, name: city.name, other_counties: city.otherCounties },
    // A row's question rides in `questions`, not twice.
    offices: { rows: city.rows.map(({ q, a, ...row }) => row) },
    homes: cities.homesOf(city),
    questions: city.rows.filter((row) => row.q && row.a).map((row) => ({ id: row.id, q: row.q, a: row.a, office: row.office, url: row.url })),
    others: cities.citiesOf(county).filter((other) => other.geoid !== city.geoid).map((other) => ({ slug: other.slug, name: other.name })),
  };
}

/** The answer for one state's page: its counties with a page, by name. Null when it has none. */
function stateAnswer(stateSlug) {
  const state = places.state(stateSlug);
  if (!state) return null;
  const counties = places.countiesOf(state.slug).filter(published);
  if (!counties.length) return null;
  return {
    v: 1,
    state: { ...statePart(state), town_records: state.townRecords },
    counties: counties.map((county) => ({ slug: county.slug, name: county.name, live: isLive(county.fips) })),
  };
}

/** Every state, county and city page, for the sitemap and the index page. */
function indexAnswer() {
  const states = [];
  const counties = [];
  const cityPages = [];
  for (const state of places.states) {
    const list = places.countiesOf(state.slug).filter(published);
    if (!list.length) continue;
    states.push({ ...statePart(state), counties: list.length, live: list.filter((county) => isLive(county.fips)).length });
    for (const county of list) {
      counties.push({ state: state.slug, slug: county.slug });
      for (const city of cities.citiesOf(county)) cityPages.push({ state: state.slug, county: county.slug, slug: city.slug });
    }
  }
  return { v: 1, states, counties, cities: cityPages };
}

/** Whether a code is a county (FIPS) or a city (place GEOID) with a page now: the visit beacon counts only those. */
function isPage(code) {
  const id = String(code || '');
  if (/^\d{5}$/.test(id)) return published(places.countyByFips(id));
  const city = /^\d{7}$/.test(id) ? cities.cityByGeoid(id) : null;
  return Boolean(city) && published(city.county);
}

module.exports = { countyAnswer, cityAnswer, stateAnswer, indexAnswer, published, isPage, BATCHES, COUNTIES };
