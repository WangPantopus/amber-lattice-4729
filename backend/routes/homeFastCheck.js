// ============================================================
// FASTVERIFY: faster home verification (founder, 2026-11-17)
//
//   GET  /api/homes/:id/verify-options             the person's level here and the ways they can verify it
//   POST /api/homes/:id/fast-check/phone/start     { phone, account_first_name?, account_last_name? } → { sent, resend_after_s }
//   POST /api/homes/:id/fast-check/phone/verify    { phone, code, account_first_name?, account_last_name? }
//                                                  → { result: 'verified'|'no_match'|'wrong_code', level, tries_left }
//   POST /api/homes/:id/fast-check/location/challenge                       → { challenge, expires_at }
//   POST /api/homes/:id/fast-check/location  { challenge, latitude, longitude, accuracy_m, mocked, platform, proof }
//        → { result: 'verified'|'confirmed'|'no_match'|'too_rough'|'not_counted', level, recheck_due_at }
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
const locationCheck = require('../services/fastCheck/locationCheck');

const noStore = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
// With home_fast_verify off for the person, every check route answers 404 FAST_CHECK_OFF before reading its body.
const fastOn = async (req, res, next) => {
  if (await fastCheck.flagOn(fastCheck.FLAGS.base, req.user)) return next();
  return fastCheck.sendError(res, new fastCheck.FastCheckError('FAST_CHECK_OFF'));
};
const name = Joi.string().trim().max(128).allow('', null);
const phoneStartSchema = Joi.object({ phone: Joi.string().trim().max(32).required(), account_first_name: name, account_last_name: name });
const locationSchema = Joi.object({
  challenge: Joi.string().max(512).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracy_m: Joi.number().min(0).max(100000).required(),
  mocked: Joi.boolean().required(),
  platform: Joi.string().valid('ios', 'android').required(),
  proof: Joi.object({
    type: Joi.string().valid('app_attest', 'play_integrity'),
    reading: Joi.string().max(1024),
    key_id: Joi.string().max(128),
    attestation: Joi.string().max(20000),
    token: Joi.string().max(20000),
  }).allow(null),
});
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

router.post('/:id/fast-check/location/challenge', noStore, verifyToken, fastOn, async (req, res) => {
  try {
    return res.status(200).json(await locationCheck.challenge({ homeId: req.params.id, user: req.user, platform: platformFromRequest(req) }));
  } catch (error) {
    return fastCheck.sendError(res, error);
  }
});

router.post('/:id/fast-check/location', noStore, verifyToken, fastOn, validate(locationSchema), async (req, res) => {
  try {
    return res.status(200).json(await locationCheck.check({ homeId: req.params.id, user: req.user, input: req.body }));
  } catch (error) {
    return fastCheck.sendError(res, error);
  }
});

module.exports = router;
