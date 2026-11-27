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
const atlas = require('../services/pulse/atlas');
const explore = require('../services/pulse/explore');
const keep = require('../services/pulse/keep');
const wantToCome = require('../services/pulse/wantToCome');
const play = require('../services/pulse/play');
const fieldCard = require('../services/pulse/fieldCard');
const planActions = require('../services/plans/planActions');
const requireFeatureFlag = require('../middleware/requireFeatureFlag');
const { contentCreationLimiter } = require('../middleware/rateLimiter');

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

// ─── Explore (CONTRACT 6f) ──────────────────────────────────────────────────

const exploreSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  cursor: Joi.string().max(500).allow(''),
}).and('latitude', 'longitude');

/** GET /explore — "Today, elsewhere", then newest with variety, each with why it is there. */
router.get('/explore', async (req, res) => {
  try {
    const { error, value } = exploreSchema.validate(req.query || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/"/g, ''), code: 'EXPLORE_INVALID' });
    res.json(await explore.exploreFor(req.user.id, value));
  } catch (error) {
    sendError(res, error, 'explore');
  }
});

// ─── "Keep this?" (CONTRACT 6d) ─────────────────────────────────────────────

const keepSchema = Joi.object({ keep: Joi.boolean().required() });

/** POST /moments/:id/keep — { keep }: the author answers "Keep this?" once, in their Moment's last two hours. */
router.post('/moments/:id/keep', async (req, res) => {
  try {
    const { error, value } = keepSchema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/"/g, ''), code: 'KEEP_INVALID' });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'This Moment could not be found.', code: 'MOMENT_NOT_FOUND' });
    }
    res.json(await keep.answerKeep(req.user.id, req.params.id, value.keep));
  } catch (error) {
    sendError(res, error, 'keep');
  }
});

// ─── My Atlas (CONTRACT 6e) ─────────────────────────────────────────────────

const atlasSchema = Joi.object({
  cursor: Joi.string().max(500).allow(''),
  limit: Joi.number().integer().min(1).max(50).default(30),
  south: Joi.number().min(-90).max(90),
  west: Joi.number().min(-180).max(180),
  north: Joi.number().min(-90).max(90),
  east: Joi.number().min(-180).max(180),
}).and('south', 'west', 'north', 'east');

/** GET /atlas — the caller's own kept Moments, by date (cursor) or in a box, private to them. */
router.get('/atlas', async (req, res) => {
  try {
    const { error, value } = atlasSchema.validate(req.query || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/"/g, ''), code: 'ATLAS_INVALID' });
    const { south, west, north, east, ...page } = value;
    const box = south == null ? null : { south, west, north, east };
    if (box && (box.south >= box.north || box.west >= box.east)) {
      return res.status(400).json({ error: 'Send a map area with south < north and west < east.', code: 'ATLAS_INVALID' });
    }
    res.json(await atlas.atlasFor(req.user.id, { ...page, box }));
  } catch (error) {
    sendError(res, error, 'atlas');
  }
});

/** DELETE /atlas/:id — Delete for good: the Moment ends, its files and picture keys go at once. */
router.delete('/atlas/:id', async (req, res) => {
  try {
    await atlas.deleteForGood(req.user.id, req.params.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'atlas_delete');
  }
});

// ─── "Want to come?" (CONTRACT 6g) ──────────────────────────────────────────

/**
 * POST /moments/:id/plan — the author starts a plan in Plans from their own Moment. The body is a plan as
 * POST /api/plans takes it, and its answers and errors are Plans' own; `more`, `guests` and `extras` in the query
 * say what this app can draw, as on the Plans routes. Never a business's plan.
 */
router.post('/moments/:id/plan', requireFeatureFlag('plans'), contentCreationLimiter, async (req, res) => {
  try {
    const user = {
      ...req.user,
      plansMore: req.query.more === '1',
      plansGuests: req.query.guests === '1',
      plansExtras: req.query.extras === '1',
    };
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    res.status(201).json(await wantToCome.startPlan(user, req.params.id, body));
  } catch (error) {
    if (error instanceof planActions.PlanError) {
      return res.status(error.status).json({ error: error.code, message: error.message, ...error.extra });
    }
    if (error.status && error.extra) {
      return res.status(error.status).json({ error: error.message, code: error.code, ...error.extra });
    }
    return sendError(res, error, 'moment_plan');
  }
});

// ─── Playable items and the answers (CONTRACT 7b) ───────────────────────────

/** GET /play/:id — a post's or a Moment's playable items, with what this reader may see of the answers. */
router.get('/play/:id', async (req, res) => {
  try {
    res.json(await play.playOf(req.params.id, req.user.id));
  } catch (error) {
    sendError(res, error, 'play');
  }
});

/** PUT /play/:id/:item — the reader's answer: a vote, a slider value, a spot on the board, a question, a guess. */
router.put('/play/:id/:item', contentCreationLimiter, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    res.json(await play.answer(req.params.id, req.params.item, req.user.id, body));
  } catch (error) {
    sendError(res, error, 'play_answer');
  }
});

/** DELETE /play/:id/:item — the reader takes their answer back (never a guess). */
router.delete('/play/:id/:item', async (req, res) => {
  try {
    await play.takeBack(req.params.id, req.params.item, req.user.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'play_take_back');
  }
});

/** GET /play/:id/:item/answers — the question box's answers or a board's notes, for the author only. */
router.get('/play/:id/:item/answers', async (req, res) => {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 12) : '';
    res.json(await play.authorAnswers(req.params.id, req.params.item, req.user.id, cursor));
  } catch (error) {
    sendError(res, error, 'play_answers');
  }
});

/** DELETE /play/:id/:item/answers/:answer — the author removes one answer on their post. */
router.delete('/play/:id/:item/answers/:answer', async (req, res) => {
  try {
    await play.removeAnswer(req.params.id, req.params.item, req.params.answer, req.user.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'play_remove');
  }
});

// ─── Dots on the picture (CONTRACT 7c) ──────────────────────────────────────

/** DELETE /dots/:id/:dot — the author removes one dot from their post. */
router.delete('/dots/:id/:dot', async (req, res) => {
  try {
    await play.removeDot(req.params.id, req.params.dot, req.user.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'dot_remove');
  }
});

// ─── Field cards (CONTRACT 7d) ──────────────────────────────────────────────

/** POST /dots/:id/:dot/card — a thing's field card: the kept one, or made now with one Pantopus AI call and kept. */
router.post('/dots/:id/:dot/card', contentCreationLimiter, async (req, res) => {
  try {
    res.json(await fieldCard.cardFor(req.params.id, req.params.dot, req.user.id));
  } catch (error) {
    sendError(res, error, 'field_card');
  }
});

/** POST /dots/:id/:dot/card/correction — "Not right?": { name, note }. */
router.post('/dots/:id/:dot/card/correction', contentCreationLimiter, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    res.json(await fieldCard.correct(req.params.id, req.params.dot, req.user.id, body));
  } catch (error) {
    sendError(res, error, 'field_card_correction');
  }
});

module.exports = router;
