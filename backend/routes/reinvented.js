// Pulse, reinvented, phase 1 (the one Pulse tab): the routes only its new screens call (coord CONTRACT section 6).
// Every one is for a signed-in person whose `pulse_reinvented` switch is on; with it off they answer
// 403 PULSE_REINVENTED_OFF, and nothing any other route answers changes. They live here, not under /api/pulse, whose
// router belongs to the paused Pulse redesign and answers 403 PULSE_REDESIGN_UNAVAILABLE while that launch key is off.
const express = require('express');
const Joi = require('joi');
const verifyToken = require('../middleware/verifyToken');
const logger = require('../utils/logger');
const store = require('../services/moments/momentStore');
const list = require('../services/pulse/list');

const router = express.Router();

router.use(verifyToken);
router.use(async (req, res, next) => {
  if (await store.reinventedOn(req.user)) return next();
  const off = store.reinventedOff();
  return res.status(off.status).json({ error: off.message, code: off.code });
});

function sendError(res, error, what) {
  if (error.status) {
    return res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
  }
  logger.error(`reinvented.${what}.error`, { error: error.message });
  return res.status(503).json({ error: "Pulse couldn't load. Please try again.", code: 'PULSE_LIST_FAILED' });
}

const listSchema = Joi.object({
  reach: Joi.string().valid(...list.REACHES).default('around'),
  miles: Joi.number().integer().min(1).max(list.MAX_MILES).default(list.MAX_MILES),
  chip: Joi.string().valid(...list.CHIP_NAMES).default('all'),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  cursor: Joi.string().max(2000).allow(''),
  limit: Joi.number().integer().min(1).max(50).default(20),
}).and('latitude', 'longitude');

/** GET /list — Close circle or Around me: the Moments and posts the caller may see, mixed (CONTRACT 6a). */
router.get('/list', async (req, res) => {
  try {
    const { error, value } = listSchema.validate(req.query || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/"/g, ''), code: 'LIST_INVALID' });
    res.json(await list.listFor(req.user.id, value));
  } catch (error) {
    sendError(res, error, 'list');
  }
});

module.exports = router;
