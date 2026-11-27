'use strict';

// Pulse, reinvented, phase 3: tomorrow's mail and "Mail it" (coord CONTRACT 8j; board B11). Both ride today's Mail tab.
// Mail it: the app sends an ordinary letter through today's POST /api/mailbox/send with the Moment's picture as the
// sender's own enclosure (enclosureFor), so today's letter rules all apply. Tomorrow's mail: a postcard is an ordinary
// letter from a person (pantopusLetters.sendSafe with `from_user`, made once per key, in one delivery round, under
// today's new-mail notice), with the picture enclosed through today's private mail enclosures.
// No new table and no new push kind; older apps and the switch off see ordinary mail.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const penName = require('../penName');

const ZONE = 'America/Los_Angeles';
const MORNING_HOUR = 7;
const PER_MORNING = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const letters = () => require('../pantopusLetters');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** Why this Moment can't go out as a postcard now, or null. */
function notMailable(row) {
  const store = momentStore();
  const m = store.meta(row);
  if (penName.isPenNameRow(row)) return "A Moment under a made-up name can't be mailed.";
  // eslint-disable-next-line global-require
  if (require('../moments/momentGuess').isGuess(row) && !store.hasEnded(row)) return "A guess the spot can't be mailed until it ends.";
  // eslint-disable-next-line global-require
  if (m.seal && require('./seal').isSealed(row)) return "A sealed Moment can't be mailed before it opens.";
  if (row.archived_at || row.moderation_state !== 'live') return 'This Moment can\'t be mailed.';
  return null;
}

/** The postcard's words and picture: { subject, content, summary, enclosures } for `sender` (an author's name). */
async function postcardOf(row, senderName) {
  const store = momentStore();
  const m = store.meta(row);
  const first = String(senderName || 'Someone').split(/\s+/)[0];
  const day = DateTime.fromISO(row.created_at).setZone(m.stamp_values?.zone || ZONE).toFormat('LLL d');
  const words = String(row.content || '').trim();
  const place = row.location_name || null;
  const content = [words || null, [place, day].filter(Boolean).join(' · ')].filter(Boolean).join('\n\n');
  const enclosures = [];
  const key = m.purged_at ? null : (m.kind === 'video' ? m.media?.poster_key : m.media?.key);
  if (key) {
    try {
      // eslint-disable-next-line global-require
      const buffer = await require('../moments/momentMedia').download(m.media.bucket, key);
      // eslint-disable-next-line global-require
      enclosures.push(await require('../mailEnclosures').keep({ buffer, name: `postcard-${day.replace(' ', '-')}.jpg`, mimeType: 'image/jpeg' }));
    } catch (error) {
      logger.warn('postcards.picture_not_enclosed', { momentId: row.id, error: error.message });
    }
  }
  return {
    subject: `A postcard from ${first}`,
    content: content || `A Moment from ${day}.`,
    summary: `${first} sent a Moment${place ? ` from ${place}` : ''}.`,
    enclosures,
  };
}

/**
 * POST /moments/:id/enclosure — the sender's own Moment's picture (a video's poster) kept as one of their own mail
 * enclosures (LEAD-3 07:34): the app then sends the letter through today's POST /api/mailbox/send with this `ref`, so
 * every rule of today's letters applies (the stamp, blocks, the recipient's mail settings). Answers today's upload shape.
 */
async function enclosureFor(userId, id) {
  const store = momentStore();
  if (!UUID.test(String(id || ''))) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const row = await store.ownMoment(id, userId);
  if (!row) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const why = notMailable(row);
  if (why) throw fail(400, 'MAIL_INVALID', why);
  const m = store.meta(row);
  const key = m.purged_at ? null : (m.kind === 'video' ? m.media?.poster_key : m.media?.key);
  if (!key) throw fail(400, 'MAIL_INVALID', 'This Moment has no picture to enclose.');
  // eslint-disable-next-line global-require
  const buffer = await require('../moments/momentMedia').download(m.media.bucket, key);
  const day = DateTime.fromISO(row.created_at).setZone(m.stamp_values?.zone || ZONE).toFormat('LLL-d');
  // eslint-disable-next-line global-require
  const kept = await require('../mailEnclosures').store({ buffer, name: `moment-${day}.jpg`, mimeType: 'image/jpeg', uploaderId: userId });
  return { enclosure: kept, words: String(row.content || '').trim() || null, place: row.location_name || null };
}

/** Whether it is 7 in the morning now in this person's own mailbox time zone (today's mail delivery reads it). */
async function isMorningFor(userId, now = Date.now()) {
  // eslint-disable-next-line global-require
  const zone = await require('../mailDelivery').mailboxTimeZone({ recipient_user_id: userId }).catch(() => ZONE);
  return DateTime.fromMillis(now, { zone: zone || ZONE }).hour === MORNING_HOUR;
}

/**
 * The job's work (jobs/pulseMorningMail.js), at 7 in the morning: for each person with the switch on who is in a
 * circle, up to 3 Moments from their circles' members that ended in the day before, that they could see while live
 * and never opened, as postcards from their authors. Made once per person and Moment. Answers how many it sent.
 */
async function sendMorning(now = Date.now(), { force = false } = {}) {
  // eslint-disable-next-line global-require
  if (!require('../../utils/featureFlags').isLaunchFeatureEnabled('mailbox')) return 0;
  const store = momentStore();
  const { data: circles, error } = await supabaseAdmin.from('Circle').select('members').limit(5000);
  if (error) throw new Error(`Failed to read circles: ${error.message}`);
  // Each person in a circle, and the people in their circles who chose, for that circle, "Keep my Moments for this
  // circle after they fade: its weekly magazine and morning postcards" (LEAD-3 07:34; off by default).
  const close = new Map();
  for (const circle of circles || []) {
    const inside = (circle.members || []).filter((m) => m.state === 'in');
    for (const person of inside) {
      const set = close.get(String(person.user_id)) || new Set();
      for (const other of inside) if (other.user_id !== person.user_id && other.keep_faded) set.add(String(other.user_id));
      close.set(String(person.user_id), set);
    }
  }
  let sent = 0;
  for (const [reader, people] of close) {
    try {
      if (!people.size || !(await store.reinventedOn(reader)) || (!force && !(await isMorningFor(reader, now)))) continue;
      const { data: rows, error: rowError } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
        .in('user_id', [...people]).gte('story_expires_at', new Date(now - DAY_MS).toISOString())
        .lte('story_expires_at', new Date(now).toISOString()).is('archived_at', null).eq('moderation_state', 'live')
        .order('story_expires_at', { ascending: false }).limit(50);
      if (rowError) throw new Error(rowError.message);
      const candidates = (rows || []).filter((row) => !notMailable(row) && !store.meta(row).at_home && !store.meta(row).purged_at);
      if (!candidates.length) continue;
      const [ctx, views, authors] = await Promise.all([
        store.viewerContext(reader, candidates.map((r) => r.user_id), null, candidates),
        supabaseAdmin.from('PostView').select('post_id').eq('user_id', reader).in('post_id', candidates.map((r) => r.id)),
        store.loadAuthors(candidates.map((r) => r.user_id)),
      ]);
      const opened = new Set((views.data || []).map((v) => v.post_id));
      // Could see it while it was live: the audience and mutes as then, not its having ended.
      const missed = candidates.filter((row) => !opened.has(row.id) && store.canSee(row, ctx)).slice(0, PER_MORNING);
      // One delivery: all of this morning's postcards arrive in the same round, under today's mail notice.
      // eslint-disable-next-line global-require
      const round = (await require('../mailDelivery').deliveryFor({ recipient_user_id: reader }, { now: new Date(now) })).delivered_at;
      for (const row of missed) {
        const name = authors.get(String(row.user_id))?.name || 'Someone';
        const result = await letters().sendSafe(`morning:${reader}:${row.id}`, {
          recipient_user_id: reader, from_user: { id: row.user_id, name }, delivered_at: round, ...(await postcardOf(row, name)),
        });
        if (result?.created) sent += 1;
      }
    } catch (readerError) {
      logger.warn('[pulseMorningMail] reader failed', { error: readerError.message });
    }
  }
  return sent;
}

module.exports = { enclosureFor, sendMorning, isMorningFor };
