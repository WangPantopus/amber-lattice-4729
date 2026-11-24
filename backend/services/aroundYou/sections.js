/**
 * Around you's page rules (AROUNDFEEDS piece 2, November 24, 2026): which queue rows make which section, in what
 * order, and the On watch card for a quiet place. Pure: the service (services/aroundYouService.js) reads the rows,
 * the sources and the regions, and makes the posts.
 *
 * Sections, in the order they show: Alerts · Roads · Headlines · Events · Around town · Across <State> · This season ·
 * On this day · On watch. `hours` is how long an item stays after the fetcher or the feeds job last saw it; a source's
 * own `keep_hours` replaces it (a weekly paper keeps its stories 168 hours).
 */

const { stateName } = require('../../utils/usState');
const { roadAgency } = require('./feeds/roadwork');

const HOUR_MS = 3_600_000;
const MAX_TITLE_LENGTH = 180;
const MAX_SUMMARY_LENGTH = 220;
// No outlet fills a section while another has something to show.
const MAX_PER_OUTLET = 5;
// Google's news search is not a headline source (founder's choice of the everywhere layer, 2026-11-24): it lists
// pages that are not local stories and its feed is for personal readers. Turn this on to bring it back.
const GOOGLE_IN_HEADLINES = false;
// A calendar event leaves the page soon after it starts: the feeds job refreshes upcoming events every hour.
const CALENDAR_KEEP_HOURS = 3;
// On watch shows when these sections hold this many rows or fewer between them.
const QUIET_SECTIONS = ['alerts', 'roads', 'headlines', 'events'];
const QUIET_AT_MOST = 2;
// The feeds job's rows (services/aroundYou/feeds/): not news, so the news word lists never run on them ("Dead Horse
// Fire", "Flu shot clinic"), and their own body line shows under the title as an outlet's summary does.
const FEED_KINDS = new Set(['wildfire', 'fema', 'roadwork', 'ical']);
const BODY_LINE_KINDS = new Set(['rss', 'wildfire', 'fema', 'roadwork']);
// Rows that may share a link and still be different things: road projects share their state's map, a calendar's
// events without their own page share the calendar's site.
const OWN_LINK_KINDS = new Set(['roadwork', 'ical', 'wildfire']);

const SECTIONS = [
  { id: 'alerts', title: 'Alerts', hours: 48, max: 4,
    takes: (row) => row.category === 'earthquake'
      || (row.category === 'safety' && ['wildfire', 'fema', 'usgs_earthquakes'].includes(row.kind)) },
  { id: 'roads', title: 'Roads', hours: 48, max: 4, takes: (row) => row.kind === 'roadwork' },
  { id: 'headlines', title: 'Headlines', hours: 48, max: 8,
    takes: (row) => row.category === 'local_news' && !row.stateOutlet
      && (GOOGLE_IN_HEADLINES || row.kind !== 'google_news') },
  { id: 'events', title: 'Events', hours: 72, max: 5, takes: (row) => row.category === 'event' },
  { id: 'around_town', title: 'Around town', hours: 168, max: 4,
    takes: (row) => row.category === 'community_resource' && row.kind !== 'roadwork' },
  { id: 'across_state', title: 'Across', hours: 72, max: 3, takes: (row) => row.stateOutlet },
  { id: 'season', title: 'This season', hours: 168, max: 1, takes: (row) => row.category === 'seasonal' },
  { id: 'history', title: 'On this day', hours: 24, max: 1, takes: (row) => row.category === 'history' },
];
const CATEGORIES = ['earthquake', 'safety', 'community_resource', 'local_news', 'event', 'seasonal', 'history'];
const LONGEST_HOURS = 168;

// The fetcher's filter already drops crime, obituaries and party politics by a word list
// (pantopus-seeder/src/config/constants.py BLOCKLIST_TERMS). The same kinds of story under words that list misses
// stay off this page too; whole words only, headline only.
const LEFT_OUT = new RegExp(`\\b(${[
  'police say', 'suspect', 'suspects', 'killed', 'kills', 'killing', 'dead', 'die', 'dies', 'died', 'death', 'deaths', 'fatal',
  'fatally', 'fentanyl', 'overdose', 'overdoses', 'rape', 'raped', 'gunman', 'gunfire', 'shot', 'stabbed', 'victim',
  'victims', 'kidnapped', 'kidnapping', 'sexual assault', 'sex abuse', 'sexual abuse', 'trafficking',
  'republican', 'republicans', 'gop', 'maga', 'trump', 'biden',
].join('|')})\\b`, 'i');
// Letters and opinion pieces are not news about the place.
const OPINION = /^\s*(letters?|opinion|commentary|editorial|column)\s*:/i;
// Across <State>: only a state outlet's stories about what touches a home. A word list, no model.
const HOME_WORDS = new RegExp(`\\b(${[
  'property taxe?s?', 'tax(es)? on (homes?|property)', 'levy', 'levies', 'assessments?', 'insurance', 'insurers?',
  'premiums?', 'housing', 'homes?', 'homeowners?', 'rent', 'rents', 'renters?', 'tenants?', 'landlords?', 'eviction',
  'evictions', 'mortgages?', 'utility', 'utilities', 'electric', 'electricity', 'power bills?', 'rates?',
  'water bills?', 'roads?', 'highways?', 'tolls?', 'bridges?', 'transportation', 'gas tax', 'schools?',
  'school districts?', 'wildfires?', 'fires?', 'floods?', 'flooding', 'drought', 'storms?',
].join('|')})\\b`, 'i');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–' };
function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The outlet's headline. Google News ends a title with " - Outlet"; the fetcher removes most of those, and what it
// leaves (a lower-case site name) goes here, since the outlet shows on its own line.
function headline(row, outlet) {
  let text = plainText(row.raw_title);
  if (outlet) text = text.replace(new RegExp(`\\s+[-–—|]\\s+${escapeRegExp(outlet)}$`, 'i'), '').trim();
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;
}

// The outlet's own summary of a feed story, as plain text, at most 220 characters cut at a word. Feeds' boilerplate
// ("The post … appeared first on …", "Continue reading") is left out, and a summary that only repeats the headline
// is no summary.
function outletSummary(row, title) {
  let text = plainText(row.raw_body)
    .replace(/\s*The post .{1,300}? appeared first on .{1,120}?\.?\s*$/i, '')
    .replace(/\s*(continue reading|read more|read the full story)\b.*$/i, '')
    .replace(/\s*\[(…|\.\.\.)\]\s*$/, '')
    .trim();
  if (!text || text.length < 25) return null;
  const bare = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (bare(text).startsWith(bare(title))) {
    text = text.slice(title.length).replace(/^[\s.:–—-]+/, '');
    if (text.length < 25) return null;
  }
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  const cut = text.slice(0, MAX_SUMMARY_LENGTH - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(' '), 120)).replace(/[\s,;:.–—-]+$/, '');
  return `${atWord}…`;
}

// Only a web link leaves this service.
function webLink(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostName(link) {
  if (!link) return null;
  return new URL(link).hostname.replace(/^www\./, '') || null;
}

// The kind of source a row came from: 'rss', 'google_news', 'wildfire', 'roadwork', 'ical', …
function kindOf(row) {
  return String(row.source || '').split(':')[0];
}

// Who published it. Google News names the outlet in its summary (<font>Outlet</font>); a feed's items carry the feed's
// own name; anything else is named for the site its link opens.
function outletName(row, link, source) {
  const kind = kindOf(row);
  if (kind === 'google_news') {
    const named = /<font[^>]*>([^<]{2,80})<\/font>/i.exec(row.raw_body || '');
    return (named && plainText(named[1])) || 'Google News';
  }
  if (kind === 'seasonal') return 'Pantopus';
  if (kind === 'on_this_day') return 'Wikipedia';
  if (kind === 'usgs_earthquakes') return 'USGS';
  if (kind === 'wildfire') return 'National Interagency Fire Center';
  if (kind === 'fema') return 'FEMA';
  if (kind === 'roadwork') return roadAgency(row.source);
  return source?.display_name || hostName(link) || null;
}

function titleKey(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// The words that say a story is about this region: its city and its county.
function placeWords(region) {
  const city = String(region?.display_name || '').split(',')[0].replace(/\s+metro$/i, '').trim();
  const county = String(region?.county_name || '').trim();
  return [...new Set([city, county, county.replace(/\s+county$/i, ' County')].filter((word) => word.length >= 3))]
    .map((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i'));
}

function dayIn(at, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'America/Los_Angeles' }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

/**
 * The sections for a page. `rows` come in the order they should show (the nearest region's first, newest first within
 * a region); `sources` maps a source id to its seeder_sources row (display_name, keep_hours, access, source_type);
 * `regions` are the page's regions, nearest first.
 */
function buildSections(rows, sources, regions = [], now = Date.now()) {
  const regionIndex = new Map(regions.map((region, index) => [region.region, index]));
  const regionById = new Map(regions.map((region) => [region.region, region]));
  const words = new Map(regions.map((region) => [region.region, placeWords(region)]));
  const nearest = regions[0];
  // Across <State> reads the nearest region's own state outlet; no state outlet's story is a local headline.
  const nearestOutlet = nearest?.state ? `rss:state_${nearest.state.toLowerCase()}` : null;
  const seen = new Set();
  const sections = [];
  for (const spec of SECTIONS) {
    const candidates = [];
    const taken = new Set();
    for (const row of rows) {
      const kind = kindOf(row);
      const source = sources.get(row.source);
      const facts = { category: row.category, kind, stateOutlet: String(row.source || '').startsWith('rss:state_') };
      if (spec.id === 'across_state' && row.source !== nearestOutlet) continue;
      if (!spec.takes(facts)) continue;
      const seenAt = Date.parse(row.fetched_at);
      const keepHours = Number(source?.keep_hours) > 0 ? Number(source.keep_hours)
        : (kind === 'ical' ? CALENDAR_KEEP_HOURS : spec.hours);
      if (!Number.isFinite(seenAt) || now - seenAt > keepHours * HOUR_MS) continue;
      const link = webLink(row.source_url);
      // A headline with nowhere to read it is left out; a seasonal tip is its own text.
      if (!link && row.category !== 'seasonal') continue;
      const outlet = outletName(row, link, source);
      const title = headline(row, outlet);
      if (!title || (!FEED_KINDS.has(kind) && (LEFT_OUT.test(title) || OPINION.test(title)))) continue;
      if (spec.id === 'across_state' && !HOME_WORDS.test(title)) continue;
      const key = titleKey(title);
      // A story is one link; road projects, fires and calendar events can share one, so they are told apart by title.
      const linkKey = OWN_LINK_KINDS.has(kind) ? null : link;
      if (seen.has(key) || taken.has(key) || (linkKey && (seen.has(linkKey) || taken.has(linkKey)))) continue;
      taken.add(key);
      if (linkKey) taken.add(linkKey);
      const summary = BODY_LINE_KINDS.has(kind) ? outletSummary(row, title) : null;
      const subscription = String(source?.access || '').toLowerCase() === 'subscription';
      const region = regionById.get(row.region);
      const ownTown = (words.get(row.region) || []).some((word) => word.test(title) || (summary && word.test(summary)));
      candidates.push({
        id: row.id,
        title,
        source: outlet && subscription ? `${outlet} (subscription)` : outlet,
        url: link,
        seen_at: new Date(Date.parse(row.created_at) || seenAt).toISOString(),
        ...(summary ? { summary } : {}),
        _key: key,
        _link: linkKey,
        _kind: kind,
        _outlet: outlet,
        _region: regionIndex.get(row.region) ?? 0,
        _own: ownTown,
        _day: dayIn(Date.parse(row.created_at) || seenAt, region?.timezone),
        _free: !subscription,
        _starts: Date.parse(row.scheduled_for) || Infinity,
        _order: candidates.length,
      });
    }
    // Headlines: the region's own town first, then the day it was first seen, free outlets before subscription ones
    // within a day; otherwise the order the rows came in.
    if (spec.id === 'headlines') {
      candidates.sort((a, b) => (a._region - b._region) || (Number(b._own) - Number(a._own))
        || (a._day === b._day ? 0 : (a._day < b._day ? 1 : -1)) || (Number(b._free) - Number(a._free))
        || (a._order - b._order));
    }
    // Events: soonest first (a calendar row carries its start in scheduled_for); others keep the order they came in.
    if (spec.id === 'events') candidates.sort((a, b) => (a._starts - b._starts) || (a._order - b._order));
    // First what fits with each outlet held to its share, then the rest in order if there is room. In Headlines each
    // of the nearest region's outlets gets an equal share first, so a weekly paper's story is not pushed off by a
    // daily's newer ones while it is still within its keep window.
    let share = MAX_PER_OUTLET;
    if (spec.id === 'headlines') {
      const nearOutlets = new Set(candidates.filter((item) => item._region === 0).map((item) => item._outlet));
      if (nearOutlets.size) share = Math.min(MAX_PER_OUTLET, Math.max(1, Math.ceil(spec.max / nearOutlets.size)));
    }
    const perOutlet = new Map();
    const items = [];
    const held = [];
    for (const item of candidates) {
      const count = perOutlet.get(item._outlet) || 0;
      const firstPass = spec.id !== 'headlines' || item._region === 0;
      if (firstPass && count < share && items.length < spec.max) {
        perOutlet.set(item._outlet, count + 1);
        items.push(item);
      } else {
        held.push(item);
      }
    }
    items.push(...held.slice(0, Math.max(spec.max - items.length, 0)));
    for (const item of items) {
      seen.add(item._key);
      if (item._link) seen.add(item._link);
    }
    if (!items.length) continue;
    const title = spec.id === 'across_state'
      ? `Across ${stateName(nearest?.state) || 'the state'}` : spec.title;
    sections.push({ id: spec.id, title, items });
  }
  return sections;
}

// "weather alerts, wildfire within 50 miles and earthquakes" style list of what was really checked for a region.
function checkedList(region, sources, checked) {
  const has = (type) => [...sources.values()].some((source) => source.region === region.region
    && source.source_type === type && source.active !== false);
  const facts = checked?.regions?.[region.region] || {};
  return [
    has('nws_alerts') && 'weather alerts',
    facts.wildfire && 'wildfire within 50 miles',
    has('usgs_earthquakes') && 'earthquakes',
    facts.fema && 'federal disaster notices',
    facts.roads && 'state road projects',
  ].filter(Boolean);
}

/**
 * The On watch card: one a day for the nearest region, only when Alerts, Roads, Headlines and Events hold two rows or
 * fewer between them, listing only what was really checked there. No link.
 */
function onWatch(sections, regions, sources, checked, now = Date.now()) {
  const region = regions[0];
  if (!region) return null;
  const busy = sections.filter((section) => QUIET_SECTIONS.includes(section.id))
    .reduce((count, section) => count + section.items.length, 0);
  if (busy > QUIET_AT_MOST) return null;
  const list = checkedList(region, sources, checked);
  if (!list.length) return null;
  const city = String(region.display_name || '').split(',')[0].replace(/\s+metro$/i, '').trim() || 'here';
  const day = dayIn(now, region.timezone);
  return {
    id: 'on_watch',
    title: 'On watch',
    items: [{
      id: `on_watch:${region.region}:${day}`,
      title: `Nothing to report around ${city} today. Checked: ${list.join(', ')}.`,
      source: 'Pantopus',
      url: null,
      seen_at: new Date(Date.parse(`${day}T00:00:00Z`) || now).toISOString(),
      _kind: 'on_watch',
      _region: 0,
    }],
  };
}

// Items as the apps receive them: no internal fields.
function publicItem(item) {
  return Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith('_')));
}

module.exports = {
  SECTIONS,
  CATEGORIES,
  LONGEST_HOURS,
  GOOGLE_IN_HEADLINES,
  buildSections,
  onWatch,
  outletSummary,
  publicItem,
  kindOf,
  plainText,
  webLink,
  HOME_WORDS,
};
