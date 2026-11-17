// ============================================================
// "This wasn't me" (FASTVERIFY, behind home_postcard_scan, off by default)
//
//   POST /api/public/postcard-report   { home_id, code }   → { recorded: true }
//
// No account: whoever holds the card scanned its square (the link carries the home id, and the code in its fragment)
// and said they didn't ask for it. When the code is a pending card's for that home: the card is cancelled (its code
// then answers POSTCARD_NO_LONGER_AVAILABLE, "This postcard can no longer be used."), reported_at is set, the fast
// check of the person who asked comes off and they can't make one there while an address review case is open, and
// the admins get an email. Any other input gets the same answer, so the route says nothing about any card or home.
// Rate limited by IP and by home. With the switch off for everyone: 404 FAST_CHECK_OFF.
// ============================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const db = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { clientIpKey } = require('../utils/clientIpKey');
const featureFlagService = require('../services/featureFlagService');
const { hashPostcardCode } = require('../utils/postcardDispatch');
const addressReviewService = require('../services/addressValidation/addressReviewService');
const adminAlerts = require('../services/adminAlerts');
const homeFastCheckService = require('../services/homeFastCheckService');

const FLAG = 'home_postcard_scan';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^\d{6}$/;
const RECORDED = Object.freeze({ recorded: true });
const HOUR_MS = 60 * 60 * 1000;

const ipLimiter = rateLimit({
  windowMs: HOUR_MS,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `postcard-report:${clientIpKey(req)}`,
  message: { error: 'Too many tries. Please try again later.' },
});

// By home, in this process: 5 reports an hour reach any one home's cards, whoever sends them.
const perHome = new Map();
function homeAllowed(homeId, now = Date.now()) {
  const recent = (perHome.get(homeId) || []).filter((at) => at > now - HOUR_MS);
  if (recent.length >= 5) return false;
  recent.push(now);
  perHome.set(homeId, recent);
  if (perHome.size > 10000) perHome.delete(perHome.keys().next().value);
  return true;
}

/** Is the switch on for anyone? The route has no account to ask about. */
async function switchOnAnywhere() {
  const flag = await featureFlagService.getFlag(FLAG).catch(() => null);
  if (!flag) return false;
  return Boolean(flag.enabled_globally || flag.enabled_for_internal_team || (flag.beta_user_ids || []).length);
}

async function report(homeId, code) {
  const { data: card, error } = await db.from('HomePostcardCode').select('id, user_id, home_id, expires_at')
    .eq('home_id', homeId).eq('status', 'pending').eq('code_hash', hashPostcardCode(code))
    .gt('expires_at', new Date().toISOString()).limit(1).maybeSingle();
  if (error || !card) return;
  // The card carries the square only when the switch is on for the person who asked; nobody else can report it here.
  if (!(await featureFlagService.isFeatureEnabled(FLAG, card.user_id).catch(() => false))) return;
  const now = new Date().toISOString();
  const { data: cancelled, error: cancelError } = await db.from('HomePostcardCode')
    .update({ status: 'cancelled', reported_at: now, updated_at: now })
    .eq('id', card.id).eq('status', 'pending').select('id');
  if (cancelError || !cancelled?.length) return;
  logger.warn('postcard_report.recorded', { home_id: homeId, postcard_id: card.id });
  // The person who asked loses the Verified mark here until the case is decided (homeFastCheckService.admit refuses).
  await homeFastCheckService.clearFastCheck({ homeId, userId: card.user_id }).catch((err) =>
    logger.warn('postcard_report.fast_check_not_cleared', { home_id: homeId, error: err.message }));
  const caseId = await addressReviewService.flagPostcardReport({ homeId, userId: card.user_id });
  const { data: home } = await db.from('Home').select('city, state').eq('id', homeId).maybeSingle();
  adminAlerts.notifyPostcardReported({ caseId, homeId, userId: card.user_id, home }).catch(() => {});
}

router.post('/postcard-report', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, ipLimiter, async (req, res) => {
  try {
    if (!(await switchOnAnywhere())) {
      const [status, message] = homeFastCheckService.REFUSALS.FAST_CHECK_OFF;
      return res.status(status).json({ code: 'FAST_CHECK_OFF', error: message });
    }
    const homeId = String(req.body?.home_id || '').toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (UUID.test(homeId) && CODE.test(code) && homeAllowed(homeId)) await report(homeId, code);
  } catch (error) {
    logger.error('postcard_report.failed', { error: error.message });
  }
  return res.status(200).json(RECORDED);
});

module.exports = router;
