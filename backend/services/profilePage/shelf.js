/**
 * The shelf (~/pantopus-profile-sources/CONTRACT.md P3.1; SPEC "Phase 3", 3C): up to five objects on the person's
 * first tab, each a picture and a caption of at most 40 characters, Said. Kept in `User.profile_shelf` as
 * `[{ id, picture_url, caption }]` (id = the picture's File id), in the person's order. Pictures come from today's
 * upload (`POST /api/files/upload`, purpose `profile_shelf`), stored as a kind the public portfolio grid never lists.
 * The `shelf` part decides who sees it (compose.js).
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');

const SHELF_MAX = 5;
const CAPTION_MAX = 40;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Plain words: no links, no handles (as the other words people write about themselves here).
const NOT_PLAIN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|app|dev)\b|(^|\s)@\w)/i;

class ShelfRefusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const invalid = (message) => new ShelfRefusal(400, 'SHELF_INVALID', message);

/** The stored shelf as the page and the owner read it. */
function objectsOf(stored) {
  return (Array.isArray(stored) ? stored : []).filter((o) => o && o.id && o.picture_url).slice(0, SHELF_MAX)
    .map((o) => ({ id: o.id, picture_url: o.picture_url, caption: String(o.caption || '') }));
}

async function readStored(userId) {
  const { data, error } = await supabaseAdmin.from('User').select('profile_shelf').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.profile_shelf || null;
}

/** GET /me/shelf. */
async function getShelf(userId) {
  return { objects: objectsOf(await readStored(userId)) };
}

/**
 * PUT /me/shelf `{ objects: [{ file_id, caption }] }`: the whole shelf in order. A picture left out is deleted, as
 * files.js deletes a file (it belongs to the shelf alone).
 */
async function putShelf(userId, body) {
  const list = body && typeof body === 'object' && !Array.isArray(body) ? body.objects : undefined;
  if (!Array.isArray(list)) throw invalid('Send the shelf as { "objects": [ { "file_id", "caption" } ] }.');
  if (list.length > SHELF_MAX) throw new ShelfRefusal(409, 'SHELF_LIMIT', 'Your shelf holds five things. Take one off first.');
  const items = list.map((o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {}));
  const ids = items.map((o) => (typeof o.file_id === 'string' ? o.file_id.toLowerCase() : null));
  if (ids.some((id) => !id || !UUID_RE.test(id)) || new Set(ids).size !== ids.length) {
    throw invalid('Each thing on the shelf is a picture you uploaded for it, once.');
  }
  const captions = items.map((o) => (typeof o.caption === 'string' ? o.caption.replace(/\s+/g, ' ').trim() : ''));
  if (captions.some((c) => !c || c.length > CAPTION_MAX)) throw invalid(`Give each thing a caption of 1 to ${CAPTION_MAX} characters.`);
  if (captions.some((c) => NOT_PLAIN.test(c))) throw invalid('A caption is plain words: no links or handles.');
  let files = [];
  if (ids.length) {
    const { data, error } = await supabaseAdmin.from('File')
      .select('id, user_id, file_url, file_type, file_context, mime_type, visibility, is_deleted').in('id', ids);
    if (error) throw error;
    const byId = new Map((data || []).map((f) => [String(f.id), f]));
    files = ids.map((id) => byId.get(id));
    if (files.some((f) => !f || String(f.user_id) !== String(userId) || f.is_deleted || f.file_context !== 'profile_shelf'
      || f.file_type !== 'other' || f.visibility !== 'public' || !/^image\//i.test(String(f.mime_type || '')))) {
      throw invalid('Put only pictures you uploaded for your shelf on it.');
    }
  }
  const before = objectsOf(await readStored(userId));
  const value = files.map((f, i) => ({ id: f.id, picture_url: f.file_url, caption: captions[i] }));
  const { error } = await supabaseAdmin.from('User').update({ profile_shelf: value.length ? value : null }).eq('id', userId);
  if (error) throw error;
  // Pictures taken off the shelf go (they were uploaded for it alone).
  const kept = new Set(value.map((o) => String(o.id)));
  for (const gone of before.filter((o) => !kept.has(String(o.id)))) {
    const { error: delError } = await supabaseAdmin.rpc('soft_delete_file', { p_file_id: gone.id, p_user_id: userId });
    if (delError) logger.warn('Shelf picture not deleted', { userId, fileId: gone.id, error: delError.message });
  }
  return { objects: objectsOf(value) };
}

module.exports = { ShelfRefusal, getShelf, putShelf, objectsOf, SHELF_MAX };
