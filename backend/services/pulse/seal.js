'use strict';

// Pulse, reinvented, phase 3: relics and "Seal it" (coord CONTRACT 8g). A Moment that opens later: on a date, at a place
// (for each reader standing within 100 m of it), or the first time it rains there. Until it opens nobody but its author
// sees what it holds; today's screens and the 2.1.6 apps don't see it at all (momentStore.canSee and listedFor, as a
// live guess-the-spot Moment). No new table: the seal rides the Moment's own kept value, and it stays.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { haversineMeters } = require('../../utils/trustState');

const OPENS = ['date', 'place', 'rain'];
const HOUR_MS = 60 * 60 * 1000;
const MAX_AHEAD_MS = 5 * 365 * 24 * HOUR_MS;
const RAIN_WAIT_MS = 365 * 24 * HOUR_MS;
const OPEN_M = 100;
const NEAR_M = 300;
const PAD = 0.005;
const RAIN_KINDS = new Set(['rain', 'drizzle', 'thunderstorm', 'showers']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONE = 'America/Los_Angeles';

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** What the post asks (`seal`), or null. Throws 400 on a bad field. */
function parse(body, now = Date.now()) {
  const seal = body?.seal;
  if (seal == null) return null;
  if (typeof seal !== 'object' || !OPENS.includes(seal.opens)) throw fail(400, 'SEAL_INVALID', 'Say when it opens: date, place or rain.');
  if (seal.opens !== 'date') return { opens: seal.opens, at: null };
  const at = Date.parse(seal.at || '');
  if (!Number.isFinite(at) || at < now + HOUR_MS || at > now + MAX_AHEAD_MS) {
    throw fail(400, 'SEAL_INVALID', 'Choose a day from an hour to five years from now.');
  }
  return { opens: 'date', at: new Date(at).toISOString() };
}

/** The posting checks: `place` and `rain` need an exact place; none at home, under a made-up name or as a guess spot. */
function checkPosting(ask, { unplaced, floating, showArea, atHome, underPenName, guess }) {
  if (!ask) return;
  if (underPenName) throw fail(400, 'SEAL_INVALID', "A sealed Moment can't be under a made-up name.");
  if (guess) throw fail(400, 'SEAL_INVALID', "A sealed Moment can't also be a guess the spot.");
  if (ask.opens === 'date') return;
  if (unplaced || floating || showArea) throw fail(400, 'SEAL_INVALID', 'One that opens at a place or with rain needs the exact spot.');
  if (atHome) throw fail(422, 'SEAL_AT_HOME', "One that opens at a place or with rain can't be left at your home.");
}

/** The kept part of a sealed Moment: it stays (as "Keep this?" keeps one), so it is there when it opens. */
function keptPart(ask) {
  return { seal: { v: 1, opens: ask.opens, at: ask.at, opened_at: null }, kept_post_at: new Date().toISOString() };
}

const sealOf = (row) => momentStore().meta(row).seal || null;

/** Whether the Moment is sealed and not open yet (a date that has come counts as open). */
function isSealed(row, now = Date.now()) {
  const seal = sealOf(row);
  if (!seal || seal.opened_at) return false;
  return !(seal.opens === 'date' && Date.parse(seal.at) <= now);
}

function hintOf(seal) {
  if (seal.opens === 'date') return `Opens on ${DateTime.fromISO(seal.at).setZone(ZONE).toFormat('LLL d, yyyy')}`;
  if (seal.opens === 'place') return 'Opens when you stand here';
  return 'Opens the next time it rains here';
}

/** The `seal` a reader gets: null for any other Moment. */
function sealAnswer(row, now = Date.now()) {
  const seal = sealOf(row);
  if (!seal) return null;
  const open = !isSealed(row, now);
  return {
    opens: seal.opens, at: seal.at || null, open, opened_at: open ? (seal.opened_at || seal.at || null) : null, hint: open ? null : hintOf(seal),
  };
}

/** A sealed Moment as someone other than its author reads it before it opens: nothing of what it holds. */
function withoutContent(moment) {
  return {
    ...moment,
    caption: null, text: null, media_url: null, poster_url: null, thumb_url: null, stamps: [], play: [], dots: [], sound: null,
    mentions: [], deck: null, retake: null,
  };
}

function pointOf(body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (body?.latitude == null || body?.longitude == null || !(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) {
    throw fail(400, 'SEAL_INVALID', 'Send where you are as latitude and longitude.');
  }
  return { latitude, longitude };
}

async function visible(rows, viewerId) {
  const store = momentStore();
  const standing = rows.filter((row) => !row.archived_at && row.moderation_state === 'live');
  if (!standing.length) return [];
  const [ctx, reported] = await Promise.all([store.viewerContext(viewerId, standing.map((r) => r.user_id), null, standing), store.reportedIds(viewerId)]);
  return standing.filter((row) => store.isOwn(row, viewerId) || (store.canSee(row, ctx) && !reported.has(row.id)));
}

/** POST /seals/:id/open — { latitude, longitude } in the body, never kept: a place relic, whole, for a reader standing there. */
async function openHere(id, viewerId, body) {
  const store = momentStore();
  const here = pointOf(body);
  if (!UUID.test(String(id || ''))) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const row = await store.loadMoment(id);
  if (!row || sealOf(row)?.opens !== 'place' || !(await visible([row], viewerId)).length) {
    throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  }
  const at = store.displayedPoint(row);
  if (at.latitude == null || haversineMeters(here.latitude, here.longitude, at.latitude, at.longitude) > OPEN_M) {
    throw fail(422, 'SEAL_NOT_HERE', 'Stand where it was left to open it.');
  }
  const [moment] = await store.serializeMoments([row], viewerId, { keptPosts: true, keptEnded: true, unsealed: true });
  return { moment };
}

/** POST /seals/near — { latitude, longitude } in the body, never kept: the place relics within 300 m the reader may see. */
async function near(viewerId, body) {
  const store = momentStore();
  const here = pointOf(body);
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .eq('post_metadata->moment->seal->>opens', 'place').is('archived_at', null).eq('moderation_state', 'live')
    .gte('latitude', here.latitude - PAD).lte('latitude', here.latitude + PAD)
    .gte('longitude', here.longitude - PAD * 1.5).lte('longitude', here.longitude + PAD * 1.5).limit(100);
  if (error) throw new Error(`Failed to load relics: ${error.message}`);
  const rows = (await visible(data || [], viewerId)).filter((row) => {
    const at = store.displayedPoint(row);
    return at.latitude != null && haversineMeters(here.latitude, here.longitude, at.latitude, at.longitude) <= NEAR_M;
  });
  const authors = await store.loadAuthors(rows.map((r) => r.user_id));
  return {
    relics: rows.map((row) => {
      const at = store.displayedPoint(row);
      const meters = haversineMeters(here.latitude, here.longitude, at.latitude, at.longitude);
      return {
        id: row.id, author: authors.get(String(row.user_id)) || null, left_at: row.created_at, hint: hintOf(sealOf(row)),
        here: meters <= OPEN_M,
      };
    }),
  };
}

/**
 * The rain job's work (jobs/pulseSeals.js): rain relics not opened yet; one that has rain at its point now, or has
 * waited a year, opens for everyone. Answers how many opened.
 */
async function openWithRain(now = Date.now()) {
  const store = momentStore();
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .eq('post_metadata->moment->seal->>opens', 'rain').is('post_metadata->moment->seal->>opened_at', null)
    .is('archived_at', null).order('created_at', { ascending: true }).limit(100);
  if (error) throw new Error(`Failed to load rain relics: ${error.message}`);
  // eslint-disable-next-line global-require
  const weather = require('../moments/momentWeather');
  let opened = 0;
  for (const row of data || []) {
    try {
      const waited = now - Date.parse(row.created_at) >= RAIN_WAIT_MS;
      const read = waited ? null : await weather.weatherAt(row.latitude, row.longitude);
      if (!waited && !RAIN_KINDS.has(read?.kind)) continue;
      const updated = await store.updateMoment(row, { moment: { seal: { ...sealOf(row), opened_at: new Date(now).toISOString() } } });
      if (updated) opened += 1;
    } catch (rainError) {
      logger.warn('[pulseSeals] rain check failed', { momentId: row.id, error: rainError.message });
    }
  }
  return opened;
}

module.exports = {
  parse, checkPosting, keptPart, isSealed, sealAnswer, withoutContent, openHere, near, openWithRain, OPEN_M, OPENS,
};
