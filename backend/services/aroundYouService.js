/**
 * Around you: the second half of Today (founder decision 2026-11-14).
 *
 * Local headlines for the place Today shows, read straight from the list the content fetcher already fills every two
 * hours (`seeder_content_queue`): each item is the outlet's own headline, the outlet's name and a link to the story at
 * the outlet. Nothing is rewritten, no photo is carried and nothing is posted to Pulse. While this is on, the curator
 * account's posts stay out of the Pulse list and map (services/feedService.js).
 *
 * Switch: AROUND_YOU ('1' on, '0' off). Unset, it is on for hosted staging (APP_ENV=staging) and off everywhere else.
 */

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { aroundYouEnabled } = require('../utils/featureFlags');
const { haversineM, hasUsableCoordinates } = require('./seederProvisioningService');

const HOUR_MS = 3_600_000;
const CACHE_TTL_MS = 300_000;
const DEFAULT_RADIUS_M = 25_000;
// The nearest regions that cover the point; a place between two metros reads both.
const MAX_REGIONS = 2;
const MAX_ROWS = 400;
const MAX_TITLE_LENGTH = 180;

// What a page can hold, in the order it shows. `hours` is how long an item stays after the fetcher first saw it.
const SECTIONS = [
  { id: 'alerts', title: 'Alerts', categories: ['earthquake'], hours: 24, max: 3 },
  { id: 'headlines', title: 'Headlines', categories: ['local_news'], hours: 48, max: 8 },
  { id: 'events', title: 'Events', categories: ['event'], hours: 72, max: 5 },
  { id: 'around_town', title: 'Around town', categories: ['community_resource'], hours: 168, max: 4 },
  { id: 'season', title: 'This season', categories: ['seasonal'], hours: 168, max: 1 },
  { id: 'history', title: 'On this day', categories: ['history'], hours: 24, max: 1 },
];
const CATEGORIES = [...new Set(SECTIONS.flatMap((section) => section.categories))];
const LONGEST_HOURS = Math.max(...SECTIONS.map((section) => section.hours));

// Sports is left out: a region's sports sources are mostly league-wide feeds and team searches (trades elsewhere,
// memorabilia listings), which do not read as local news. They keep feeding the Pulse Sports lane.
// No outlet fills a section while another has something to show.
const MAX_PER_OUTLET = 5;

// The fetcher's filter already drops crime, obituaries and party politics by a word list
// (pantopus-seeder/src/config/constants.py BLOCKLIST_TERMS). The same kinds of story under words that list misses
// stay off this page too; whole words only, headline only.
const LEFT_OUT = new RegExp(`\\b(${[
  'police say', 'suspect', 'suspects', 'killed', 'kills', 'killing', 'dead', 'dies', 'died', 'death', 'deaths', 'fatal',
  'fatally', 'fentanyl', 'overdose', 'overdoses', 'rape', 'raped', 'gunman', 'gunfire', 'shot', 'stabbed', 'victim',
  'victims', 'kidnapped', 'kidnapping', 'sexual assault', 'sex abuse', 'sexual abuse', 'trafficking',
  'republican', 'republicans', 'gop', 'maga', 'trump', 'biden',
].join('|')})\\b`, 'i');

const EMPTY = Object.freeze({ available: false, area: null, sections: [] });

let regionsCache = { rows: null, expires: 0 };
const pageCache = new Map(); // region ids -> { page, expires }

async function activeRegions() {
  const now = Date.now();
  if (regionsCache.rows && now < regionsCache.expires) return regionsCache.rows;
  const { data, error } = await supabaseAdmin
    .from('seeder_config')
    .select('region, lat, lng, radius_meters, display_name')
    .eq('active', true);
  if (error) throw error;
  regionsCache = { rows: data || [], expires: now + CACHE_TTL_MS };
  return regionsCache.rows;
}

// The regions whose circle holds the point, nearest first.
function coveringRegions(regions, latitude, longitude) {
  return regions
    .map((region) => ({ region, meters: haversineM(latitude, longitude, Number(region.lat), Number(region.lng)) }))
    .filter(({ region, meters }) => Number.isFinite(meters) && meters <= (region.radius_meters || DEFAULT_RADIUS_M))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, MAX_REGIONS)
    .map(({ region }) => region);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

// The outlet's headline. Google News ends a title with " - Outlet"; the fetcher removes most of those, and what it
// leaves (a lower-case site name) goes here, since the outlet shows on its own line.
function headline(row, outlet) {
  let text = plainText(row.raw_title);
  if (outlet) {
    const tail = new RegExp(`\\s+[-–—|]\\s+${outlet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    text = text.replace(tail, '').trim();
  }
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;
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
  const host = new URL(link).hostname.replace(/^www\./, '');
  return host || null;
}

// Who published it. Google News names the outlet in its summary (<font>Outlet</font>); a feed's items carry the feed's
// own name; anything else is named for the site its link opens.
function outletName(row, link, sourceNames) {
  const type = String(row.source || '').split(':')[0];
  if (type === 'google_news') {
    const named = /<font[^>]*>([^<]{2,80})<\/font>/i.exec(row.raw_body || '');
    return (named && plainText(named[1])) || 'Google News';
  }
  if (type === 'seasonal') return 'Pantopus';
  if (type === 'on_this_day') return 'Wikipedia';
  if (type === 'usgs_earthquakes') return 'USGS';
  return sourceNames.get(row.source) || hostName(link) || null;
}

function titleKey(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// `rows` come in the order they should show: the nearest region's first, newest first within a region.
function buildSections(rows, sourceNames, now = Date.now()) {
  const seen = new Set();
  const sections = [];
  for (const spec of SECTIONS) {
    const candidates = [];
    for (const row of rows) {
      if (!spec.categories.includes(row.category)) continue;
      const seenAt = Date.parse(row.fetched_at);
      if (!Number.isFinite(seenAt) || now - seenAt > spec.hours * HOUR_MS) continue;
      const link = webLink(row.source_url);
      // A headline with nowhere to read it is left out; a seasonal tip is its own text.
      if (!link && row.category !== 'seasonal') continue;
      const source = outletName(row, link, sourceNames);
      const title = headline(row, source);
      if (!title || LEFT_OUT.test(title)) continue;
      const key = titleKey(title);
      if (seen.has(key) || (link && seen.has(link))) continue;
      seen.add(key);
      if (link) seen.add(link);
      candidates.push({ id: row.id, title, source, url: link, seen_at: new Date(seenAt).toISOString() });
    }
    // First what fits with each outlet held to its share, then the rest in order if there is room.
    const perOutlet = new Map();
    const items = [];
    const held = [];
    for (const item of candidates) {
      const count = perOutlet.get(item.source) || 0;
      if (count < MAX_PER_OUTLET && items.length < spec.max) {
        perOutlet.set(item.source, count + 1);
        items.push(item);
      } else {
        held.push(item);
      }
    }
    items.push(...held.slice(0, Math.max(spec.max - items.length, 0)));
    if (items.length) sections.push({ id: spec.id, title: spec.title, items });
  }
  return sections;
}

async function readPage(regions) {
  const regionIds = regions.map((region) => region.region);
  const since = new Date(Date.now() - LONGEST_HOURS * HOUR_MS).toISOString();
  const [queue, sources] = await Promise.all([
    supabaseAdmin
      .from('seeder_content_queue')
      .select('id, source, source_url, raw_title, raw_body, region, category, fetched_at')
      .in('region', regionIds)
      .in('category', CATEGORIES)
      .eq('scope', 'local')
      // What the fetcher's filter let through. An item the poster set aside for another reason than age stays out.
      .or('status.in.(queued,humanized,posted,failed),and(status.eq.skipped,failure_reason.eq.stale)')
      .gte('fetched_at', since)
      .order('fetched_at', { ascending: false })
      .limit(MAX_ROWS),
    supabaseAdmin.from('seeder_sources').select('source_id, display_name').in('region', regionIds),
  ]);
  if (queue.error) throw queue.error;
  // A feed's name is a nicety: without the table's answer an item is named for its site.
  const sourceNames = new Map((sources.data || []).map((row) => [row.source_id, row.display_name]));
  // The nearest region's items first, newest first within a region: a place between two metros reads its own news
  // before the next one's.
  const order = new Map(regionIds.map((id, index) => [id, index]));
  const rows = (queue.data || [])
    .map((row, index) => ({ row, index }))
    .sort((x, y) => (order.get(x.row.region) - order.get(y.row.region))
      || (Date.parse(y.row.fetched_at) - Date.parse(x.row.fetched_at)) || (x.index - y.index))
    .map(({ row }) => row);
  const sections = buildSections(rows, sourceNames);
  if (!sections.length) return EMPTY;
  return { available: true, area: regions[0].display_name || null, sections };
}

/**
 * The Around you page for a point: { available, area, sections: [{ id, title, items: [{ id, title, source, url,
 * seen_at }] }] }. `available` is false (and the apps show no switch) while the feature is off, where no content
 * region covers the point, and when the region has nothing to show. A failed read answers the same way: Today's first
 * half never waits on this.
 */
async function aroundYou({ latitude, longitude }) {
  if (!aroundYouEnabled()) return EMPTY;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!hasUsableCoordinates(lat, lng)) return EMPTY;
  try {
    const regions = coveringRegions(await activeRegions(), lat, lng);
    if (!regions.length) return EMPTY;
    const key = regions.map((region) => region.region).join('|');
    const kept = pageCache.get(key);
    if (kept && Date.now() < kept.expires) return kept.page;
    const page = await readPage(regions);
    if (pageCache.size > 500) pageCache.clear();
    pageCache.set(key, { page, expires: Date.now() + CACHE_TTL_MS });
    return page;
  } catch (err) {
    // The point stays out of the log.
    logger.warn('Around you could not be read', { error: err.message });
    return EMPTY;
  }
}

function resetAroundYouCache() {
  regionsCache = { rows: null, expires: 0 };
  pageCache.clear();
}

module.exports = { aroundYou, resetAroundYouCache, buildSections, coveringRegions, EMPTY };
