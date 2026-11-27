'use strict';

// Pulse, reinvented, phase 3: tomorrow's mail and "Mail it" (coord CONTRACT 8j; board B11). Both ride today's Mail tab:
// a postcard is an ordinary letter from a person (pantopusLetters.sendSafe with `from_user`, made once per key, by today's
// delivery rule and today's new-mail notice), with the picture enclosed through today's private mail enclosures.
// No new table and no new push kind; older apps and the switch off see ordinary mail.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const blockService = require('../blockService');
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

/** POST /moments/:id/mail — { to }: the sender's own Moment, mailed to one of their connections. */
async function mailIt(userId, id, body) {
  const store = momentStore();
  const to = String(body?.to || '').toLowerCase();
  if (!UUID.test(String(id || '')) || !UUID.test(to)) throw fail(400, 'MAIL_INVALID', 'Send who it goes to as "to".');
  const row = await store.ownMoment(id, userId);
  if (!row) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const why = notMailable(row);
  if (why) throw fail(400, 'MAIL_INVALID', why);
  const [connections, blocked] = await Promise.all([store.connectionIds(userId), blockService.blockedUserIds(userId)]);
  if (!connections.map(String).includes(to) || blocked.has(to)) throw fail(404, 'PERSON_NOT_FOUND', 'You can mail a Moment to your connections.');
  const authors = await store.loadAuthors([userId]);
  const name = authors.get(String(userId))?.name || 'Someone';
  const card = await postcardOf(row, name);
  const result = await letters().sendSafe(`moment-mail:${row.id}:${to}`, {
    recipient_user_id: to, from_user: { id: userId, name }, immediate: true, ...card,
  });
  if (!result) throw new Error('The postcard could not be written.');
  if (!result.created) throw fail(409, 'MAILED_ALREADY', 'You already mailed this Moment to them.');
  logger.info('postcards.mailed', { momentId: row.id });
  return { mail_id: result.id };
}

/** Whether it is the morning hour now (Pacific until a person's own zone is known). */
function isMorning(now = Date.now()) {
  return DateTime.fromMillis(now, { zone: ZONE }).hour === MORNING_HOUR;
}

/**
 * The job's work (jobs/pulseMorningMail.js), at 7 in the morning: for each person with the switch on who is in a
 * circle, up to 3 Moments from their circles' members that ended in the day before, that they could see while live
 * and never opened, as postcards from their authors. Made once per person and Moment. Answers how many it sent.
 */
async function sendMorning(now = Date.now(), { force = false } = {}) {
  if (!force && !isMorning(now)) return 0;
  const store = momentStore();
  const { data: circles, error } = await supabaseAdmin.from('Circle').select('members').limit(5000);
  if (error) throw new Error(`Failed to read circles: ${error.message}`);
  // Each person in a circle, and the people in their circles.
  const close = new Map();
  for (const circle of circles || []) {
    const inside = (circle.members || []).filter((m) => m.state === 'in').map((m) => String(m.user_id));
    for (const person of inside) {
      const set = close.get(person) || new Set();
      for (const other of inside) if (other !== person) set.add(other);
      close.set(person, set);
    }
  }
  let sent = 0;
  for (const [reader, people] of close) {
    try {
      if (!people.size || !(await store.reinventedOn(reader))) continue;
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
      for (const row of missed) {
        const name = authors.get(String(row.user_id))?.name || 'Someone';
        const result = await letters().sendSafe(`morning:${reader}:${row.id}`, {
          recipient_user_id: reader, from_user: { id: row.user_id, name }, ...(await postcardOf(row, name)),
        });
        if (result?.created) sent += 1;
      }
    } catch (readerError) {
      logger.warn('[pulseMorningMail] reader failed', { error: readerError.message });
    }
  }
  return sent;
}

module.exports = { mailIt, sendMorning, isMorning };
