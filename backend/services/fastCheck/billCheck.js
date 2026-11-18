'use strict';

// A bill read at once (FASTVERIFY phase 4, behind home_fast_verify_document). The residency document upload
// (POST /api/upload/ownership-evidence/:homeId/:claimId) stays exactly as it is: the document always goes to today's
// review queue. When the switch is on and the person holds a claim here, the server also reads the picture with the
// Anthropic client (services/ai/llm.js), asking only for the name, the address and the date and how sure it is of
// each. All three sure, the name the account's (or the account holder's the person gave), the address this Home's,
// the date within 90 days: the claim is marked Verified (kind 'document') and the answer says 'verified'. Anything
// else is 'needs_review' (today's path), or 'unreadable'. A rejection in the review queue clears the mark and tells
// the person (billRejected). 3 photos a day. Nothing read is kept: the answer and the date only.

const sharp = require('sharp');
const db = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const fastCheck = require('../homeFastCheckService');
const { getAnthropicClient, resolveModel, CHAT_MODEL } = require('../../config/anthropic');
const { complete, AIRefusalError } = require('../ai/llm');
const { expandAbbreviations } = require('../../utils/normalizeAddress');

const { FastCheckError } = fastCheck;
const KIND = 'document';
const MODEL = resolveModel(process.env.ANTHROPIC_BILL_READ_MODEL, CHAT_MODEL);
const TIMEOUT_MS = 30 * 1000;
const READ_PX = 1800;
const MAX_AGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    kind: { type: 'string', enum: ['utility_bill', 'bank_statement', 'lease', 'other'] },
    names: { type: 'array', items: { type: 'string' } },
    name_sure: { type: 'boolean' },
    address: {
      type: 'object',
      properties: {
        line1: { type: 'string' }, unit: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, zip: { type: 'string' },
      },
      required: ['line1', 'unit', 'city', 'state', 'zip'],
      additionalProperties: false,
    },
    address_sure: { type: 'boolean' },
    date: { type: 'string' },
    date_sure: { type: 'boolean' },
  },
  required: ['readable', 'kind', 'names', 'name_sure', 'address', 'address_sure', 'date', 'date_sure'],
  additionalProperties: false,
};

const SYSTEM = `You read one document a person photographed to show they live at their home: a utility bill, a bank statement or a lease. Read only three things and nothing else:
- names: the account holder or tenant names printed for the service address (as written; several if several)
- address: the service or property address (not a payment or remittance address): line1 (number and street), unit ("" if none), city, state (two letters), zip (five digits)
- date: the statement, bill or lease date as YYYY-MM-DD ("" if none)
For each, say whether you are sure (name_sure, address_sure, date_sure): sure means printed clearly and unambiguous. Never read or repeat account numbers, amounts or anything else. kind is what the document is. readable is false when the picture is not a document, is too blurry, or shows no name or address. Use "" for anything you can't read.`;

/** Words of a name, lowercase, without punctuation. */
const nameWords = (value) => String(value || '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/['-]/g, '').split(/\s+/).filter(Boolean);

/** Does a printed name match this person (last name, and the first name or its initial)? */
function nameMatches(printed, { firstName, lastName }) {
  const last = nameWords(lastName);
  const first = nameWords(firstName)[0];
  if (!last.length) return false;
  return printed.some((name) => {
    const words = nameWords(name.includes(',') ? name.split(',').reverse().join(' ') : name);
    const hasLast = last.every((part) => words.includes(part));
    if (!hasLast) return false;
    if (!first) return true;
    const others = words.filter((w) => !last.includes(w));
    return others.some((w) => w === first || (w.length === 1 && w === first[0]));
  });
}

const streetKey = (line) => expandAbbreviations(String(line || '').toLowerCase().replace(/[.,#]/g, ' ')).replace(/\s+/g, ' ').trim();
const unitKey = (unit) => String(unit || '').toLowerCase().replace(/\b(apt|apartment|unit|suite|ste|no|number)\b|[#.\s]/g, '');

/** Does the printed address match the Home's (house number and street in expanded form, ZIP, and the unit when the Home has one)? */
function addressMatches(read, home) {
  if (!read || !read.line1) return false;
  if (streetKey(read.line1) !== streetKey(home.address)) return false;
  const zip = String(read.zip || '').replace(/\D/g, '').slice(0, 5);
  if (!zip || zip !== String(home.zipcode || '').replace(/\D/g, '').slice(0, 5)) return false;
  if (home.address2 && unitKey(read.unit) !== unitKey(home.address2)) return false;
  return true;
}

function dateRecent(value, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const at = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(at) && at <= now + DAY_MS && at >= now - MAX_AGE_DAYS * DAY_MS;
}

/** The content block for the file: a JPEG for any picture sharp can read, the PDF itself for a PDF, else null. */
async function contentBlock(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) return null;
  if (file.mimetype === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') } };
  }
  try {
    const jpeg = await sharp(file.buffer).rotate().resize(READ_PX, READ_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } };
  } catch (_) {
    return null;
  }
}

/** Ask Claude to read the document. Returns the reading, or null when it couldn't run. */
async function read(block) {
  const client = getAnthropicClient();
  if (!client) return null;
  try {
    const { text } = await complete({
      client, model: MODEL, system: SYSTEM, effort: 'low', schema: SCHEMA, maxTokens: 1024, timeoutMs: TIMEOUT_MS, cacheSystem: false,
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Read the name, address and date on this document.' }] }],
    });
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof AIRefusalError) return { readable: false };
    logger.warn('fast_check.bill_read_unavailable', { error: error.name || 'error' });
    return null;
  }
}

/**
 * After a residency document is saved: the fast_check part of the upload's answer, or null when it doesn't apply
 * (the switch off for the person, no claim here). Never throws: the upload stands either way.
 */
async function afterUpload({ homeId, claimId, user, file, accountHolderName = null }) {
  try {
    if (!(await fastCheck.flagOn(fastCheck.FLAGS.base, user)) || !(await fastCheck.flagOn(fastCheck.FLAGS.document, user))) return null;
    // Only a residency document of the person's own (an ownership document is for the ownership review alone).
    const { data: claim } = await db.from('HomeOwnershipClaim').select('claim_type, claimant_user_id, home_id').eq('id', claimId).maybeSingle();
    if (!claim || claim.claim_type !== 'resident' || claim.claimant_user_id !== user.id || claim.home_id !== homeId) return null;
    let occupancy;
    try {
      occupancy = await fastCheck.admit({ homeId, user, kind: KIND });
    } catch (error) {
      if (!(error instanceof FastCheckError)) throw error;
      // No claim here (or the switches): the upload is today's, with no fast check in its answer.
      if (['FAST_CHECK_NEEDS_CLAIM', 'FAST_CHECK_OFF', 'HOME_NOT_FOUND'].includes(error.code)) return null;
      // One home, too many photos today: it goes to a person, as today.
      return { result: 'needs_review' };
    }
    await fastCheck.logTry({ homeId, userId: user.id, kind: KIND, step: 'read' });
    const block = await contentBlock(file);
    if (!block) {
      void fastCheck.countTry(KIND, 'miss', ['unreadable']);
      return { result: 'unreadable' };
    }
    const reading = await read(block);
    if (!reading) {
      void fastCheck.countTry(KIND, 'error', ['read_unavailable']);
      return { result: 'needs_review' };
    }
    if (reading.readable === false) {
      void fastCheck.countTry(KIND, 'miss', ['unreadable']);
      return { result: 'unreadable' };
    }
    const [{ data: home }, { data: account }] = await Promise.all([
      db.from('Home').select('address, address2, city, state, zipcode').eq('id', homeId).maybeSingle(),
      db.from('User').select('first_name, last_name').eq('id', user.id).maybeSingle(),
    ]);
    if (!home) return { result: 'needs_review' };
    const given = nameWords(accountHolderName);
    const holder = given.length >= 2
      ? { firstName: given[0], lastName: given.slice(1).join(' ') }
      : { firstName: account && account.first_name, lastName: account && account.last_name };
    const sure = reading.name_sure === true && reading.address_sure === true && reading.date_sure === true;
    const checks = {
      name: nameMatches(Array.isArray(reading.names) ? reading.names : [], holder),
      address: addressMatches(reading.address, home),
      date: dateRecent(reading.date),
    };
    if (!sure || !checks.name || !checks.address || !checks.date) {
      const reasons = [!sure ? 'unsure' : null, !checks.name ? 'name' : null, !checks.address ? 'address' : null, !checks.date ? 'date' : null]
        .filter(Boolean);
      void fastCheck.countTry(KIND, 'miss', reasons);
      return { result: 'needs_review' };
    }
    await fastCheck.markFastCheck({ occupancyId: occupancy.id, kind: KIND });
    void fastCheck.countTry(KIND, 'pass', []);
    logger.info('fast_check.bill_verified', { home_id: homeId });
    return { result: 'verified' };
  } catch (error) {
    logger.warn('fast_check.bill_failed', { home_id: homeId, error: error.message });
    return { result: 'needs_review' };
  }
}

/**
 * A person at Pantopus rejected the residency document (the review queue): a mark the bill read gave comes off, and
 * the person is told (section 6 words). Never throws.
 */
async function billRejected({ homeId, userId, claimId, reason = null }) {
  try {
    const { data: row } = await db.from('HomeOccupancy').select('id, fast_check_kind')
      .eq('home_id', homeId).eq('user_id', userId).maybeSingle();
    if (!row || row.fast_check_kind !== KIND) return false;
    await fastCheck.clearFastCheck({ homeId, userId, kind: KIND });
    const why = typeof reason === 'string' && reason.trim() ? reason.trim().replace(/[.\s]+$/, '') : 'A person at Pantopus couldn\'t confirm it';
    await require('../notificationService').createNotification({
      userId, type: 'fast_check_bill_rejected', title: 'Your bill didn\'t pass review',
      body: `${why}. Your Verified mark is off for now. You can verify another way.`,
      link: `/app/homes/${homeId}/dashboard`, metadata: { home_id: homeId },
      idempotencyKey: `fast-check-bill-rejected:${userId}:${claimId}`,
    });
    return true;
  } catch (error) {
    logger.warn('fast_check.bill_rejected_notice_failed', { home_id: homeId, error: error.message });
    return false;
  }
}

/** Does a residency document of this person's for this Home still wait for (or has it passed) a person's review? */
async function documentStillInReview(homeId, userId) {
  const { data: claims, error } = await db.from('HomeOwnershipClaim').select('id, state, claim_phase_v2')
    .eq('home_id', homeId).eq('claimant_user_id', userId).eq('claim_type', 'resident');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line global-require
  const { maskClaimState } = require('../homeOwnershipClaimListService');
  const open = (claims || []).filter((c) => maskClaimState(c.state, c.claim_phase_v2) === 'under_review').map((c) => c.id);
  if (!open.length) return false;
  // A document the person deleted stays as a row with status 'failed': nobody can review it.
  const { data: evidence, error: evidenceError } = await db.from('HomeVerificationEvidence').select('claim_id')
    .in('claim_id', open).neq('evidence_type', 'idv').in('status', ['pending', 'verified']).limit(1);
  if (evidenceError) throw new Error(evidenceError.message);
  return (evidence || []).length > 0;
}

/**
 * The person took their residency document out of review themselves: they withdrew the claim, or deleted the file. A
 * mark the bill read gave comes off, because a person at Pantopus will never review that document now, and the mark
 * stands on that review ("A person at Pantopus also reviews it afterwards"). It stays while another document of theirs
 * for this Home is still in review. No notice: it was their own step. Fails closed: when the documents can't be read,
 * the mark comes off. Never throws.
 */
async function billWithdrawn({ homeId, claimId }) {
  try {
    const { data: claim } = await db.from('HomeOwnershipClaim').select('claim_type, claimant_user_id, home_id').eq('id', claimId).maybeSingle();
    if (!claim || claim.claim_type !== 'resident' || claim.home_id !== homeId) return false;
    const userId = claim.claimant_user_id;
    const { data: row } = await db.from('HomeOccupancy').select('id, fast_check_kind')
      .eq('home_id', homeId).eq('user_id', userId).maybeSingle();
    if (!row || row.fast_check_kind !== KIND) return false;
    if (await documentStillInReview(homeId, userId).catch(() => false)) return false;
    await fastCheck.clearFastCheck({ homeId, userId, kind: KIND });
    logger.info('fast_check.bill_withdrawn', { home_id: homeId });
    return true;
  } catch (error) {
    logger.warn('fast_check.bill_withdrawn_failed', { home_id: homeId, error: error.message });
    return false;
  }
}

module.exports = { afterUpload, billRejected, billWithdrawn, nameMatches, addressMatches, dateRecent, SCHEMA, SYSTEM };
