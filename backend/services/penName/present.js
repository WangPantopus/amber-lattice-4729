// Made-up names: what a reader gets.
//
// A made-up-name post or reply is stored under the system account. This file turns such a row into what an app
// draws: the made-up name as its author, the made-up name's id where the account's id would be, and, for the
// person who wrote it and nobody else, their own id there (the apps offer Edit and Delete when a row's user_id is the
// viewer's, as they do for a business post's writer: feedService.redactPrivateIdentityFields).
//
// It also keeps what a person chose not to see: a mute or a block of a made-up name hides everything that account
// writes under any made-up name, now or later. Those live in "PostMute" (kinds 'pen_name' and 'pen_name_block'),
// never in "UserBlock": a row there would hide the person's named posts too, and so say who is behind the name.

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const owner = require('./owner');
const names = require('./names');

const UNKNOWN_NAME = 'Someone nearby';
const MUTE = 'pen_name';
const BLOCK = 'pen_name_block';

/** The author every app draws for a made-up name. `pen` may be missing (the name couldn't be read). */
function authorOf(pen, fallbackId = null) {
  return {
    type: owner.KIND,
    id: pen?.id || fallbackId || '',
    handle: null,
    displayName: pen?.display_name || UNKNOWN_NAME,
    avatarUrl: pen?.avatar_url || null,
    bio: null,
    tagline: null,
    // No page: a made-up name opens a small card in the apps (GET /api/pen-names/:id), never a profile.
    href: null,
    madeUp: true,
    // Everyone with a made-up name has a verified home, so the mark says something and tells nothing apart.
    badges: ['made_up_name', 'verified_home'],
    locality: { city: null, state: null, neighborhood: null, precision: 'city' },
    stats: { reviews: 0, gigsCompleted: null, marketplaceSales: 0 },
    viewer: { relationshipStatus: 'none', isFollowingLocal: false, canMessage: false },
    bridges: { audienceProfile: null },
  };
}

function creatorOf(author) {
  return { type: author.type, id: author.id, handle: null, displayName: author.displayName, avatarUrl: author.avatarUrl };
}

/** The names and "which are mine" for these rows, read together. `kind`: 'post' or 'comment'. */
async function read(kind, rows, viewerId) {
  const penRows = (rows || []).filter(owner.isPenNameRow);
  if (!penRows.length) return null;
  const [pens, mine] = await Promise.all([
    names.rowsById(penRows.map((row) => row.identity_context_id)),
    viewerId ? owner.mine(viewerId, kind, penRows.map((row) => row.id)) : new Set(),
  ]);
  return { pens, mine };
}

/** One post as its reader gets it. `context` is read()'s answer. */
function presentPost(post, viewerId, context) {
  if (!owner.isPenNameRow(post)) return post;
  const pen = context?.pens.get(String(post.identity_context_id));
  const own = !!viewerId && !!context?.mine.has(String(post.id));
  const author = authorOf(pen, post.identity_context_id);
  const shownId = own ? viewerId : author.id;
  return {
    ...post,
    user_id: shownId,
    author_user_id: shownId,
    author: own ? { ...author, isYou: true } : author,
    creator: creatorOf(author),
    business_author: null,
    business_author_id: null,
    business_id: null,
    home: null,
    home_id: null,
    target_place_id: null,
    is_visitor_post: false,
    // The post floats over an area; how far that area is from the reader would read as how far its writer is.
    distance_meters: null,
    made_up_name: true,
    viewer_is_author: own,
  };
}

/** One reply as its reader gets it. */
function presentComment(comment, viewerId, context) {
  if (!owner.isPenNameRow(comment)) return comment;
  const pen = context?.pens.get(String(comment.identity_context_id));
  const own = !!viewerId && !!context?.mine.has(String(comment.id));
  const author = authorOf(pen, comment.identity_context_id);
  return {
    ...comment,
    user_id: own ? viewerId : author.id,
    author: own ? { ...author, isYou: true } : author,
    made_up_name: true,
    viewer_is_author: own,
  };
}

/**
 * The row as its own writer's requests see it: user_id is theirs, so the routes' "is this yours" checks work
 * unchanged. For everyone else the row comes back as it is (under the system account, so never "theirs").
 */
async function asWriter(row, userId, kind) {
  if (!owner.isPenNameRow(row) || !userId) return row;
  return (await owner.mine(userId, kind, [row.id])).has(String(row.id))
    ? { ...row, user_id: userId, ...(kind === 'post' ? { author_user_id: userId } : {}), written_under_pen_name: true }
    : row;
}

/**
 * The account to tell about something that happened to a row (a reply, a reaction): the row's own account, or the
 * writer behind a made-up name. Null when it can't be read; the notice is then not sent.
 */
async function writerId(row, kind) {
  if (!row) return null;
  if (!owner.isPenNameRow(row)) return row.user_id || null;
  try {
    return await owner.ownerOf(kind, row.id);
  } catch (error) {
    logger.warn('penName.writer_unavailable', { kind, error: error.message });
    return null;
  }
}

// ── What a person chose not to see ──────────────────────────────────────────────────────────────────────────────

const HIDDEN_MS = 60 * 1000;
const hiddenCache = new Map();

function forgetHidden(viewerId) {
  hiddenCache.delete(String(viewerId));
}

/**
 * The made-up names this person muted or blocked, and every other name the same accounts have had: a Set of pen-name
 * ids. A read error answers an empty set, as the feed's other filters do.
 */
async function hiddenIds(viewerId) {
  if (!viewerId) return new Set();
  const key = String(viewerId);
  const hit = hiddenCache.get(key);
  if (hit && Date.now() - hit.at < HIDDEN_MS) return hit.ids;
  let ids = new Set();
  try {
    const { data: mutes, error } = await supabaseAdmin.from('PostMute').select('muted_entity_id')
      .eq('user_id', viewerId).in('muted_entity_type', [MUTE, BLOCK]);
    if (error) throw error;
    const muted = [...new Set((mutes || []).map((row) => row.muted_entity_id).filter(Boolean))];
    if (muted.length) {
      const { data: chosen, error: chosenError } = await supabaseAdmin.from('AudienceIdentity')
        .select('lineage_id').eq('kind', owner.KIND).in('id', muted);
      if (chosenError) throw chosenError;
      const lineages = [...new Set((chosen || []).map((row) => row.lineage_id).filter(Boolean))];
      if (lineages.length) {
        const { data: all, error: allError } = await supabaseAdmin.from('AudienceIdentity')
          .select('id').eq('kind', owner.KIND).in('lineage_id', lineages);
        if (allError) throw allError;
        ids = new Set((all || []).map((row) => String(row.id)));
      }
      for (const id of muted) ids.add(String(id));
    }
  } catch (error) {
    logger.warn('penName.hidden_unavailable', { error: error.message });
    return new Set();
  }
  if (hiddenCache.size > 5000) hiddenCache.delete(hiddenCache.keys().next().value);
  hiddenCache.set(key, { ids, at: Date.now() });
  return ids;
}

/** Whether `id` is a made-up name's id (the apps send it where they would send an account's). */
async function isPenNameId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))) return false;
  return (await names.rowsById([id])).has(String(id));
}

function refuse(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

/** Mutes (`block: false`) or blocks a made-up name for this person. Blocking also mutes. */
async function hide(viewerId, penNameId, { block = false } = {}) {
  if (!await isPenNameId(penNameId)) throw refuse('PEN_NAME_NOT_FOUND', "That made-up name isn't here anymore.", 404);
  if ((await owner.mine(viewerId, owner.KIND, [penNameId])).has(String(penNameId))) {
    throw refuse('PEN_NAME_IS_YOURS', "That's your own made-up name.");
  }
  const kind = block ? BLOCK : MUTE;
  // "PostMute" is unique on (user, kind, id, surface-or-global), an index on an expression that an upsert can't
  // name: read first, and a second request that loses the race is the same mute.
  const { data: existing, error: readError } = await supabaseAdmin.from('PostMute').select('id')
    .eq('user_id', viewerId).eq('muted_entity_type', kind).eq('muted_entity_id', String(penNameId)).limit(1);
  if (readError) throw readError;
  if (!existing?.length) {
    const { error } = await supabaseAdmin.from('PostMute')
      .insert({ user_id: viewerId, muted_entity_type: kind, muted_entity_id: String(penNameId) });
    if (error && error.code !== '23505') throw error;
  }
  forgetHidden(viewerId);
}

/** Undoes a mute (`block: false`) or a block of a made-up name. */
async function unhide(viewerId, penNameId, { block = false } = {}) {
  const { error } = await supabaseAdmin.from('PostMute').delete()
    .eq('user_id', viewerId).eq('muted_entity_type', block ? BLOCK : MUTE).eq('muted_entity_id', String(penNameId));
  if (error) throw error;
  forgetHidden(viewerId);
}

/** The made-up names this person muted or blocked, for Settings: [{ id, name, avatar_url, blocked, created_at }]. */
async function hiddenList(viewerId) {
  const { data, error } = await supabaseAdmin.from('PostMute')
    .select('id, muted_entity_type, muted_entity_id, created_at')
    .eq('user_id', viewerId).in('muted_entity_type', [MUTE, BLOCK]).order('created_at', { ascending: false });
  if (error) throw error;
  const pens = await names.rowsById((data || []).map((row) => row.muted_entity_id));
  return (data || []).map((row) => {
    const pen = pens.get(String(row.muted_entity_id));
    return {
      id: row.muted_entity_id,
      name: pen?.display_name || UNKNOWN_NAME,
      avatar_url: pen?.avatar_url || null,
      blocked: row.muted_entity_type === BLOCK,
      created_at: row.created_at,
    };
  });
}

/**
 * Whether the account may not reach `targetUserId` because that person blocked one of the account's made-up names.
 * Asked only when the target wrote under their own name: on a made-up-name post nothing is refused because of a
 * block, or a refusal would say who is behind the name.
 */
async function reachRefused(actorUserId, targetUserId) {
  if (!actorUserId || !targetUserId || targetUserId === owner.SYSTEM_ACCOUNT_ID) return false;
  try {
    return (await owner.blockedBy(actorUserId, [targetUserId])).has(String(targetUserId));
  } catch (error) {
    logger.warn('penName.reach_unavailable', { error: error.message });
    return false;
  }
}

module.exports = {
  UNKNOWN_NAME,
  MUTE,
  BLOCK,
  authorOf,
  read,
  presentPost,
  presentComment,
  asWriter,
  writerId,
  hiddenIds,
  forgetHidden,
  isPenNameId,
  hide,
  unhide,
  hiddenList,
  reachRefused,
};
