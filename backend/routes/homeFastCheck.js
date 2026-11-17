// ============================================================
// FASTVERIFY: faster home verification (founder, 2026-11-17)
//
//   GET  /api/homes/:id/verify-options             the person's level here and the ways they can verify it
//   POST /api/homes/:id/fast-check/phone/start     { phone, account_first_name?, account_last_name? } → { sent, resend_after_s }
//   POST /api/homes/:id/fast-check/phone/verify    { phone, code, account_first_name?, account_last_name? }
//                                                  → { result: 'verified'|'no_match'|'wrong_code', level, tries_left }
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

const Joi = require('joi');
const validate = require('../middleware/validate');
const phoneCheck = require('../services/fastCheck/phoneCheck');

const noStore = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
// With home_fast_verify off for the person, every check route answers 404 FAST_CHECK_OFF before reading its body.
const fastOn = async (req, res, next) => {
  if (await fastCheck.flagOn(fastCheck.FLAGS.base, req.user)) return next();
  return fastCheck.sendError(res, new fastCheck.FastCheckError('FAST_CHECK_OFF'));
};
const name = Joi.string().trim().max(128).allow('', null);
const phoneStartSchema = Joi.object({ phone: Joi.string().trim().max(32).required(), account_first_name: name, account_last_name: name });
const phoneVerifySchema = Joi.object({ phone: Joi.string().trim().max(32).required(), code: Joi.string().trim().max(10).required(),
  account_first_name: name, account_last_name: name });

router.get('/:id/verify-options', noStore, verifyToken, async (req, res) => {
  try {
    const options = await fastCheck.verifyOptions({ homeId: req.params.id, user: req.user, platform: platformFromRequest(req) });
    return res.status(200).json(options);
  } catch (error) {
    return fastCheck.sendError(res, error);
  }
});

router.post('/:id/fast-check/phone/start', noStore, verifyToken, fastOn, validate(phoneStartSchema), async (req, res) => {
  try {
    return res.status(200).json(await phoneCheck.start({ homeId: req.params.id, user: req.user, phone: req.body.phone,
      firstName: req.body.account_first_name, lastName: req.body.account_last_name }));
  } catch (error) {
    return fastCheck.sendError(res, error);
  }
});

router.post('/:id/fast-check/phone/verify', noStore, verifyToken, fastOn, validate(phoneVerifySchema), async (req, res) => {
  try {
    return res.status(200).json(await phoneCheck.verify({ homeId: req.params.id, user: req.user, phone: req.body.phone,
      code: req.body.code, firstName: req.body.account_first_name, lastName: req.body.account_last_name }));
  } catch (error) {
    return fastCheck.sendError(res, error);
  }
});

module.exports = router;
