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
const { officesOf } = require('./offices');
const { isLive } = require('./holds');

// Released states, by postal code, in the order they went out. Live counties have pages whatever this says.
const BATCHES = [];
// COUNTY_GUIDE_STATES (postal codes, comma-separated) adds states for a rig's or staging's checks; production follows
// BATCHES alone, so a release is a reviewed change here.
const released = new Set([
  ...BATCHES.flat(),
  ...String(process.env.COUNTY_GUIDE_STATES || '').split(',').map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)),
]);

const ANSWER_TTL_MS = 6 * 60 * 60 * 1000;
const answers = new Map();

/** Whether a county has a page now. */
const published = (county) => Boolean(county) && (isLive(county.fips) || released.has(county.state.abbr));

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

/** The questions people ask, each answered with the office that holds the answer. Only what this county's page holds. */
function questionsOf(county, { offices }) {
  const questions = [];
  const search = offices.rows.find((row) => row.id === 'property_search');
  if (search) {
    questions.push({
      id: 'records',
      q: `How do I look up property records in ${county.inName}?`,
      a: `${search.office || 'The county'}'s property search${search.host ? ` (${search.host})` : ''} holds each property's record. Pantopus's lookup on this page shows what public records say about one address.`,
      office: search.office,
      url: search.url,
    });
  } else if (offices.towns.length) {
    questions.push({
      id: 'records',
      q: `How do I look up property records in ${county.inName}?`,
      a: `In ${county.state.name}, each town keeps its own property records. The towns' own property cards are listed on this page. Pantopus's lookup shows what public records say about one address.`,
    });
  }
  questions.push({
    id: 'flood_zone',
    q: `How do I find a home's flood zone in ${county.inName}?`,
    a: "FEMA's Flood Map Service Center (msc.fema.gov) holds the official flood maps. Pantopus's lookup reads the same FEMA map for an address.",
    office: 'FEMA',
    url: 'https://msc.fema.gov/portal/home',
  });
  return questions;
}

async function compose(county) {
  const offices = officesOf(county);
  return {
    v: 1,
    // The day the answer was made, Pacific time.
    built: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
    state: statePart(county.state),
    county: countyPart(county),
    live: isLive(county.fips),
    town_records: county.state.townRecords,
    offices,
    questions: questionsOf(county, { offices }),
    near: nearOf(county),
  };
}

/** The answer for one county's page, or null when it has none. */
async function countyAnswer(stateSlug, countySlug) {
  const county = places.county(stateSlug, countySlug);
  if (!published(county)) return null;
  const kept = answers.get(county.fips);
  if (kept && Date.now() - kept.at < ANSWER_TTL_MS) return kept.answer;
  const pending = compose(county);
  // Concurrent asks share one composition.
  answers.set(county.fips, { at: Date.now(), answer: pending });
  try {
    const answer = await pending;
    answers.set(county.fips, { at: Date.now(), answer });
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

module.exports = { countyAnswer, stateAnswer, indexAnswer, published, BATCHES };
