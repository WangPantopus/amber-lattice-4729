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
const pulseMap = require('../services/pulse/map');

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

// The map's box, as GET /api/moments/map takes it.
const mapSchema = Joi.object({
  south: Joi.number().min(-90).max(90).required(),
  west: Joi.number().min(-180).max(180).required(),
  north: Joi.number().min(-90).max(90).required(),
  east: Joi.number().min(-180).max(180).required(),
  zoom: Joi.number().min(0).max(25),
  time: Joi.string().valid(...pulseMap.TIMES).default('live'),
});

/** GET /map — the one map for a box and a time: rings, marks, tickets, guess spots (CONTRACT 6b). */
router.get('/map', async (req, res) => {
  try {
    const { error, value } = mapSchema.validate(req.query || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/"/g, ''), code: 'MAP_INVALID' });
    const { time, zoom: _zoom, ...box } = value;
    if (box.south >= box.north || box.west >= box.east) {
      return res.status(400).json({ error: 'Send a map area with south < north and west < east.', code: 'MAP_INVALID' });
    }
    res.json(await pulseMap.mapFor(req.user, box, { time }));
  } catch (error) {
    sendError(res, error, 'map');
  }
});

const stripSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
}).and('latitude', 'longitude');

/** GET /strip — "Alive right now": Live from here, plans starting soon, rings of people you know (CONTRACT 6c). */
router.get('/strip', async (req, res) => {
  try {
    const { error, value } = stripSchema.validate(req.query || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/"/g, ''), code: 'STRIP_INVALID' });
    res.json(await pulseMap.stripFor(req.user, value));
  } catch (error) {
    sendError(res, error, 'strip');
  }
});

module.exports = router;
