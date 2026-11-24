/**
 * Around you: the second half of Today (founder decision 2026-11-14).
 *
 * Local headlines for the place Today shows, read straight from the list the content fetcher already fills every two
 * hours (`seeder_content_queue`): each item is the outlet's own headline, the outlet's name and a link to the story at
 * the outlet. Nothing is rewritten and no Claude call is made. While this is on, the curator
 * account's posts stay out of the Pulse list and map (services/feedService.js).
 *
 * Each item is also a real post (founder, the same evening: people react with emojis and reply in threads, as on
 * Pulse): the region's curator account posts the outlet's headline, with the outlet's name and the link in
 * post_metadata (source_name, source_url), and the apps draw it with the Pulse card. A post carries the story's own
 * pictures as the curator's Pulse posts did (founder, 2026-11-15): the links the fetcher kept from the outlet's feed,
 * shown from the outlet's own address, never copied; a post made before that gets them on the next read. These posts carry no Pulse
 * distribution target, so the Pulse list and map never read them, whatever the switch says; they show only here, on
 * their own post page and in a person's saved posts. A post's id is derived from its queue row's id, so two reads at
 * once make one post, and a post moderation removed stays removed.
 *
 * The everywhere layer (AROUNDFEEDS, 2026-11-24): the worker's feeds job (jobs/aroundYouFeeds.js) adds wildfires,
 * federal disaster notices, road projects and calendar events to the same list; the page rules (sections, the outlet's
 * own summary, subscription outlets, the region's own town first, Across <State>, On watch) are in
 * services/aroundYou/sections.js. A status row (a fire, a project, a notice) keeps one post whose text follows the
 * row's title; every other post stays as it was made (changeFor says what little follows its item). A read that returns sections is counted (around_you_opened, at
 * most once an hour per person, counts only).
 *
 * Topics and scrolling back (founder, 2026-11-24): every item the rules let through becomes a post, not only the few
 * the first page has room for, and each post carries its region and its topics (post_metadata.around_you). The posts
 * are the history: the lists behind the first page (a topic's, "Talked about", Earlier) page back through them for as
 * long as there are any (services/aroundYou/lists.js), and the worker's hourly job keeps the history whole for regions
 * nobody opened (`archivePass`). The first page's answer keeps its shape for the apps already out, and adds `lists`
 * (the chips to offer) and, on each post with replies, `conversation` (who replied and the latest reply).
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
const {
  CATEGORIES, LONGEST_HOURS, buildSections, onWatch, publicItem, webLink,
} = require('./aroundYou/sections');
const { readChecked } = require('./aroundYou/checked');
const { TOPICS, ALL, TALKED, LISTS } = require('./aroundYou/topics');
const {
  PAGE_SIZE, chunks, decodeCursor, archiveIds, talkedIds, listFacts, conversations,
} = require('./aroundYou/lists');
const { recordFunnelEvent } = require('./funnelEvents');

const HOUR_MS = 3_600_000;
const CACHE_TTL_MS = 300_000;
// A page whose posts could not be made is tried again sooner; until then the apps draw its plain rows.
const RETRY_TTL_MS = 30_000;
const DEFAULT_RADIUS_M = 25_000;
// The nearest regions that cover the point; a place between two metros reads both.
const MAX_REGIONS = 2;
const MAX_ROWS = 400;
// The hourly history pass reads this many of the fetcher's rows at most, newest first.
const MAX_ARCHIVE_ROWS = 5000;
const QUEUE_COLUMNS = 'id, source, source_url, raw_title, raw_body, region, category, fetched_at, created_at, scheduled_for, media_urls, media_types, outlet_tags';
const SOURCE_COLUMNS = 'source_id, source_type, display_name, region, active, keep_hours, access, topic';
// What the fetcher's filter let through. An item the poster set aside for another reason than age stays out.
const SHOWN_STATUSES = 'status.in.(queued,humanized,posted,failed),and(status.eq.skipped,failure_reason.eq.stale)';
// The fetcher keeps at most four pictures for a story; a link longer than this is not one a card should load.
const MAX_PICTURES = 4;
const MAX_PICTURE_LINK_LENGTH = 2048;
// Rows whose post text follows the row: a fire's acres, a project's dates, a notice's help.
const STATUS_KINDS = new Set(['wildfire', 'fema', 'roadwork']);
// Around you is counted at most once an hour per person (per server process).
const OPEN_COUNT_MS = HOUR_MS;

const EMPTY = Object.freeze({ available: false, area: null, sections: [] });

let regionsCache = { rows: null, expires: 0 };
// The page for a set of regions is the same for everyone: region ids -> { page, expires }. What a viewer sees of its
// posts (their own reaction, a post they hid) is added for each read (withPosts).
const pageCache = new Map();
const pageBuilds = new Map(); // region ids -> the read in flight, so one process builds a page once
const lastCounted = new Map(); // user id -> when their open was last counted

async function activeRegions() {
  const now = Date.now();
  if (regionsCache.rows && now < regionsCache.expires) return regionsCache.rows;
  const { data, error } = await supabaseAdmin
    .from('seeder_config')
    .select('region, lat, lng, radius_meters, display_name, curator_user_id, timezone, state, county_name, provisioned_by')
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

// The story's own pictures, as the fetcher kept them from the outlet's feed (media_urls, with media_types beside
// them): secure web links to images only, so every app can load them.
function pictures(row) {
  const types = Array.isArray(row.media_types) ? row.media_types : [];
  return (Array.isArray(row.media_urls) ? row.media_urls : [])
    .filter((link, index) => (types[index] || 'image') === 'image' && typeof link === 'string'
      && link.length <= MAX_PICTURE_LINK_LENGTH && webLink(link)?.startsWith('https://'))
    .slice(0, MAX_PICTURES);
}

// The post for a queue row: the same id for the same row on every server, so a post is made once (POST /api/posts'
// replies derive their ids the same way).
function postIdFor(itemId) {
  const hex = createHash('sha256').update(`pantopus:around-you-post:v1:${String(itemId).toLowerCase()}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// A post's text: the headline, and the outlet's own summary on the next line. Every app draws a post's text; the
// iPhone and Android cards draw a `title` on one line and the text in 2 lines beside a title or 3 without one, so the
// summary goes in the text after a single line break (a blank line would use up the third line), never in `title`.
function postText(item) {
  return item.summary ? `${item.title}\n${item.summary}` : item.title;
}

// What a post says about its item: the fetcher's row, the section that took it, its region and its topics, and
// whether it is a story (a story stays listed after it leaves the first page). The lists read posts by these.
function aroundFacts(item, sectionId, regionId) {
  return {
    item: item.id,
    section: sectionId,
    ...(regionId ? { region: regionId } : {}),
    topics: item._topics || [],
    ...(item._story ? { story: true } : {}),
  };
}

// An item as a post by its region's curator account: the outlet's headline as written, its name and link in the
// metadata, the story's pictures, no place. Visible to anyone signed in (visibility public), listed nowhere but here (no
// distribution target), and off the curator's profile. Its time is when the fetcher first saw the story.
function postRow(item, sectionId, curatorUserId, localProfileId, itemPictures = [], regionId = null) {
  return {
    id: item.post_id,
    user_id: curatorUserId,
    author_user_id: curatorUserId,
    identity_context_type: 'local',
    identity_context_id: localProfileId || null,
    title: null,
    content: postText(item),
    media_urls: itemPictures,
    media_types: itemPictures.map(() => 'image'),
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
      around_you: aroundFacts(item, sectionId, regionId),
    },
    created_at: item.seen_at,
    updated_at: item.seen_at,
  };
}

// The posts already made for these rows: id → { id, content, post_metadata, media_urls }.
async function madePosts(ids) {
  const answers = await Promise.all(chunks(ids).map((batch) => supabaseAdmin.from('Post')
    .select('id, content, post_metadata, media_urls').in('id', batch)));
  const failed = answers.find((answer) => answer.error);
  if (failed) throw failed.error;
  return new Map(answers.flatMap((answer) => answer.data || []).map((post) => [post.id, post]));
}

function sameList(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

// What a made post takes from its item where the item says something the post doesn't yet: a status row's text (a
// fire's acres, a project's dates); the outlet's summary for a story post made before posts carried one (its text is
// still the bare headline); the outlet's name and link when they changed (an outlet marked a subscription since, a
// fire's page moved); the region, topics and story mark for a post made before the lists; and its pictures for one
// made before posts carried them. Reactions and replies stay; nothing else about a post changes.
function changeFor(now, { post, status, headline }) {
  const change = {};
  if (status ? now.content !== post.content : (post.content !== headline && now.content === headline)) {
    change.content = post.content;
  }
  const metadata = { ...(now.post_metadata || {}) };
  let moved = false;
  for (const key of ['source_name', 'source_url']) {
    const value = post.post_metadata[key];
    if (value && metadata[key] && metadata[key] !== value) {
      metadata[key] = value;
      moved = true;
    }
  }
  const wanted = post.post_metadata.around_you;
  const kept = metadata.around_you || {};
  if (kept.region !== wanted.region || !sameList(kept.topics, wanted.topics) || Boolean(kept.story) !== Boolean(wanted.story)) {
    // The section a post was made under stays: it is where people first saw it.
    metadata.around_you = { ...wanted, item: kept.item || wanted.item, section: kept.section || wanted.section };
    moved = true;
  }
  if (moved) change.post_metadata = metadata;
  if (post.media_urls.length && !(now.media_urls || []).length) {
    change.media_urls = post.media_urls;
    change.media_types = post.media_types;
  }
  return Object.keys(change).length ? change : null;
}

// Makes the posts these sections' items don't have yet, and lets the ones they have follow their items (changeFor).
// One that exists, or was removed by moderation, is otherwise left as it is.
async function makePosts(sections, regionOfItem, regions, picturesOfItem) {
  const curatorOf = new Map(regions.map((region) => [region.region, region.curator_user_id]));
  const curatorIds = [...new Set([...curatorOf.values()].filter(Boolean))];
  const { data: profiles } = curatorIds.length
    ? await supabaseAdmin.from('LocalProfile').select('id, user_id').in('user_id', curatorIds)
    : { data: [] };
  const profileOf = new Map((profiles || []).map((row) => [String(row.user_id), row.id]));
  const wanted = sections.flatMap((section) => section.items.flatMap((item) => {
    const regionId = regionOfItem.get(item.id);
    const curator = curatorOf.get(regionId);
    if (!curator) return [];
    const post = postRow(item, section.id, curator, profileOf.get(String(curator)), picturesOfItem.get(item.id), regionId);
    return [{ post, status: STATUS_KINDS.has(item._kind), headline: item.title }];
  }));
  if (!wanted.length) return;
  const made = await madePosts(wanted.map(({ post }) => post.id));
  const missing = wanted.filter(({ post }) => !made.has(post.id)).map(({ post }) => post);
  for (const batch of chunks(missing, 200)) {
    const { error } = await supabaseAdmin.from('Post').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }
  // A failure here leaves the change for the next read: a post without its newest words is still the post.
  const updates = wanted.flatMap((row) => {
    const now = made.get(row.post.id);
    const change = now && changeFor(now, row);
    return change ? [{ id: row.post.id, change }] : [];
  });
  for (const batch of chunks(updates, 20)) {
    const results = await Promise.all(batch.map(({ id, change }) => supabaseAdmin.from('Post')
      .update(change).eq('id', id).eq('origin', 'curator')));
    const failed = results.find((result) => result.error);
    if (failed) {
      logger.warn('Around you posts could not follow their items', { error: failed.error.message });
      return;
    }
  }
}

// Each section's items with the id of the post each has or will have.
function withPostIds(sections) {
  return sections
    .map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, post_id: postIdFor(item.id) })) }));
}

// A source's row by its id: the nearer region's row speaks where two regions carry the same source.
function sourcesById(rows, regionIds) {
  const kept = new Map();
  for (const row of rows || []) {
    const before = kept.get(row.source_id);
    if (!before || regionIds.indexOf(row.region) < regionIds.indexOf(before.region)) kept.set(row.source_id, row);
  }
  return kept;
}

async function readPage(regions) {
  const regionIds = regions.map((region) => region.region);
  const since = new Date(Date.now() - LONGEST_HOURS * HOUR_MS).toISOString();
  const [queue, sources, checked] = await Promise.all([
    supabaseAdmin
      .from('seeder_content_queue')
      .select(QUEUE_COLUMNS)
      .in('region', regionIds)
      .in('category', CATEGORIES)
      .eq('scope', 'local')
      .or(SHOWN_STATUSES)
      .gte('fetched_at', since)
      .order('fetched_at', { ascending: false })
      .limit(MAX_ROWS),
    supabaseAdmin.from('seeder_sources').select(SOURCE_COLUMNS).in('region', regionIds),
    readChecked(),
  ]);
  if (queue.error) throw queue.error;
  if (sources.error) logger.warn('Around you sources could not be read', { error: sources.error.message });
  // A source's name, keep window, access and topic are niceties: without the table's answer an item is named for
  // its site.
  const sourceRows = sourcesById(sources.data, regionIds);
  // The nearest region's items first, newest first within a region: a place between two metros reads its own news
  // before the next one's.
  const order = new Map(regionIds.map((id, index) => [id, index]));
  const rows = (queue.data || [])
    .map((row, index) => ({ row, index }))
    .sort((x, y) => (order.get(x.row.region) - order.get(y.row.region))
      || (Date.parse(y.row.fetched_at) - Date.parse(x.row.fetched_at)) || (x.index - y.index))
    .map(({ row }) => row);
  const now = Date.now();
  const built = buildSections(rows, sourceRows, regions, now);
  // Everything the rules let through, not only what the first page has room for: each becomes a post, so a topic's
  // list and Earlier have it.
  const everything = buildSections(rows, sourceRows, regions, now, { everything: true });
  const watch = onWatch(built, regions, new Map((sources.data || []).map((row) => [`${row.region}|${row.source_id}`, row])),
    checked);
  if (watch) {
    built.push(watch);
    everything.push(watch);
  }
  const sections = withPostIds(built);
  if (!sections.length) return EMPTY;
  const all = withPostIds(everything);
  const regionOfItem = new Map(rows.map((row) => [row.id, row.region]));
  if (watch) regionOfItem.set(watch.items[0].id, regions[0].region);
  let postsReady = true;
  try {
    await makePosts(all, regionOfItem, regions, new Map(rows.map((row) => [row.id, pictures(row)])));
  } catch (err) {
    postsReady = false;
    logger.warn('Around you posts could not be made', { error: err.message });
  }
  // The lists behind the first page are the nearest region's own: a place between two metros reads its own county's
  // history, not the next city's interleaved with it (the first page still fills up from the next region).
  const listRegionIds = regionIds.slice(0, 1);
  // What the chips can offer: the topics of what is listed now and of the last month's stories.
  const facts = postsReady
    ? await listFacts(listRegionIds, regionIds, now).catch((err) => {
      logger.warn('Around you lists could not be read', { error: err.message });
      return { topics: new Set(), talked: false };
    })
    : { topics: new Set(), talked: false };
  const topicsNow = new Set([...facts.topics, ...all.flatMap((section) => section.items
    .flatMap((item) => (item._region === 0 || section.id === 'events' ? item._topics || [] : [])))]);
  return {
    available: true,
    area: regions[0].display_name || null,
    sections: sections.map((section) => ({ ...section, items: section.items.map(publicItem) })),
    postsReady,
    handMade: regions[0].provisioned_by === 'manual',
    regionIds,
    listRegionIds,
    // The posts on the first page (Earlier leaves them out) and the coming events, soonest first.
    shownIds: sections.flatMap((section) => section.items.map((item) => item.post_id)),
    eventIds: (all.find((section) => section.id === 'events')?.items || []).map((item) => item.post_id),
    lists: [
      { id: ALL, title: 'All' },
      ...(facts.talked ? [{ id: TALKED, title: 'Talked about' }] : []),
      ...TOPICS.filter((topic) => topicsNow.has(topic.id)),
    ],
  };
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

// These posts in the feed's shape, as `viewerId` sees them, by id: their own reaction and saves, the counts as they
// are now, the reply preview, and none they hid or whose author they blocked. A post removed by moderation is left out.
async function readPosts(ids, viewerId) {
  if (!ids.length) return new Map();
  const [answers, filters] = await Promise.all([
    Promise.all(chunks(ids).map((batch) => supabaseAdmin.from('Post').select(FEED_POST_SELECT).in('id', batch)
      .eq('moderation_state', 'live').is('archived_at', null).not('is_story', 'is', true))),
    viewerId ? getMuteAndHideFilters(viewerId).catch(() => null) : null,
  ]);
  const failed = answers.find((answer) => answer.error);
  if (failed) throw failed.error;
  const shown = answers.flatMap((answer) => answer.data || []).map((row) => normalizeFeedPostRow(row))
    .filter((post) => !filters || (!filters.hiddenPostIds.has(post.id) && !filters.blockedUserIds.has(post.user_id)));
  const hiddenPeople = new Set([...(filters?.blockedUserIds || []), ...(filters?.mutedUserIds || [])]);
  const [posts, talk] = await Promise.all([
    enrichFeedPosts(shown, viewerId),
    // A card without its preview is still the card.
    conversations(shown, hiddenPeople).catch((err) => {
      logger.warn('Around you reply previews could not be read', { error: err.message });
      return new Map();
    }),
  ]);
  return new Map(posts.map((post) => [post.id, talk.has(post.id) ? { ...post, conversation: talk.get(post.id) } : post]));
}

// The first page with each section's posts, and the lists the chips offer.
async function withPosts(page, viewerId) {
  if (!page.postsReady) return rowsOnly(page);
  try {
    const byId = await readPosts(page.shownIds, viewerId);
    return {
      available: true,
      area: page.area,
      sections: page.sections.map((section) => ({
        ...section,
        posts: section.items.map((item) => byId.get(item.post_id)).filter(Boolean),
      })),
      lists: page.lists,
    };
  } catch (err) {
    logger.warn('Around you posts could not be read', { error: err.message });
    return rowsOnly(page);
  }
}

// One page of a list behind the first page: { available, area, lists, list, posts, next }. `next` continues it
// (null at its end). Earlier ('all') is every story that is not on the first page, newest first; a topic's list is
// its stories, newest first (Events: what is coming, soonest first); 'talked' is what people replied or reacted to.
async function listPage(page, { list, before, viewerId }) {
  const answer = { available: true, area: page.area, lists: page.lists || [], list, posts: [], next: null };
  if (!page.postsReady) return answer;
  let ids = [];
  if (list === 'events') {
    const from = Math.max(0, Number.parseInt(String(before || '0'), 10) || 0);
    ids = page.eventIds.slice(from, from + PAGE_SIZE);
    if (from + PAGE_SIZE < page.eventIds.length) answer.next = String(from + PAGE_SIZE);
  } else if (list === TALKED) {
    // What people are talking about is the whole page's: an alert from the next region counts.
    ids = await talkedIds({ regionIds: page.regionIds });
  } else {
    const found = await archiveIds({
      regionIds: page.listRegionIds,
      want: list === ALL ? { story: true } : { topics: [list] },
      before: decodeCursor(before),
      excludeIds: list === ALL ? page.shownIds : [],
    });
    ids = found.ids;
    answer.next = found.next;
  }
  const byId = await readPosts(ids, viewerId);
  answer.posts = ids.map((id) => byId.get(id)).filter(Boolean);
  return answer;
}

// Counts an open of Around you that returned sections: at most once an hour per person in this process (a restart may
// count one open twice in that hour), counts only (no place, no item). Fire-and-forget: the read never waits on it.
function countOpen(userId, page) {
  if (!userId) return;
  const now = Date.now();
  if (now - (lastCounted.get(userId) || 0) < OPEN_COUNT_MS) return;
  if (lastCounted.size > 20_000) lastCounted.clear();
  lastCounted.set(userId, now);
  recordFunnelEvent('around_you_opened', {
    userId,
    meta: {
      sections: page.sections.length,
      rows: page.sections.reduce((count, section) => count + section.items.length, 0),
      hand_made: Boolean(page.handMade),
    },
  });
}

/**
 * The Around you page for a point, as `userId` sees it: { available, area, sections: [{ id, title, items: [{ id,
 * title, source, url, seen_at, summary?, post_id }], posts: [feed post] }], lists: [{ id, title }] }. `items` are the
 * first build's rows (apps from before the posts read only them); `posts` holds the same items as posts in the feed's
 * shape (GET /api/posts/feed), in the same order, and is left out when the posts could not be made or read, so the
 * apps draw the rows instead. A post people replied to carries `conversation` ({ people, latest }). `lists` are the
 * chips to offer over the page ('all' first; a topic only where the region has stories for it), each read by asking
 * again with `list` set: { available, area, lists, list, posts: [feed post], next }, where `next` goes back as
 * `before` for the page after (null at the list's end). `available` is false (and the apps show no switch) while the
 * feature is off, where no content region covers the point, and when the region has nothing to show. A failed read
 * answers the same way: Today's first half never waits on this.
 */
async function aroundYou({ latitude, longitude, userId = null, list = null, before = null }) {
  // A list's answer keeps its shape when there is nothing to give (off, no region, a failed read): no posts, no next.
  const nothing = list ? { ...EMPTY, lists: [], list, posts: [], next: null } : EMPTY;
  if (!aroundYouEnabled()) return nothing;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!hasUsableCoordinates(lat, lng)) return nothing;
  try {
    const regions = coveringRegions(await activeRegions(), lat, lng);
    if (!regions.length) return nothing;
    const page = await regionPage(regions);
    if (!page.available) return nothing;
    if (list) return await listPage(page, { list: LISTS.includes(list) ? list : ALL, before, viewerId: userId });
    countOpen(userId, page);
    return await withPosts(page, userId);
  } catch (err) {
    // The point stays out of the log.
    logger.warn('Around you could not be read', { error: err.message });
    return nothing;
  }
}

/**
 * What a route passes on from its request: which list (`list`) and where it continues (`before`), from the query of
 * a GET or the body of the area's POST. Anything else is the first page.
 */
function listQuery(input) {
  const list = typeof input?.list === 'string' && LISTS.includes(input.list) ? input.list : null;
  const before = typeof input?.before === 'string' && input.before.length <= 200 ? input.before : null;
  return list ? { list, before } : {};
}

/**
 * The history kept whole (the worker's hourly job, jobs/aroundYouFeeds.js): a post for every story the fetcher saw
 * in the last `sinceHours` in every active region, whether or not anyone opened Around you there while the story was
 * on the first page, and the region and topics on the posts made before the lists. Only stories: an alert, a road
 * project or an event is made when a page shows it. Returns how many regions and stories it looked at.
 */
async function archivePass({ sinceHours = 3 } = {}) {
  if (!aroundYouEnabled()) return { skipped: 'off' };
  const regions = await activeRegions();
  if (!regions.length) return { regions: 0, stories: 0 };
  const since = new Date(Date.now() - sinceHours * HOUR_MS).toISOString();
  const rows = [];
  for (let from = 0; from < MAX_ARCHIVE_ROWS; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('seeder_content_queue')
      .select(QUEUE_COLUMNS)
      .in('category', CATEGORIES)
      .eq('scope', 'local')
      .or(SHOWN_STATUSES)
      .gte('fetched_at', since)
      .order('fetched_at', { ascending: false })
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  if (!rows.length) return { regions: regions.length, stories: 0 };
  const { data: sources, error: sourcesError } = await supabaseAdmin.from('seeder_sources').select(SOURCE_COLUMNS);
  if (sourcesError) throw sourcesError;
  const byRegion = new Map();
  for (const row of rows) {
    if (!byRegion.has(row.region)) byRegion.set(row.region, []);
    byRegion.get(row.region).push(row);
  }
  let stories = 0;
  for (const region of regions) {
    const regionRows = byRegion.get(region.region);
    if (!regionRows) continue;
    const sourceRows = sourcesById((sources || []).filter((row) => row.region === region.region), [region.region]);
    const sections = withPostIds(buildSections(regionRows, sourceRows, [region], Date.now(), { everything: true, anyAge: true }));
    stories += sections.reduce((count, section) => count + section.items.length, 0);
    try {
      await makePosts(sections, new Map(regionRows.map((row) => [row.id, row.region])), [region],
        new Map(regionRows.map((row) => [row.id, pictures(row)])));
    } catch (err) {
      logger.warn('Around you history could not be kept for a region', { region: region.region, error: err.message });
    }
  }
  return { regions: byRegion.size, stories };
}

function resetAroundYouCache() {
  regionsCache = { rows: null, expires: 0 };
  pageCache.clear();
  lastCounted.clear();
}

module.exports = {
  aroundYou, archivePass, listQuery, resetAroundYouCache, buildSections, coveringRegions, postIdFor, pictures, EMPTY,
};
