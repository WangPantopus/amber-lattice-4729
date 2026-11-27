'use strict';

// Pulse, reinvented, phase 0 step 5: mentions in a caption (coord CONTRACT 7h; LEAD-3 2026-11-27 05:19). The caption
// keeps "@First Last" as plain words; the ids sent beside it are kept only for the author's connections, not blocked
// either way, who may see the post, and never under a made-up name (a mention says who the author knows). Nobody is
// told for now: no notice kind that exists today fits, and a new push kind waits for a notification settings row.

const blockService = require('../blockService');
const logger = require('../../utils/logger');

const MAX = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const play = () => require('./play');

/** The ids sent (`mentions`), or null when none were sent; throws an Error that says what is wrong. */
function parse(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > MAX || !value.every((id) => UUID.test(String(id)))) {
    throw new Error(`mentions must be a list of up to ${MAX} person ids.`);
  }
  return [...new Set(value.map((id) => String(id).toLowerCase()))];
}

/**
 * The mentioned people kept, in the order sent: the author's connections, not blocked either way, for whom
 * `maySee(personId)` holds. None under a made-up name.
 */
async function keep(ids, authorId, { penName = false, maySee }) {
  if (!ids?.length || penName) return [];
  const store = momentStore();
  const [connections, blocked] = await Promise.all([store.connectionIds(authorId), blockService.blockedUserIds(authorId)]);
  const linked = new Set(connections.map(String));
  const candidates = ids.filter((id) => id !== String(authorId).toLowerCase() && linked.has(id) && !blocked.has(id));
  const seeing = await Promise.all(candidates.map((id) => Promise.resolve(maySee(id)).catch((error) => {
    logger.warn('mentions.may_see_failed', { error: error.message });
    return false;
  })));
  return candidates.filter((_, index) => seeing[index]);
}

/** Whether `personId` may see a Moment like `row` (today's rules: audience, blocks, mutes), for `keep`'s `maySee`. */
async function maySeeMoment(row, personId) {
  const store = momentStore();
  const ctx = await store.viewerContext(personId, [row.user_id]);
  return store.canSee(row, ctx);
}

/**
 * The mentioned people as `viewerId` reads them, by row id: [<Author>] in the order kept, without people the reader has
 * blocked or muted, or who blocked the reader. `listOf(row)` gives a row's kept ids.
 */
async function shownFor(rows, viewerId, listOf) {
  const out = new Map();
  const withAny = (rows || []).filter((row) => listOf(row)?.length);
  if (!withAny.length) return out;
  const store = momentStore();
  const [authors, hidden] = await Promise.all([
    store.loadAuthors(withAny.flatMap((row) => listOf(row))),
    play().hiddenPeople(viewerId),
  ]);
  for (const row of withAny) {
    out.set(row.id, listOf(row).filter((id) => !hidden.has(String(id)) && authors.has(String(id))).map((id) => authors.get(String(id))));
  }
  return out;
}

// ─── A mentioned person's own mentions (CONTRACT 7h; LEAD-3, forty-ninth pass) ─────────────────────────────────────

const supabaseAdmin = require('../../config/supabaseAdmin');

const PAGE = 20;
const READ = 200;
const without = (list, id) => (Array.isArray(list) ? list.filter((x) => String(x) !== String(id)) : list);

/**
 * GET /mentions for `viewerId`: the Moments and Studio posts that mention them and that they may see now, newest first.
 * A Moment through canSee, listedFor and reports, live or kept; a post as their Place map shows it.
 */
async function mentionsOf(viewerId, cursor = null) {
  const store = momentStore();
  const before = cursor && Number.isFinite(Date.parse(cursor)) ? new Date(cursor).toISOString() : null;
  const has = JSON.stringify([String(viewerId)]);
  let moments = supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true).is('archived_at', null)
    .eq('moderation_state', 'live').filter('post_metadata->moment->mentions', 'cs', has).order('created_at', { ascending: false }).limit(READ);
  let posts = supabaseAdmin.from('PostStudio').select('post_id, created_at').filter('studio->mentions', 'cs', has)
    .order('created_at', { ascending: false }).limit(READ);
  if (before) {
    moments = moments.lt('created_at', before);
    posts = posts.lt('created_at', before);
  }
  const [m, p] = await Promise.all([moments, posts]);
  if (m.error) throw new Error(`Failed to load your mentions: ${m.error.message}`);
  if (p.error) throw new Error(`Failed to load your mentions: ${p.error.message}`);
  const rows = m.data || [];
  let shownMoments = [];
  if (rows.length) {
    await store.markOwn(rows, viewerId);
    const [ctx, reported] = await Promise.all([store.viewerContext(viewerId, rows.map((r) => r.user_id), null, rows), store.reportedIds(viewerId)]);
    const shown = rows.filter((row) => store.canSee(row, ctx) && store.listedFor(row, viewerId) && !reported.has(row.id)
      && (store.momentState(row) === 'live' || Boolean(store.meta(row).kept_post_at)));
    shownMoments = (await store.serializeMoments(shown, viewerId, { keptPosts: true })).filter(Boolean);
  }
  const postIds = (p.data || []).map((r) => r.post_id);
  // eslint-disable-next-line global-require
  const shownPosts = postIds.length ? await require('../feedService').getPlaceMapPostsByIds({ userId: viewerId, ids: postIds }) : [];
  const all = [
    ...shownMoments.map((moment) => ({ type: 'moment', id: moment.id, at: moment.created_at, moment })),
    ...shownPosts.map(({ distance_meters: _d, ...post }) => ({ type: 'post', id: post.id, at: post.created_at, post })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const page = all.slice(0, PAGE);
  const more = all.length > PAGE || rows.length >= READ || postIds.length >= READ;
  return { mentions: page, next_cursor: more && page.length ? page[page.length - 1].at : null };
}

/** DELETE /mentions/:id: takes `viewerId`'s own mention off a Moment or a Studio post, and only theirs. Says nothing either way. */
async function removeMine(viewerId, id) {
  if (!UUID.test(String(id || ''))) return;
  const store = momentStore();
  const row = await store.loadMoment(id).catch(() => null);
  if (row && Array.isArray(store.meta(row).mentions) && store.meta(row).mentions.map(String).includes(String(viewerId))) {
    await store.changeMoment(row, (m) => (Array.isArray(m.mentions) && m.mentions.map(String).includes(String(viewerId))
      ? { mentions: without(m.mentions, viewerId) } : null));
    return;
  }
  const { data, error } = await supabaseAdmin.from('PostStudio').select('studio').eq('post_id', id).maybeSingle();
  if (error) throw new Error(`Failed to read the post: ${error.message}`);
  if (!data || !Array.isArray(data.studio?.mentions) || !data.studio.mentions.map(String).includes(String(viewerId))) return;
  // eslint-disable-next-line global-require
  await require('./postStudio').changeStudio(id, data.studio, (studio) => (Array.isArray(studio.mentions)
    && studio.mentions.map(String).includes(String(viewerId)) ? { mentions: without(studio.mentions, viewerId) } : null));
}

module.exports = { parse, keep, maySeeMoment, shownFor, mentionsOf, removeMine, MAX };
