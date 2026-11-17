// ============================================================
// FASTVERIFY: faster home verification (founder, 2026-11-17)
//
//   GET  /api/homes/:id/verify-options   the person's level here and the ways they can verify it
//
// Mounted at /api/homes before the generic home router. Every answer is private and never stored by a cache. With
// home_fast_verify off for the person every route here answers 404 FAST_CHECK_OFF, and the apps keep today's sheet.
// The contract is SPEC section 4 (~/pantopus-home-verify/SPEC.md); services/homeFastCheckService.js does the work.
// ============================================================

const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const fastCheck = require('../services/homeFastCheckService');
const { platformFromRequest } = require('../services/authDeviceService');

const noStore = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };

router.get('/:id/verify-options', noStore, verifyToken, async (req, res) => {
  try {
    const options = await fastCheck.verifyOptions({ homeId: req.params.id, user: req.user, platform: platformFromRequest(req) });
    return res.status(200).json(options);
  } catch (error) {
    return fastCheck.sendError(res, error);
  }
});

module.exports = router;
