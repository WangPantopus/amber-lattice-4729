/**
 * The profile page (~/pantopus-profile-sources/CONTRACT.md, frozen v1). Every route answers 404 PROFILE_SOURCES_OFF
 * while the backend switch PROFILE_SOURCES is off (utils/featureFlags.js), so the apps keep today's screens.
 *
 *   GET /api/profile-page/me/share               the owner's parts and what a visitor sees
 *   PUT /api/profile-page/me/share               save the parts of the main link
 *   GET /api/profile-page/id/:id                 the page, by account id
 *   GET /api/profile-page/:username              the page, by the name in the person's link
 *   GET …/piece/:pieceId, …/month/:month         one piece, one month, under the same viewer rules
 *   GET /api/profile-page/marks?ids=…            the ring an avatar wears, for up to 100 people
 */

const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const optionalAuth = require('../middleware/optionalAuth');
const logger = require('../utils/logger');
const { profileSourcesEnabled } = require('../utils/featureFlags');
const profilePage = require('../services/profilePage');

const router = express.Router();

router.use((req, res, next) => {
  if (profileSourcesEnabled()) return next();
  return res.status(404).json({ error: 'Not found', code: 'PROFILE_SOURCES_OFF' });
});

function handle(label, run) {
  return async (req, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      return res.json(await run(req));
    } catch (err) {
      if (err instanceof profilePage.PageRefusal) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      logger.error('Profile page read failed', { route: label, error: err.message, errorCode: err.code || null });
      return res.status(503).json({ error: 'This profile can\'t be loaded right now. Please try again.', code: 'PROFILE_UNAVAILABLE' });
    }
  };
}

// The owner's own share settings (before /:username, so "me" is never read as a username).
router.get('/me/share', verifyToken, handle('share', (req) => profilePage.shareBody(req)));
router.put('/me/share', verifyToken, handle('share-save', (req) => profilePage.putShare(req)));

// By account id.
router.get('/id/:id', optionalAuth, handle('page-id', (req) => profilePage.getPage(req, { id: req.params.id })));
router.get('/id/:id/piece/:pieceId', optionalAuth,
  handle('piece-id', (req) => profilePage.getPiece(req, { id: req.params.id }, req.params.pieceId)));
router.get('/id/:id/month/:month', optionalAuth,
  handle('month-id', (req) => profilePage.getMonth(req, { id: req.params.id }, req.params.month)));

// The ring an avatar wears, for up to 100 people (CONTRACT section 7).
router.get('/marks', verifyToken, handle('marks', (req) => {
  const { marksFor, parseIds, MAX_IDS } = require('../services/profilePage/marks');
  const ids = parseIds(req.query.ids);
  if (!ids) throw new profilePage.PageRefusal(400, 'MARKS_INVALID', `Send ids as a list of at most ${MAX_IDS} account ids.`);
  return marksFor(String(req.user.id), ids);
}));

// "me", "id" and "marks" are never usernames here.
const RESERVED = new Set(['me', 'id', 'marks']);
function byUsername(req) {
  if (RESERVED.has(String(req.params.username).toLowerCase())) {
    throw new profilePage.PageRefusal(404, 'PROFILE_NOT_FOUND', 'This profile isn\'t here.');
  }
  return { username: req.params.username };
}

router.get('/:username', optionalAuth, handle('page', (req) => profilePage.getPage(req, byUsername(req))));
router.get('/:username/piece/:pieceId', optionalAuth,
  handle('piece', (req) => profilePage.getPiece(req, byUsername(req), req.params.pieceId)));
router.get('/:username/month/:month', optionalAuth,
  handle('month', (req) => profilePage.getMonth(req, byUsername(req), req.params.month)));

module.exports = router;
