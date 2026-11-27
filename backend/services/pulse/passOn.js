'use strict';

// Pulse, reinvented, phase 3: passing on (coord CONTRACT 8f). A post travels when someone passes it on from where they
// are, and it says who carried it. A pass is today's quote post ("Repost with your words", `quoted_post_id`) that the
// Studio marks `studio.passed_on`, made from the passer's own place, so it reaches people around them through today's
// feed and rules. Its Studio row keeps `passed_on: { v: 1, from }`. No new table.

const supabaseAdmin = require('../../config/supabaseAdmin');
const penName = require('../penName');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * The checks a pass passes before it is posted (the quote itself is checked by today's route): a post someone else
 * wrote, under their own name and as a person, not at their home, passed once per person. Answers the original's id.
 */
async function check(userId, quotedPostId) {
  if (!UUID.test(String(quotedPostId || ''))) throw fail(400, 'PASS_INVALID', 'Pass on a post: send it as quotedPostId.');
  const { data: original, error } = await supabaseAdmin.from('Post')
    .select('id, user_id, is_story, identity_context_type, identity_context_id, latitude, longitude, archived_at')
    .eq('id', quotedPostId).maybeSingle();
  if (error) throw new Error(`Failed to load the post: ${error.message}`);
  if (!original || original.archived_at || original.is_story) throw fail(404, 'PASS_NOT_FOUND', "This post can't be passed on.");
  if (String(original.user_id) === String(userId)) throw fail(400, 'PASS_OWN', "You can't pass on your own post.");
  if (penName.isPenNameRow(original) || ['business', 'persona'].includes(original.identity_context_type)) {
    throw fail(400, 'PASS_INVALID', 'Only a person\'s own post can be passed on.');
  }
  if (original.latitude != null && original.longitude != null) {
    // eslint-disable-next-line global-require
    const atHome = await require('../moments/momentPlace').isAtHome(original.user_id, original.latitude, original.longitude, { onFailure: true });
    if (atHome) throw fail(400, 'PASS_INVALID', "A post made at someone's home stays with them.");
  }
  const { data: mine, error: mineError } = await supabaseAdmin.from('PostStudio')
    .select('post_id, post:Post!inner(user_id, archived_at)').eq('studio->passed_on->>from', original.id)
    .eq('post.user_id', userId).is('post.archived_at', null).limit(1);
  if (mineError) throw new Error(`Failed to read your passes: ${mineError.message}`);
  if ((mine || []).length) throw fail(409, 'PASSED_ALREADY', 'You already passed this post on.');
  return original.id;
}

/**
 * For the posts on a page (switch-on reader): `passed` on an original ({ count, carriers }: the passes this reader may
 * see) and `passed_on` on a pass ({ from, carried_by }), by post id. One read of the passes, only when there are any.
 */
// How many recent passes a list reads beside its posts (recentPasses) before it falls back to reading by the page's ids.
const RECENT_PASSES = 500;

/**
 * The newest passes there are, read BESIDE a list's posts read (the opening time, LEAD-3 09:22): partsFor then takes the
 * page's from them, with no read after the posts. Null when there are more than one read takes: partsFor reads by ids.
 */
async function recentPasses() {
  // eslint-disable-next-line global-require
  const { POST_READ_SELECT } = require('./readAccess');
  const { data, error } = await supabaseAdmin.from('PostStudio')
    .select(`post_id, studio, post:Post!inner(${POST_READ_SELECT}, created_at)`).not('studio->passed_on->>from', 'is', null)
    .is('post.archived_at', null).order('created_at', { ascending: false }).limit(RECENT_PASSES);
  if (error) throw new Error(`Failed to load passes: ${error.message}`);
  return (data || []).length >= RECENT_PASSES ? null : data || [];
}

async function partsFor(posts, viewerId, studios, { recent = null } = {}) {
  const out = new Map();
  const ids = [...new Set((posts || []).map((p) => p?.id).filter(Boolean))];
  if (!ids.length) return out;
  // eslint-disable-next-line global-require
  const store = require('../moments/momentStore');
  // eslint-disable-next-line global-require
  const { canReadPost, POST_READ_SELECT } = require('./readAccess');
  const early = recent ? await recent.catch(() => null) : null;
  const wanted = new Set(ids);
  const { data, error } = early
    ? { data: early.filter((row) => wanted.has(row.studio?.passed_on?.from)), error: null }
    : await supabaseAdmin.from('PostStudio')
      .select(`post_id, studio, post:Post!inner(${POST_READ_SELECT}, created_at)`).in('studio->passed_on->>from', ids)
      .is('post.archived_at', null).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(`Failed to load passes: ${error.message}`);
  const passes = [];
  for (const row of data || []) {
    if (await canReadPost(row.post, viewerId).catch(() => false)) passes.push(row);
  }
  const ownPasses = (posts || []).filter((p) => studios.get(p.id)?.passed_on?.from);
  const authors = await store.loadAuthors([...passes.map((r) => r.post.user_id), ...ownPasses.map((p) => p.user_id)]);
  for (const id of ids) {
    const mine = passes.filter((r) => r.studio.passed_on.from === id);
    if (mine.length) {
      out.set(id, { passed: { count: mine.length, carriers: mine.slice(0, 3).map((r) => authors.get(String(r.post.user_id))).filter(Boolean) } });
    }
  }
  for (const post of ownPasses) {
    out.set(post.id, { ...(out.get(post.id) || {}), passed_on: { from: studios.get(post.id).passed_on.from, carried_by: authors.get(String(post.user_id)) || null } });
  }
  return out;
}

module.exports = { check, partsFor, recentPasses };
