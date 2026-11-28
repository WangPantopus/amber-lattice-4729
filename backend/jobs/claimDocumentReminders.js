/**
 * claimDocumentReminders
 *
 * A home claim can't be reviewed until it has a document, and adding a Home as its owner files the claim with none.
 * Nobody chased either side, so claims sat: the claimant never heard that a document was missing, and a document
 * that did arrive could wait weeks for a reviewer.
 *
 *   remindClaimants  hourly. A claim a person filed themself that still has no document a day later gets one notice,
 *                    and one more after a week. Left alone: claims older than two weeks, co-owner invitations (the
 *                    invitation told them) and claims answering Request info (that notice already asked).
 *   remindReviewers  daily. One email to the review team when a document has waited more than a day for a reviewer.
 *   closeUndocumented  hourly. A claim the person filed themself that has had no document for 30 days closes (the
 *                    founder's decision, 2026-11-27), and the claimant is told; after Request info the 30 days count
 *                    from the request. The database function decides and closes (close_home_claim_without_document,
 *                    under the Home's claim lock); this only picks candidates and sends the notice.
 *
 * The reminders change no claim. A notice goes out once per claim and stage (its idempotency key), however often
 * this runs, in the app and by email (services/homeClaimNotices.js).
 */
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { isOpenForReview, waitingOn } = require('../services/homeClaimRoutingService');
const { CLOSE_AFTER_DAYS } = require('../services/homeClaimNotices');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FIRST_REMINDER_AFTER = DAY;
const SECOND_REMINDER_AFTER = 7 * DAY;
const REMIND_UNTIL = 14 * DAY;
const REVIEW_OVERDUE_AFTER = DAY;
// States a claim is in before a reviewer has answered it. needs_more_info is the reviewer's own ask.
const UNANSWERED_STATES = ['submitted', 'pending_review', 'pending_challenge_window'];
const OPEN_STATES = [...UNANSWERED_STATES, 'needs_more_info', 'disputed'];
const CLAIM_FIELDS = 'id, home_id, claimant_user_id, claim_type, state, claim_phase_v2, terminal_reason, merged_into_claim_id, expires_at, method, reviewed_at, created_at';

function reminderKey(claimId, stage) {
  return `claim-document-reminder:${claimId}:${stage}`;
}

function closedKey(claimId) {
  return `claim-closed-no-document:${claimId}`;
}

/** Documents (never an identity check) on these claims: claim id → the times they came in. */
async function documentTimes(claimIds) {
  const times = new Map();
  if (!claimIds.length) return times;
  const { data, error } = await supabaseAdmin
    .from('HomeVerificationEvidence')
    .select('claim_id, created_at')
    .in('claim_id', claimIds)
    .neq('evidence_type', 'idv');
  if (error) throw error;
  for (const row of data || []) times.set(row.claim_id, [...(times.get(row.claim_id) || []), row.created_at]);
  return times;
}

async function remindClaimants(options = {}) {
  const { dryRun = false, now = Date.now(), limit = 200 } = options;
  const { data, error } = await supabaseAdmin
    .from('HomeOwnershipClaim')
    .select(`${CLAIM_FIELDS}, home:home_id ( address, address2 )`)
    .in('state', UNANSWERED_STATES)
    .not('method', 'in', '("invite","vouch")')
    .gte('created_at', new Date(now - REMIND_UNTIL).toISOString())
    .lte('created_at', new Date(now - FIRST_REMINDER_AFTER).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    logger.error('[claimDocumentReminders] Failed to read claims', { error: error.message });
    throw error;
  }

  const open = (data || []).filter(claim => claim.claimant_user_id && isOpenForReview(claim, now));
  const documents = await documentTimes(open.map(claim => claim.id));
  const due = open.filter(claim => !documents.has(claim.id)).map(claim => ({
    claim,
    stage: now - Date.parse(claim.created_at) >= SECOND_REMINDER_AFTER ? 2 : 1,
  }));
  if (!due.length) return { scanned: open.length, due: 0, sent: 0, dry_run: dryRun };

  // Already reminded at this stage: skip without another write.
  const keys = due.map(({ claim, stage }) => reminderKey(claim.id, stage));
  const { data: sentRows, error: sentError } = await supabaseAdmin
    .from('Notification')
    .select('idempotency_key')
    .in('idempotency_key', keys);
  if (sentError) throw sentError;
  const alreadySent = new Set((sentRows || []).map(row => row.idempotency_key));

  let sent = 0;
  for (const { claim, stage } of due) {
    const key = reminderKey(claim.id, stage);
    if (alreadySent.has(key)) continue;
    if (dryRun) { sent++; continue; }
    if (await require('../services/homeClaimNotices').remindAboutDocument({ claim, stage, key })) sent++;
  }

  const summary = { scanned: open.length, due: due.length, sent, dry_run: dryRun };
  logger.info('[claimDocumentReminders] Claimants reminded', summary);
  return summary;
}

async function remindReviewers(options = {}) {
  const { dryRun = false, now = Date.now(), limit = 500 } = options;
  const { data, error } = await supabaseAdmin
    .from('HomeOwnershipClaim')
    .select(CLAIM_FIELDS)
    .in('state', OPEN_STATES)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    logger.error('[claimDocumentReminders] Failed to read claims', { error: error.message });
    throw error;
  }

  const open = (data || []).filter(claim => isOpenForReview(claim, now));
  const documents = await documentTimes(open.map(claim => claim.id));
  let count = 0;
  let longestWait = 0;
  for (const claim of open) {
    const all = (documents.get(claim.id) || []).map(time => Date.parse(time)).sort((a, b) => a - b);
    // After Request info only what came in since counts; the wait runs from the first of those.
    const asked = claim.state === 'needs_more_info' && claim.reviewed_at ? Date.parse(claim.reviewed_at) : null;
    const since = asked === null ? all : all.filter(time => time > asked);
    if (waitingOn(claim, { documents: all.length, documentsSinceRequest: since.length }) !== 'reviewer' || !since.length) continue;
    const waited = now - since[0];
    if (waited < REVIEW_OVERDUE_AFTER) continue;
    count++;
    longestWait = Math.max(longestWait, waited);
  }

  const summary = { scanned: open.length, overdue: count, oldest_days: Math.floor(longestWait / DAY), dry_run: dryRun };
  if (count && !dryRun) {
    summary.emailed = await require('../services/adminAlerts').notifyClaimsStillWaiting({ count, oldestDays: summary.oldest_days });
  }
  logger.info('[claimDocumentReminders] Reviewers checked', summary);
  return summary;
}

async function closeUndocumented(options = {}) {
  const { dryRun = false, now = Date.now(), limit = 200 } = options;
  const cutoff = now - CLOSE_AFTER_DAYS * DAY;
  const { data, error } = await supabaseAdmin
    .from('HomeOwnershipClaim')
    .select(`${CLAIM_FIELDS}, home:home_id ( address, address2 )`)
    .in('state', [...UNANSWERED_STATES, 'needs_more_info'])
    .not('method', 'in', '("invite","vouch")')
    .lte('created_at', new Date(cutoff).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    logger.error('[claimDocumentReminders] Failed to read claims', { error: error.message });
    throw error;
  }

  // After Request info the 30 days count from the request. The database function tests all of this again.
  const open = (data || []).filter(claim => claim.claimant_user_id && isOpenForReview(claim, now)
    && !(claim.state === 'needs_more_info' && claim.reviewed_at && Date.parse(claim.reviewed_at) > cutoff));
  const documents = await documentTimes(open.map(claim => claim.id));
  const due = open.filter(claim => !documents.has(claim.id));

  let closed = 0;
  let told = 0;
  for (const claim of due) {
    if (dryRun) { closed++; continue; }
    const { data: result, error: closeError } = await supabaseAdmin.rpc('close_home_claim_without_document', {
      p_claim_id: claim.id, p_min_age_days: CLOSE_AFTER_DAYS,
    });
    if (closeError || result?.ok !== true) {
      // Nothing was closed. A missing function (the migration not applied yet) fails every call, so stop here.
      logger.warn('[claimDocumentReminders] Could not close a claim', { claimId: claim.id, errorCode: closeError?.code || result?.code });
      if (closeError) break;
      continue;
    }
    if (result.closed !== true) continue;
    if (!result.replayed) closed++;
    // A repeated close still tells the claimant if the notice didn't go out the first time (its key keeps it to one).
    try {
      if (await require('../services/homeClaimNotices').tellClaimClosed({ claim, key: closedKey(claim.id) })) told++;
    } catch (noticeError) {
      logger.warn('[claimDocumentReminders] Close notice failed after commit', { claimId: claim.id, errorCode: noticeError?.code });
    }
  }

  const summary = { scanned: open.length, due: due.length, closed, told, dry_run: dryRun };
  if (due.length) logger.info('[claimDocumentReminders] Claims without a document closed', summary);
  return summary;
}

module.exports = { remindClaimants, remindReviewers, closeUndocumented };
