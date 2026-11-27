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

// ─── Collect: the reader's field guide (CONTRACT 7f) ────────────────────────

/** POST /dots/:id/:dot/collect — keeps a kept field card in the reader's own field guide. */
router.post('/dots/:id/:dot/collect', contentCreationLimiter, async (req, res) => {
  try {
    res.json(await fieldCard.collect(req.params.id, req.params.dot, req.user.id));
  } catch (error) {
    sendError(res, error, 'collect');
  }
});

/** DELETE /dots/:id/:dot/collect — lets it go. */
router.delete('/dots/:id/:dot/collect', async (req, res) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !/^[a-z0-9_-]{1,38}$/.test(req.params.dot)) {
      return res.status(404).json({ error: 'This could not be found.', code: 'PLAY_NOT_FOUND' });
    }
    await fieldCard.letGo(req.params.id, req.params.dot, req.user.id);
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error, 'collect_let_go');
  }
});

/** GET /field-guide — the reader's own collected cards, newest first. */
router.get('/field-guide', async (req, res) => {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 12) : '';
    res.json(await fieldCard.fieldGuide(req.user.id, cursor));
  } catch (error) {
    sendError(res, error, 'field_guide');
  }
});

// ─── The person's own Pantopus AI switch (CONTRACT 7d) ──────────────────────

const aiSetting = require('../services/pulse/aiSetting');
const settingsSchema = Joi.object({ pantopus_ai: Joi.boolean().required() });

/** GET /settings — { pantopus_ai }: the person's own Pantopus AI switch, on unless they turned it off. */
router.get('/settings', async (req, res) => {
  try {
    res.json(await aiSetting.settingsOf(req.user.id));
  } catch (error) {
    sendError(res, error, 'settings');
  }
});

/** PATCH /settings — { pantopus_ai: true | false }. */
router.patch('/settings', async (req, res) => {
  try {
    const { error, value } = settingsSchema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/"/g, ''), code: 'SETTINGS_INVALID' });
    logger.info('reinvented.pantopus_ai_set', { on: value.pantopus_ai });
    return res.json(await aiSetting.setAi(req.user.id, value.pantopus_ai));
  } catch (error) {
    return sendError(res, error, 'settings_set');
  }
});

// ─── Voice and sound as media (CONTRACT 7e) ─────────────────────────────────

const multer = require('multer');
const soundMedia = require('../services/pulse/sound');

const soundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: soundMedia.MAX_BYTES.voice, files: 1, fields: 8, parts: 10, fieldSize: 32 * 1024, fieldNameSize: 40 },
}).single('file');

function receiveSound(req, res, next) {
  soundUpload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'This sound is too large to post.', code: 'MEDIA_TOO_LARGE' });
    return res.status(400).json({ error: 'Send the sound as "file", with kind, duration_ms and (for a voice) words.', code: 'SOUND_INVALID' });
  });
}

/** POST /moments/:id/sound — the author's voice, place sound, or a dot's whisper on their own Moment. */
router.post('/moments/:id/sound', contentCreationLimiter, receiveSound, async (req, res) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'This Moment could not be found.', code: 'MOMENT_NOT_FOUND' });
    }
    const row = await soundMedia.upload(req.params.id, req.user, req.file, req.body || {});
    const [moment] = await store.serializeMoments([row], req.user.id);
    return res.json({ moment });
  } catch (error) {
    return sendError(res, error, 'sound');
  }
});

/** DELETE /moments/:id/sound?kind=voice|place — the author takes it off. */
router.delete('/moments/:id/sound', async (req, res) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'This Moment could not be found.', code: 'MOMENT_NOT_FOUND' });
    }
    await soundMedia.remove(req.params.id, req.user, String(req.query.kind || ''));
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error, 'sound_remove');
  }
});

// ─── "Save the steps" of a step deck (CONTRACT 7g) ───────────────────────────

const stepDeck = require('../services/pulse/deck');

/** POST /moments/:id/deck/save — keeps the words of the deck's steps in the reader's field guide. */
router.post('/moments/:id/deck/save', contentCreationLimiter, async (req, res) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'This step deck could not be found.', code: 'PLAY_NOT_FOUND' });
    }
    return res.json(await stepDeck.saveSteps(req.params.id, req.user.id));
  } catch (error) {
    return sendError(res, error, 'deck_save');
  }
});

/** DELETE /moments/:id/deck/save — lets them go. */
router.delete('/moments/:id/deck/save', async (req, res) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'This step deck could not be found.', code: 'PLAY_NOT_FOUND' });
    }
    await stepDeck.unsaveSteps(req.params.id, req.user.id);
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error, 'deck_unsave');
  }
});

// ─── Replies people can see on a Moment (CONTRACT 8a) ───────────────────────

const shownReplies = require('../services/pulse/replies');

/** GET /moments/:id/replies — the replies this reader may see, oldest first. */
router.get('/moments/:id/replies', async (req, res) => {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 12) : '';
    res.json(await shownReplies.list(req.params.id, req.user.id, cursor));
  } catch (error) {
    sendError(res, error, 'replies');
  }
});

/** POST /moments/:id/replies — { text }. */
router.post('/moments/:id/replies', contentCreationLimiter, async (req, res) => {
  try {
    res.status(201).json(await shownReplies.create(req.params.id, req.user, req.body?.text));
  } catch (error) {
    sendError(res, error, 'reply_create');
  }
});

/** DELETE /moments/:id/replies/:reply — its writer or the Moment's author. */
router.delete('/moments/:id/replies/:reply', async (req, res) => {
  try {
    await shownReplies.remove(req.params.id, req.params.reply, req.user.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'reply_remove');
  }
});

/** POST /moments/:id/replies/:reply/report — { reason, details }: Pulse's reply report. */
router.post('/moments/:id/replies/:reply/report', contentCreationLimiter, async (req, res) => {
  try {
    await shownReplies.report(req.params.id, req.params.reply, req.user.id, req.body || {});
    res.json({ message: 'Reply reported successfully. We will review it shortly.' });
  } catch (error) {
    sendError(res, error, 'reply_report');
  }
});

/** POST /moments/:id/replies-shown — { shown }: the author's choice for this Moment. */
router.post('/moments/:id/replies-shown', async (req, res) => {
  try {
    if (typeof req.body?.shown !== 'boolean') return res.status(400).json({ error: 'Send shown: true or false.', code: 'REPLY_INVALID' });
    const row = await shownReplies.setShown(req.params.id, req.user.id, req.body.shown);
    const [moment] = await store.serializeMoments([row], req.user.id);
    return res.json({ moment });
  } catch (error) {
    return sendError(res, error, 'replies_shown');
  }
});

// ─── Pins on the photo (CONTRACT 8b) ────────────────────────────────────────

const pins = require('../services/pulse/pins');

const pinUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10, parts: 12, fieldSize: 4 * 1024, fieldNameSize: 40 },
}).single('file');

/** GET /moments/:id/pins — the pins this reader may see on the picture. */
router.get('/moments/:id/pins', async (req, res) => {
  try {
    res.json(await pins.list(req.params.id, req.user.id));
  } catch (error) {
    sendError(res, error, 'pins');
  }
});

/** POST /moments/:id/pins — a reaction (JSON), or a voice bubble or a cutout (multipart `file`), on a spot. */
router.post('/moments/:id/pins', contentCreationLimiter, (req, res, next) => pinUpload(req, res, (error) => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'This file is too large to post.', code: 'MEDIA_TOO_LARGE' });
  return res.status(400).json({ error: 'Send the pin as kind, x, y and, for a voice or a cutout, "file".', code: 'PIN_INVALID' });
}), async (req, res) => {
  try {
    res.status(201).json(await pins.create(req.params.id, req.user, req.body || {}, req.file || null));
  } catch (error) {
    sendError(res, error, 'pin_create');
  }
});

module.exports = router;
