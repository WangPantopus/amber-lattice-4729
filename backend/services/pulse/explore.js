'use strict';

// Pulse, reinvented, phase 1: Explore (coord CONTRACT 6f, GET /api/reinvented/explore; PHASE-1 section 4, the rules on
// a page anyone can read). Only Moments and Studio posts their authors chose for Explore ("Also show in Explore", kept
// at posting as `post_metadata.moment.explore`, or in PostStudio's `explore`, with its town), only what the reader may
// see (a Moment through momentStore's canSee, reports and listing rules; a post through the Place map's own rules,
// feedService.getPlaceMapPostsByIds), never the reader's own and never from the reader's own town.
//
// "Today, elsewhere": up to ten, by how many different people gave each a reaction or a signal in the last 24 hours
// (people, never watch time), at most one per author and two per town. Then the rest, newest first, never two in a
// row from one author or one town where the page allows it. Each says why it is there.

const supabaseAdmin = require('../../config/supabaseAdmin');
const store = require('../moments/momentStore');
const momentGuess = require('../moments/momentGuess');
const feedService = require('../feedService');
const postStudio = require('./postStudio');
const list = require('./list');
const logger = require('../../utils/logger');

const MAX_CANDIDATES = 2000;
const PICKED = 10;
const PAGE = 20;
const PER_AUTHOR = 1;
const PER_TOWN = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDS_PER_READ = 100;
// The newest Studio posts chosen for Explore that one read considers (the Place map's own read takes up to 500 ids).
const MAX_POST_CANDIDATES = 500;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * The live Moments chosen for Explore that `viewerId` may see, not their own, as
 * [{ type, id, authorKey, authorId, row, town, townKey, at }].
 */
async function candidates(viewerId) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT)
    .eq('is_story', true)
    .gt('story_expires_at', nowIso)
    .is('archived_at', null)
    .eq('moderation_state', 'live')
    .eq('post_metadata->moment->>state', 'live')
    .not('post_metadata->moment->explore', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES);
  if (error) throw new Error(`Failed to load Explore: ${error.message}`);
  const rows = (data || []).filter((row) => store.momentState(row) === 'live');
  if (!rows.length) return [];
  const [ctx, reported] = await Promise.all([
    store.viewerContext(viewerId, rows.map((row) => row.user_id), null, rows),
    store.reportedIds(viewerId),
  ]);
  return rows
    .filter((row) => !store.isOwn(row, viewerId) && store.canSee(row, ctx) && !reported.has(row.id)
      && store.listedFor(row, viewerId))
    .map((row) => {
      const point = store.displayedPoint(row);
      const town = store.meta(row).explore?.town || null;
      return {
        type: 'moment',
        id: row.id,
        authorKey: String(store.authorKey(row)),
        authorId: String(row.user_id),
        row,
        town,
        townKey: town ? `t:${town}` : (point.latitude == null ? null : momentGuess.gridKey(point.latitude, point.longitude)),
        at: Date.parse(store.shownAt(row)),
      };
    })
    .filter((item) => item.townKey);
}

/**
 * The Studio posts chosen for Explore that `viewerId`'s Place map would show (CONTRACT 6f), not their own, as
 * [{ type, id, authorKey, authorId, post, town, townKey, at }], `post` as the list carries it (with its stamps). A
 * failed read leaves the posts out and Explore lists the Moments.
 */
async function postCandidates(viewerId) {
  const { data, error } = await supabaseAdmin.from('PostStudio').select('post_id, studio')
    .not('studio->explore', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_POST_CANDIDATES);
  if (error) throw new Error(`Failed to load Explore's posts: ${error.message}`);
  const studios = new Map((data || []).map((row) => [row.post_id, row.studio]));
  if (!studios.size) return [];
  const posts = await feedService.getPlaceMapPostsByIds({ userId: viewerId, ids: [...studios.keys()] });
  return posts
    .filter((post) => String(post.user_id) !== String(viewerId) && post.latitude != null && post.longitude != null)
    .map((post) => {
      const studio = studios.get(post.id);
      const town = studio?.explore?.town || null;
      const { distance_meters: _distance, ...shown } = post;
      return {
        type: 'post',
        id: post.id,
        authorKey: String(post.user_id),
        authorId: String(post.user_id),
        post: { ...shown, stamps: postStudio.shownOf(studio) },
        town,
        townKey: town ? `t:${town}` : momentGuess.gridKey(post.latitude, post.longitude),
        at: Date.parse(post.created_at),
      };
    })
    .filter((item) => item.townKey && Number.isFinite(item.at));
}

/** How many different people (not the author) gave each one a reaction or a signal in the last 24 hours. */
async function peopleWhoMarked(items) {
  const counts = new Map();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const ids = items.map((item) => item.id);
  const authors = new Map(items.map((item) => [item.id, item.authorId]));
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await supabaseAdmin.from('PostLike').select('post_id, user_id')
      .in('post_id', ids.slice(i, i + IDS_PER_READ)).gte('created_at', since).limit(10000);
    if (error) throw new Error(`Failed to count Explore's marks: ${error.message}`);
    for (const like of data || []) {
      if (String(like.user_id) === authors.get(like.post_id)) continue;
      if (!counts.has(like.post_id)) counts.set(like.post_id, new Set());
      counts.get(like.post_id).add(String(like.user_id));
    }
  }
  return new Map([...counts].map(([id, people]) => [id, people.size]));
}

const newestFirst = (a, b) => (b.at - a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
const authorOf = (item) => item.authorKey;

/** "Today, elsewhere": up to ten by people who marked them, at most one per author and two per town. */
function pickToday(items, marked) {
  const ranked = items.filter((item) => (marked.get(item.id) || 0) > 0)
    .sort((a, b) => (marked.get(b.id) - marked.get(a.id)) || newestFirst(a, b));
  const byAuthor = new Map();
  const byTown = new Map();
  const picked = [];
  for (const item of ranked) {
    if (picked.length >= PICKED) break;
    if ((byAuthor.get(authorOf(item)) || 0) >= PER_AUTHOR || (byTown.get(item.townKey) || 0) >= PER_TOWN) continue;
    picked.push(item);
    byAuthor.set(authorOf(item), (byAuthor.get(authorOf(item)) || 0) + 1);
    byTown.set(item.townKey, (byTown.get(item.townKey) || 0) + 1);
  }
  return picked;
}

/** A page in newest-first order, reordered so no two in a row share an author or a town where the page allows it. */
function withVariety(page) {
  const left = [...page];
  const out = [];
  while (left.length) {
    const last = out[out.length - 1];
    const index = last ? left.findIndex((item) => authorOf(item) !== authorOf(last) && item.townKey !== last.townKey) : 0;
    out.push(...left.splice(index === -1 ? 0 : index, 1));
  }
  return out;
}

function encodeCursor(item) {
  return Buffer.from(JSON.stringify({ v: 1, at: item.at, id: item.id })).toString('base64url');
}

function decodeCursor(text) {
  if (text == null || text === '') return null;
  try {
    const state = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    if (state?.v === 1 && Number.isFinite(state.at) && UUID.test(String(state.id))) return state;
  } catch {
    // falls through
  }
  throw fail(400, 'INVALID_CURSOR', 'This list has changed. Pull to refresh.');
}

const below = (item, cursor) => !cursor || item.at < cursor.at || (item.at === cursor.at && item.id < cursor.id);

function pickedWhy(count) {
  return `Picked today: ${count} ${count === 1 ? 'person' : 'people'} marked it`;
}

/** GET /api/reinvented/explore for `userId` (CONTRACT 6f). */
async function exploreFor(userId, { latitude = null, longitude = null, cursor: cursorText = null } = {}) {
  const cursor = decodeCursor(cursorText);
  const [moments_, posts, place] = await Promise.all([
    candidates(userId),
    postCandidates(userId).catch((error) => {
      logger.warn('reinvented.explore_posts_failed', { error: error.message });
      return [];
    }),
    list.readerPlace(userId, latitude, longitude),
  ]);
  const all = [...moments_, ...posts];
  const readerTown = place ? await momentGuess.townKeyAt(place.latitude, place.longitude) : null;
  const elsewhere = all.filter((item) => item.townKey !== readerTown);
  const marked = elsewhere.length ? await peopleWhoMarked(elsewhere) : new Map();
  const picked = pickToday(elsewhere, marked);
  const pickedIds = new Set(picked.map((item) => item.id));
  const rest = elsewhere.filter((item) => !pickedIds.has(item.id)).sort(newestFirst).filter((item) => below(item, cursor));
  const pageItems = rest.slice(0, PAGE);
  const more = rest.length > PAGE;
  const shown = withVariety(pageItems);
  const firstPage = !cursor;
  const rows = [...(firstPage ? picked : []), ...shown].filter((item) => item.type === 'moment').map((item) => item.row);
  const moments = new Map((await store.serializeMoments(rows, userId)).map((moment) => [moment.id, moment]));
  const entry = (item, why) => {
    if (item.type === 'post') return { type: 'post', id: item.id, post: item.post, why };
    const moment = moments.get(item.id);
    return moment ? { type: 'moment', id: moment.id, moment, why } : null;
  };
  return {
    picked: firstPage ? picked.map((item) => entry(item, pickedWhy(marked.get(item.id)))).filter(Boolean) : null,
    items: shown.map((item) => entry(item, item.town ? `New from ${item.town}` : 'New elsewhere')).filter(Boolean),
    // The page's oldest Moment, so the next page starts below everything this one held, whatever its order.
    next_cursor: more ? encodeCursor(pageItems[pageItems.length - 1]) : null,
    pause: more ? 'Keep exploring?' : null,
  };
}

module.exports = { exploreFor };
