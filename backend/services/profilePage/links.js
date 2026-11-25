/**
 * Links for one purpose (CONTRACT.md Changes v1.3; founder item 9.1): a person shares chosen parts of their profile
 * behind a long random key. At most 10 live links a person (50 kept). A key is the link's only credential: it is never
 * logged (app.js redacts it from the request log; nothing here logs it) and it stops working the moment its link is
 * switched off, ends, or the person turns links off. Opens are a count and the last day, never who (item 9.6).
 * On (SPEC rule 4.12); PROFILE_LINKS=0, or PROFILE_SOURCES=0, is the emergency off.
 */

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { PART_KEYS } = require('./parts');

const MAX_LIVE = 10;
const MAX_KEPT = 50;
const KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LINK_SELECT = 'id, user_id, name, key, parts, ends_on, switched_off_at, opens, last_opened_on, created_at';

class LinkRefusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NOT_FOUND = () => new LinkRefusal(404, 'PROFILE_LINK_NOT_FOUND', 'This link isn\'t working.');

function today() {
  return require('./compose').localDate(new Date(), require('./compose').PACIFIC);
}

function newKey() {
  return crypto.randomBytes(24).toString('base64url'); // 32 characters, 192 bits
}

/** The link's parts with every key, true or false. */
function fullParts(parts) {
  return Object.fromEntries(PART_KEYS.map((key) => [key, parts?.[key] === true]));
}

function isLive(row, linksEnabled, day = today()) {
  return linksEnabled && !row.switched_off_at && (!row.ends_on || row.ends_on >= day);
}

function serialize(row, { username, webBase, linksEnabled, day }) {
  return {
    id: row.id,
    name: row.name,
    url: `${webBase}/${encodeURIComponent(username)}/v/${row.key}`,
    parts: fullParts(row.parts),
    ends_on: row.ends_on || null,
    switched_off: Boolean(row.switched_off_at),
    live: isLive(row, linksEnabled, day),
    opens: row.opens || 0,
    last_opened_on: row.last_opened_on || null,
    created_at: row.created_at,
  };
}

async function listRows(userId) {
  const { data, error } = await supabaseAdmin.from('ProfileShareLink').select(LINK_SELECT)
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(MAX_KEPT);
  if (error) throw error;
  return data || [];
}

// ---------- checking a body ----------

function checkName(name) {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length >= 1 && clean.length <= 60 ? clean : null;
}

function checkParts(parts) {
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) return null;
  for (const [key, value] of Object.entries(parts)) {
    if (!PART_KEYS.includes(key) || typeof value !== 'boolean') return null;
  }
  return parts;
}

function checkEndsOn(value, day) {
  if (value === null) return { value: null };
  if (typeof value !== 'string' || !DAY_RE.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value >= day ? { value } : null;
}

function invalid(message) {
  return new LinkRefusal(400, 'PROFILE_LINK_INVALID', message);
}

// ---------- the owner's writes ----------

async function createLink(userId, body, { linksEnabled }) {
  if (!linksEnabled) throw new LinkRefusal(409, 'PROFILE_LINKS_OFF_FOR_YOU', 'Links for one purpose are off for you. Turn them on first.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Send a name and the parts the link shows.');
  const unknown = Object.keys(body).filter((k) => !['name', 'parts', 'ends_on'].includes(k));
  if (unknown.length) throw invalid('A link takes a name, its parts and an optional last day.');
  const day = today();
  const name = checkName(body.name);
  if (!name) throw invalid('Give the link a name of 1 to 60 characters.');
  const parts = body.parts === undefined ? {} : checkParts(body.parts);
  if (!parts) throw invalid('Each part is on (true) or off (false).');
  const ends = body.ends_on === undefined ? { value: null } : checkEndsOn(body.ends_on, day);
  if (!ends) throw invalid('The last day is today or later, written YYYY-MM-DD.');
  const rows = await listRows(userId);
  if (rows.length >= MAX_KEPT) throw new LinkRefusal(409, 'PROFILE_LINKS_LIMIT', `You can keep ${MAX_KEPT} links. Delete one first.`);
  if (rows.filter((r) => isLive(r, true, day)).length >= MAX_LIVE) {
    throw new LinkRefusal(409, 'PROFILE_LINKS_LIMIT', `You can have ${MAX_LIVE} links working at once. Switch one off first.`);
  }
  const { data, error } = await supabaseAdmin.from('ProfileShareLink')
    .insert({ user_id: userId, name, key: newKey(), parts: fullParts(parts), ends_on: ends.value })
    .select(LINK_SELECT).single();
  if (error) throw error;
  logger.info('Profile link made', { userId, linkId: data.id });
  return data;
}

async function ownRow(userId, id) {
  const { data, error } = await supabaseAdmin.from('ProfileShareLink').select(LINK_SELECT)
    .eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) {
    if (error.code === '22P02') throw NOT_FOUND();
    throw error;
  }
  if (!data) throw NOT_FOUND();
  return data;
}

async function updateLink(userId, id, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Send what to change.');
  const unknown = Object.keys(body).filter((k) => !['name', 'parts', 'ends_on', 'switched_off'].includes(k));
  if (unknown.length) throw invalid('A link takes a name, its parts, a last day and switched off.');
  const row = await ownRow(userId, id);
  const day = today();
  const change = {};
  if (body.name !== undefined) {
    const name = checkName(body.name);
    if (!name) throw invalid('Give the link a name of 1 to 60 characters.');
    change.name = name;
  }
  if (body.parts !== undefined) {
    const parts = checkParts(body.parts);
    if (!parts) throw invalid('Each part is on (true) or off (false).');
    change.parts = fullParts({ ...fullParts(row.parts), ...parts });
  }
  if (body.ends_on !== undefined) {
    const ends = checkEndsOn(body.ends_on, day);
    if (!ends) throw invalid('The last day is today or later, written YYYY-MM-DD.');
    change.ends_on = ends.value;
  }
  if (body.switched_off !== undefined) {
    if (typeof body.switched_off !== 'boolean') throw invalid('Switched off is true or false.');
    change.switched_off_at = body.switched_off ? (row.switched_off_at || new Date().toISOString()) : null;
  }
  const after = { ...row, ...change };
  if (isLive(after, true, day) && !isLive(row, true, day)) {
    const live = (await listRows(userId)).filter((r) => r.id !== row.id && isLive(r, true, day)).length;
    if (live >= MAX_LIVE) {
      throw new LinkRefusal(409, 'PROFILE_LINKS_LIMIT', `You can have ${MAX_LIVE} links working at once. Switch one off first.`);
    }
  }
  if (!Object.keys(change).length) return row;
  const { data, error } = await supabaseAdmin.from('ProfileShareLink')
    .update({ ...change, updated_at: new Date().toISOString() })
    .eq('id', row.id).eq('user_id', userId).select(LINK_SELECT).single();
  if (error) throw error;
  return data;
}

async function deleteLink(userId, id) {
  const row = await ownRow(userId, id);
  const { error } = await supabaseAdmin.from('ProfileShareLink').delete().eq('id', row.id).eq('user_id', userId);
  if (error) throw error;
  return { id: row.id, deleted: true };
}

// ---------- opening a link ----------

/** The link behind a key, or throws the one 404 every key that doesn't open gets. */
async function rowForKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw NOT_FOUND();
  const { data, error } = await supabaseAdmin.from('ProfileShareLink')
    .select('id, user_id, parts, ends_on, switched_off_at').eq('key', key).maybeSingle();
  if (error) throw error;
  if (!data) throw NOT_FOUND();
  return data;
}

/** Counts one open (never who). Doesn't hold up the answer; a failed count is logged without the key. */
function countOpen(linkId) {
  supabaseAdmin.rpc('profile_share_link_opened', { p_link_id: linkId, p_day: today() })
    .then(({ error }) => { if (error) logger.warn('Profile link open not counted', { linkId, error: error.message }); })
    .catch((err) => logger.warn('Profile link open not counted', { linkId, error: err.message }));
}

module.exports = {
  LinkRefusal, NOT_FOUND, MAX_LIVE, listRows, serialize, createLink, updateLink, deleteLink, rowForKey, countOpen,
  isLive, today, fullParts,
};
