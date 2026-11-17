'use strict';

// Faster home verification (FASTVERIFY; the founder approved the design and its nine decisions on 2026-11-17).
// A fast check (phone number, at home now, a bill read at once) marks a claimed occupancy (verification_source
// 'claim', today's instant claim) as Verified: the Verified mark, messaging homes near you, Place's verified sections
// and Real Rent. Mail stays the proof for residency letters, home Mail and owner powers. The gates live in
// utils/homePermissions.js (isVerifiedResident unchanged, isVerified new); this service answers which ways to verify
// a person has (GET /api/homes/:id/verify-options), writes the marks, keeps the per-person limits and counts every try.
// Everything is behind the FeatureFlag rows below, all off by default: with home_fast_verify off nothing here answers.

const db = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const featureFlagService = require('./featureFlagService');
const {
  getUserAccess, isVerifiedResident, fastVerified, fastCheckStands, claimSetAside, FAST_CHECK_COLUMNS,
} = require('../utils/homePermissions');
const { NON_RESIDENT_ROLES, resolveHomeRole } = require('../utils/homeAccessPolicy');
const { validityDays } = require('../utils/verificationAge');

const FLAGS = Object.freeze({
  base: 'home_fast_verify',
  phone: 'home_fast_verify_phone',
  location: 'home_fast_verify_location',
  document: 'home_fast_verify_document',
  shortAdd: 'home_short_add',
  postcardScan: 'home_postcard_scan',
  claim: 'home_instant_claim',
});
const KINDS = Object.freeze(['phone', 'location', 'document']);
const OPTION_ORDER = Object.freeze(['phone', 'location', 'document', 'mail', 'landlord']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

// Section 6 words. Every refusal is { code, error }.
const REFUSALS = Object.freeze({
  FAST_CHECK_OFF: [404, "This way to verify isn't available. Verify by mail instead."],
  // No claim to mark (a private setup that isn't claimed, a household invitation, proof already, a set-aside claim).
  FAST_CHECK_NEEDS_CLAIM: [409, "This way to verify isn't available. Verify by mail instead."],
  FAST_CHECK_ONE_HOME: [409, 'A fast check covers one home. Verify this one by mail.'],
  FAST_CHECK_LIMIT: [429, 'Too many tries for now. Try again later, or verify another way.'],
  PHONE_IN_USE: [409, 'This number already verified another account. Use a different way.'],
  PHONE_INVALID: [400, 'Check the number and try again.'],
  PHONE_CHECK_UNAVAILABLE: [503, "The phone check isn't available right now. Verify another way."],
  MAIL_PROOF_REQUIRED: [403, 'This needs a mailed code. Ask for the postcard in Place.'],
  HOME_NOT_FOUND: [404, 'Home not found.'],
  FAST_CHECK_UNAVAILABLE: [503, 'Could not check this right now. Please retry.'],
});

class FastCheckError extends Error {
  constructor(code, extra = {}) {
    const [status, message] = REFUSALS[code] || REFUSALS.FAST_CHECK_UNAVAILABLE;
    super(message);
    this.code = REFUSALS[code] ? code : 'FAST_CHECK_UNAVAILABLE';
    this.status = status;
    this.extra = extra;
  }
}

/** Send a FastCheckError (or any error, as 503) as { code, error }. */
function sendError(res, error) {
  if (error instanceof FastCheckError) return res.status(error.status).json({ code: error.code, error: error.message, ...error.extra });
  logger.error('fast_check.failed', { error: error && error.message });
  const [status, message] = REFUSALS.FAST_CHECK_UNAVAILABLE;
  return res.status(status).json({ code: 'FAST_CHECK_UNAVAILABLE', error: message });
}

const flagOn = (flag, user) => featureFlagService.isFeatureEnabled(flag, user).catch(() => false);

// ── Counting (SPEC section 3): one AddressVerificationEvent row per try, no person, home or number in it ──────────

const TRY_STATUSES = new Set(['pass', 'miss', 'refused', 'error']);
/** Count one try. `reasons` are codes. Never throws. */
async function countTry(kind, status, reasons = []) {
  if (!KINDS.includes(kind) || !TRY_STATUSES.has(status)) return;
  try {
    const { error } = await db.from('AddressVerificationEvent').insert({
      address_id: null, event_type: 'fast_check', provider: kind, status,
      reasons: (reasons || []).filter((r) => typeof r === 'string' && /^[a-z0-9_]{1,40}$/i.test(r)),
      raw_response: {},
    });
    if (error) throw error;
  } catch (error) {
    logger.warn('fast_check.count_failed', { kind, status, error: error.message });
  }
}

// ── Per-person limits: HomeAuditLog rows FAST_CHECK_TRIED (kind in metadata, never a number) ─────────────────────

/** Write a FAST_CHECK_TRIED row for this person. `ref` is a short keyed hash (phone), never the number. */
async function logTry({ homeId, userId, kind, step = 'check', ref = null }) {
  const metadata = { kind, step };
  if (ref) metadata.ref = ref;
  const { error } = await db.from('HomeAuditLog').insert({
    home_id: homeId, actor_user_id: userId, action: 'FAST_CHECK_TRIED', target_type: 'HomeOccupancy', target_id: null, metadata,
  });
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
}

/** This person's FAST_CHECK_TRIED rows of a kind (and step) since a time, newest first. */
async function triesSince({ userId, kind, step = null, sinceMs }) {
  let query = db.from('HomeAuditLog').select('created_at, metadata')
    .eq('actor_user_id', userId).eq('action', 'FAST_CHECK_TRIED').eq('metadata->>kind', kind)
    .gte('created_at', new Date(sinceMs).toISOString()).order('created_at', { ascending: false }).limit(200);
  if (step) query = query.eq('metadata->>step', step);
  const { data, error } = await query;
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  return data || [];
}

const LIMITS = Object.freeze({
  location: { tries: 5, windowMs: DAY_MS },
  document: { tries: 3, windowMs: DAY_MS },
  phoneNumbers: { numbers: 3, windowMs: 30 * DAY_MS },
  phoneCodes: { codes: 5, windowMs: 60 * 60 * 1000 },
});

/** Has this person used up today's tries of a kind (location 5, document 3; phone: 3 numbers in 30 days)? */
async function overLimit(userId, kind, now = Date.now()) {
  if (kind === 'phone') {
    const rows = await triesSince({ userId, kind, step: 'start', sinceMs: now - LIMITS.phoneNumbers.windowMs });
    return new Set(rows.map((row) => row.metadata && row.metadata.ref).filter(Boolean)).size >= LIMITS.phoneNumbers.numbers;
  }
  const limit = LIMITS[kind];
  const rows = await triesSince({ userId, kind, sinceMs: now - limit.windowMs });
  return rows.length >= limit.tries;
}

// ── The person's occupancies ──────────────────────────────────────────────────────────────────────────────────

const OCC_SELECT = `id, home_id, user_id, is_active, role, role_base, age_band, verification_status, verification_source,
  verified_at, start_at, end_at, access_start_at, access_end_at, ${FAST_CHECK_COLUMNS}, fast_check_ref_hash`;

/** Another home where this person's fast check stands (one fast-checked home per account). */
async function fastCheckedElsewhere(userId, homeId) {
  const { data, error } = await db.from('HomeOccupancy').select(OCC_SELECT)
    .eq('user_id', userId).eq('is_active', true).eq('verification_source', 'claim').not('fast_check_at', 'is', null);
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  for (const row of data || []) {
    if (row.home_id !== homeId && fastCheckStands(row)) return row;
  }
  return null;
}

/**
 * How and when a proven occupancy was proven, for "by mail · {date}": a postcard code (when it was entered), a
 * landlord (the lease), or a document a person reviewed (when it was approved). The latest proof wins. Read for many
 * homes at once: Map homeId → { by, at }. A home with none of them (legacy proof) is left out; callers fall back to
 * 'mail' and the occupancy's verified_at.
 */
async function provenBy(userId, homeIds) {
  const ids = [...new Set((homeIds || []).filter((id) => UUID.test(id || '')))];
  const by = new Map();
  if (!ids.length) return by;
  const [cards, leases, claims] = await Promise.all([
    db.from('HomePostcardCode').select('home_id, verified_at, updated_at').eq('user_id', userId).eq('status', 'verified').in('home_id', ids),
    db.from('HomeLease').select('home_id, start_at, updated_at, created_at').eq('primary_resident_user_id', userId).eq('state', 'active').in('home_id', ids),
    db.from('HomeOwnershipClaim').select('home_id, state, claim_phase_v2, reviewed_at, updated_at').eq('claimant_user_id', userId)
      .eq('claim_type', 'resident').in('home_id', ids),
  ]);
  const rows = (read) => (read && !read.error ? read.data || [] : []);
  const offer = (homeId, kind, at) => {
    const time = Date.parse(at);
    if (!Number.isFinite(time)) return;
    const current = by.get(homeId);
    if (!current || time > Date.parse(current.at)) by.set(homeId, { by: kind, at: new Date(time).toISOString() });
  };
  for (const row of rows(cards)) offer(row.home_id, 'mail', row.verified_at || row.updated_at);
  for (const row of rows(leases)) offer(row.home_id, 'landlord', row.start_at || row.updated_at || row.created_at);
  for (const row of rows(claims)) {
    if (row.state === 'approved' || row.claim_phase_v2 === 'verified') offer(row.home_id, 'document', row.reviewed_at || row.updated_at);
  }
  return by;
}

// SPEC section 4 names the fast kinds as the apps show them: a document check reads as "bill".
const FAST_BY = Object.freeze({ phone: 'phone', location: 'location', document: 'bill' });

/** The fast check of a Verified-by-fast-check occupancy, as the apps show it. */
function fastView(occupancy) {
  const location = occupancy.fast_check_kind === 'location';
  return {
    kind: occupancy.fast_check_kind,
    at: occupancy.fast_check_at,
    expires_at: occupancy.fast_check_expires_at,
    recheck_due_at: location && !occupancy.fast_check_confirmed_at ? occupancy.fast_check_recheck_due_at || null : null,
  };
}

// ── GET /api/homes/:id/verify-options ────────────────────────────────────────────────────────────────────────────

async function documentInReview(homeId, userId) {
  const { data: claims, error } = await db.from('HomeOwnershipClaim').select('id, state, claim_phase_v2')
    .eq('home_id', homeId).eq('claimant_user_id', userId).eq('claim_type', 'resident');
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  // eslint-disable-next-line global-require
  const { maskClaimState } = require('./homeOwnershipClaimListService');
  const open = (claims || []).filter((c) => maskClaimState(c.state, c.claim_phase_v2) === 'under_review').map((c) => c.id);
  if (!open.length) return false;
  const { data: evidence, error: evidenceError } = await db.from('HomeVerificationEvidence').select('claim_id')
    .in('claim_id', open).neq('evidence_type', 'idv').limit(1);
  if (evidenceError) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  return (evidence || []).length > 0;
}

/** Is a "This wasn't me" case open about this person at this home? Unreadable counts as yes (held). */
async function reportedHere(homeId, userId) {
  // eslint-disable-next-line global-require
  return require('./addressValidation/addressReviewService').postcardReportOpen(homeId, userId).catch(() => true);
}

/** Today's landlord door rule (GET /api/v1/tenant/home/:id/status): a verified landlord, or the person's own lease. */
async function landlordDoor(homeId, userId) {
  const [authority, lease] = await Promise.all([
    db.from('HomeAuthority').select('id').eq('home_id', homeId).eq('status', 'verified').limit(1).maybeSingle(),
    db.from('HomeLease').select('id, state, metadata').eq('home_id', homeId).eq('primary_resident_user_id', userId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (authority.error || lease.error) return false;
  if (authority.data) return true;
  const row = lease.data;
  if (!row) return false;
  const denied = row.state === 'canceled' && (row.metadata?.landlord_decision?.intent?.action === 'deny'
    || Object.hasOwn(row.metadata || {}, 'denial_reason'));
  return !(row.state === 'canceled' && !denied);
}

/** Is the phone check set up on this server (keys present, and today's records ceiling not reached)? */
function phoneProviderReady() {
  // eslint-disable-next-line global-require
  return require('./fastCheck/phoneProvider').configured();
}
async function phoneDailyCeilingReached(now = Date.now()) {
  const max = Number.parseInt(process.env.FAST_CHECK_PHONE_DAILY_MAX || '200', 10);
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await db.from('AddressVerificationEvent').select('id', { count: 'exact', head: true })
    .eq('event_type', 'fast_check').eq('provider', 'phone').in('status', ['pass', 'miss'])
    .gte('created_at', start.toISOString());
  if (error) return true;
  return (count || 0) >= (Number.isFinite(max) && max >= 0 ? max : 200);
}

/**
 * The person's level at this Home and the ways they can verify it. `platform` is 'ios', 'android' or null (web).
 * Throws FastCheckError FAST_CHECK_OFF (home_fast_verify off for them) or HOME_NOT_FOUND (nothing of theirs here).
 */
async function verifyOptions({ homeId, user, platform = null }) {
  if (!UUID.test(homeId || '') || !UUID.test(user?.id || '')) throw new FastCheckError('HOME_NOT_FOUND');
  const userId = user.id;
  const flagNames = Object.values(FLAGS);
  const flags = Object.fromEntries(await Promise.all(flagNames.map(async (name) => [name, await flagOn(name, user)])));
  if (!flags[FLAGS.base]) throw new FastCheckError('FAST_CHECK_OFF');

  let access;
  try {
    access = await getUserAccess(homeId, userId);
  } catch (_) {
    throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  }
  const occupancy = access.occupancy;
  if (!access.hasAccess && !occupancy) throw new FastCheckError('HOME_NOT_FOUND');

  const proven = access.hasAccess && isVerifiedResident(access);
  const fast = !proven && access.hasAccess && await fastVerified(occupancy);
  const level = proven ? 'proven' : fast ? 'fast' : access.hasAccess ? 'added' : 'none';
  const nonResident = NON_RESIDENT_ROLES.has(resolveHomeRole(occupancy));
  const claim = access.hasAccess && occupancy?.verification_source === 'claim' && occupancy?.verification_status === 'verified'
    && !nonResident && !(await claimSetAside(homeId, userId).catch(() => true));

  const elsewhere = claim ? await fastCheckedElsewhere(userId, homeId) : null;
  const options = [];
  for (const id of OPTION_ORDER) {
    let reason = null;
    if (KINDS.includes(id)) {
      if (!flags[FLAGS[id]] || !flags[FLAGS.claim]) reason = 'OFF';
      else if (id === 'location' && platform !== 'ios' && platform !== 'android') reason = 'APP_ONLY';
      else if (!claim) reason = 'NEEDS_CLAIM';
      else if (elsewhere) reason = 'ONE_HOME';
      else if (await reportedHere(homeId, userId)) reason = 'IN_REVIEW';
      else if (id === 'phone' && !phoneProviderReady()) reason = 'UNAVAILABLE';
      // eslint-disable-next-line global-require
      else if (id === 'location' && !require('./fastCheck/locationCheck').ready(platform)) reason = 'UNAVAILABLE';
      else if (await overLimit(userId, id)) reason = 'LIMIT';
      else if (id === 'phone' && await phoneDailyCeilingReached()) reason = 'UNAVAILABLE';
    } else if (id === 'mail') {
      // eslint-disable-next-line global-require
      const mailVendorService = require('./addressValidation/mailVendorService');
      if (proven || nonResident || !mailVendorService.canSendPostcards()) reason = 'UNAVAILABLE';
    } else if (id === 'landlord') {
      if (proven || nonResident || !(await landlordDoor(homeId, userId))) reason = 'UNAVAILABLE';
    }
    if (id === 'document') {
      // Today's document upload stays a way to verify whatever the fast read says; `fast` says whether a photo is
      // read at once (FASTVERIFY) or goes to a person only. A document already in review closes the row only when
      // nothing is read at once (today's "Document under review"); with the fast read a person can take another photo.
      const fast = reason === null;
      reason = proven || nonResident ? 'UNAVAILABLE' : !fast && await documentInReview(homeId, userId) ? 'IN_REVIEW' : null;
      options.push({ id, available: reason === null, reason, fast });
      continue;
    }
    options.push({ id, available: reason === null, reason });
  }

  let verifiedBy = null;
  let verifiedAt = null;
  if (proven) {
    const how = (await provenBy(userId, [homeId])).get(homeId);
    verifiedBy = how ? how.by : 'mail';
    verifiedAt = how ? how.at : occupancy?.verified_at || null;
  } else if (fast) {
    verifiedBy = FAST_BY[occupancy.fast_check_kind];
    verifiedAt = occupancy.fast_check_at;
  }
  return {
    home_id: homeId,
    level,
    fast: fast ? fastView(occupancy) : null,
    options,
    short_add_home: flags[FLAGS.shortAdd],
    postcard_scan: flags[FLAGS.postcardScan],
    // Additive (FASTVERIFY contract notes): how and when the person is Verified, for "by {kind} · {date}".
    verified_by: verifiedBy,
    verified_at: verifiedAt,
    needs_mail: level === 'fast',
  };
}

// ── Writing a fast check (phases 3 to 5) ───────────────────────────────────────────────────────────────────────

/**
 * Check the person may make a fast check of this kind at this Home now, and return their claim occupancy.
 * Throws FAST_CHECK_OFF, FAST_CHECK_NEEDS_CLAIM, FAST_CHECK_ONE_HOME or FAST_CHECK_LIMIT (counted as refused).
 */
async function admit({ homeId, user, kind, countLimit = true }) {
  if (!UUID.test(homeId || '') || !UUID.test(user?.id || '')) throw new FastCheckError('HOME_NOT_FOUND');
  const [base, kindOn, claimOn] = await Promise.all([flagOn(FLAGS.base, user), flagOn(FLAGS[kind], user), flagOn(FLAGS.claim, user)]);
  if (!base || !kindOn || !claimOn) throw new FastCheckError('FAST_CHECK_OFF');
  let access;
  try {
    access = await getUserAccess(homeId, user.id);
  } catch (_) {
    throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  }
  const occupancy = access.occupancy;
  if (!access.hasAccess && !occupancy) throw new FastCheckError('HOME_NOT_FOUND');
  const claim = access.hasAccess && occupancy.verification_source === 'claim' && occupancy.verification_status === 'verified'
    && !NON_RESIDENT_ROLES.has(resolveHomeRole(occupancy)) && !(await claimSetAside(homeId, user.id).catch(() => true));
  if (!claim) {
    void countTry(kind, 'refused', ['needs_claim']);
    throw new FastCheckError('FAST_CHECK_NEEDS_CLAIM');
  }
  if (await fastCheckedElsewhere(user.id, homeId)) {
    void countTry(kind, 'refused', ['one_home']);
    throw new FastCheckError('FAST_CHECK_ONE_HOME');
  }
  // A card they asked for here was reported ("This wasn't me"): held until Pantopus decides the case.
  if (await reportedHere(homeId, user.id)) {
    void countTry(kind, 'refused', ['reported']);
    throw new FastCheckError('FAST_CHECK_NEEDS_CLAIM');
  }
  if (countLimit && await overLimit(user.id, kind)) {
    void countTry(kind, 'refused', ['limit']);
    throw new FastCheckError('FAST_CHECK_LIMIT');
  }
  return occupancy;
}

/**
 * Mark the claim Verified by a fast check of this kind: now, for validityDays() (365). A location check also sets its
 * second-match due date (14 days). `refHash` (phone only) is the keyed hash of the number.
 */
async function markFastCheck({ occupancyId, kind, refHash = null, now = new Date() }) {
  const at = now.toISOString();
  const patch = {
    fast_check_kind: kind,
    fast_check_at: at,
    fast_check_expires_at: new Date(now.getTime() + validityDays() * DAY_MS).toISOString(),
    fast_check_recheck_due_at: kind === 'location' ? new Date(now.getTime() + 14 * DAY_MS).toISOString() : null,
    fast_check_confirmed_at: null,
    fast_check_ref_hash: kind === 'phone' ? refHash : null,
    updated_at: at,
  };
  const { data, error } = await db.from('HomeOccupancy').update(patch).eq('id', occupancyId)
    .eq('verification_source', 'claim').eq('verification_status', 'verified').select(OCC_SELECT).maybeSingle();
  if (error) {
    if (error.code === '23505') throw new FastCheckError('PHONE_IN_USE');
    throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
  }
  if (!data) throw new FastCheckError('FAST_CHECK_NEEDS_CLAIM');
  return data;
}

/** Clear a fast check (a rejected bill, a reported card): the claim stays, the Verified mark goes. */
async function clearFastCheck({ homeId, userId, kind = null }) {
  let query = db.from('HomeOccupancy').update({
    fast_check_kind: null, fast_check_at: null, fast_check_expires_at: null, fast_check_recheck_due_at: null,
    fast_check_confirmed_at: null, fast_check_ref_hash: null, updated_at: new Date().toISOString(),
  }).eq('home_id', homeId).eq('user_id', userId);
  if (kind) query = query.eq('fast_check_kind', kind);
  const { error } = await query;
  if (error) throw new FastCheckError('FAST_CHECK_UNAVAILABLE');
}

/** The level a person now has at this Home, for the answers of the check routes. */
async function levelFor(homeId, userId) {
  const access = await getUserAccess(homeId, userId);
  if (access.hasAccess && isVerifiedResident(access)) return 'proven';
  if (access.hasAccess && await fastVerified(access.occupancy)) return 'fast';
  return access.hasAccess ? 'added' : 'none';
}

module.exports = {
  FLAGS, KINDS, REFUSALS, LIMITS, FAST_BY, FastCheckError, sendError, flagOn,
  countTry, logTry, triesSince, overLimit, fastCheckedElsewhere, provenBy, fastView, phoneDailyCeilingReached,
  verifyOptions, admit, markFastCheck, clearFastCheck, levelFor,
};
