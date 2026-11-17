'use strict';

// Fast check by phone number (FASTVERIFY phase 3, behind home_fast_verify_phone). Two steps:
//   start   text a code to the number (Twilio Verify)
//   verify  check the code, then ask the records one question (Twilio Lookup Identity Match): is this number billed to
//           this name at this home's address? A pass marks the claim Verified (kind 'phone').
// Kept: the result, the date and a keyed hash of the number (one number marks one account). Never the number in
// clear, never the per-field match levels. The person is never told which part missed.
// Limits: 3 different numbers per account in 30 days, 5 codes per number per hour, and a server-wide daily ceiling of
// records checks (FAST_CHECK_PHONE_DAILY_MAX, default 200) after which the option is unavailable for the day.

const db = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const provider = require('./phoneProvider');
const fastCheck = require('../homeFastCheckService');

const { FastCheckError } = fastCheck;
const KIND = 'phone';
const CHECKS_PER_CODE = 5;
const RESEND_AFTER_S = 30;
const NAMES_KEPT_MS = 15 * 60 * 1000;
const CODE_WINDOW_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// "Name on the phone account", given at start and needed at verify: kept in this process only, for 15 minutes.
const givenNames = new Map();
function rememberNames(key, firstName, lastName) {
  const now = Date.now();
  for (const [k, v] of givenNames) if (v.at < now - NAMES_KEPT_MS) givenNames.delete(k);
  if (firstName || lastName) givenNames.set(key, { firstName: firstName || null, lastName: lastName || null, at: now });
}
function recallNames(key) {
  const kept = givenNames.get(key);
  return kept && kept.at >= Date.now() - NAMES_KEPT_MS ? kept : null;
}
const cleanName = (value) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : null);

/**
 * Another account's standing phone check on this number. Any other row that holds the number gives it back (an ended
 * check, or this person's own earlier one at another home), so the unique index never refuses a number that is free.
 */
async function numberInUse(hash, userId, occupancyId) {
  const { data, error } = await db.from('HomeOccupancy')
    .select('id, home_id, user_id, is_active, verification_status, verification_source, fast_check_kind, fast_check_at, fast_check_expires_at, fast_check_recheck_due_at, fast_check_confirmed_at')
    .eq('fast_check_ref_hash', hash).eq('is_active', true);
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  // eslint-disable-next-line global-require
  const { fastCheckStands } = require('../../utils/homePermissions');
  for (const row of data || []) {
    if (row.id === occupancyId) continue;
    if (row.user_id !== userId && fastCheckStands(row)) return true;
    await db.from('HomeOccupancy').update({ fast_check_ref_hash: null }).eq('id', row.id).eq('fast_check_ref_hash', hash);
  }
  return false;
}

/** 'start' rows for this number in the last hour, across every account (5 codes per number per hour). */
async function codesSentForNumber(ref) {
  const { count, error } = await db.from('HomeAuditLog').select('id', { count: 'exact', head: true })
    .eq('action', 'FAST_CHECK_TRIED').eq('metadata->>kind', KIND).eq('metadata->>step', 'start').eq('metadata->>ref', ref)
    .gte('created_at', new Date(Date.now() - HOUR_MS).toISOString());
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  return count || 0;
}

async function ready() {
  if (!provider.configured()) {
    void fastCheck.countTry(KIND, 'refused', ['unavailable']);
    throw new FastCheckError('PHONE_CHECK_UNAVAILABLE');
  }
}

/** POST /api/homes/:id/fast-check/phone/start → { sent: true, resend_after_s } */
async function start({ homeId, user, phone, firstName, lastName }) {
  const occupancy = await fastCheck.admit({ homeId, user, kind: KIND, countLimit: false });
  const e164 = provider.normalizeUsNumber(phone);
  if (!e164) throw new FastCheckError('PHONE_INVALID');
  await ready();
  if (await fastCheck.phoneDailyCeilingReached()) {
    void fastCheck.countTry(KIND, 'refused', ['daily_ceiling']);
    throw new FastCheckError('PHONE_CHECK_UNAVAILABLE');
  }
  const hash = provider.numberHash(e164);
  const ref = provider.numberRef(e164);
  if (await numberInUse(hash, user.id, occupancy.id)) {
    void fastCheck.countTry(KIND, 'refused', ['phone_in_use']);
    throw new FastCheckError('PHONE_IN_USE');
  }
  const recent = await fastCheck.triesSince({ userId: user.id, kind: KIND, step: 'start', sinceMs: Date.now() - fastCheck.LIMITS.phoneNumbers.windowMs });
  const numbers = new Set(recent.map((row) => row.metadata && row.metadata.ref).filter(Boolean));
  if ((!numbers.has(ref) && numbers.size >= fastCheck.LIMITS.phoneNumbers.numbers)
    || await codesSentForNumber(ref) >= fastCheck.LIMITS.phoneCodes.codes) {
    void fastCheck.countTry(KIND, 'refused', ['limit']);
    throw new FastCheckError('FAST_CHECK_LIMIT');
  }
  try {
    await provider.startVerification(e164);
  } catch (error) {
    logger.warn('fast_check.phone_start_failed', { status: error.status, twilio_code: error.twilioCode });
    void fastCheck.countTry(KIND, 'error', ['send_failed']);
    throw new FastCheckError('PHONE_CHECK_UNAVAILABLE');
  }
  await fastCheck.logTry({ homeId, userId: user.id, kind: KIND, step: 'start', ref });
  rememberNames(`${user.id}:${ref}`, cleanName(firstName), cleanName(lastName));
  return { sent: true, resend_after_s: RESEND_AFTER_S };
}

/** POST /api/homes/:id/fast-check/phone/verify → { result, level, tries_left } */
async function verify({ homeId, user, phone, code, firstName, lastName }) {
  const occupancy = await fastCheck.admit({ homeId, user, kind: KIND, countLimit: false });
  const e164 = provider.normalizeUsNumber(phone);
  if (!e164) throw new FastCheckError('PHONE_INVALID');
  await ready();
  const ref = provider.numberRef(e164);
  const hash = provider.numberHash(e164);
  // Checks of the code sent last (since the latest start, within ten minutes): five, as Verify allows.
  const since = Date.now() - CODE_WINDOW_MS;
  const rows = await fastCheck.triesSince({ userId: user.id, kind: KIND, sinceMs: since });
  const ofNumber = rows.filter((row) => row.metadata && row.metadata.ref === ref);
  const lastStart = ofNumber.findIndex((row) => row.metadata.step === 'start');
  const checks = (lastStart < 0 ? ofNumber : ofNumber.slice(0, lastStart)).filter((row) => row.metadata.step === 'verify').length;
  const level = async () => fastCheck.levelFor(homeId, user.id);
  if (lastStart < 0 || checks >= CHECKS_PER_CODE || !/^\d{4,10}$/.test(String(code || ''))) {
    return { result: 'wrong_code', level: await level(), tries_left: lastStart < 0 ? 0 : Math.max(0, CHECKS_PER_CODE - checks) };
  }
  await fastCheck.logTry({ homeId, userId: user.id, kind: KIND, step: 'verify', ref });
  const triesLeft = Math.max(0, CHECKS_PER_CODE - checks - 1);
  let status;
  try {
    status = await provider.checkVerification(e164, code);
  } catch (error) {
    logger.warn('fast_check.phone_check_failed', { status: error.status, twilio_code: error.twilioCode });
    void fastCheck.countTry(KIND, 'error', ['check_failed']);
    throw new FastCheckError('PHONE_CHECK_UNAVAILABLE');
  }
  if (status !== 'approved') return { result: 'wrong_code', level: await level(), tries_left: status === 'pending' ? triesLeft : 0 };

  if (await numberInUse(hash, user.id, occupancy.id)) {
    void fastCheck.countTry(KIND, 'refused', ['phone_in_use']);
    throw new FastCheckError('PHONE_IN_USE');
  }
  if (await fastCheck.phoneDailyCeilingReached()) {
    void fastCheck.countTry(KIND, 'refused', ['daily_ceiling']);
    throw new FastCheckError('PHONE_CHECK_UNAVAILABLE');
  }
  const [{ data: home, error: homeError }, { data: account, error: accountError }] = await Promise.all([
    db.from('Home').select('address, address2, city, state, zipcode').eq('id', homeId).maybeSingle(),
    db.from('User').select('first_name, last_name').eq('id', user.id).maybeSingle(),
  ]);
  if (homeError || accountError || !home) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  const kept = recallNames(`${user.id}:${ref}`);
  const holder = {
    firstName: cleanName(firstName) || (kept && kept.firstName) || cleanName(account && account.first_name),
    lastName: cleanName(lastName) || (kept && kept.lastName) || cleanName(account && account.last_name),
  };
  let identity;
  try {
    identity = await provider.identityMatch(e164, {
      firstName: holder.firstName, lastName: holder.lastName, addressLine1: home.address, addressLine2: home.address2,
      city: home.city, state: home.state, postalCode: String(home.zipcode || '').slice(0, 5),
    });
  } catch (error) {
    logger.warn('fast_check.phone_records_failed', { status: error.status, twilio_code: error.twilioCode });
    void fastCheck.countTry(KIND, 'error', ['records_failed']);
    throw new FastCheckError('PHONE_CHECK_UNAVAILABLE');
  }
  const { pass, reason } = holder.lastName ? provider.matchResult(identity) : { pass: false, reason: 'no_name' };
  givenNames.delete(`${user.id}:${ref}`);
  if (!pass) {
    void fastCheck.countTry(KIND, 'miss', [reason]);
    return { result: 'no_match', level: await level(), tries_left: triesLeft };
  }
  await fastCheck.markFastCheck({ occupancyId: occupancy.id, kind: KIND, refHash: hash });
  void fastCheck.countTry(KIND, 'pass', []);
  logger.info('fast_check.phone_verified', { home_id: homeId });
  return { result: 'verified', level: await level(), tries_left: triesLeft };
}

module.exports = { start, verify, RESEND_AFTER_S };
