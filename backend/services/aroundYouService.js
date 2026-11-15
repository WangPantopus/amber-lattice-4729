/**
 * Around you: the second half of Today (founder decision 2026-11-14).
 *
 * Local headlines for the place Today shows, read straight from the list the content fetcher already fills every two
 * hours (`seeder_content_queue`): each item is the outlet's own headline, the outlet's name and a link to the story at
 * the outlet. Nothing is rewritten, no photo is carried and no Claude call is made. While this is on, the curator
 * account's posts stay out of the Pulse list and map (services/feedService.js).
 *
 * Each item is also a real post (founder, the same evening: people react with emojis and reply in threads, as on
 * Pulse): the region's curator account posts the outlet's headline, with the outlet's name and the link in
 * post_metadata (source_name, source_url), and the apps draw it with the Pulse card. These posts carry no Pulse
 * distribution target, so the Pulse list and map never read them, whatever the switch says; they show only here, on
 * their own post page and in a person's saved posts. A post's id is derived from its queue row's id, so two reads at
 * once make one post, and a post moderation removed stays removed.
 *
 * Switch: AROUND_YOU ('1' on, '0' off). Unset, it is on for hosted staging (APP_ENV=staging) and off everywhere else.
 * Nothing is read or posted while it is off.
 */

const { createHash } = require('crypto');
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { aroundYouEnabled } = require('../utils/featureFlags');
const { haversineM, hasUsableCoordinates } = require('./seederProvisioningService');
const {
  FEED_POST_SELECT, normalizeFeedPostRow, enrichFeedPosts, getMuteAndHideFilters,
} = require('./feedService');

const HOUR_MS = 3_600_000;
const CACHE_TTL_MS = 300_000;
// A page whose posts could not be made is tried again sooner; until then the apps draw its plain rows.
const RETRY_TTL_MS = 30_000;
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
  'police say', 'suspect', 'suspects', 'killed', 'kills', 'killing', 'dead', 'die', 'dies', 'died', 'death', 'deaths', 'fatal',
  'fatally', 'fentanyl', 'overdose', 'overdoses', 'rape', 'raped', 'gunman', 'gunfire', 'shot', 'stabbed', 'victim',
  'victims', 'kidnapped', 'kidnapping', 'sexual assault', 'sex abuse', 'sexual abuse', 'trafficking',
  'republican', 'republicans', 'gop', 'maga', 'trump', 'biden',
].join('|')})\\b`, 'i');

const EMPTY = Object.freeze({ available: false, area: null, sections: [] });

let regionsCache = { rows: null, expires: 0 };
// The page for a set of regions is the same for everyone: region ids -> { page, expires }. What a viewer sees of its
// posts (their own reaction, a post they hid) is added for each read (withPosts).
const pageCache = new Map();
const pageBuilds = new Map(); // region ids -> the read in flight, so one process builds a page once

async function activeRegions() {
  const now = Date.now();
  if (regionsCache.rows && now < regionsCache.expires) return regionsCache.rows;
  const { data, error } = await supabaseAdmin
    .from('seeder_config')
    .select('region, lat, lng, radius_meters, display_name, curator_user_id')
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

// The post for a queue row: the same id for the same row on every server, so a post is made once (POST /api/posts'
// replies derive their ids the same way).
function postIdFor(itemId) {
  const hex = createHash('sha256').update(`pantopus:around-you-post:v1:${String(itemId).toLowerCase()}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// An item as a post by its region's curator account: the outlet's headline as written, its name and link in the
// metadata, no photo, no place. Visible to anyone signed in (visibility public), listed nowhere but here (no
// distribution target), and off the curator's profile. Its time is when the fetcher first saw the story.
function postRow(item, sectionId, curatorUserId, localProfileId) {
  return {
    id: item.post_id,
    user_id: curatorUserId,
    author_user_id: curatorUserId,
    identity_context_type: 'local',
    identity_context_id: localProfileId || null,
    title: null,
    content: item.title,
    media_urls: [],
    media_types: [],
    post_type: 'local_update',
    purpose: 'local_update',
    post_format: 'standard',
    post_as: 'personal',
    visibility: 'public',
    audience: 'nearby',
    distribution_targets: [],
    tags: [],
    show_on_profile: false,
    state: 'open',
    origin: 'curator',
    post_metadata: {
      ...(item.url ? { source_url: item.url } : {}),
      ...(item.source ? { source_name: item.source } : {}),
      around_you: { item: item.id, section: sectionId },
    },
    created_at: item.seen_at,
    updated_at: item.seen_at,
  };
}

// Makes the posts a page's items don't have yet; one that exists (or was removed by moderation) is left as it is.
async function makePosts(sections, regionOfItem, regions) {
  const curatorOf = new Map(regions.map((region) => [region.region, region.curator_user_id]));
  const curatorIds = [...new Set([...curatorOf.values()].filter(Boolean))];
  const { data: profiles } = curatorIds.length
    ? await supabaseAdmin.from('LocalProfile').select('id, user_id').in('user_id', curatorIds)
    : { data: [] };
  const profileOf = new Map((profiles || []).map((row) => [String(row.user_id), row.id]));
  const rows = sections.flatMap((section) => section.items.flatMap((item) => {
    const curator = curatorOf.get(regionOfItem.get(item.id));
    return curator ? [postRow(item, section.id, curator, profileOf.get(String(curator)))] : [];
  }));
  if (!rows.length) return;
  const { error } = await supabaseAdmin.from('Post').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
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
  const sections = buildSections(rows, sourceNames)
    .map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, post_id: postIdFor(item.id) })) }));
  if (!sections.length) return EMPTY;
  let postsReady = true;
  try {
    await makePosts(sections, new Map(rows.map((row) => [row.id, row.region])), regions);
  } catch (err) {
    postsReady = false;
    logger.warn('Around you posts could not be made', { error: err.message });
  }
  return { available: true, area: regions[0].display_name || null, sections, postsReady };
}

// The page for these regions, from the cache or read once however many ask at the same time.
function regionPage(regions) {
  const key = regions.map((region) => region.region).join('|');
  const kept = pageCache.get(key);
  if (kept && Date.now() < kept.expires) return Promise.resolve(kept.page);
  if (pageBuilds.has(key)) return pageBuilds.get(key);
  const build = readPage(regions).then((page) => {
    if (pageCache.size > 500) pageCache.clear();
    const ttl = page.available && !page.postsReady ? RETRY_TTL_MS : CACHE_TTL_MS;
    pageCache.set(key, { page, expires: Date.now() + ttl });
    return page;
  }).finally(() => pageBuilds.delete(key));
  pageBuilds.set(key, build);
  return build;
}

// Without its posts the page is the first build's rows, which every app still draws.
function rowsOnly(page) {
  return { available: true, area: page.area, sections: page.sections };
}

// The page with each section's posts in the feed's shape, as `viewerId` sees them: their own reaction and saves, the
// counts as they are now, and none they hid or whose author they blocked. A post removed by moderation is left out.
async function withPosts(page, viewerId) {
  if (!page.postsReady) return rowsOnly(page);
  const ids = page.sections.flatMap((section) => section.items.map((item) => item.post_id));
  try {
    const [{ data, error }, filters] = await Promise.all([
      supabaseAdmin.from('Post').select(FEED_POST_SELECT).in('id', ids)
        .eq('moderation_state', 'live').is('archived_at', null).not('is_story', 'is', true),
      viewerId ? getMuteAndHideFilters(viewerId).catch(() => null) : null,
    ]);
    if (error) throw error;
    const shown = (data || []).map((row) => normalizeFeedPostRow(row))
      .filter((post) => !filters || (!filters.hiddenPostIds.has(post.id) && !filters.blockedUserIds.has(post.user_id)));
    const byId = new Map((await enrichFeedPosts(shown, viewerId)).map((post) => [post.id, post]));
    return {
      available: true,
      area: page.area,
      sections: page.sections.map((section) => ({
        ...section,
        posts: section.items.map((item) => byId.get(item.post_id)).filter(Boolean),
      })),
    };
  } catch (err) {
    logger.warn('Around you posts could not be read', { error: err.message });
    return rowsOnly(page);
  }
}

/**
 * The Around you page for a point, as `userId` sees it: { available, area, sections: [{ id, title, items: [{ id,
 * title, source, url, seen_at, post_id }], posts: [feed post] }] }. `items` are the first build's rows (apps from
 * before the posts read only them); `posts` holds the same items as posts in the feed's shape (GET /api/posts/feed),
 * in the same order, and is left out when the posts could not be made or read, so the apps draw the rows instead.
 * `available` is false (and the apps show no switch) while the feature is off, where no content region covers the
 * point, and when the region has nothing to show. A failed read answers the same way: Today's first half never waits
 * on this.
 */
async function aroundYou({ latitude, longitude, userId = null }) {
  if (!aroundYouEnabled()) return EMPTY;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!hasUsableCoordinates(lat, lng)) return EMPTY;
  try {
    const regions = coveringRegions(await activeRegions(), lat, lng);
    if (!regions.length) return EMPTY;
    const page = await regionPage(regions);
    if (!page.available) return EMPTY;
    return await withPosts(page, userId);
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

module.exports = { aroundYou, resetAroundYouCache, buildSections, coveringRegions, postIdFor, EMPTY };
