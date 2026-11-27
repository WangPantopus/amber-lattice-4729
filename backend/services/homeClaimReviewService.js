const db = require('../config/supabaseAdmin');
const verificationAge = require('../utils/verificationAge');
const logger = require('../utils/logger');

const MESSAGES = {
  HOME_NOT_FOUND: 'Home not found.', CLAIM_NOT_FOUND: 'Claim not found.',
  CLAIM_REVIEW_INVALID: 'Check the claim review details and try again.',
  CLAIM_REVIEW_DENIED: 'You do not have permission to review this claim.',
  CLAIM_RECIPIENT_MISMATCH: 'This claim belongs to another account.',
  CLAIM_SELF_REVIEW_FORBIDDEN: 'You cannot review your own claim.',
  CLAIM_REVIEW_CHANGED: 'The claim or its evidence changed. Reopen it before reviewing.',
  CLAIM_NOT_ELIGIBLE: 'This claim can no longer be changed through this action.',
  CLAIM_CHALLENGE_REVIEW_REQUIRED: 'This claim needs the dedicated dispute review flow.',
  CLAIM_VERIFIED_EVIDENCE_REQUIRED: 'No document has been checked yet. Verify the claimant\'s document first, or use Request info to ask for one. Older uploads need a new private upload.',
  CLAIM_EVIDENCE_PRIVATE_REUPLOAD_REQUIRED: 'Private document uploads are temporarily unavailable. Your claim is unchanged. Please try again later.',
  IDENTITY_CONFIRMATION_REQUIRED: 'The claimant\'s identity isn\'t confirmed yet, so this claim can\'t be approved.',
  MEMBERSHIP_RENEWAL_REQUIRED: 'This membership needs a new review before it can be restored.',
  CLAIM_ACCESS_NOT_STARTED: 'This claim can be approved when its existing access window starts.',
  OWNERSHIP_REVIEW_REQUIRED: 'This person has an owner record on this home that this approval can\'t change.',
  COMPETING_OWNER_CLAIM_OPEN: 'Another person\'s claim to own this home is still open. Approve or reject that claim first.',
  PROPOSED_ROLE_FORBIDDEN: 'The proposed role exceeds the current authority or age limit.',
  PERMISSION_DELEGATION_FORBIDDEN: 'You cannot grant permissions that you do not hold.',
  OWNERSHIP_MANAGE_REQUIRED: 'You do not have permission to resolve this claim.',
  OWNER_INVITE_AUTHORITY_REQUIRED: 'Only a current verified owner can approve a co-owner.',
};
// Why an approval answered OWNERSHIP_REVIEW_REQUIRED: the "reason" home_claim_review_target and
// mutate_home_claim_review send with it (migration 20261110223300), in a reviewer's words.
const OWNERSHIP_REVIEW_REASONS = {
  ownership_disputed: 'This person\'s ownership of this home is in dispute. Settle the dispute before approving this claim.',
  ownership_ended: 'This person was an owner of this home before and that ownership was ended, so this claim can\'t be approved.',
  home_has_owner: 'This home already has a verified owner, so this claim can\'t make this person its owner. The current owner can add them as a co-owner.',
  owner_record: 'This person already has an owner record on this home, so they can\'t be approved in a non-owner role. Approve as Owner if their proof supports it, or reject this claim.',
  verified_role_higher: 'This person is already a verified member of this home in a higher role, so this claim can\'t lower it.',
  primary_place_held: 'Another owner record on this home is disputed or not finished, so this person can\'t be approved as its owner yet.',
};
function failure(code = 'CLAIM_REVIEW_UNAVAILABLE', status = 503, reason = null) {
  const message = (code === 'OWNERSHIP_REVIEW_REQUIRED' && typeof reason === 'string'
    && Object.hasOwn(OWNERSHIP_REVIEW_REASONS, reason) && OWNERSHIP_REVIEW_REASONS[reason])
    || MESSAGES[code] || 'Could not confirm the claim request. Please retry.';
  return Object.assign(new Error(message), { code, status, statusCode: status });
}
async function call(name, args) {
  let response;
  try { response = await db.rpc(name, args); } catch (_) { throw failure(); }
  if (!response || response.error || !response.data) throw failure();
  const result = response.data;
  if (result.ok !== true) {
    if (result.ok === false && Object.hasOwn(MESSAGES, result.code) && [400,403,404,409,410].includes(result.status)) {
      throw failure(result.code, result.status, result.reason);
    }
    throw failure();
  }
  if (typeof result.homeId !== 'string' || result.claimId !== args.p_claim_id
    || (args.p_home_id !== null && result.homeId !== args.p_home_id)) throw failure();
  return result;
}
async function read({ homeId = null, claimId, actorId, platformAdmin = false }) {
  const result = await call('get_home_claim_review', { p_home_id: homeId, p_claim_id: claimId,
    p_actor_id: actorId, p_platform_admin: platformAdmin });
  if (result.claim?.id !== claimId || result.claim.home_id !== result.homeId
    || !/^[a-f0-9]{64}$/.test(result.claim.review_token) || !Array.isArray(result.evidence)) throw failure();
  return result;
}
async function mutate({ homeId = null, claimId, actorId, action, reviewToken = null, note = null, platformAdmin = false,
  role = null, identityConfirmed = false }) {
  // A platform admin may approve as another role or attest identity; the defaults send exactly the previous call.
  const result = await call('mutate_home_claim_review', { p_home_id: homeId, p_claim_id: claimId, p_actor_id: actorId,
    p_action: action, p_review_token: reviewToken, p_note: note, p_platform_admin: platformAdmin,
    p_validity_days: verificationAge.validityDays(),
    ...(role ? { p_role: role } : {}), ...(identityConfirmed ? { p_identity_confirmed: true } : {}) });
  if (action === 'approve' && role && result.occupancy?.role_base !== role) throw failure();
  if (result.action !== action || typeof result.replayed !== 'boolean' || typeof result.state !== 'string') throw failure();
  if (action === 'withdraw' && (result.withdrawn !== true || result.deleted !== false)) throw failure();
  if (action === 'approve' && (!result.occupancy?.id || result.occupancy.home_id !== result.homeId
    || result.occupancy.user_id !== result.claimantId || result.state !== 'approved')) throw failure();
  // Notifications are a best-effort consequence of the committed receipt. The claimant hears every decision, Pantopus's
  // or a household owner's; only Pantopus asks for more (Request info), and only Pantopus's note reaches them.
  const method = { approve: 'notifyOwnershipClaimApproved', reject: 'notifyOwnershipClaimRejected',
    ...(platformAdmin ? { request_more_info: 'notifyOwnershipClaimNeedsMoreInfo' } : {}) }[action];
  if (method && !result.replayed) {
    try {
      const claim = await claimForNotice(claimId);
      const reviewerNote = platformAdmin && typeof note === 'string' && note.trim() ? note.trim() : null;
      await require('./notificationService')[method]({ userId: result.claimantId, homeId: result.homeId,
        homeName: claim.address || 'your home', claimId, claimType: claim.claimType,
        reason: action === 'reject' ? reviewerNote || undefined : undefined, note: reviewerNote });
      // Request info also goes by email, so a claimant who doesn't open the app hears it. Not awaited: the reviewer's
      // answer doesn't wait for the mailer.
      if (action === 'request_more_info') {
        require('./homeClaimNotices').emailMoreInfo({ userId: result.claimantId, homeId: result.homeId, claimId,
          claimType: claim.claimType, address: claim.address, note: reviewerNote }).catch(() => {});
      }
    } catch (error) { logger.warn('Claim review notification failed after commit', { claimId, errorCode: error.code }); }
  }
  // A rejected residency document takes off the Verified mark a bill read gave (FASTVERIFY), and says so.
  if (action === 'reject' && !result.replayed) {
    const reviewerNote = platformAdmin && typeof note === 'string' && note.trim() ? note.trim() : null;
    await require('./fastCheck/billCheck').billRejected({ homeId: result.homeId, userId: result.claimantId, claimId, reason: reviewerNote });
  }
  // A withdrawn residency claim leaves the review queue, so nobody will review its document: a Verified mark the bill
  // read gave comes off with it (FASTVERIFY). Without that mark this reads two rows and changes nothing.
  if (action === 'withdraw' && !result.replayed) {
    await require('./fastCheck/billCheck').billWithdrawn({ homeId: result.homeId, claimId });
  }
  return result;
}
// The address the claimant entered (their own claim may name it) and the claim's kind, for its notice.
async function claimForNotice(claimId) {
  try {
    const { data } = await db.from('HomeOwnershipClaim').select('claim_type, home:home_id ( address, address2 )')
      .eq('id', claimId).maybeSingle();
    const address = [data?.home?.address, data?.home?.address2].map(part => part?.trim()).filter(Boolean).join(' ');
    return { address: address || null, claimType: data?.claim_type || null };
  } catch (_) { return { address: null, claimType: null }; }
}
// The first document a claimant adds after Pantopus asked for more (Request info) tells the review team by email.
// Best effort: the upload stands either way.
async function tellReviewersAboutReply(claimId) {
  try {
    const { data: claim } = await db.from('HomeOwnershipClaim')
      .select('id, claim_type, state, reviewed_at, claimant_user_id, home:home_id ( city, state )').eq('id', claimId).maybeSingle();
    if (claim?.state !== 'needs_more_info' || !claim.reviewed_at) return false;
    const { data: documents, error } = await db.from('HomeVerificationEvidence').select('id')
      .eq('claim_id', claimId).neq('evidence_type', 'idv').gt('created_at', claim.reviewed_at);
    if (error || documents?.length !== 1) return false;
    return await require('./adminAlerts').notifyClaimInfoSent({ claim, home: claim.home });
  } catch (_) { return false; }
}
// An ownership claim tells the review team when its first document arrives: until then there is nothing to review,
// and a claim filed by adding a Home as its owner starts with none. A residency claim told them when it was filed
// (routes/homeOwnership.js), and a claim answering Request info tells them through tellReviewersAboutReply.
// Best effort: the upload stands either way.
async function tellReviewersAboutFirstDocument(claimId) {
  try {
    const { data: claim } = await db.from('HomeOwnershipClaim')
      .select('id, claim_type, state, claim_phase_v2, terminal_reason, merged_into_claim_id, expires_at, method, created_at, claimant_user_id, home:home_id ( city, state )')
      .eq('id', claimId).maybeSingle();
    if (!claim || claim.claim_type === 'resident' || claim.state === 'needs_more_info'
      || !require('./homeClaimRoutingService').isOpenForReview(claim)) return false;
    const { data: documents, error } = await db.from('HomeVerificationEvidence').select('id')
      .eq('claim_id', claimId).neq('evidence_type', 'idv');
    if (error || documents?.length !== 1) return false;
    return await require('./adminAlerts').notifyClaimToReview({ claim, home: claim.home, claimantUserId: claim.claimant_user_id });
  } catch (_) { return false; }
}
function sendError(res, error) {
  const safe = error?.code && (Object.hasOwn(MESSAGES, error.code) || error.code === 'CLAIM_REVIEW_UNAVAILABLE') ? error : failure();
  return res.status(safe.statusCode).json({ error: safe.message, code: safe.code });
}
async function recordProvider({ homeId, claimId, actorId, result }) {
  const receipt = await call('record_home_claim_provider_evidence', { p_home_id: homeId, p_claim_id: claimId,
    p_actor_id: actorId, p_provider: result.provider, p_matched: result.matched, p_confidence: result.confidence,
    p_details: result.details || null, p_apn: result.apn || null });
  if (typeof receipt.evidenceId !== 'string') throw failure();
  return receipt;
}
module.exports = { read, mutate, recordProvider, sendError, tellReviewersAboutReply, tellReviewersAboutFirstDocument };
