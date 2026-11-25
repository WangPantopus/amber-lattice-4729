// Made-up names (services/penName; contract docs/product/made-up-names/README.md): a person's own made-up name, the
// small card a made-up name opens, and muting or blocking one. Posting and replying under a made-up name are in
// routes/posts.js (`postAs: 'pen_name'`). Every route needs a signed-in person.
//
//   GET    /api/pen-names/me            your made-up name, whether you may use one, and names Pantopus could give
//   POST   /api/pen-names               take a name: { name?: string, replace?: boolean }
//   GET    /api/pen-names/suggestions   more names Pantopus could give
//   GET    /api/pen-names/check         whether a post made here may carry a made-up name (?latitude&longitude)
//   GET    /api/pen-names/me/posts      your own posts under a made-up name (only you can read this)
//   GET    /api/pen-names/hidden        the made-up names you muted or blocked
//   GET    /api/pen-names/:id           the card: name, picture, what it is, and your mute/block of it
//   POST   /api/pen-names/:id/mute      DELETE undoes
//   POST   /api/pen-names/:id/block     DELETE undoes

const express = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middleware/verifyToken');
const validate = require('../middleware/validate');
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const penName = require('../services/penName');

const router = express.Router();
router.use(verifyToken);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_NOTE = 'A made-up name. Pantopus knows who this is and holds them to the same rules as everyone.';
const PROMISE = [
  "Others see a made-up name and that you have a verified home nearby. They don't see your name, photo, profile, home or how far away you are.",
  "Pantopus knows it's you. We step in when the rules are broken, and the law can require us to say who wrote something.",
  'A photo, a detail only you would know, or the way you write can still give you away.',
];

// Taking a name asks an automatic check and writes a picture: a few tries a minute is plenty for a person.
const nameLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: (req) => `pen-name:${req.user?.id || 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tries. Wait a minute and try again.', code: 'PEN_NAME_RATE_LIMIT' },
});

function send(res, error, fallback) {
  if (error?.status && error?.code) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { error: error?.message });
  return res.status(500).json({ error: "That didn't work. Please try again." });
}

function own(pen) {
  if (!pen) return null;
  const takenAt = Date.parse(pen.taken_at || '');
  return {
    id: pen.id,
    name: pen.name,
    avatar_url: pen.avatar_url,
    taken_at: pen.taken_at || null,
    // A name nothing was written under can be changed at any time; a used one once it is this old.
    change_after: Number.isFinite(takenAt)
      ? new Date(takenAt + penName.names.MIN_DAYS_BETWEEN_NAMES * 24 * 60 * 60 * 1000).toISOString() : null,
  };
}

router.get('/me', async (req, res) => {
  try {
    const userId = req.user.id;
    const [pen, refusal] = await Promise.all([penName.names.ofOwner(userId), penName.gate.accountRefusal(userId)]);
    const used = pen ? await penName.gate.written(userId) : { post: 0, moment: 0, comment: 0 };
    res.json({
      pen_name: own(pen),
      allowed: !refusal,
      refusal: refusal ? { code: refusal.code, message: refusal.message } : null,
      limits: {
        posts_per_day: penName.gate.DAILY_LIMITS.post,
        replies_per_day: penName.gate.DAILY_LIMITS.comment,
        moments_per_day: penName.gate.DAILY_LIMITS.moment,
        posts_today: used.post,
        replies_today: used.comment,
        moments_today: used.moment,
      },
      name_rules: { min: penName.names.NAME_MIN, max: penName.names.NAME_MAX },
      post_types: [...penName.gate.POST_TYPES],
      promise: PROMISE,
      suggestions: pen || refusal ? [] : await penName.names.suggestions(4),
    });
  } catch (error) {
    send(res, error, 'Pen name read failed');
  }
});

router.get('/suggestions', async (req, res) => {
  try {
    res.json({ suggestions: await penName.names.suggestions(4) });
  } catch (error) {
    send(res, error, 'Pen name suggestions failed');
  }
});

const takeSchema = Joi.object({
  name: Joi.string().allow('', null).max(64).optional(),
  replace: Joi.boolean().default(false),
});

router.post('/', nameLimiter, validate(takeSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const refusal = await penName.gate.accountRefusal(userId);
    if (refusal) return res.status(refusal.status).json({ error: refusal.message, code: refusal.code });
    const taken = await penName.names.take({ ownerId: userId, typed: req.body.name, replace: req.body.replace === true });
    return res.status(201).json({ pen_name: own(taken) });
  } catch (error) {
    return send(res, error, 'Pen name take failed');
  }
});

router.get('/check', async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ error: 'latitude and longitude are required.', code: 'PEN_NAME_NEEDS_PLACE' });
    }
    const [refusal, crowd] = await Promise.all([
      penName.gate.accountRefusal(req.user.id),
      penName.gate.crowdAt(latitude, longitude),
    ]);
    const tooFew = crowd === 'too_few';
    return res.json({
      allowed: !refusal && !tooFew,
      refusal: refusal ? { code: refusal.code, message: refusal.message }
        : tooFew ? { code: 'PEN_NAME_TOO_FEW_NEARBY', message: "There aren't enough verified homes near here yet for a made-up name to hide you." }
          : null,
      // Shown above the Post button when few people could have written the post.
      warning: !refusal && crowd === 'few'
        ? 'Only a few verified homes are near here. Someone could guess who wrote this.' : null,
    });
  } catch (error) {
    return send(res, error, 'Pen name check failed');
  }
});

// A Moment is a post row too, and is sealed as one. It is not listed here: its owner finds it with their other Moments
// (GET /api/moments/mine), where it has its picture. A page reads on past Moments until it is full.
const OWN_POSTS_ROUNDS = 5;

router.get('/me/posts', async (req, res) => {
  try {
    const userId = req.user.id;
    const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    // eslint-disable-next-line global-require
    const feedService = require('../services/feedService');
    const found = [];
    let cursor = before;
    let more = true;
    for (let round = 0; round < OWN_POSTS_ROUNDS && more && found.length < limit; round += 1) {
      const rows = await penName.owner.owned(userId, 'post', { before: cursor, limit });
      more = rows.length === limit;
      if (!rows.length) break;
      const { data, error } = await supabaseAdmin.from('Post').select(feedService.FEED_POST_SELECT)
        .in('id', rows.map((row) => row.id)).eq('identity_context_type', penName.KIND).not('is_story', 'is', true);
      if (error) throw error;
      const byId = new Map((data || []).map((row) => [String(row.id), row]));
      for (const row of rows) {
        cursor = row.created_at;
        const post = byId.get(String(row.id));
        if (post) found.push(post);
        if (found.length === limit) {
          // Rows of this read may be left over: the next page starts after the last one taken.
          more = more || row !== rows[rows.length - 1];
          break;
        }
      }
    }
    if (!found.length) return res.json({ posts: [], next_before: more ? cursor : null });
    const posts = await feedService.enrichFeedPosts(found.map((row) => feedService.normalizeFeedPostRow(row)), userId);
    return res.json({ posts, next_before: more ? cursor : null });
  } catch (error) {
    return send(res, error, 'Own pen name posts failed');
  }
});

router.get('/hidden', async (req, res) => {
  try {
    res.json({ hidden: await penName.present.hiddenList(req.user.id) });
  } catch (error) {
    send(res, error, 'Hidden pen names failed');
  }
});

router.param('id', (req, res, next, id) => {
  if (!UUID.test(id)) return res.status(404).json({ error: "That made-up name isn't here anymore.", code: 'PEN_NAME_NOT_FOUND' });
  return next();
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pen = (await penName.names.rowsById([id])).get(id);
    if (!pen) return res.status(404).json({ error: "That made-up name isn't here anymore.", code: 'PEN_NAME_NOT_FOUND' });
    const [mine, hidden] = await Promise.all([
      penName.owner.mine(req.user.id, penName.KIND, [id]),
      penName.present.hiddenList(req.user.id),
    ]);
    const mark = hidden.filter((row) => String(row.id) === String(id));
    return res.json({
      pen_name: {
        id: pen.id,
        name: pen.display_name,
        avatar_url: pen.avatar_url || null,
        badges: ['made_up_name', 'verified_home'],
        note: CARD_NOTE,
        is_yours: mine.has(String(id)),
        muted: mark.some((row) => !row.blocked),
        blocked: mark.some((row) => row.blocked),
      },
    });
  } catch (error) {
    return send(res, error, 'Pen name card failed');
  }
});

function hideRoute(block, undo) {
  return async (req, res) => {
    try {
      if (undo) await penName.present.unhide(req.user.id, req.params.id, { block });
      else await penName.present.hide(req.user.id, req.params.id, { block });
      // eslint-disable-next-line global-require
      require('../services/feedService').invalidateFilterCache(req.user.id);
      return res.json({ success: true });
    } catch (error) {
      return send(res, error, 'Pen name mute or block failed');
    }
  };
}

router.post('/:id/mute', hideRoute(false, false));
router.delete('/:id/mute', hideRoute(false, true));
router.post('/:id/block', hideRoute(true, false));
router.delete('/:id/block', hideRoute(true, true));

module.exports = router;
