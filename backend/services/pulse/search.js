'use strict';

// Pulse, reinvented, phase 4: Ask the map and Atlas search (coord CONTRACT 9b). The search index (searchIndex.js) finds
// candidates by plain words; every one is checked again by today's reads (a Moment through canSee, listedFor, reports
// and the reader's own answer; a post through the Place map's own chain by id) and answered as those reads answer it, so
// its place is always the one the reader's own answer holds (LEAD-3 08:12). The words come in a POST body and are never
// logged or kept.

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const parsePostGISPoint = require('../../utils/parsePostGISPoint');

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const feedService = () => require('../feedService');

const MAP_LIMIT = 200;
const ATLAS_PAGE = 20;
const ATLAS_READ = 60;
const PLACE_MILES = 3;
const MILE_DEG = 1 / 69;
const MAX_WORDS = 6;
const ANSWER_KINDS = ['poll', 'slider', 'board', 'question', 'guess'];

const STOP = new Set(['a', 'an', 'and', 'are', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'i', 'in', 'is', 'it',
  'me', 'my', 'near', 'of', 'on', 'or', 'our', 'so', 'the', 'their', 'there', 'this', 'to', 'was', 'we', 'what', 'where',
  'who', 'with', 'you', 'your', 'any', 'some', 'good', 'best', 'place', 'spot', 'find', 'show']);

// Close words: a word asked also finds these (a short fixed list, no model call; CONTRACT 9a).
const CLOSE = [
  ['cafe', 'coffee', 'coffeehouse', 'espresso', 'latte'],
  ['study', 'library', 'studying', 'homework'],
  ['cozy', 'warm', 'snug', 'quiet'],
  ['trail', 'path', 'hike', 'hiking', 'walk'],
  ['park', 'playground', 'meadow'],
  ['lake', 'pond'],
  ['river', 'creek', 'stream'],
  ['beach', 'shore'],
  ['view', 'viewpoint', 'overlook', 'vista'],
  ['sunset', 'sundown', 'dusk'],
  ['sunrise', 'dawn'],
  ['snow', 'snowy', 'flurries'],
  ['rain', 'rainy', 'drizzle'],
  ['fog', 'foggy', 'mist'],
  ['flower', 'bloom', 'blossom'],
  ['tree', 'forest', 'woods'],
  ['mushroom', 'fungus', 'fungi'],
  ['bird', 'birding'],
  ['dog', 'puppy'],
  ['kid', 'kids', 'children', 'family'],
  ['food', 'restaurant', 'lunch', 'dinner', 'breakfast', 'brunch'],
  ['bar', 'pub', 'brewery', 'beer'],
  ['market', 'farmers', 'produce'],
  ['music', 'concert', 'band'],
  ['art', 'mural', 'gallery'],
  ['game', 'match', 'soccer', 'football', 'baseball', 'basketball'],
  ['bike', 'bicycle', 'cycling'],
];
const CLOSE_OF = new Map();
for (const group of CLOSE) for (const word of group) CLOSE_OF.set(word, group);

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * The words asked, each with its close words, as to_tsquery groups the database function takes. Only letters and
 * digits reach the database, so nothing in `q` can change the query.
 */
function groupsOf(q) {
  const text = typeof q === 'string' ? q.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
  if (text.trim().length < 2 || text.length > 100) throw fail(400, 'SEARCH_INVALID', 'Say what you are looking for in 2 to 100 characters.');
  const words = [...new Set(text.match(/[\p{L}\p{N}]+/gu) || [])].filter((w) => w.length >= 2 && w.length <= 30 && !STOP.has(w)).slice(0, MAX_WORDS);
  if (!words.length) throw fail(400, 'SEARCH_INVALID', 'Say what you are looking for.');
  return {
    words,
    // A word of 5 letters or more also finds longer ones ("mushro" finds mushroom); a short one only itself, so "fir"
    // never finds "first".
    groups: words.map((word) => [...new Set([word, ...(CLOSE_OF.get(word) || [])])]
      .map((w) => (w.length >= 5 ? `${w}:*` : w)).join(' | ')),
  };
}

async function candidates(viewerId, groups, filters) {
  const { data, error } = await supabaseAdmin.rpc('pulse_search_candidates', { p_viewer: viewerId, p_groups: groups, ...filters });
  // The database's own message may repeat the words asked: only its code is kept.
  if (error) throw new Error(`Failed to search (${error.code || 'db'})`);
  return data || [];
}

const inBox = (p, box) => p && p.latitude != null && p.longitude != null
  && p.latitude >= box.south && p.latitude <= box.north && p.longitude >= box.west && p.longitude <= box.east;

/**
 * These Moments as the reader may be shown them in a list, with each one's own answer: [{ row, moment }]. `keep(row,
 * own)` says which states the caller lists (live, kept). A Moment the reader can't see, one a list never shows them (a
 * live guess spot, an unopened relic), or one they reported is left out.
 */
async function shownMoments(ids, viewerId, keep, { keptEnded = false } = {}) {
  if (!ids.length) return [];
  const store = momentStore();
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).in('id', ids.slice(0, 500))
    .eq('is_story', true).is('archived_at', null).eq('moderation_state', 'live');
  if (error) throw new Error(`Failed to load Moments: ${error.message}`);
  const rows = data || [];
  if (!rows.length) return [];
  await store.markOwn(rows, viewerId);
  const [ctx, reported] = await Promise.all([
    store.viewerContext(viewerId, rows.map((r) => r.user_id), null, rows), store.reportedIds(viewerId)]);
  const shown = rows.filter((row) => {
    const own = store.isOwn(row, viewerId);
    if (!own && !(store.canSee(row, ctx) && store.listedFor(row, viewerId) && !reported.has(row.id))) return false;
    return keep(row, own);
  });
  const moments = await store.serializeMoments(shown, viewerId, { keptPosts: true, keptEnded });
  return shown.map((row, i) => ({ row, moment: moments[i] })).filter(({ moment }) => moment);
}

/** These posts as the reader's Place map shows them (its own chain, by id), by id. */
async function shownPosts(ids, viewerId) {
  if (!ids.length) return new Map();
  const posts = await feedService().getPlaceMapPostsByIds({ userId: viewerId, ids });
  return new Map(posts.map((post) => {
    const { distance_meters: _distance, ...shown } = post;
    return [post.id, shown];
  }));
}

/**
 * POST /api/reinvented/map/ask for `user` (CONTRACT 9b): the ids of what the reader's map shows in `box` for `time`
 * whose words match, most words matched first. Plans are not searched; the forward times have nothing to match.
 */
async function askMap(user, { q, box, time = 'live' }) {
  const { words, groups } = groupsOf(q);
  // eslint-disable-next-line global-require
  const map = require('./map');
  if (map.FORWARD.includes(time)) return { matches: [], more: false };
  const userId = user.id;
  const since = map.backSince(time, box);
  const back = map.BACK.includes(time);
  const found = await candidates(userId, groups, {
    p_south: box.south, p_west: box.west, p_north: box.north, p_east: box.east, p_order: 'matched', p_limit: MAP_LIMIT + 1,
  });
  const more = found.length > MAP_LIMIT;
  const page = found.slice(0, MAP_LIMIT);
  const store = momentStore();
  const recent = (at) => since == null || Date.parse(at) >= since;
  // What the map shows for this time (6b): Live, the live Moments and the kept ones that ended; back, the reader's own
  // Moments of the window and the kept ones (others' only once ended or kept), all within the window.
  const keep = (row, own) => {
    const state = store.momentState(row);
    const kept = Boolean(store.meta(row).kept_post_at);
    if (!recent(store.shownAt(row))) return false;
    if (!back) return state === 'live' || (state === 'ended' && kept);
    return (own && state === 'live') || (kept && (state === 'ended' || !own));
  };
  const [moments, posts] = await Promise.all([
    shownMoments(page.filter((c) => c.kind === 'moment').map((c) => c.post_id), userId, keep),
    shownPosts(page.filter((c) => c.kind === 'post').map((c) => c.post_id), userId),
  ]);
  const shownIds = new Set([
    ...moments.filter(({ moment }) => inBox(moment, box)).map(({ row }) => row.id),
    ...[...posts.values()].filter((post) => inBox(post, box) && recent(post.created_at)).map((post) => post.id),
  ]);
  return {
    matches: page.filter((c) => shownIds.has(c.post_id)).map((c) => ({
      type: c.kind, id: c.post_id, words: (c.groups || []).map((i) => words[i - 1]).filter(Boolean),
    })),
    more,
  };
}

/** The reader's own places for "Your places": their homes, and the place today's reads take as theirs. */
async function placesOf(userId) {
  const places = [];
  try {
    // eslint-disable-next-line global-require
    const { householdHomeIds } = require('../../utils/homeMailAccess');
    const homeIds = await householdHomeIds(userId);
    if (homeIds.length) {
      const { data } = await supabaseAdmin.from('Home').select('id, location').in('id', homeIds.slice(0, 10));
      for (const home of data || []) {
        const point = parsePostGISPoint(home.location);
        if (point) places.push({ ...point, label: 'Near home' });
      }
    }
    if (!places.length) {
      // eslint-disable-next-line global-require
      const { resolveLocation } = require('../context/locationResolver');
      const own = await resolveLocation(userId);
      if (own?.latitude != null && own?.longitude != null) places.push({ latitude: own.latitude, longitude: own.longitude, label: own.label ? `Near ${own.label}` : 'Near you' });
    }
  } catch (error) {
    logger.warn('reinvented.search_places_failed', { error: error.message });
  }
  return places.slice(0, 5);
}

function boxAround({ latitude, longitude }, miles) {
  const dLat = miles * MILE_DEG;
  const dLng = dLat / Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  return { p_south: latitude - dLat, p_north: latitude + dLat, p_west: longitude - dLng, p_east: longitude + dLng };
}

const stemOf = (w) => w.replace(/(ies|es|s|ing|ed)$/u, '') || w;

/** The reader's own collected cards whose words match (7f's field guide entries), newest first, before `before`. */
async function guideMatches(userId, words, before) {
  let query = supabaseAdmin.from('PostAnswer').select('post_id, value, created_at').eq('user_id', userId).eq('kind', 'collect')
    .order('created_at', { ascending: false }).limit(300);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load the field guide: ${error.message}`);
  const wanted = words.flatMap((w) => [w, ...(CLOSE_OF.get(w) || [])]).map(stemOf).filter((w) => w.length >= 2);
  return (data || []).filter((row) => !row.value?.deck).filter((row) => {
    const said = `${row.value?.name || ''} ${row.value?.scientific || ''}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const tokens = (said.match(/[\p{L}\p{N}]+/gu) || []).map(stemOf);
    return tokens.some((t) => wanted.some((w) => t.startsWith(w) || (t.length >= 4 && w.startsWith(t))));
  }).slice(0, ATLAS_READ);
}

/**
 * POST /api/reinvented/atlas/search for `userId` (CONTRACT 9b): newest first, 20 a page, across what is the reader's,
 * what people they know made, what is near their places, and what they learned and answered.
 */
async function atlasSearch(userId, { q, cursor = null }) {
  const { words, groups } = groupsOf(q);
  const before = cursor && Number.isFinite(Date.parse(cursor)) ? new Date(cursor).toISOString() : null;
  const store = momentStore();
  const newest = { p_order: 'newest', p_limit: ATLAS_READ, p_before: before };
  const [people, places, answered] = await Promise.all([
    store.connectionIds(userId),
    placesOf(userId),
    supabaseAdmin.from('PostAnswer').select('post_id').eq('user_id', userId).in('kind', ANSWER_KINDS)
      .order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => (error ? [] : [...new Set((data || []).map((r) => r.post_id))])),
  ]);
  const [mine, theirs, near, answers, cards] = await Promise.all([
    candidates(userId, groups, { ...newest, p_user_ids: [userId] }),
    people.length ? candidates(userId, groups, { ...newest, p_user_ids: people.slice(0, 1000) }) : [],
    Promise.all(places.map((place) => candidates(userId, groups, { ...newest, ...boxAround(place, PLACE_MILES) })
      .then((rows) => rows.map((row) => ({ ...row, why: place.label }))))).then((lists) => lists.flat()),
    answered.length ? candidates(userId, groups, { ...newest, p_post_ids: answered }) : [],
    guideMatches(userId, words, before),
  ]);
  // One entry per post, the reason in this order: yours, you answered, someone you know, near your place.
  const byId = new Map();
  const add = (rows, why) => {
    for (const row of rows) if (!byId.has(row.post_id)) byId.set(row.post_id, { ...row, why: why || row.why });
  };
  add(mine, 'Yours');
  add(answers, 'You answered');
  add(theirs, 'people');
  add(near, null);
  const found = [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, ATLAS_READ);
  const keep = (row, own) => {
    const m = store.meta(row);
    if (own) return store.momentState(row) === 'live' || Boolean(m.kept) || Boolean(m.kept_post_at);
    return store.momentState(row) === 'live' || Boolean(m.kept_post_at);
  };
  const [moments, posts, openCards] = await Promise.all([
    shownMoments(found.filter((c) => c.kind === 'moment').map((c) => c.post_id), userId, keep, { keptEnded: true }),
    shownPosts(found.filter((c) => c.kind === 'post').map((c) => c.post_id), userId),
    // eslint-disable-next-line global-require
    Promise.all(cards.map((row) => require('./play').reach(row.post_id, userId).then(() => true, () => false))),
  ]);
  const momentById = new Map(moments.map(({ row, moment }) => [row.id, moment]));
  const results = [];
  for (const c of found) {
    const moment = momentById.get(c.post_id);
    const post = posts.get(c.post_id);
    if (!moment && !post) continue;
    let { why } = c;
    if (why === 'people') {
      const author = moment?.author || post?.creator || null;
      const first = String(author?.first_name || author?.name || author?.displayName || '').trim().split(/\s+/)[0];
      why = first ? `From ${first}` : 'From someone you know';
    }
    results.push(moment
      ? { type: 'moment', id: c.post_id, at: c.at, why, moment }
      : { type: 'post', id: c.post_id, at: c.at, why, post });
  }
  cards.forEach((row, i) => results.push({
    type: 'card', id: `${row.post_id}:${row.value?.dot || ''}`, at: row.created_at, why: 'In your field guide',
    card: {
      post_id: row.post_id, dot_id: row.value?.dot || null, collected_at: row.created_at,
      card: {
        name: row.value?.name || null, scientific: row.value?.scientific || null, why: row.value?.why || null,
        source: row.value?.source || null, caution: row.value?.caution || null, likely: true,
      },
      open: openCards[i],
    },
  }));
  results.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const pageItems = results.slice(0, ATLAS_PAGE);
  const more = results.length > ATLAS_PAGE || found.length >= ATLAS_READ || cards.length >= ATLAS_READ;
  return { results: pageItems, next_cursor: more && pageItems.length ? pageItems[pageItems.length - 1].at : null };
}

module.exports = { askMap, atlasSearch, groupsOf, CLOSE };
