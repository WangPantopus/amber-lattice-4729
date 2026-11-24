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
const { programForState, CHECKED_AT: EXEMPTIONS_READ } = require('../../data/homesteadPrograms');
const { appealForState, CHECKED_AT: APPEALS_READ } = require('../../data/appealPrograms');

// Released states, by postal code, in the order they went out. Live counties have pages whatever this says. A state
// release shows links from NETR Online's directory where no office was read by hand, so it waits on the founder's
// decision about those links (FOUNDER-STEPS.md); until then, release county by county below.
const BATCHES = [];

// Released counties, by FIPS: each one's every office row was read by hand on the office's own site
// (data/offices.json), so its page shows no directory link. A county listed here without that has no page.
const COUNTIES = [
  // November 23, 2026: Pierce and Kitsap counties, WA (Clark County, WA is live).
  '53053', '53035',
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

/** The Census's medians for the county, from the survey named in data/counties.json. */
function homesOf(county) {
  const { built, value } = county.facts;
  if (!built && !value) return null;
  return {
    median_year_built: built || null,
    median_value: value || null,
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

/** Every state and county page, for the sitemap and the index page. */
function indexAnswer() {
  const states = [];
  const counties = [];
  for (const state of places.states) {
    const list = places.countiesOf(state.slug).filter(published);
    if (!list.length) continue;
    states.push({ ...statePart(state), counties: list.length, live: list.filter((county) => isLive(county.fips)).length });
    for (const county of list) counties.push({ state: state.slug, slug: county.slug });
  }
  return { v: 1, states, counties };
}

/** Whether a FIPS code is a county with a page now (the visit beacon counts only those). */
const isPage = (fips) => /^\d{5}$/.test(String(fips || '')) && published(places.countyByFips(fips));

module.exports = { countyAnswer, stateAnswer, indexAnswer, published, isPage, BATCHES, COUNTIES };
