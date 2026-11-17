'use strict';

// The device proof for the location check (FASTVERIFY phase 5): it binds a reading to a real copy of the app on a real
// phone, so posting a home's coordinates can't pass. The reading's hash is SHA-256 of the challenge followed by the
// exact JSON text of the reading the app sends (`proof.reading`), so both sides hash the same bytes.
//
// iPhone: an App Attest attestation (DCAppAttestService.attestKey) whose clientDataHash is that hash. Checked as Apple's
// "Validating apps that connect to your server" says (read 2026-11-17): the x5c chain to Apple's App Attest root; the
// credCert extension 1.2.840.113635.100.8.2 equals SHA-256(authData || clientDataHash); SHA-256 of the credCert public
// key (X9.62 uncompressed) equals the key id and the credentialId; the RP ID hash equals SHA-256 of the App ID
// (APP_ATTEST_APP_ID, "<team id>.<bundle id>"); the counter is 0; the aaguid is "appattest" + seven 0x00 bytes
// (production) or "appattestdevelop" (APP_ATTEST_ENV=development); apple_validation_category_01, when present, is the
// App Store (4) or TestFlight (2) (or a development build in development).
//
// Android: a Play Integrity classic token whose nonce is that hash (URL-safe base64, no padding), decoded on Google's
// server (playintegrity.googleapis.com/v1/<package>:decodeIntegrityToken, a service account with the playintegrity
// scope: PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON). Checked as Google's "Integrity verdicts" says: requestDetails names this
// package and the nonce and is recent; appIntegrity.appRecognitionVerdict is PLAY_RECOGNIZED for this package;
// deviceIntegrity.deviceRecognitionVerdict includes MEETS_DEVICE_INTEGRITY.

const crypto = require('crypto');

const APPLE_APP_ATTEST_ROOT = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;
const NONCE_OID = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02]); // 1.2.840.113635.100.8.2
const AAGUID_PROD = Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)]);
const AAGUID_DEV = Buffer.from('appattestdevelop');
const PLAY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

const env = (key) => String(process.env[key] || '').trim();
const sha256 = (data) => crypto.createHash('sha256').update(data).digest();
const fail = (reason) => Object.assign(new Error(reason), { proofReason: reason });

/** The bytes both sides hash: the challenge, then the reading's JSON text, as UTF-8. */
function readingHash(challenge, readingText) {
  return sha256(Buffer.from(`${challenge}${readingText}`, 'utf8'));
}

// ── A small CBOR reader (RFC 8949): what an attestation object and its authenticator data hold ───────────────────────

function cborDecode(buf, offset = 0) {
  const first = buf[offset];
  if (first === undefined) throw fail('cbor');
  const major = first >> 5;
  const info = first & 0x1f;
  let pos = offset + 1;
  let length;
  if (info < 24) length = info;
  else if (info === 24) { length = buf[pos]; pos += 1; }
  else if (info === 25) { length = buf.readUInt16BE(pos); pos += 2; }
  else if (info === 26) { length = buf.readUInt32BE(pos); pos += 4; }
  else if (info === 27) { length = Number(buf.readBigUInt64BE(pos)); pos += 8; }
  else throw fail('cbor');
  switch (major) {
    case 0: return { value: length, end: pos };
    case 1: return { value: -1 - length, end: pos };
    case 2: if (pos + length > buf.length) throw fail('cbor'); return { value: buf.subarray(pos, pos + length), end: pos + length };
    case 3: if (pos + length > buf.length) throw fail('cbor'); return { value: buf.subarray(pos, pos + length).toString('utf8'), end: pos + length };
    case 4: {
      const out = [];
      for (let i = 0; i < length; i += 1) { const item = cborDecode(buf, pos); out.push(item.value); pos = item.end; }
      return { value: out, end: pos };
    }
    case 5: {
      const out = new Map();
      for (let i = 0; i < length; i += 1) {
        const key = cborDecode(buf, pos); const item = cborDecode(buf, key.end);
        out.set(key.value, item.value); pos = item.end;
      }
      return { value: out, end: pos };
    }
    case 6: return cborDecode(buf, pos);
    case 7: return { value: info === 20 ? false : info === 21 ? true : null, end: pos };
    default: throw fail('cbor');
  }
}

/** One DER TLV at pos: its tag and where its content starts and ends. */
function derTLV(buf, pos) {
  const tag = buf[pos];
  let length = buf[pos + 1];
  let header = 2;
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n < 1 || n > 4) throw fail('der');
    length = 0;
    for (let i = 0; i < n; i += 1) length = (length * 256) + buf[pos + 2 + i];
    header = 2 + n;
  }
  if (tag === undefined || pos + header + length > buf.length) throw fail('der');
  return { tag, start: pos + header, end: pos + header + length };
}

/**
 * The nonce in the credCert's extension 1.2.840.113635.100.8.2 (DER): the extension's value is an OCTET STRING holding
 * SEQUENCE { [1] { OCTET STRING (32 bytes) } }. Null when it isn't there.
 */
function nonceFromCert(der) {
  const at = der.indexOf(NONCE_OID);
  if (at < 0) return null;
  let value = derTLV(der, at + NONCE_OID.length);
  if (value.tag === 0x01) value = derTLV(der, value.end); // "critical"
  if (value.tag !== 0x04) return null;
  const sequence = derTLV(der, value.start);
  if (sequence.tag !== 0x30) return null;
  for (let pos = sequence.start; pos < sequence.end;) {
    const child = derTLV(der, pos);
    if (child.tag === 0xa1) {
      const octets = derTLV(der, child.start);
      if (octets.tag === 0x04 && octets.end - octets.start === 32) return der.subarray(octets.start, octets.end);
    }
    pos = child.end;
  }
  return null;
}

function appAttestConfigured() {
  return /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(env('APP_ATTEST_APP_ID'));
}

/** Check an App Attest attestation for this reading. Throws (proofReason) when it isn't one. */
function verifyAppAttest({ keyId, attestation, clientDataHash, now = new Date() }) {
  if (!appAttestConfigured()) throw fail('not_configured');
  const keyIdBytes = Buffer.from(String(keyId || ''), 'base64');
  const raw = Buffer.from(String(attestation || ''), 'base64');
  if (keyIdBytes.length !== 32 || raw.length < 100) throw fail('malformed');
  const object = cborDecode(raw).value;
  if (!(object instanceof Map) || object.get('fmt') !== 'apple-appattest') throw fail('format');
  const statement = object.get('attStmt');
  const authData = object.get('authData');
  const x5c = statement instanceof Map ? statement.get('x5c') : null;
  if (!Array.isArray(x5c) || x5c.length < 2 || !Buffer.isBuffer(authData)) throw fail('format');
  const credCert = new crypto.X509Certificate(x5c[0]);
  const intermediate = new crypto.X509Certificate(x5c[1]);
  const root = new crypto.X509Certificate(APPLE_APP_ATTEST_ROOT);
  const within = (cert) => Date.parse(cert.validFrom) <= now.getTime() && now.getTime() <= Date.parse(cert.validTo);
  if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey) || !credCert.checkIssued(intermediate)
    || !credCert.verify(intermediate.publicKey) || !within(credCert) || !within(intermediate) || !within(root)) throw fail('chain');
  const nonce = sha256(Buffer.concat([authData, clientDataHash]));
  const inCert = nonceFromCert(Buffer.from(credCert.raw));
  if (!inCert || !crypto.timingSafeEqual(inCert, nonce)) throw fail('nonce');
  const jwk = credCert.publicKey.export({ format: 'jwk' });
  const point = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  if (!sha256(point).equals(keyIdBytes)) throw fail('key');
  if (authData.length < 55) throw fail('auth_data');
  if (!authData.subarray(0, 32).equals(sha256(Buffer.from(env('APP_ATTEST_APP_ID'))))) throw fail('app_id');
  const flags = authData[32];
  if (authData.readUInt32BE(33) !== 0) throw fail('counter');
  const development = env('APP_ATTEST_ENV') === 'development';
  if (!authData.subarray(37, 53).equals(development ? AAGUID_DEV : AAGUID_PROD)) throw fail('environment');
  const credLength = authData.readUInt16BE(53);
  if (credLength !== 32 || !authData.subarray(55, 55 + credLength).equals(keyIdBytes)) throw fail('credential');
  // Extensions follow the key; Apple's sample carries them with the ED flag clear, so read whatever follows.
  const cose = cborDecode(authData, 55 + credLength);
  if ((flags & 0x80) || cose.end < authData.length) {
    const extensions = cborDecode(authData, cose.end).value;
    const raw = extensions instanceof Map ? extensions.get('apple_validation_category_01') : undefined;
    // A UInt32, as four little-endian bytes in Apple's sample (01 00 00 00 for an OS executable).
    const category = Buffer.isBuffer(raw) && raw.length === 4 ? raw.readUInt32LE(0) : raw;
    const allowed = development ? [2, 3, 4] : [2, 4];
    if (category !== undefined && !allowed.includes(Number(category))) throw fail('category');
  }
  return true;
}

// ── Play Integrity ──────────────────────────────────────────────────────────────────────────────────────────────────

let googleToken = null;
function serviceAccount() {
  const raw = env('PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON');
  if (!raw) return null;
  try {
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const account = JSON.parse(text);
    return account.client_email && account.private_key ? account : null;
  } catch (_) {
    return null;
  }
}
const playPackage = () => env('PLAY_INTEGRITY_PACKAGE_NAME') || 'com.pantopus.app';
function playIntegrityConfigured() { return serviceAccount() !== null; }

async function googleAccessToken() {
  if (googleToken && googleToken.until > Date.now() + 60000) return googleToken.token;
  const account = serviceAccount();
  if (!account) throw fail('not_configured');
  const audience = account.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: account.client_email, scope: PLAY_SCOPE, aud: audience, iat, exp: iat + 3600 })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url');
  const res = await fetch(audience, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }).toString(),
    signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) throw fail('google_auth');
  googleToken = { token: body.access_token, until: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return googleToken.token;
}

const unpadded = (value) => String(value || '').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Check a Play Integrity token for this reading. Throws (proofReason) when it isn't one. */
async function verifyPlayIntegrity({ token, nonceHash, now = Date.now() }) {
  if (!playIntegrityConfigured()) throw fail('not_configured');
  if (typeof token !== 'string' || token.length < 20 || token.length > 20000) throw fail('malformed');
  const pkg = playPackage();
  const res = await fetch(`https://playintegrity.googleapis.com/v1/${encodeURIComponent(pkg)}:decodeIntegrityToken`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await googleAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrity_token: token }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw fail('google_decode');
  const payload = body.tokenPayloadExternal || body;
  const request = payload.requestDetails || {};
  if (request.requestPackageName !== pkg) throw fail('package');
  if (unpadded(request.nonce) !== nonceHash.toString('base64url')) throw fail('nonce');
  const at = Number(request.timestampMillis);
  if (!Number.isFinite(at) || Math.abs(now - at) > TOKEN_MAX_AGE_MS) throw fail('stale');
  const app = payload.appIntegrity || {};
  if (app.appRecognitionVerdict !== 'PLAY_RECOGNIZED' || app.packageName !== pkg) throw fail('app');
  const device = (payload.deviceIntegrity && payload.deviceIntegrity.deviceRecognitionVerdict) || [];
  if (!Array.isArray(device) || !device.includes('MEETS_DEVICE_INTEGRITY')) throw fail('device');
  return true;
}

/** Is the proof for this platform set up on this server? */
function configured(platform) {
  return platform === 'ios' ? appAttestConfigured() : platform === 'android' ? playIntegrityConfigured() : false;
}

module.exports = { readingHash, verifyAppAttest, verifyPlayIntegrity, configured, cborDecode, nonceFromCert, APPLE_APP_ATTEST_ROOT };
