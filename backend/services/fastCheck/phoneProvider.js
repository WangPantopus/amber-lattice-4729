'use strict';

// The phone check's provider (FASTVERIFY phase 3). Field names are Twilio's own, from its docs (read 2026-11-17):
//   Verify v2   POST {verify}/v2/Services/{ServiceSid}/Verifications       To, Channel=sms   → { sid, status: 'pending', ... }
//               POST {verify}/v2/Services/{ServiceSid}/VerificationCheck   To, Code          → { status: 'approved'|'pending'|... }
//               A check with no pending verification (expired, already approved, deleted) answers 404 (error 20404);
//               too many checks answer 429 (60202).
//   Lookup v2   GET  {lookups}/v2/PhoneNumbers/{E.164}?Fields=identity_match&FirstName&LastName&AddressLine1&AddressLine2
//                    &City&State&PostalCode&AddressCountryCode
//               → { valid, identity_match: { first_name_match, last_name_match, address_lines_match, city_match,
//                   state_match, postal_code_match, address_country_match, summary_score, error_code, error_message } }
//               Levels: exact_match, high_partial_match, partial_match, no_match, no_data_available.
// Requests are signed with an API key (HTTP basic, key SID and secret). Without the keys the option is UNAVAILABLE.
// A hosted server (APP_ENV staging or production) always talks to Twilio itself: the base-URL overrides that point a
// local rig at its stand-in are ignored there.

const crypto = require('crypto');

const KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID', 'FAST_CHECK_PHONE_HASH_KEY'];
const VERIFY_BASE = 'https://verify.twilio.com';
const LOOKUP_BASE = 'https://lookups.twilio.com';
const TIMEOUT_MS = 8000;

const env = (key) => String(process.env[key] || '').trim();
const hosted = () => ['staging', 'production'].includes(env('APP_ENV').toLowerCase());

/** Are the phone check's keys all set on this server? */
function configured() {
  return KEYS.every((key) => env(key) !== '');
}

function base(kind) {
  if (hosted()) return kind === 'verify' ? VERIFY_BASE : LOOKUP_BASE;
  const override = env(kind === 'verify' ? 'TWILIO_VERIFY_BASE_URL' : 'TWILIO_LOOKUP_BASE_URL');
  return (override || (kind === 'verify' ? VERIFY_BASE : LOOKUP_BASE)).replace(/\/+$/, '');
}

class PhoneProviderError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.status = status;
    this.twilioCode = code;
  }
}

async function call(method, url, form = null) {
  const auth = Buffer.from(`${env('TWILIO_API_KEY_SID')}:${env('TWILIO_API_KEY_SECRET')}`).toString('base64');
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Basic ${auth}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new PhoneProviderError(`phone provider unreachable: ${error.name}`);
  }
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/**
 * The number in E.164 for a US mobile number typed any common way ("(360) 555-0142", "360-555-0142", "+1 360 555
 * 0142"), or null. Identity Match answers for US numbers here, so only NANP numbers are taken.
 */
function normalizeUsNumber(input) {
  const digits = String(input || '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

/** The keyed hash of a number (FAST_CHECK_PHONE_HASH_KEY): what the occupancy keeps; never the number. */
function numberHash(e164) {
  return crypto.createHmac('sha256', env('FAST_CHECK_PHONE_HASH_KEY')).update(`phone:${e164}`).digest('hex');
}

/** A short form of that hash for the per-person limits in HomeAuditLog. */
function numberRef(e164) {
  return numberHash(e164).slice(0, 20);
}

/** Text a code to the number. Returns { sid, status }. Throws PhoneProviderError. */
async function startVerification(e164) {
  const url = `${base('verify')}/v2/Services/${encodeURIComponent(env('TWILIO_VERIFY_SERVICE_SID'))}/Verifications`;
  const { status, body } = await call('POST', url, { To: e164, Channel: 'sms' });
  if (status >= 200 && status < 300 && body && body.status) return { sid: body.sid || null, status: body.status };
  throw new PhoneProviderError('verification not started', { status, code: body && body.code });
}

/**
 * Check the code the person typed. Returns 'approved', 'pending' (a wrong code, more tries left), or 'closed' (no
 * pending verification: expired, used, or too many tries). Throws PhoneProviderError on anything else.
 */
async function checkVerification(e164, code) {
  const url = `${base('verify')}/v2/Services/${encodeURIComponent(env('TWILIO_VERIFY_SERVICE_SID'))}/VerificationCheck`;
  const { status, body } = await call('POST', url, { To: e164, Code: String(code) });
  if (status >= 200 && status < 300 && body) return body.status === 'approved' ? 'approved' : body.status === 'pending' ? 'pending' : 'closed';
  if (status === 404 || status === 429) return 'closed';
  throw new PhoneProviderError('verification check failed', { status, code: body && body.code });
}

/**
 * Ask the records one question: is this number billed to this name and address? Returns Twilio's identity_match
 * object (the caller keeps none of its per-field levels). Throws PhoneProviderError when it can't be asked.
 */
async function identityMatch(e164, { firstName, lastName, addressLine1, addressLine2, city, state, postalCode }) {
  const params = new URLSearchParams({ Fields: 'identity_match', AddressCountryCode: 'US' });
  for (const [key, value] of [['FirstName', firstName], ['LastName', lastName], ['AddressLine1', addressLine1],
    ['AddressLine2', addressLine2], ['City', city], ['State', state], ['PostalCode', postalCode]]) {
    if (value != null && String(value).trim() !== '') params.set(key, String(value).trim());
  }
  const url = `${base('lookup')}/v2/PhoneNumbers/${encodeURIComponent(e164)}?${params.toString()}`;
  const { status, body } = await call('GET', url);
  if (status >= 200 && status < 300 && body && body.identity_match && typeof body.identity_match === 'object') return body.identity_match;
  throw new PhoneProviderError('identity match unavailable', { status, code: body && body.code });
}

const STRONG = new Set(['exact_match', 'high_partial_match']);

/**
 * SPEC section 4's pass rule: an exact or high-partial match on address line 1, an exact match on postal code, and an
 * exact or high-partial match on last name. Anything else, "no data" included, is no match. Returns a reason code
 * for the counting only (never shown, never a per-field level).
 */
function matchResult(identity) {
  if (!identity || identity.error_code) return { pass: false, reason: 'no_data' };
  const levels = [identity.address_lines_match, identity.postal_code_match, identity.last_name_match];
  if (levels.every((level) => level === 'no_data_available' || level == null)) return { pass: false, reason: 'no_data' };
  const pass = STRONG.has(identity.address_lines_match) && identity.postal_code_match === 'exact_match'
    && STRONG.has(identity.last_name_match);
  return { pass, reason: pass ? null : 'no_match' };
}

module.exports = {
  configured, hosted, KEYS, normalizeUsNumber, numberHash, numberRef,
  startVerification, checkVerification, identityMatch, matchResult, PhoneProviderError,
};
