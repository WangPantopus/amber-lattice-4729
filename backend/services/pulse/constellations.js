'use strict';

// Pulse, reinvented, phase 4: curiosity constellations near you (coord CONTRACT 9c). Within 5 miles of the reader's
// place (sent in a POST body, never kept): Retake challenges, sky archives (Convergence pieces), field specimens (kept
// field cards) and solved local answers. Only what the reader may already open, each checked by today's reads, and each
// placed at the point the reader's own answer holds (LEAD-3 08:12).

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { haversineMeters } = require('../../utils/trustState');
const eyesOn = require('./eyesOn');
const retake = require('./retake');
const convergence = require('./convergence');

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const feedService = () => require('../feedService');

const RADIUS_M = 5 * 1609.344;
const PAD_DEG = 0.09;
const EACH = 20;
const READ = 300;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function placeOf(body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (body?.latitude == null || body?.longitude == null || !(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) {
    throw fail(400, 'CONSTELLATIONS_INVALID', 'Send where you are as latitude and longitude.');
  }
  return { latitude, longitude };
}

const inBox = (query, here, column = '') => {
  const lngPad = PAD_DEG / Math.max(0.2, Math.cos((here.latitude * Math.PI) / 180));
  return query.gte(`${column}latitude`, here.latitude - PAD_DEG).lte(`${column}latitude`, here.latitude + PAD_DEG)
    .gte(`${column}longitude`, here.longitude - lngPad).lte(`${column}longitude`, here.longitude + lngPad);
};
const near = (here, p) => p && p.latitude != null && p.longitude != null
  && haversineMeters(here.latitude, here.longitude, p.latitude, p.longitude) <= RADIUS_M;
const newest = (a, b) => Date.parse(b.at) - Date.parse(a.at);

async function rows(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load ${what}: ${error.message}`);
  return data || [];
}

/** Moments the reader may be shown in a list (live, or kept as posts that stay), with their answers, by id. */
async function shownMoments(all, viewerId) {
  const store = momentStore();
  const byId = new Map(all.map((r) => [r.id, r]));
  const list = [...byId.values()].filter((r) => !r.archived_at && r.moderation_state === 'live');
  if (!list.length) return new Map();
  await store.markOwn(list, viewerId);
  const [ctx, reported] = await Promise.all([
    store.viewerContext(viewerId, list.map((r) => r.user_id), null, list), store.reportedIds(viewerId)]);
  const shown = list.filter((row) => {
    const own = store.isOwn(row, viewerId);
    if (!own && !(store.canSee(row, ctx) && store.listedFor(row, viewerId) && !reported.has(row.id))) return false;
    return store.momentState(row) === 'live' || Boolean(store.meta(row).kept_post_at);
  });
  const answers = await store.serializeMoments(shown, viewerId, { keptPosts: true });
  return new Map(shown.map((row, i) => [row.id, { row, moment: answers[i] }]).filter(([, v]) => v.moment));
}

const cardNames = (cards) => [...new Set(Object.values(cards && typeof cards === 'object' ? cards : {})
  .map((card) => card?.name).filter((name) => typeof name === 'string' && name))];

/** POST /api/reinvented/constellations for `user` (CONTRACT 9c). */
async function constellationsFor(user, body) {
  const here = placeOf(body);
  const userId = user.id;
  const store = momentStore();
  const moments = () => inBox(supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .is('archived_at', null).eq('moderation_state', 'live'), here);
  const [starts, skies, specimenMoments, studioCards, solved, eyes] = await Promise.all([
    rows(moments().not('post_metadata->moment->retake->>title', 'is', null).order('created_at', { ascending: false }).limit(READ), 'Retakes'),
    rows(moments().not('post_metadata->moment->convergence->>id', 'is', null).order('created_at', { ascending: false }).limit(READ), 'sky pieces'),
    rows(moments().not('post_metadata->moment->cards', 'is', null).order('created_at', { ascending: false }).limit(READ), 'field cards'),
    rows(inBox(supabaseAdmin.from('PostStudio').select('post_id, studio, post:Post!inner(id, latitude, longitude, created_at)')
      .not('studio->cards', 'is', null), here, 'post.').limit(READ), "posts' field cards"),
    rows(inBox(supabaseAdmin.from('Post').select('id').eq('post_type', 'ask_local').eq('state', 'solved').is('archived_at', null)
      .not('is_story', 'is', true), here).order('created_at', { ascending: false }).limit(READ), 'solved Asks'),
    eyesOn.openAsks({ box: here }).catch((error) => {
      logger.warn('reinvented.constellations_eyes_failed', { error: error.message });
      return [];
    }),
  ]);
  const eyeCounts = await eyesOn.answerCounts(eyes.map((r) => r.post_id));
  const answeredEyes = eyes.filter((r) => (eyeCounts.get(r.post_id) || 0) > 0);
  const cardsByPost = new Map(studioCards.map((r) => [r.post_id, cardNames(r.studio?.cards)]).filter(([, names]) => names.length));
  const postIds = [...new Set([...cardsByPost.keys(), ...solved.map((r) => r.id), ...answeredEyes.map((r) => r.post_id)])];
  const [shown, posts] = await Promise.all([
    shownMoments([...starts, ...skies, ...specimenMoments], userId),
    postIds.length ? feedService().getPlaceMapPostsByIds({ userId, ids: postIds }) : [],
  ]);
  const postById = new Map(posts.map((p) => [p.id, p]).filter(([, p]) => near(here, p)));
  const at = (id) => ({ ...(shown.get(id)?.moment || {}) });
  const nearMoment = (id) => shown.has(id) && near(here, at(id));

  // Retake challenges: their starts, with the frames this reader may see.
  const retakeRows = starts.filter((r) => nearMoment(r.id)).map((r) => shown.get(r.id).row);
  const summaries = retakeRows.length ? await retake.summariesFor(retakeRows, userId) : new Map();
  const retakes = retakeRows.map((row) => {
    const m = at(row.id);
    return { id: row.id, title: store.meta(row).retake.title, frames: summaries.get(row.id)?.frames ?? 1, at: m.created_at, latitude: m.latitude, longitude: m.longitude };
  }).sort(newest).slice(0, EACH);

  // Sky archives: the Convergence pieces, one entry per window, at its newest piece.
  const windows = new Map();
  for (const row of skies.filter((r) => nearMoment(r.id))) {
    const c = store.meta(row).convergence;
    const m = at(row.id);
    const entry = windows.get(c.id) || { id: c.id, kind: c.kind, title: convergence.answerOf(store.meta(row))?.title || null, pieces: 0, day: c.day, at: m.created_at, latitude: m.latitude, longitude: m.longitude };
    entry.pieces += 1;
    if (Date.parse(m.created_at) > Date.parse(entry.at)) Object.assign(entry, { at: m.created_at, latitude: m.latitude, longitude: m.longitude });
    windows.set(c.id, entry);
  }

  // Field specimens: Moments and posts with kept field cards, with the cards' names.
  const specimens = [
    ...specimenMoments.filter((r) => nearMoment(r.id)).map((row) => {
      const m = at(row.id);
      return { type: 'moment', id: row.id, names: cardNames(store.meta(row).cards), at: m.created_at, latitude: m.latitude, longitude: m.longitude };
    }),
    ...[...cardsByPost.entries()].filter(([id]) => postById.has(id)).map(([id, names]) => {
      const p = postById.get(id);
      return { type: 'post', id, names, at: p.created_at, latitude: p.latitude, longitude: p.longitude };
    }),
  ].filter((s) => s.names.length).sort(newest).slice(0, EACH);

  // Solved local answers: today's Asks marked solved, and Eyes-on Asks with at least one answer.
  const answers = [
    ...solved.filter((r) => postById.has(r.id)).map((r) => {
      const p = postById.get(r.id);
      return { id: p.id, question: String(p.content || '').slice(0, 280), answers: Number(p.comment_count) || 0, at: p.created_at, latitude: p.latitude, longitude: p.longitude };
    }),
    ...answeredEyes.filter((r) => postById.has(r.post_id)).map((r) => {
      const p = postById.get(r.post_id);
      return { id: p.id, question: String(p.content || '').slice(0, 280), answers: eyeCounts.get(r.post_id) || 0, at: p.created_at, latitude: p.latitude, longitude: p.longitude };
    }),
  ].sort(newest).slice(0, EACH);

  return { retakes, skies: [...windows.values()].sort(newest).slice(0, EACH), specimens, answers };
}

module.exports = { constellationsFor, RADIUS_M };
