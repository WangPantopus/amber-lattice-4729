/**
 * State road projects near a region, from the federal registry of work zone feeds (WZDx). Only feeds the registry marks
 * active and keyless, in WZDx version 4; each feed is read once a run for all of its state's regions. Kept: a project
 * that has started or starts within 14 days, has not ended, and lies within 40 km of the centre. A state whose feed has
 * no usable dates gives none. Washington's open feed is a list of planned projects (its real closures and pass
 * conditions need an access code: a follow-up).
 *
 * Link: the state's traveler map (a work zone feed has no page per project), else the federal list of them.
 */

const { createHash } = require('crypto');
const { readJson } = require('./http');
const { guardedFetch } = require('../guardedFetch');
const { km, dayLabel } = require('./place');
const { STATE_CODES, stateName } = require('../../../utils/usState');

const REGISTRY = 'https://data.transportation.gov/resource/69qe-yiui.json';
const WITHIN_KM = 40;
const AHEAD_MS = 14 * 24 * 3_600_000;
const FALLBACK_PAGE = 'https://www.fhwa.dot.gov/trafficinfo/';
const FALLBACK_AGENCY = 'Federal Highway Administration';
// Who runs each traveler map: a road row's link reads "Read at <agency>".
const AGENCIES = {
  AZ: 'Arizona DOT', DE: 'Delaware DOT', FL: 'Florida DOT', HI: 'Hawaii DOT', IA: 'Iowa DOT',
  ID: 'Idaho Transportation Department', IN: 'Indiana DOT', KS: 'Kansas DOT', KY: 'Kentucky Transportation Cabinet',
  LA: 'Louisiana DOTD', MD: 'Maryland DOT', ME: 'New England 511', MN: 'Minnesota DOT', MO: 'Missouri DOT',
  MS: 'Mississippi DOT', ND: 'North Dakota DOT', NH: 'New England 511', NJ: 'New Jersey DOT', NY: 'New York State DOT',
  OK: 'Oklahoma DOT', OR: 'Oregon DOT', TX: 'Texas DOT', VT: 'New England 511', WA: 'Washington State DOT',
  WI: 'Wisconsin DOT',
};

// The agency a road row's link opens, from its source ("roadwork:fl").
function roadAgency(source) {
  const state = String(source || '').split(':')[1]?.toUpperCase();
  return (TRAVEL_PAGES[state] && AGENCIES[state]) || FALLBACK_AGENCY;
}
// Each state's own traveler map, checked by hand on 2026-11-24.
const TRAVEL_PAGES = {
  AZ: 'https://www.az511.gov/',
  DE: 'https://deldot.gov/map/',
  FL: 'https://fl511.com/',
  HI: 'https://hidot.hawaii.gov/highways/',
  IA: 'https://www.511ia.org/',
  ID: 'https://511.idaho.gov/',
  IN: 'https://511in.org/',
  KS: 'https://www.kandrive.gov/',
  KY: 'https://goky.ky.gov/',
  LA: 'https://www.511la.org/',
  MD: 'https://chart.maryland.gov/',
  ME: 'https://newengland511.org/',
  MN: 'https://511mn.org/',
  MO: 'https://traveler.modot.org/map/',
  MS: 'https://www.mdottraffic.com/',
  ND: 'https://travel.dot.nd.gov/',
  NH: 'https://newengland511.org/',
  NJ: 'https://511nj.org/',
  NY: 'https://511ny.org/',
  OK: 'https://oktraffic.org/',
  OR: 'https://www.tripcheck.com/',
  TX: 'https://drivetexas.org/',
  VT: 'https://newengland511.org/',
  WA: 'https://wsdot.com/travel/real-time/map/',
  WI: 'https://511wi.gov/',
};
const IMPACT = {
  'all-lanes-closed': 'All lanes closed',
  'some-lanes-closed': 'Some lanes closed',
  'all-lanes-open': 'All lanes open',
  'alternating-one-way': 'One lane, taking turns',
  'some-lanes-closed-merge-left': 'Some lanes closed',
  'some-lanes-closed-merge-right': 'Some lanes closed',
  'some-lanes-closed-split': 'Some lanes closed',
  'flagging': 'Flaggers on the road',
  'temporary-traffic-signal': 'A temporary traffic signal',
};
const DONE = new Set(['completed', 'cancelled', 'canceled']);

const CODE_BY_NAME = new Map([...STATE_CODES].map((code) => [String(stateName(code) || '').toLowerCase(), code]));

// "New Hampshire, Vermont, Maine" -> ['NH', 'VT', 'ME'].
function statesOf(entry) {
  return String(entry.state || '').split(',').map((name) => CODE_BY_NAME.get(name.trim().toLowerCase())).filter(Boolean);
}

// The registry's open feeds: active, keyless, WZDx 4, https. { url, organization, states }.
async function readRegistry() {
  const entries = await readJson(REGISTRY);
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => String(entry.active) === 'true' || entry.active === true)
    .filter((entry) => !(String(entry.needapikey) === 'true' || entry.needapikey === true))
    .filter((entry) => /^4(\.|$)/.test(String(entry.version || '')))
    .map((entry) => ({
      url: typeof entry.url === 'object' ? entry.url?.url : entry.url,
      organization: entry.issuingorganization || null,
      states: statesOf(entry),
    }))
    .filter((entry) => entry.states.length && /^https:\/\//i.test(String(entry.url || '')));
}

// A state's feed address comes from the federal registry, not from us, so it is read through the fetch guard: public
// addresses only, checked on every connection and redirect, redirects only within the same site.
async function readFeedEvents(entry) {
  const answer = await guardedFetch(entry.url, { accept: 'application/json, application/geo+json' });
  if (answer.status !== 200) throw new Error(`HTTP ${answer.status} from ${new URL(answer.url).host}`);
  const data = JSON.parse(answer.body.toString('utf8'));
  return Array.isArray(data?.features) ? data.features : [];
}

function points(geometry) {
  const out = [];
  const walk = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      out.push([value[1], value[0]]);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry?.coordinates);
  return out;
}

function parseDate(value) {
  const at = Date.parse(String(value || ''));
  return Number.isFinite(at) ? at : null;
}

function cleanDescription(text) {
  return String(text || '')
    .replace(/\s*Last updated\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,\s]+$/, '');
}

function eventId(feature, details, start) {
  if (feature.id != null && String(feature.id).trim()) return String(feature.id).trim();
  return createHash('sha256').update(`${details.data_source_id || ''}|${details.description || ''}|${start}`).digest('hex').slice(0, 32);
}

// The rows for one region from one state's feed.
function roadworkRows(region, entry, features, now = Date.now()) {
  const state = String(region.state || '').toUpperCase();
  const rows = [];
  for (const feature of features) {
    const props = feature?.properties || {};
    const details = props.core_details || {};
    if (DONE.has(String(props.event_status || '').toLowerCase())) continue;
    const start = parseDate(props.start_date);
    const end = parseDate(props.end_date);
    if (!start || start > now + AHEAD_MS) continue;
    if (end && end <= now) continue;
    const near = points(feature.geometry).reduce((best, [lat, lng]) => Math.min(best, km(region, lat, lng)), Infinity);
    if (!(near <= WITHIN_KM)) continue;
    const roads = (Array.isArray(details.road_names) ? details.road_names : []).filter(Boolean).join(' / ');
    const description = cleanDescription(details.description);
    const firstRoad = String(details.road_names?.[0] || '').toLowerCase();
    let title = description || `${roads}: ${String(details.event_type || 'road work').replace(/-/g, ' ')}`;
    if (description && roads && firstRoad && !description.toLowerCase().includes(firstRoad)) title = `${roads}: ${description}`;
    if (!title.trim()) continue;
    const when = start > now
      ? `Starts ${dayLabel(new Date(start), region.timezone)}`
      : `Started ${dayLabel(new Date(start), region.timezone, { year: now - start > 300 * 24 * 3_600_000 })}`;
    const ends = end ? `; ends ${dayLabel(new Date(end), region.timezone, { year: true })}` : '';
    const impact = IMPACT[String(props.vehicle_impact || '').toLowerCase()];
    // The agency is the link's name ("Read at Florida DOT"), so the body is the dates and the lanes.
    const body = `${when}${ends}.${impact ? ` ${impact}.` : ''}`;
    rows.push({
      source: `roadwork:${state.toLowerCase()}`,
      feedId: eventId(feature, details, props.start_date),
      category: 'community_resource',
      priority: 2,
      rank: near,
      title,
      body,
      url: TRAVEL_PAGES[state] || FALLBACK_PAGE,
    });
  }
  return rows;
}

module.exports = { readRegistry, readFeedEvents, roadworkRows, roadAgency, statesOf, TRAVEL_PAGES };
