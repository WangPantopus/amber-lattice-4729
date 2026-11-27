'use strict';

// Pulse, reinvented, phase 3: pins on a Moment's picture (coord CONTRACT 8b; the PostPin table approved by LEAD-3 for
// the founder). A reader drops a reaction, a voice bubble or a cutout on a spot. A pin is a reply people can see (8a's
// PostComment, so report and remove are Pulse's own flows) plus one PostPin row keyed by the reply. Its reply's words
// are the pin as plain words for today's screens and older apps: a reaction's emoji, a voice bubble's words, a cutout's
// "📷 Cutout". Allowed only where 8a allows replies; never on a made-up-name Moment (8a refuses replies there).

const crypto = require('crypto');
const sharp = require('sharp');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const media = require('../moments/momentMedia');
const { POST_REACTION_EMOJIS, SIGNAL_EMOJI } = require('../../utils/postReaction');
const replies = require('./replies');
const sound = require('./sound');

const KINDS = ['reaction', 'voice', 'cutout'];
const MAX_CUTOUT_BYTES = 2 * 1024 * 1024;
// Caps (LEAD-3): so one person cannot cover someone's picture.
const MAX_PINS = 200;
const MAX_PINS_EACH = 5;
// A cutout's answer waits this long for its picture check; a check still running finishes after the answer.
const CHECK_WAIT_MS = 10 * 1000;
// A cutout still 'checking' after this was left behind (the process restarted mid-check): the job checks it again.
const STUCK_CHECK_MS = 2 * 60 * 1000;
const FILE_KINDS = ['voice', 'cutout'];
const BATCH = 50;

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const play = () => require('./play');
// eslint-disable-next-line global-require
const momentCheck = () => require('../moments/momentCheck');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

// Each pin gets its own file, even for the same bytes pinned twice, so removing one pin never takes another's file.
function ownDigest(buffer) {
  return media.sha256(Buffer.concat([buffer, crypto.randomBytes(16)]));
}

function spotOf(fields) {
  const x = Number(fields.x);
  const y = Number(fields.y);
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw fail(400, 'PIN_INVALID', 'Send the spot as x and y, 0 to 1 across and down the picture.');
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}

/** Refuses a pin beyond the caps: 5 from one person on one Moment, 200 on a Moment (held ones count). */
async function checkCaps(row, userId) {
  const { data, error } = await supabaseAdmin.from('PostPin')
    .select('reply_id, reply:PostComment!inner(user_id, is_deleted, moderation_state)')
    .eq('post_id', row.id).eq('reply.is_deleted', false).neq('reply.moderation_state', 'removed')
    .limit(MAX_PINS + 1);
  if (error) throw new Error(`Failed to count the pins: ${error.message}`);
  const pins = data || [];
  if (pins.length >= MAX_PINS) throw fail(409, 'PINS_FULL', 'This picture has all the pins it can hold.');
  const mine = pins.filter((pin) => String(pin.reply.user_id) === String(userId)).length;
  if (mine >= MAX_PINS_EACH) throw fail(409, 'PIN_LIMIT', `You can drop up to ${MAX_PINS_EACH} pins on one Moment. Remove one to drop another.`);
}

async function setDetail(replyId, detail) {
  const { error } = await supabaseAdmin.from('PostPin').update({ detail }).eq('reply_id', replyId);
  if (error) throw new Error(`Failed to update the pin: ${error.message}`);
}

/**
 * Deletes a pin's file (a voice bubble's or a cutout's) once its reply is gone or refused, and notes that it went.
 * Answers true when storage confirmed it (or there was nothing to delete).
 */
async function removeFileOf(pin) {
  const detail = pin?.detail || {};
  if (!FILE_KINDS.includes(pin?.kind) || !detail.key || detail.file_removed_at) return true;
  if (!(await media.removeKeys(detail.bucket, [detail.key]))) return false;
  await setDetail(pin.reply_id, { ...detail, file_removed_at: new Date().toISOString() });
  return true;
}

/** After its reply is removed (its writer, the Moment's author): the pin's file goes too. A no-op for a plain reply. */
async function replyRemoved(replyId) {
  const { data, error } = await supabaseAdmin.from('PostPin').select('reply_id, kind, detail').eq('reply_id', replyId).maybeSingle();
  if (error) throw new Error(`Failed to load the pin: ${error.message}`);
  if (data && !(await removeFileOf(data))) logger.warn('moments.pin_file_left', { replyId });
}

/**
 * The answer of a cutout's picture check (the check a Moment's picture passes, LEAD-3): passed, the pin goes live for
 * everyone; flagged, it is never shown and its file goes; not run (no key, an outage), it stays held, visible to its
 * sender only, and the cleanup job checks it again (jobs/momentsCleanup.js), up to momentCheck's MAX_ATTEMPTS; after
 * that a picture nothing could look at is never shown, and its file goes. Answers the state it left the pin in.
 */
async function applyCutoutCheck(pin, result) {
  const check = momentCheck();
  const before = pin.detail?.check || {};
  const attempts = (Number(before.attempts) || 0) + 1;
  const at = new Date().toISOString();
  if (result.status === 'passed') {
    const { error } = await supabaseAdmin.from('PostComment').update({ moderation_state: 'live' })
      .eq('id', pin.reply_id).eq('moderation_state', 'held').eq('is_deleted', false);
    if (error) throw new Error(`Failed to show the pin: ${error.message}`);
    await setDetail(pin.reply_id, { ...pin.detail, check: { status: 'passed', checked_at: at, attempts } });
    logger.info('moments.pin_checked', { replyId: pin.reply_id, status: 'passed' });
    return 'live';
  }
  const refused = result.status === 'flagged' || attempts > check.MAX_ATTEMPTS;
  const status = result.status === 'flagged' ? 'flagged' : (refused ? 'unavailable' : 'unchecked');
  const detail = { ...pin.detail, check: { status, reasons: result.reasons || [], checked_at: at, attempts } };
  await setDetail(pin.reply_id, detail);
  if (!refused) {
    logger.info('moments.pin_checked', { replyId: pin.reply_id, status: 'unchecked', attempts });
    return 'held';
  }
  const { error } = await supabaseAdmin.from('PostComment').update({ is_deleted: true, moderation_state: 'removed' }).eq('id', pin.reply_id);
  if (error) throw new Error(`Failed to remove the pin: ${error.message}`);
  if (!(await removeFileOf({ ...pin, detail }))) logger.warn('moments.pin_file_left', { replyId: pin.reply_id });
  logger.info('moments.pin_checked', { replyId: pin.reply_id, status, reasons: detail.check.reasons });
  return 'refused';
}

async function checkCutout(pin, png) {
  const check = momentCheck();
  const result = await check.checkPictures([await media.checkImage(png)], { madeUpName: false });
  return applyCutoutCheck(pin, result);
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
  await checkCaps(row, user.id);
  let detail = {};
  let words;
  let png = null;
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
      const key = media.keyFor(media.folderOwner(row), row.id, 'pin-voice', ownDigest(file.buffer), facts.ext);
      await media.put(bucket, key, file.buffer, facts.type);
      detail = { key, bucket, duration_ms: facts.durationMs, text: said || null };
      words = said ? `🎤 ${said}` : '🎤 Voice';
    } else {
      const type = String(file?.mimetype || '').toLowerCase();
      if (!file?.buffer?.length || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw fail(400, 'PIN_INVALID', 'Send the cutout as a PNG, JPEG or WebP "file".');
      if (file.buffer.length > MAX_CUTOUT_BYTES) throw fail(413, 'MEDIA_TOO_LARGE', 'This cutout is too large to post.');
      // A cutout is a picture: it is read (and re-encoded) so nothing but an image is stored.
      try {
        png = await sharp(file.buffer).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      } catch {
        throw fail(400, 'PIN_INVALID', 'This cutout could not be read.');
      }
      const key = media.keyFor(media.folderOwner(row), row.id, 'pin-cutout', ownDigest(png), 'png');
      await media.put(bucket, key, png, 'image/png');
      // Held until the picture check passes (seen by its sender only, as a held reply is).
      detail = { key, bucket, check: { status: 'checking', since: new Date().toISOString(), attempts: 0 } };
      words = '📷 Cutout';
    }
  }
  const { data: reply, error } = await supabaseAdmin.from('PostComment')
    .insert({ post_id: row.id, user_id: user.id, comment: words, moderation_state: png ? 'held' : 'live' }).select('id, created_at').single();
  if (error) {
    if (detail.key) await media.removeKeys(detail.bucket, [detail.key]);
    if (/POST_COMMENT_RATE_LIMIT/.test(error.message || '')) throw fail(429, 'REPLY_RATE_LIMIT', 'You are replying too quickly. Please wait a moment.');
    throw new Error(`Failed to keep the pin: ${error.message}`);
  }
  const { error: pinError } = await supabaseAdmin.from('PostPin').insert({ reply_id: reply.id, post_id: row.id, kind, ...spot, detail });
  if (pinError) {
    await supabaseAdmin.from('PostComment').delete().eq('id', reply.id);
    if (detail.key) await media.removeKeys(detail.bucket, [detail.key]);
    throw new Error(`Failed to keep the pin: ${pinError.message}`);
  }
  logger.info('moments.pin_added', { momentId: row.id, kind });
  if (png) {
    // The check runs now; the answer waits a little for it, and a slow one finishes after the answer.
    const finished = checkCutout({ reply_id: reply.id, kind, detail }, png);
    finished.catch((checkError) => logger.error('moments.pin_check_failed', { replyId: reply.id, error: checkError.message }));
    let timer;
    const state = await Promise.race([
      finished.catch(() => 'held'),
      new Promise((resolve) => { timer = setTimeout(() => resolve('held'), CHECK_WAIT_MS); }),
    ]);
    clearTimeout(timer);
    if (state === 'refused') throw fail(422, 'PIN_PICTURE_REFUSED', "This cutout can't be shown on the picture.");
  }
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
      // A cutout its picture check hasn't passed yet: shown to its sender only, until it does.
      checking: pin.reply.moderation_state === 'held' && pin.kind === 'cutout'
        && ['checking', 'unchecked'].includes(pin.detail?.check?.status),
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

// ─── Housekeeping (jobs/momentsCleanup.js) and account deletion ─────────────

/** Cutouts whose check couldn't run, or was left behind: checked again from the stored file. Answers how many. */
async function recheckCutouts() {
  const stuckBefore = new Date(Date.now() - STUCK_CHECK_MS).toISOString();
  const { data, error } = await supabaseAdmin.from('PostPin')
    .select('reply_id, kind, detail, reply:PostComment!inner(is_deleted, moderation_state)')
    .eq('kind', 'cutout').eq('reply.is_deleted', false).eq('reply.moderation_state', 'held')
    .or(`detail->check->>status.eq.unchecked,and(detail->check->>status.eq.checking,detail->check->>since.lt."${stuckBefore}")`)
    .order('created_at', { ascending: true }).limit(BATCH);
  if (error) throw new Error(`Failed to load held cutouts: ${error.message}`);
  let done = 0;
  for (const pin of data || []) {
    try {
      const png = await media.download(pin.detail.bucket, pin.detail.key).catch(() => null);
      const result = png ? await momentCheck().checkPictures([await media.checkImage(png)], { madeUpName: false })
        : { status: 'unchecked', reasons: [], error: 'picture unreadable' };
      await applyCutoutCheck(pin, result);
      done += 1;
    } catch (checkError) {
      logger.warn('[momentsCleanup] pin recheck failed', { replyId: pin.reply_id, error: checkError.message });
    }
  }
  return done;
}

/**
 * Files of pins whose reply is gone (removed by its writer, the Moment's author or a review, or its writer's account was
 * deleted) and still in storage: deleted. Catches what the moment of removal could not. Answers how many.
 */
async function sweepRemovedFiles() {
  let done = 0;
  for (const gone of [['reply.is_deleted', true], ['reply.moderation_state', 'removed']]) {
    const { data, error } = await supabaseAdmin.from('PostPin')
      .select('reply_id, kind, detail, reply:PostComment!inner(is_deleted, moderation_state)')
      .in('kind', FILE_KINDS).is('detail->>file_removed_at', null).eq(gone[0], gone[1])
      .order('created_at', { ascending: true }).limit(BATCH);
    if (error) throw new Error(`Failed to load removed pins: ${error.message}`);
    for (const pin of data || []) {
      if (await removeFileOf(pin)) done += 1;
    }
  }
  return done;
}

/**
 * The files of every pin a person dropped (DELETE /api/users/account reads them before the rows go; their replies are
 * scrubbed and the pins hidden with the account): [{ bucket, key }]. Empty for a person with no pins.
 */
async function accountPinFiles(userId) {
  const { data, error } = await supabaseAdmin.from('PostPin')
    .select('reply_id, kind, detail, reply:PostComment!inner(user_id)')
    .eq('reply.user_id', userId).in('kind', FILE_KINDS).is('detail->>file_removed_at', null).limit(5000);
  if (error) throw new Error(`Failed to load the person's pins: ${error.message}`);
  return (data || []).filter((pin) => pin.detail?.key).map((pin) => ({ bucket: pin.detail.bucket, key: pin.detail.key }));
}

/** Deletes the files accountPinFiles read. Answers how many went. */
async function removeAccountPinFiles(files) {
  const byBucket = new Map();
  for (const file of files || []) byBucket.set(file.bucket || '', [...(byBucket.get(file.bucket || '') || []), file.key]);
  let removed = 0;
  for (const [bucket, keys] of byBucket) {
    if (await media.removeKeys(bucket || undefined, keys)) removed += keys.length;
  }
  return removed;
}

module.exports = {
  create, list, pinsOf, replyRemoved, recheckCutouts, sweepRemovedFiles, accountPinFiles, removeAccountPinFiles,
  KINDS, MAX_PINS, MAX_PINS_EACH,
};
