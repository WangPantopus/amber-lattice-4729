// Made-up names ("pen names" in code): who wrote what.
//
// A post or a reply written under a made-up name is saved under one Pantopus system account (SYSTEM_ACCOUNT_ID), with
// identity_context_type 'pen_name' and the pen name's id. The account that wrote it is on no row a feed, a profile, a
// search or a notice reads: it is kept only in "PenNameOwner", a table the server's own database role holds no
// privilege on. The functions in this file are the only way to it (supabase/migrations/20261125083000_pen_names.sql),
// and THIS FILE IS THE ONLY ONE THAT MAY CALL THEM (backend/scripts/ci/check-pen-name-owner.js fails the build
// otherwise). A reader that has never heard of made-up names therefore shows "Someone nearby", never the person.
//
// Every answer here is about the asking account, except ownerOf: that one names the writer, for a notice to them or
// for a member of staff, and its callers are listed in the build contract (docs/product/made-up-names/README.md).

const supabaseAdmin = require('../../config/supabaseAdmin');

const SYSTEM_ACCOUNT_ID = '5ea1ed00-0000-4000-8000-000000000001';
const KIND = 'pen_name';
const CONTENT_KINDS = ['post', 'comment'];

function isPenNameRow(row) {
  return !!row && row.identity_context_type === KIND;
}

async function call(name, args) {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) {
    // The database's own refusals (RAISE EXCEPTION 'PEN_NAME_…') and a taken name (23505) reach the caller by name.
    const code = /PEN_NAME_[A-Z_]+/.exec(error.message || '')?.[0] || (error.code === '23505' ? 'PEN_NAME_TAKEN' : null);
    throw Object.assign(new Error(error.message || `${name} failed`), { code: code || error.code || 'PEN_NAME_READ_FAILED' });
  }
  return data;
}

/** The id of the account's pen name in use, or null. */
async function currentId(ownerId) {
  if (!ownerId) return null;
  return (await call('pen_name_current', { p_owner: ownerId })) || null;
}

/** Takes a pen name for the account (names.js has checked the words). Returns its id. */
async function take({ ownerId, name, nameKey, handle, avatarUrl, source, replace, minDays }) {
  return call('pen_name_take', {
    p_owner: ownerId, p_name: name, p_name_key: nameKey, p_handle: handle, p_avatar_url: avatarUrl || null,
    p_source: source, p_replace: !!replace, p_min_days: minDays,
  });
}

/** Records the writer of a row about to be saved; the database refuses the row without it. */
async function seal({ kind, contentId, ownerId, penNameId }) {
  await call('pen_name_seal', { p_kind: kind, p_content_id: contentId, p_owner: ownerId, p_identity: penNameId });
}

/** Takes back a record whose row was never saved. Never throws: an orphan record names nothing anyone can read. */
async function unseal({ kind, contentId, ownerId }) {
  try {
    await call('pen_name_unseal', { p_kind: kind, p_content_id: contentId, p_owner: ownerId });
  } catch {
    // Left for the row that may yet arrive (a retry of the same command).
  }
}

/** Which of these rows the account wrote: a Set of ids. Fails closed: on an error, none. */
async function mine(ownerId, kind, ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!ownerId || !list.length) return new Set();
  try {
    return new Set(((await call('pen_name_mine', { p_owner: ownerId, p_kind: kind, p_ids: list })) || []).map(String));
  } catch {
    return new Set();
  }
}

/** The account that wrote a row, or null. Only for a notice to that account, a block check, or staff. */
async function ownerOf(kind, contentId) {
  if (!contentId) return null;
  return (await call('pen_name_owner', { p_kind: kind, p_content_id: contentId })) || null;
}

/** The account's own rows, newest first: [{ id, created_at }]. */
async function owned(ownerId, kind, { before = null, limit = 20 } = {}) {
  const rows = await call('pen_name_owned', { p_owner: ownerId, p_kind: kind, p_before: before, p_limit: limit });
  return (rows || []).map((row) => ({ id: String(row.content_id), created_at: row.created_at }));
}

/** How many rows the account wrote since a time. */
async function countSince(ownerId, kind, since) {
  return Number(await call('pen_name_count', { p_owner: ownerId, p_kind: kind, p_since: since })) || 0;
}

/** The voice the account already has in a conversation: 'pen_name', 'named' or null. */
async function voiceIn(ownerId, postId) {
  return (await call('pen_name_voice', { p_owner: ownerId, p_post: postId })) || null;
}

/** Which of these people blocked a pen name of the account: a Set of their ids. */
async function blockedBy(ownerId, blockerIds) {
  const list = [...new Set((blockerIds || []).filter(Boolean).map(String))].filter((id) => id !== SYSTEM_ACCOUNT_ID);
  if (!ownerId || !list.length) return new Set();
  return new Set(((await call('pen_name_blocked_by', { p_owner: ownerId, p_blockers: list })) || []).map(String));
}

module.exports = {
  SYSTEM_ACCOUNT_ID,
  KIND,
  CONTENT_KINDS,
  isPenNameRow,
  currentId,
  take,
  seal,
  unseal,
  mine,
  ownerOf,
  owned,
  countSince,
  voiceIn,
  blockedBy,
};
