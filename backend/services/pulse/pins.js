'use strict';

// Pulse, reinvented, phase 3: pins on a Moment's picture (coord CONTRACT 8b; the PostPin table approved by LEAD-3 for
// the founder). A reader drops a reaction, a voice bubble or a cutout on a spot. A pin is a reply people can see (8a's
// PostComment, so report and remove are Pulse's own flows) plus one PostPin row keyed by the reply. Its reply's words
// are the pin as plain words for today's screens and older apps: a reaction's emoji, a voice bubble's words, a cutout's
// "📷 Cutout". Allowed only where 8a allows replies; never on a made-up-name Moment (8a refuses replies there).

const sharp = require('sharp');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const media = require('../moments/momentMedia');
const { POST_REACTION_EMOJIS, SIGNAL_EMOJI } = require('../../utils/postReaction');
const replies = require('./replies');
const sound = require('./sound');

const KINDS = ['reaction', 'voice', 'cutout'];
const MAX_CUTOUT_BYTES = 2 * 1024 * 1024;
const MAX_PINS = 200;

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const play = () => require('./play');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function spotOf(fields) {
  const x = Number(fields.x);
  const y = Number(fields.y);
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw fail(400, 'PIN_INVALID', 'Send the spot as x and y, 0 to 1 across and down the picture.');
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}

/** POST /moments/:id/pins — a reaction (JSON), or a voice bubble or a cutout (multipart `file`). */
async function create(id, user, fields, file) {
  const store = momentStore();
  const row = await replies.openFor(id, user.id);
  if (!(await replies.shownNow(row))) throw fail(403, 'REPLIES_CLOSED', "Replies aren't shown on this Moment. Send a private reply instead.");
  if (store.momentState(row) !== 'live') throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  const kind = String(fields.kind || '');
  if (!KINDS.includes(kind)) throw fail(400, 'PIN_INVALID', 'kind must be reaction, voice or cutout.');
  const spot = spotOf(fields);
  let detail = {};
  let words;
  if (kind === 'reaction') {
    const signal = typeof fields.signal === 'string' ? fields.signal : null;
    const emoji = signal ? SIGNAL_EMOJI[signal] : (POST_REACTION_EMOJIS.includes(fields.emoji) ? fields.emoji : null);
    if (!emoji) throw fail(400, 'PIN_INVALID', 'Send one of the emoji or one of the five signals.');
    detail = { emoji, ...(signal ? { signal } : {}) };
    words = emoji;
  } else {
    const bucket = await media.privateBucket(store.meta(row).media?.bucket);
    if (kind === 'voice') {
      const facts = sound.checkShortVoice(file, fields.duration_ms);
      const said = typeof fields.text === 'string' ? fields.text.trim().slice(0, 200) : '';
      const key = media.keyFor(media.folderOwner(row), row.id, 'pin-voice', media.sha256(file.buffer), facts.ext);
      await media.put(bucket, key, file.buffer, facts.type);
      detail = { key, bucket, duration_ms: facts.durationMs, text: said || null };
      words = said ? `🎤 ${said}` : '🎤 Voice';
    } else {
      const type = String(file?.mimetype || '').toLowerCase();
      if (!file?.buffer?.length || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw fail(400, 'PIN_INVALID', 'Send the cutout as a PNG, JPEG or WebP "file".');
      if (file.buffer.length > MAX_CUTOUT_BYTES) throw fail(413, 'MEDIA_TOO_LARGE', 'This cutout is too large to post.');
      // A cutout is a picture: it is read (and re-encoded) so nothing but an image is stored.
      let png;
      try {
        png = await sharp(file.buffer).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      } catch {
        throw fail(400, 'PIN_INVALID', 'This cutout could not be read.');
      }
      const key = media.keyFor(media.folderOwner(row), row.id, 'pin-cutout', media.sha256(png), 'png');
      await media.put(bucket, key, png, 'image/png');
      detail = { key, bucket };
      words = '📷 Cutout';
    }
  }
  const { data: reply, error } = await supabaseAdmin.from('PostComment')
    .insert({ post_id: row.id, user_id: user.id, comment: words }).select('id, created_at').single();
  if (error) {
    if (/POST_COMMENT_RATE_LIMIT/.test(error.message || '')) throw fail(429, 'REPLY_RATE_LIMIT', 'You are replying too quickly. Please wait a moment.');
    throw new Error(`Failed to keep the pin: ${error.message}`);
  }
  const { error: pinError } = await supabaseAdmin.from('PostPin').insert({ reply_id: reply.id, post_id: row.id, kind, ...spot, detail });
  if (pinError) {
    await supabaseAdmin.from('PostComment').delete().eq('id', reply.id);
    throw new Error(`Failed to keep the pin: ${pinError.message}`);
  }
  logger.info('moments.pin_added', { momentId: row.id, kind });
  const [pin] = await pinsOf(row, user.id, [reply.id]);
  return { pin };
}

/** The pins of a Moment this reader may see (8a's rules), oldest first; `only`: these reply ids. */
async function pinsOf(row, viewerId, only = null) {
  const store = momentStore();
  let query = supabaseAdmin.from('PostPin')
    .select('reply_id, kind, x, y, detail, created_at, reply:PostComment!inner(user_id, comment, is_deleted, moderation_state)')
    .eq('post_id', row.id).eq('reply.is_deleted', false).order('created_at', { ascending: true }).limit(MAX_PINS);
  if (only) query = query.in('reply_id', only);
  const [{ data, error }, hidden] = await Promise.all([query, play().hiddenPeople(viewerId)]);
  if (error) throw new Error(`Failed to load the pins: ${error.message}`);
  const own = store.isOwn(row, viewerId);
  const shown = (data || []).filter((pin) => (pin.reply.moderation_state === 'live' || String(pin.reply.user_id) === String(viewerId))
    && !hidden.has(String(pin.reply.user_id)));
  const [authors, links] = await Promise.all([
    store.loadAuthors(shown.map((pin) => pin.reply.user_id)),
    media.signedLinks(undefined, shown.map((pin) => pin.detail?.key).filter(Boolean)),
  ]);
  return shown.map((pin) => {
    const mine = String(pin.reply.user_id) === String(viewerId);
    return {
      id: pin.reply_id,
      kind: pin.kind,
      x: pin.x,
      y: pin.y,
      emoji: pin.detail?.emoji || null,
      signal: pin.detail?.signal || null,
      audio_url: pin.kind === 'voice' ? links.get(pin.detail?.key) || null : null,
      duration_ms: pin.kind === 'voice' ? pin.detail?.duration_ms ?? null : null,
      image_url: pin.kind === 'cutout' ? links.get(pin.detail?.key) || null : null,
      text: pin.kind === 'voice' ? pin.detail?.text || null : null,
      at: pin.created_at,
      author: authors.get(String(pin.reply.user_id)) || null,
      mine,
      can_remove: mine || own,
    };
  });
}

/** GET /moments/:id/pins — the pins this reader may see. */
async function list(id, viewerId) {
  const row = await replies.openFor(id, viewerId);
  if (!(await replies.shownNow(row))) return { pins: [] };
  return { pins: await pinsOf(row, viewerId) };
}

module.exports = { create, list, pinsOf, KINDS };
