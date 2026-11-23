// ============================================================
// ADMIN ROUTES — Platform-level admin operations
// Requires User.role = 'admin' for all endpoints.
// Mount at: app.use('/api/admin', require('./routes/admin'));
// ============================================================

const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const verifyToken = require('../middleware/verifyToken');
const { requireAdmin } = require('../middleware/verifyToken');
const logger = require('../utils/logger');
const homeClaimReviewService = require('../services/homeClaimReviewService');
const homeClaimRoutingService = require('../services/homeClaimRoutingService');
const homeClaimIdentityService = require('../services/homeClaimIdentityService');
const { getRequestSessionScope, requireExpectedSessionScope } = require('../utils/requestSessionScope');
const funnelReport = require('../services/funnelReport');
const propertyRecordsReport = require('../services/propertyRecords/report');
const creatorLinks = require('../services/creatorLinks');

// All admin routes require auth + admin role
router.use(verifyToken, requireAdmin);

// ============================================================
// PENDING CLAIMS — List all claims awaiting review
// ============================================================

// The pending queue also receives co-owner invitations recorded as a vouch.
const BUCKET_STATES = {
  pending: ['submitted', 'pending_review', 'pending_challenge_window', 'needs_more_info', 'disputed'],
  approved: ['approved'],
  rejected: ['rejected'],
};

async function enrichClaims(claims) {
  const list = claims || [];
  if (list.length === 0) return [];

  const homeIds = [...new Set(list.map(c => c.home_id))];
  const userIds = [...new Set(list.map(c => c.claimant_user_id))];

  let homesMap = {};
  if (homeIds.length > 0) {
    const { data: homes } = await supabaseAdmin
      .from('Home')
      .select('id, address, city, state, zipcode, name')
      .in('id', homeIds);
    for (const h of (homes || [])) {
      homesMap[h.id] = h;
    }
  }

  let usersMap = {};
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('User')
      .select('id, username, name, email, created_at, profile_picture_url')
      .in('id', userIds);
    for (const u of (users || [])) {
      usersMap[u.id] = u;
    }
  }

  const claimIds = list.filter(claim => homeClaimRoutingService.isOpenForReview(claim)).map(claim => claim.id);
  const byId = new Map(list.map(c => [c.id, c]));
  let evidenceCountMap = {};
  const sinceRequestMap = {};
  if (claimIds.length > 0) {
    const { data: evidenceCounts } = await supabaseAdmin
      .from('HomeVerificationEvidence')
      .select('claim_id, evidence_type, created_at')
      .in('claim_id', claimIds);
    // Documents only: a claim's identity check isn't one.
    for (const e of (evidenceCounts || [])) {
      if (e.evidence_type === 'idv') continue;
      evidenceCountMap[e.claim_id] = (evidenceCountMap[e.claim_id] || 0) + 1;
      // A claim waiting on the claimant (Request info) counts the documents they sent after the request.
      const claim = byId.get(e.claim_id);
      if (claim?.state === 'needs_more_info' && claim.reviewed_at && Date.parse(e.created_at) > Date.parse(claim.reviewed_at)) {
        sinceRequestMap[e.claim_id] = (sinceRequestMap[e.claim_id] || 0) + 1;
      }
    }
  }

  return list.map(c => ({
    ...c,
    home: homesMap[c.home_id] || null,
    claimant: usersMap[c.claimant_user_id] || null,
    evidence_count: evidenceCountMap[c.id] || 0,
    documents_since_request: sinceRequestMap[c.id] || 0,
  }));
}

/**
 * GET /api/admin/pending-claims
 * Returns all ownership/residency claims in reviewable states across all homes.
 * Kept as an alias for /claims?bucket=pending so existing clients keep working.
 */
// ── GET /funnel/summary?days=30 — the wedge ladder read-out ──
// Previews → aha → share → wall → register → account, per distinct
// visitor, overall and split by the ?r= route on the beacons. Nothing
// identifying comes back: anon ids are counted, never listed.
router.get('/funnel/summary', async (req, res) => {
  try {
    res.json(await funnelReport.loadFunnelSummary({ days: req.query.days }));
  } catch (err) {
    logger.error('admin.funnel.summary.error', { error: err.message });
    res.status(500).json({ error: 'Failed to build the funnel summary' });
  }
});

// ── GET /property-records/report?days=7 — county records: what was asked for, who answered ──
// Per county: lookups answered and unanswered, what to build next, what's ready to go live,
// and calls to each vendor (ATTOM's must be zero). Counts only.
router.get('/property-records/report', async (req, res) => {
  try {
    res.json(await propertyRecordsReport.loadReport({ days: req.query.days }));
  } catch (err) {
    logger.error('admin.property_records.report.error', { error: err.message });
    res.status(500).json({ error: 'Failed to build the property records report' });
  }
});

// ── Creator links for Christmas cards (services/creatorLinks.js) ──
// GET  /creators                 — every creator code, its link, people joined through it and the stamp books they
//                                  bought by size (refunds apart). Counts and sums only: nothing about any buyer.
// POST /creators/accounts { q }  — find the account to give a code: an exact email address or username (a POST,
//                                  so a typed email address never sits in a request address or access log)
// POST /creators { user_id, code } — give that account its code (6–12 letters and digits, kept in capitals)
router.get('/creators', async (_req, res) => {
  try {
    res.json(await creatorLinks.salesReport());
  } catch (err) {
    logger.error('admin.creators.report.error', { error: err.message });
    res.status(500).json({ error: 'Failed to build the creator sales report' });
  }
});

router.post('/creators/accounts', async (req, res) => {
  try {
    res.json({ accounts: await creatorLinks.findAccounts(req.body?.q) });
  } catch (err) {
    logger.error('admin.creators.accounts.error', { error: err.message });
    res.status(500).json({ error: 'Failed to look up the account' });
  }
});

router.post('/creators', async (req, res) => {
  try {
    res.status(201).json(await creatorLinks.giveCreatorCode({
      userId: req.body?.user_id,
      code: req.body?.code,
      adminId: req.user.id,
    }));
  } catch (err) {
    if (err instanceof creatorLinks.CreatorCodeRefusal) return res.status(err.status).json({ error: err.message });
    logger.error('admin.creators.give.error', { error: err.message });
    res.status(500).json({ error: 'Failed to save the code' });
  }
});

router.get('/pending-claims', async (req, res) => {
  try {
    const { data: claims, error } = await supabaseAdmin
      .from('HomeOwnershipClaim')
      .select(`
        id,
        home_id,
        claimant_user_id,
        claim_type,
        state,
        claim_phase_v2,
        terminal_reason,
        merged_into_claim_id,
        expires_at,
        challenge_state,
        method,
        risk_score,
        reviewed_at,
        created_at,
        updated_at
      `)
      .in('state', BUCKET_STATES.pending)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const enrichedClaims = await enrichClaims(claims);
    res.set('Cache-Control', 'private, no-store');
    res.json({ claims: enrichedClaims, total: enrichedClaims.length, review_session: getRequestSessionScope(req) });
  } catch (err) {
    logger.error('Admin: Failed to fetch pending claims', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch pending claims' });
  }
});

// ============================================================
// ALL CLAIMS — Tabbed admin queue (pending / approved / rejected)
// ============================================================

/**
 * GET /api/admin/claims
 * Returns claims filtered by `bucket` (pending|approved|rejected) or by
 * a single legacy `state` value. Pending claims are ordered oldest-first
 * (FIFO triage); approved/rejected are ordered newest-first. The
 * response is enriched with home + claimant + evidence_count so the
 * Review-claims admin queue can render rows directly.
 *
 * Query params:
 *   bucket:  pending | approved | rejected (preferred)
 *   state:   raw state value (legacy escape hatch; ignored when bucket set)
 *   limit:   default 50
 *   offset:  default 0
 */
router.get('/claims', async (req, res) => {
  try {
    const { bucket, state, limit = 50, offset = 0 } = req.query;
    const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
    const off = Math.max(0, parseInt(offset, 10) || 0);

    const bucketStates = bucket ? BUCKET_STATES[bucket] : null;
    if (bucket && !bucketStates) {
      return res.status(400).json({ error: `Unknown bucket "${bucket}". Expected one of: pending, approved, rejected` });
    }

    let query = supabaseAdmin
      .from('HomeOwnershipClaim')
      .select(`
        id,
        home_id,
        claimant_user_id,
        claim_type,
        state,
        claim_phase_v2,
        terminal_reason,
        merged_into_claim_id,
        expires_at,
        challenge_state,
        method,
        risk_score,
        reviewed_at,
        created_at,
        updated_at
      `, { count: 'exact' })
      .order('created_at', { ascending: bucket === 'pending' })
      .range(off, off + lim - 1);

    if (bucketStates) {
      query = query.in('state', bucketStates);
    } else if (state) {
      query = query.eq('state', state);
    }

    const { data: claims, error, count } = await query;
    if (error) throw error;

    const enrichedClaims = await enrichClaims(claims);

    // For the Pending queue banner: surface the age of the oldest claim
    // in the bucket. Claims are ordered ascending for pending so [0] is
    // the oldest; for other buckets it's not surfaced.
    let oldestAgeSeconds = null;
    if (bucket === 'pending' && enrichedClaims.length > 0) {
      const oldestCreatedAt = new Date(enrichedClaims[0].created_at);
      oldestAgeSeconds = Math.max(0, Math.floor((Date.now() - oldestCreatedAt.getTime()) / 1000));
    }

    res.json({
      claims: enrichedClaims,
      total: count || enrichedClaims.length,
      oldest_age_seconds: oldestAgeSeconds,
    });
  } catch (err) {
    logger.error('Admin: Failed to fetch claims', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

/**
 * GET /api/admin/claims/counts
 * Returns the per-bucket totals used by the Review-claims tab strip.
 * Declared before /claims/:claimId so "counts" isn't matched as an id.
 */
router.get('/claims/counts', async (_req, res) => {
  try {
    const counts = { pending: 0, approved: 0, rejected: 0 };

    for (const [bucket, states] of Object.entries(BUCKET_STATES)) {
      const { count, error } = await supabaseAdmin
        .from('HomeOwnershipClaim')
        .select('id', { count: 'exact', head: true })
        .in('state', states);

      if (error) throw error;
      counts[bucket] = count || 0;
    }

    res.json(counts);
  } catch (err) {
    logger.error('Admin: Failed to fetch claim counts', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch claim counts' });
  }
});

// ============================================================
// CLAIM DETAIL — View a specific claim + its evidence
// ============================================================

/**
 * GET /api/admin/claims/:claimId
 * Returns the current claim snapshot and safe evidence metadata.
 */
router.get('/claims/:claimId', async (req, res) => {
  try {
    if (!requireExpectedSessionScope(req, res)) return;
    const result = await homeClaimReviewService.read({ claimId: req.params.claimId, actorId: req.user.id, platformAdmin: true });
    const archived = !homeClaimRoutingService.isOpenForReview(result.claim);
    const approval = !archived
      ? await homeClaimIdentityService.reviewerApprovalOrNull(result.claimId) : null;
    res.set('Cache-Control', 'private, no-store');
    res.json({ claim: { ...result.claim, evidence: homeClaimIdentityService.withoutIdentityEvidence(result.claim.evidence) },
      home: result.home, claimant: result.claimant, evidence: homeClaimIdentityService.withoutIdentityEvidence(result.evidence), evidence_archived: archived, approval,
      claim_session: { ...getRequestSessionScope(req), home_id: result.homeId, claim_id: result.claimId } });
  } catch (error) { homeClaimReviewService.sendError(res, error); }
});

// Household roles an approval may grant. "approve_as" overrides the role the claim type gives.
const APPROVE_AS_ROLES = ['owner', 'admin', 'manager', 'member', 'lease_resident', 'restricted_member', 'guest'];

router.post('/claims/:claimId/review', async (req, res) => {
  const { action, approve_as: approveAs = null, identity_confirmed: identityConfirmed = false } = req.body;
  if (!['approve', 'reject', 'request_more_info'].includes(action)) {
    return res.status(400).json({ error: 'Invalid claim review action.' });
  }
  if ((approveAs !== null && !APPROVE_AS_ROLES.includes(approveAs)) || typeof identityConfirmed !== 'boolean'
    || ((approveAs !== null || identityConfirmed) && action !== 'approve')) {
    return res.status(400).json({ error: 'Invalid claim review action.' });
  }
  try {
    if (!requireExpectedSessionScope(req, res)) return;
    const result = await homeClaimReviewService.mutate({ claimId: req.params.claimId, actorId: req.user.id,
      action, reviewToken: req.body.review_token, note: req.body.note, platformAdmin: true,
      role: approveAs, identityConfirmed });
    res.json({ ...result, message: 'Claim review saved.' });
  } catch (error) { homeClaimReviewService.sendError(res, error); }
});

module.exports = router;
