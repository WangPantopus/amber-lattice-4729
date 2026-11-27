'use strict';

// Pulse, reinvented, phase 2: voice and sound as media on a Moment (coord CONTRACT 7e): Voice Spark (the person's own
// voice with their exact words, timed), place sound (three seconds kept when the shot is held) and a voice whisper on a
// dot. They are media like a Moment's video: stored in the same private bucket, in the Moment's own folder (so the 7-day
// cleanup, Delete, Delete for good and a deleted account remove them with its picture, and a kept Moment keeps them),
// handed out as the same short signed links, only while the Moment's picture link is. Speech becomes words on the phone;
// the server keeps the words and their times as sent. Never under a made-up name: a voice tells who someone is.

const media = require('../moments/momentMedia');
const penName = require('../penName');
const logger = require('../../utils/logger');

const KINDS = ['voice', 'place', 'whisper'];
const MAX_MS = { voice: 60 * 1000, place: 3500, whisper: 3500 };
const MAX_BYTES = { voice: 2 * 1024 * 1024, place: 400 * 1024, whisper: 400 * 1024 };
const MP4_TYPES = ['audio/mp4', 'audio/x-m4a', 'audio/m4a'];
const WEB_TYPES = ['audio/webm', 'audio/ogg'];
const EXT = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };
const MAX_WORDS = 200;
const TOLERANCE_MS = 500;

// Required when used: momentStore requires this file for its answers.
// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

function invalid(message) {
  return momentStore().fail(400, 'SOUND_INVALID', message);
}

/** The words a voice carries, as sent ([{ w, start_ms, end_ms }], in order), or throws SOUND_INVALID. */
function parseWords(raw, durationMs) {
  if (raw == null || raw === '') return null;
  let list;
  try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw invalid('words must be a list.'); }
  if (!Array.isArray(list) || list.length > MAX_WORDS) throw invalid(`words holds at most ${MAX_WORDS} words.`);
  let last = 0;
  return list.map((entry, index) => {
    const w = typeof entry?.w === 'string' ? entry.w.trim().slice(0, 40) : '';
    const start = Math.round(Number(entry?.start_ms));
    const end = Math.round(Number(entry?.end_ms));
    if (!w || !Number.isFinite(start) || !Number.isFinite(end) || start < last - 1 || end < start || end > durationMs + TOLERANCE_MS) {
      throw invalid(`words[${index}] needs a word and its times, in order, inside the sound.`);
    }
    last = start;
    return { w, start_ms: start, end_ms: end };
  });
}

// A browser's sound must be what it says it is (LEAD-3): WebM starts 1A 45 DF A3, Ogg starts "OggS".
const MAGIC = { 'audio/webm': Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'audio/ogg': Buffer.from('OggS', 'latin1') };

/** The sound's length: read from an MP4-family file, or the app's own measure for the web's formats. */
function lengthOf(file, type, sentMs) {
  if (MAGIC[type] && !file.buffer.subarray(0, MAGIC[type].length).equals(MAGIC[type])) {
    throw invalid('This sound is not the kind of file it says it is.');
  }
  if (MP4_TYPES.includes(type)) {
    try {
      return media.videoFacts(file.buffer).durationMs;
    } catch {
      throw invalid('This sound could not be read. Send an M4A file.');
    }
  }
  const ms = Math.round(Number(sentMs));
  if (!Number.isFinite(ms) || ms <= 0) throw invalid('Send duration_ms with this sound.');
  return ms;
}

/**
 * POST /moments/:id/sound — the author's voice, place sound or a dot's whisper on their own Moment (CONTRACT 7e).
 * Answers the Moment as its author reads it.
 */
async function upload(id, user, file, fields) {
  const store = momentStore();
  const row = await store.ownMoment(id, user.id);
  if (!row) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  if (store.momentState(row) === 'ended') throw store.fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  const m = store.meta(row);
  if (!['photo', 'video'].includes(m.kind)) throw invalid('Sound goes on a photo or a video.');
  // No sound under a made-up name (LEAD-3, told to the founder): a person's own voice tells who they are.
  if (penName.isPenNameRow(row)) throw store.fail(400, 'PEN_NAME_NO_SOUND', "A made-up name can't carry sound: a voice tells who you are.");
  const kind = String(fields.kind || '');
  if (!KINDS.includes(kind)) throw invalid('kind must be voice, place or whisper.');
  if (!file?.buffer?.length) throw invalid('Send the sound as "file".');
  const type = String(file.mimetype || '').toLowerCase().split(';')[0];
  if (![...MP4_TYPES, ...WEB_TYPES].includes(type)) throw invalid('Send the sound as M4A (or WebM or Ogg from a browser).');
  if (file.buffer.length > MAX_BYTES[kind]) throw store.fail(413, 'MEDIA_TOO_LARGE', 'This sound is too large to post.');
  const durationMs = lengthOf(file, type, fields.duration_ms);
  if (durationMs > MAX_MS[kind] + TOLERANCE_MS) {
    throw invalid(kind === 'voice' ? 'A voice can be up to a minute.' : 'This sound can be up to three seconds.');
  }
  const dotId = kind === 'whisper' ? String(fields.dot || '') : null;
  if (kind === 'whisper' && !(m.dots || []).some((dot) => dot.id === dotId && dot.kind === 'whisper')) {
    throw invalid('Send the id of a whisper dot on this Moment.');
  }
  const words = kind === 'voice' ? parseWords(fields.words, durationMs) : null;
  const bucket = await media.privateBucket(m.media?.bucket);
  const key = media.keyFor(media.folderOwner(row), row.id, kind === 'whisper' ? `whisper-${dotId.replace(/[^a-z0-9]/g, '')}` : `sound-${kind}`,
    media.sha256(file.buffer), EXT[type]);
  await media.put(bucket, key, file.buffer, type);
  const stored = { key, bucket, content_type: type, duration_ms: durationMs };
  // Worked out from the Moment as it is when written, so sounds sent at the same moment keep each other (LEAD-3).
  const updated = await store.changeMoment(row, (now) => (kind === 'whisper'
    ? { whispers: { ...(now.whispers || {}), [dotId]: stored } }
    : { sound: { ...stored, kind, words, cleaned: String(fields.cleaned) === 'true' } }), { archived_at: null });
  if (!updated) throw store.fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  // The sound it replaced, if any, stays in the folder until the Moment's files go (as every file there does).
  logger.info('moments.sound_added', { momentId: id, kind, duration_ms: durationMs, words: words?.length || 0 });
  return updated;
}

/** DELETE /moments/:id/sound?kind= — the author takes a voice or place sound off; its file goes now. */
async function remove(id, user, kind) {
  const store = momentStore();
  const row = await store.ownMoment(id, user.id);
  if (!row) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const m = store.meta(row);
  if (!['voice', 'place'].includes(kind) || m.sound?.kind !== kind) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This sound could not be found.');
  await store.updateMoment(row, { moment: { sound: null } });
  await media.removeKeys(m.sound.bucket, [m.sound.key]).catch((error) => logger.warn('moments.sound_remove_failed', { error: error.message }));
}

/** Every stored key of a Moment's sound and whispers, for signing alongside its picture. */
function soundKeys(m) {
  return [m?.sound?.key, ...Object.values(m?.whispers || {}).map((whisper) => whisper?.key)].filter(media.isMomentKey);
}

/** A Moment's `sound` as a reader gets it (CONTRACT 7e): a link only while its picture's link is given. */
function soundOf(m, links, show) {
  const sound = m?.sound;
  if (!sound) return null;
  return {
    kind: sound.kind,
    url: show ? links.get(sound.key) || null : null,
    duration_ms: sound.duration_ms ?? null,
    words: Array.isArray(sound.words) ? sound.words : null,
    cleaned: Boolean(sound.cleaned),
  };
}

/**
 * A short voice file checked as a whisper's is (type, first bytes, length up to 3.5 s, size): { type, ext, durationMs }.
 * For a voice bubble pinned on a picture (CONTRACT 8b).
 */
function checkShortVoice(file, sentMs) {
  if (!file?.buffer?.length) throw invalid('Send the sound as "file".');
  const type = String(file.mimetype || '').toLowerCase().split(';')[0];
  if (![...MP4_TYPES, ...WEB_TYPES].includes(type)) throw invalid('Send the sound as M4A (or WebM or Ogg from a browser).');
  if (file.buffer.length > MAX_BYTES.whisper) throw momentStore().fail(413, 'MEDIA_TOO_LARGE', 'This sound is too large to post.');
  const durationMs = lengthOf(file, type, sentMs);
  if (durationMs > MAX_MS.whisper + TOLERANCE_MS) throw invalid('This sound can be up to three seconds.');
  return { type, ext: EXT[type], durationMs };
}

module.exports = { upload, remove, soundKeys, soundOf, checkShortVoice, KINDS, MAX_BYTES };
