'use strict';

// Fast check "I'm at home now" (FASTVERIFY phase 5, behind home_fast_verify_location; iPhone and Android only).
//   challenge  a signed, two-minute value bound to the person and the Home (nothing stored)
//   check      one reading: { challenge, latitude, longitude, accuracy_m, mocked, platform, proof }
// The reading passes when accuracy_m <= 50 and the point is within 30 m of the Home's map point. (The property index
// keeps lot sizes and building outlines, not lot outlines, and has no cheap nearby-address query, so neither the lot
// rule nor the nearest-point rule applies yet.) The first match marks the claim (kind 'location') with a second match
// due in 14 days; a match on a later calendar day in the home's time zone confirms it; a match in the last 30 days
// before the year ends, or after, renews it for another year. A reading needs a device proof (deviceProof.js) whenever
// APP_ENV is staging or production; only a local rig may set FAST_CHECK_LOCATION_TRUST_CLIENT=1. Mocked locations,
// simulators and emulators are not counted outside that rig setting. 5 tries a day. Kept: the result, the date and the
// accuracy; never the coordinates.

const crypto = require('crypto');
const db = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const fastCheck = require('../homeFastCheckService');
const deviceProof = require('./deviceProof');
const { haversineMeters } = require('../../utils/geo');
const { inferTimezone } = require('../context/locationResolver');

const { FastCheckError } = fastCheck;
const KIND = 'location';
const CHALLENGE_MS = 2 * 60 * 1000;
const MAX_ACCURACY_M = 50;
const MATCH_METERS = 30;
const RENEW_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const env = (key) => String(process.env[key] || '').trim();
const hosted = () => ['staging', 'production'].includes(env('APP_ENV').toLowerCase());
/** Only a local rig may count readings without a device proof. */
const trustClient = () => !hosted() && env('FAST_CHECK_LOCATION_TRUST_CLIENT') === '1';

function signingKey() {
  const secret = env('FAST_CHECK_SIGNING_KEY') || env('SUPABASE_JWT_SECRET') || env('JWT_SECRET');
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('pantopus-fast-check-location-challenge-v1').digest();
}

/** Is the location check usable from this platform on this server (a proof it can check, or the rig setting)? */
function ready(platform) {
  if (!signingKey()) return false;
  return trustClient() || deviceProof.configured(platform);
}

/** POST /api/homes/:id/fast-check/location/challenge → { challenge, expires_at } */
async function challenge({ homeId, user, platform }) {
  await fastCheck.admit({ homeId, user, kind: KIND, countLimit: false });
  if (platform !== 'ios' && platform !== 'android') throw new FastCheckError('FAST_CHECK_OFF');
  const key = signingKey();
  if (!key || !ready(platform)) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  const expires = Date.now() + CHALLENGE_MS;
  const body = Buffer.from(JSON.stringify({ h: homeId.toLowerCase(), u: user.id, e: expires, n: crypto.randomBytes(16).toString('base64url') }))
    .toString('base64url');
  const mac = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return { challenge: `${body}.${mac}`, expires_at: new Date(expires).toISOString() };
}

function challengeValid(value, homeId, userId, now = Date.now()) {
  const key = signingKey();
  const [body, mac] = String(value || '').split('.');
  if (!key || !body || !mac) return false;
  const expected = crypto.createHmac('sha256', key).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return claims.h === homeId.toLowerCase() && claims.u === userId && Number(claims.e) > now;
  } catch (_) {
    return false;
  }
}

/** The proof's reading text must say exactly what the request says. */
function readingMatches(readingText, input) {
  let reading;
  try { reading = JSON.parse(readingText); } catch (_) { return false; }
  return reading && Number(reading.latitude) === Number(input.latitude) && Number(reading.longitude) === Number(input.longitude)
    && Number(reading.accuracy_m) === Number(input.accuracy_m) && Boolean(reading.mocked) === Boolean(input.mocked)
    && reading.platform === input.platform;
}

async function proofCounts(input) {
  if (trustClient()) return { ok: true };
  if (input.mocked === true) return { ok: false, reason: 'mocked' };
  const proof = input.proof && typeof input.proof === 'object' ? input.proof : null;
  if (!proof || typeof proof.reading !== 'string' || !readingMatches(proof.reading, input)) return { ok: false, reason: 'no_proof' };
  const hash = deviceProof.readingHash(input.challenge, proof.reading);
  try {
    if (input.platform === 'ios') deviceProof.verifyAppAttest({ keyId: proof.key_id, attestation: proof.attestation, clientDataHash: hash });
    else if (input.platform === 'android') await deviceProof.verifyPlayIntegrity({ token: proof.token, nonceHash: hash });
    else return { ok: false, reason: 'platform' };
    return { ok: true };
  } catch (error) {
    logger.info('fast_check.location_proof_refused', { platform: input.platform, reason: error.proofReason || 'error' });
    return { ok: false, reason: `proof_${error.proofReason || 'error'}` };
  }
}

/** The Home's map point, or null. */
function homePoint(home) {
  const lat = Number(home.map_center_lat);
  const lng = Number(home.map_center_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

/** The calendar day (YYYY-MM-DD) of a time in a time zone. */
function dayIn(timeZone, at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

/** POST /api/homes/:id/fast-check/location → { result, level, recheck_due_at } */
async function check({ homeId, user, input }) {
  const occupancy = await fastCheck.admit({ homeId, user, kind: KIND });
  const answer = async (result) => {
    const level = await fastCheck.levelFor(homeId, user.id);
    const { data: row } = await db.from('HomeOccupancy').select('fast_check_kind, fast_check_recheck_due_at, fast_check_confirmed_at')
      .eq('id', occupancy.id).maybeSingle();
    const due = row && row.fast_check_kind === KIND && !row.fast_check_confirmed_at ? row.fast_check_recheck_due_at : null;
    return { result, level, recheck_due_at: due || null };
  };
  const accuracy = Number(input.accuracy_m);
  await fastCheck.logTry({ homeId, userId: user.id, kind: KIND, step: 'check' });
  // The accuracy is kept with the try (a whole number of meters); the coordinates never are.
  if (!challengeValid(input.challenge, homeId, user.id)) {
    void fastCheck.countTry(KIND, 'refused', ['challenge']);
    return answer('not_counted');
  }
  const proof = await proofCounts(input);
  if (!proof.ok) {
    void fastCheck.countTry(KIND, 'refused', [proof.reason]);
    return answer('not_counted');
  }
  if (!Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_M) {
    void fastCheck.countTry(KIND, 'miss', ['too_rough']);
    return answer('too_rough');
  }
  const { data: home, error } = await db.from('Home').select('id, map_center_lat, map_center_lng').eq('id', homeId).maybeSingle();
  if (error || !home) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  const point = homePoint(home);
  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  if (!point || !Number.isFinite(lat) || !Number.isFinite(lng) || haversineMeters(point.lat, point.lng, lat, lng) > MATCH_METERS) {
    void fastCheck.countTry(KIND, 'miss', [point ? 'no_match' : 'no_home_point']);
    return answer('no_match');
  }

  const now = new Date();
  const { data: current } = await db.from('HomeOccupancy').select('id, home_id, user_id, is_active, verification_status, verification_source, '
    + 'fast_check_kind, fast_check_at, fast_check_expires_at, fast_check_recheck_due_at, fast_check_confirmed_at').eq('id', occupancy.id).maybeSingle();
  // eslint-disable-next-line global-require
  const { fastCheckStands } = require('../../utils/homePermissions');
  const standing = current && fastCheckStands(current, now.getTime());
  if (standing && current.fast_check_kind !== KIND) {
    // Verified another way already: the reading matches, nothing changes.
    void fastCheck.countTry(KIND, 'pass', ['already_verified']);
    return answer('verified');
  }
  if (!standing) {
    await fastCheck.markFastCheck({ occupancyId: occupancy.id, kind: KIND, now });
    void fastCheck.countTry(KIND, 'pass', ['first']);
    return answer('verified');
  }
  if (!current.fast_check_confirmed_at) {
    const zone = inferTimezone(point.lat, point.lng, null) || 'America/Los_Angeles';
    if (dayIn(zone, now) === dayIn(zone, current.fast_check_at)) {
      void fastCheck.countTry(KIND, 'pass', ['same_day']);
      return answer('verified');
    }
    await updateRow(occupancy.id, { fast_check_confirmed_at: now.toISOString(), fast_check_recheck_due_at: null });
    void fastCheck.countTry(KIND, 'pass', ['confirmed']);
    return answer('confirmed');
  }
  const ends = Date.parse(current.fast_check_expires_at);
  if (Number.isFinite(ends) && ends - now.getTime() <= RENEW_WINDOW_DAYS * DAY_MS) {
    // eslint-disable-next-line global-require
    const { validityDays } = require('../../utils/verificationAge');
    await updateRow(occupancy.id, { fast_check_at: now.toISOString(), fast_check_expires_at: new Date(now.getTime() + validityDays() * DAY_MS).toISOString() });
    void fastCheck.countTry(KIND, 'pass', ['renewed']);
  } else {
    void fastCheck.countTry(KIND, 'pass', ['confirmed_again']);
  }
  return answer('confirmed');
}

async function updateRow(id, patch) {
  const { error } = await db.from('HomeOccupancy').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    .eq('fast_check_kind', KIND);
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
}

/**
 * The scheduled pass: a location check whose second match didn't come by its due time has stopped standing by itself
 * (fastCheckStands); tell the person once (section 6 words). Returns how many were told.
 */
async function noticeLapsed({ now = new Date(), limit = 200 } = {}) {
  const { data, error } = await db.from('HomeOccupancy').select('id, home_id, user_id, fast_check_at, fast_check_recheck_due_at')
    .eq('fast_check_kind', KIND).is('fast_check_confirmed_at', null).eq('is_active', true)
    .lt('fast_check_recheck_due_at', now.toISOString())
    .gt('fast_check_recheck_due_at', new Date(now.getTime() - 7 * DAY_MS).toISOString())
    .limit(limit);
  if (error) throw new Error(`location lapse read failed: ${error.message}`);
  let told = 0;
  for (const row of data || []) {
    if (!(await fastCheck.flagOn(fastCheck.FLAGS.base, row.user_id))) continue;
    // One notice per first match: the key names the occupancy and when it matched.
    const sent = await require('../notificationService').createNotification({
      userId: row.user_id, type: 'fast_check_location_lapsed', title: 'Open Pantopus at home to keep your Verified mark',
      body: 'We couldn\'t check your location a second time, so the mark is off for now. One tap at home brings it back.',
      link: `/app/homes/${row.home_id}/dashboard`, metadata: { home_id: row.home_id },
      idempotencyKey: `fast-check-location-lapsed:${row.id}:${row.fast_check_at}`,
    }).catch((err) => { logger.warn('fast_check.location_lapse_notice_failed', { error: err.message }); return null; });
    if (sent) told += 1;
  }
  return told;
}

module.exports = { challenge, check, noticeLapsed, ready, challengeValid, readingMatches, trustClient, MATCH_METERS, MAX_ACCURACY_M };
