/**
 * The profile page (~/pantopus-profile-sources/CONTRACT.md, frozen v1). On: built and merged means available (SPEC rule
 * 4.12). Only after an emergency off (PROFILE_SOURCES=0) does every route answer 404 PROFILE_SOURCES_OFF, and the apps
 * keep today's screens; PROFILE_LINKS=0 and PROFILE_TIES=0 do the same for their own routes.
 *
 *   GET /api/profile-page/me/share               the owner's parts and what a visitor sees
 *   PUT /api/profile-page/me/share               save the parts of the main link
 *   GET /api/profile-page/id/:id                 the page, by account id
 *   GET /api/profile-page/:username              the page, by the name in the person's link
 *   GET …/piece/:pieceId, …/month/:month         one piece, one month, under the same viewer rules
 *   GET /api/profile-page/marks?ids=…            the ring an avatar wears, for up to 100 people
 *   POST | PATCH | DELETE /api/profile-page/me/links[/:id]   links for one purpose (on; PROFILE_LINKS=0 turns them off)
 *   GET /api/profile-page/:username/v/:key[/piece/:id | /month/:m]   a link for one purpose, opened by its key
 *   POST | DELETE …/me/pieces/:id/credits[/:creditId], GET /me/asks, POST /me/asks/:id/sign | decline,
 *   PATCH | DELETE /me/ties/:id                 credits and signing (CONTRACT P2.5; PROFILE_TIES=0 turns them off)
 *   POST | PATCH | DELETE /me/roles[/:id], GET …/circle[/:userId]   roles, schools and the circle (P2.6; PROFILE_TIES=0 too)
 */

const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const optionalAuth = require('../middleware/optionalAuth');
const { previewLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');
const { profileSourcesEnabled, profileLinksEnabled, profileTiesEnabled, profileKnownForEnabled, profileDoorsEnabled } = require('../utils/featureFlags');
const profilePage = require('../services/profilePage');
const pieces = require('../services/profilePage/pieces');
const ties = require('../services/profilePage/ties');
const shelf = require('../services/profilePage/shelf');
const knownFor = require('../services/profilePage/knownFor');
const doorsService = require('../services/profilePage/doors');

const router = express.Router();

router.use((req, res, next) => {
  if (profileSourcesEnabled()) return next();
  return res.status(404).json({ error: 'Not found', code: 'PROFILE_SOURCES_OFF' });
});

function handle(label, run, status = 200) {
  return async (req, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      return res.status(status).json(await run(req));
    } catch (err) {
      if (err instanceof profilePage.PageRefusal || err instanceof profilePage.LinkRefusal || err instanceof pieces.PieceRefusal
        || err instanceof ties.TieRefusal || err instanceof shelf.ShelfRefusal || err instanceof knownFor.KnownForRefusal
        || err instanceof doorsService.DoorsRefusal) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      logger.error('Profile page read failed', { route: label, error: err.message, errorCode: err.code || null });
      return res.status(503).json({ error: 'This profile can\'t be loaded right now. Please try again.', code: 'PROFILE_UNAVAILABLE' });
    }
  };
}

// Signed-out reads (the page is listed by search engines) share the public previews' budget: 60 a minute per visitor
// (middleware/rateLimiter.js previewLimiter; the web's server forwards the visitor's address with EDGE_PROXY_SECRET).
const publicRead = [optionalAuth, (req, res, next) => (req.user ? next() : previewLimiter(req, res, next))];

// The owner's own share settings (before /:username, so "me" is never read as a username).
router.get('/me/share', verifyToken, handle('share', (req) => profilePage.shareBody(req)));
router.put('/me/share', verifyToken, handle('share-save', (req) => profilePage.putShare(req)));

// The owner's pieces (CONTRACT "Phase 2: Work", P2.3).
router.put('/me/work', verifyToken, handle('work-save', (req) => pieces.saveWork(String(req.user.id), req.body)));
// The shelf (CONTRACT P3.1).
router.get('/me/shelf', verifyToken, handle('shelf', (req) => shelf.getShelf(String(req.user.id))));
router.put('/me/shelf', verifyToken, handle('shelf-save', (req) => shelf.putShelf(String(req.user.id), req.body)));
router.get('/me/pieces', verifyToken, handle('pieces', (req) => pieces.listMine(String(req.user.id))));
router.post('/me/pieces/preview', verifyToken, handle('piece-preview', (req) => pieces.previewPiece(String(req.user.id), req.body)));
router.post('/me/pieces', verifyToken, handle('piece-make', (req) => pieces.createPiece(String(req.user.id), req.body), 201));
router.patch('/me/pieces/:id', verifyToken, handle('piece-change', (req) => pieces.updatePiece(String(req.user.id), req.params.id, req.body)));
// Proof and check share the link preview route's budget (linkPreview.js previewLimiter).
const linkBudget = (req, res, next) => require('./linkPreview').linkCards.previewLimiter(req, res, next);
router.post('/me/pieces/:id/links/:linkId/proof', verifyToken, linkBudget,
  handle('link-proof', (req) => pieces.proofLine(String(req.user.id), req.params.id, req.params.linkId)));
router.post('/me/pieces/:id/links/:linkId/check', verifyToken, linkBudget,
  handle('link-check', (req) => pieces.checkProof(String(req.user.id), req.params.id, req.params.linkId)));
router.delete('/me/pieces/:id', verifyToken, handle('piece-delete', (req) => pieces.deletePiece(String(req.user.id), req.params.id)));

// Credits, signing and "Asked of you" (CONTRACT P2.5): on; PROFILE_TIES=0 is their emergency off.
function tiesOn(req, res, next) {
  if (profileTiesEnabled()) return next();
  return res.status(404).json({ error: 'Not found', code: 'PROFILE_TIES_OFF' });
}
router.post('/me/pieces/:id/credits', verifyToken, tiesOn,
  handle('credit-add', (req) => ties.addCredit(String(req.user.id), req.params.id, req.body), 201));
router.delete('/me/pieces/:id/credits/:creditId', verifyToken, tiesOn,
  handle('credit-remove', (req) => ties.removeCredit(String(req.user.id), req.params.id, req.params.creditId)));
router.get('/me/asks', verifyToken, tiesOn, handle('asks', (req) => ties.listAsks(String(req.user.id))));
router.post('/me/asks/:id/sign', verifyToken, tiesOn, handle('ask-sign', (req) => ties.signAsk(String(req.user.id), req.params.id, req.body)));
router.post('/me/asks/:id/decline', verifyToken, tiesOn, handle('ask-decline', (req) => ties.declineAsk(String(req.user.id), req.params.id)));
router.patch('/me/ties/:id', verifyToken, tiesOn, handle('tie-change', (req) => ties.changeTie(String(req.user.id), req.params.id, req.body)));
router.delete('/me/ties/:id', verifyToken, tiesOn, handle('tie-remove', (req) => ties.removeTie(String(req.user.id), req.params.id)));
// Known for (CONTRACT P3.2): on; PROFILE_KNOWN_FOR=0 is its emergency off.
function knownForOn(req, res, next) {
  if (profileKnownForEnabled()) return next();
  return res.status(404).json({ error: 'Not found', code: 'PROFILE_KNOWN_FOR_OFF' });
}
router.get('/me/known-for', verifyToken, knownForOn, handle('known-for-mine', (req) => knownFor.listMine(String(req.user.id))));
router.post('/me/known-for/:id/show', verifyToken, knownForOn,
  handle('known-for-show', (req) => knownFor.setStatus(String(req.user.id), req.params.id, 'signed')));
router.post('/me/known-for/:id/hide', verifyToken, knownForOn,
  handle('known-for-hide', (req) => knownFor.setStatus(String(req.user.id), req.params.id, 'declined')));
router.put('/me/known-for/on-top', verifyToken, knownForOn, handle('known-for-top', (req) => knownFor.setOnTop(String(req.user.id), req.body)));
router.delete('/me/lines-written/:id', verifyToken, knownForOn, handle('known-for-take-back', (req) => knownFor.takeBack(String(req.user.id), req.params.id)));
// Doors and Leave your card (CONTRACT P3.3), behind their own switch PROFILE_DOORS.
function doorsOn(req, res, next) {
  if (profileDoorsEnabled()) return next();
  return res.status(404).json({ error: 'Not found', code: 'PROFILE_DOORS_OFF' });
}
router.get('/me/doors', verifyToken, doorsOn, handle('doors', (req) => doorsService.getDoors(String(req.user.id))));
router.put('/me/doors', verifyToken, doorsOn, handle('doors-save', (req) => doorsService.putDoors(String(req.user.id), req.body)));
router.get('/me/cards', verifyToken, doorsOn, handle('cards', (req) => doorsService.listCards(String(req.user.id))));
router.post('/me/cards/:id/write-back', verifyToken, doorsOn, handle('card-write-back', (req) => doorsService.writeBack(String(req.user.id), req.params.id)));
router.delete('/me/cards/:id', verifyToken, doorsOn, handle('card-remove', (req) => doorsService.removeCard(String(req.user.id), req.params.id)));
router.post('/me/roles', verifyToken, tiesOn, handle('role-add', (req) => ties.addRole(String(req.user.id), req.body), 201));
router.patch('/me/roles/:id', verifyToken, tiesOn, handle('role-change', (req) => ties.updateRole(String(req.user.id), req.params.id, req.body)));
router.delete('/me/roles/:id', verifyToken, tiesOn, handle('role-remove', (req) => ties.removeRole(String(req.user.id), req.params.id)));

// Links for one purpose (CONTRACT Changes v1.3): on; PROFILE_LINKS=0 is their emergency off.
function linksOn(req, res, next) {
  if (profileLinksEnabled()) return next();
  return res.status(404).json({ error: 'Not found', code: 'PROFILE_LINKS_OFF' });
}
router.post('/me/links', verifyToken, linksOn, handle('link-make', (req) => profilePage.makeLink(req), 201));
router.patch('/me/links/:id', verifyToken, linksOn, handle('link-change', (req) => profilePage.changeLink(req)));
router.delete('/me/links/:id', verifyToken, linksOn, handle('link-delete', (req) => profilePage.removeLink(req)));

// By account id.
router.get('/id/:id', publicRead, handle('page-id', (req) => profilePage.getPage(req, { id: req.params.id })));
router.get('/id/:id/piece/:pieceId', publicRead,
  handle('piece-id', (req) => profilePage.getPiece(req, { id: req.params.id }, req.params.pieceId)));
router.get('/id/:id/month/:month', publicRead,
  handle('month-id', (req) => profilePage.getMonth(req, { id: req.params.id }, req.params.month)));
router.get('/id/:id/known-for', publicRead, knownForOn, handle('known-for-id', (req) => profilePage.getKnownFor(req, { id: req.params.id })));
router.get('/id/:id/circle', publicRead, tiesOn, handle('circle-id', (req) => profilePage.getCircle(req, { id: req.params.id })));
router.get('/id/:id/circle/:userId', publicRead, tiesOn,
  handle('circle-pieces-id', (req) => profilePage.getCircle(req, { id: req.params.id }, req.params.userId)));

// The ring an avatar wears, for up to 100 people (CONTRACT section 7).
router.get('/marks', verifyToken, handle('marks', (req) => {
  const { marksFor, parseIds, MAX_IDS } = require('../services/profilePage/marks');
  const ids = parseIds(req.query.ids);
  if (!ids) throw new profilePage.PageRefusal(400, 'MARKS_INVALID', `Send ids as a list of at most ${MAX_IDS} account or Local Profile ids.`);
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

router.get('/:username', publicRead, handle('page', (req) => profilePage.getPage(req, byUsername(req))));
// A link for one purpose, opened by its key (never needs sign-in; app.js keeps the key out of the request log).
router.get('/:username/v/:key', publicRead, linksOn,
  handle('link-open', (req) => profilePage.openByKey(req, req.params.username, req.params.key)));
router.get('/:username/v/:key/piece/:pieceId', publicRead, linksOn,
  handle('link-piece', (req) => profilePage.openByKey(req, req.params.username, req.params.key, 'piece', req.params.pieceId)));
router.get('/:username/v/:key/month/:month', publicRead, linksOn,
  handle('link-month', (req) => profilePage.openByKey(req, req.params.username, req.params.key, 'month', req.params.month)));
router.get('/:username/v/:key/known-for', publicRead, linksOn, knownForOn,
  handle('link-known-for', (req) => profilePage.openByKey(req, req.params.username, req.params.key, 'known_for', null)));
router.get('/:username/v/:key/circle', publicRead, linksOn, tiesOn,
  handle('link-circle', (req) => profilePage.openByKey(req, req.params.username, req.params.key, 'circle', null)));
router.get('/:username/v/:key/circle/:userId', publicRead, linksOn, tiesOn,
  handle('link-circle-pieces', (req) => profilePage.openByKey(req, req.params.username, req.params.key, 'circle', req.params.userId)));
router.get('/:username/piece/:pieceId', publicRead,
  handle('piece', (req) => profilePage.getPiece(req, byUsername(req), req.params.pieceId)));
router.get('/:username/month/:month', publicRead,
  handle('month', (req) => profilePage.getMonth(req, byUsername(req), req.params.month)));
router.get('/:username/known-for', publicRead, knownForOn, handle('known-for', (req) => profilePage.getKnownFor(req, byUsername(req))));
router.get('/:username/known-for/write', verifyToken, knownForOn, handle('known-for-sheet', async (req) => {
  return knownFor.writeSheet(String(req.user.id), await profilePage.personIdFor(byUsername(req)));
}));
router.post('/:username/known-for', verifyToken, knownForOn, handle('known-for-write', async (req) => {
  return knownFor.writeLine(String(req.user.id), await profilePage.personIdFor(byUsername(req)), req.body);
}, 201));
router.post('/:username/card', verifyToken, doorsOn, handle('card-leave', async (req) => {
  return doorsService.leaveCard(String(req.user.id), await profilePage.personIdFor(byUsername(req)), req.body);
}, 201));
router.get('/:username/circle', publicRead, tiesOn, handle('circle', (req) => profilePage.getCircle(req, byUsername(req))));
router.get('/:username/circle/:userId', publicRead, tiesOn,
  handle('circle-pieces', (req) => profilePage.getCircle(req, byUsername(req), req.params.userId)));

module.exports = router;
