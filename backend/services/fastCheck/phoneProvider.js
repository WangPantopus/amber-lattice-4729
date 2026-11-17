'use strict';

// The phone check's provider (FASTVERIFY phase 3): Twilio Verify for the text and the code, Twilio Lookup v2 Identity
// Match for the records question. Without its keys the option is UNAVAILABLE. A hosted server (APP_ENV staging or
// production) always talks to Twilio itself: the base-URL overrides that point a local rig at its stand-in are
// ignored there.

const KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID', 'FAST_CHECK_PHONE_HASH_KEY'];

const hosted = () => ['staging', 'production'].includes(String(process.env.APP_ENV || '').toLowerCase());

/** Are the phone check's keys all set on this server? */
function configured() {
  return KEYS.every((key) => typeof process.env[key] === 'string' && process.env[key].trim() !== '');
}

module.exports = { configured, hosted, KEYS };
