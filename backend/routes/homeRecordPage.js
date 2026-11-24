// ============================================================
// GET /api/homes/:id/record — "Your home's record" (services/homeRecord, ~/pantopus-home-record/SPEC.md)
//
// Signed in. The viewer's standing on the Home picks the state: `owner` for its confirmed owner, `member` for anyone
// else the Home's Place lets in (its household, a private setup, an open claim), with the promise's button set to
// their own next step. Anyone else gets a 404 that says nothing about the Home. Mounted at /api/homes before the
// generic home router, like the other Home pages.
// ============================================================

const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const homeRecordService = require('../services/homeRecord');
const logger = require('../utils/logger');
const { fetchFloodCached } = require('./public');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:id/record', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const { id } = req.params;
  if (!UUID.test(id)) return res.status(404).json({ error: 'Home not found.', code: 'HOME_NOT_FOUND' });
  try {
    return res.json(await homeRecordService.forHome({ homeId: id, userId: req.user.id, flood: fetchFloodCached }));
  } catch (err) {
    const status = err.status || err.statusCode;
    if (status && status < 500) return res.status(status === 403 ? 404 : status).json({ error: status === 403 ? 'Home not found.' : err.message, code: status === 403 ? 'HOME_NOT_FOUND' : err.code });
    logger.error('homeRecord: read failed', { homeId: id, error: err.message });
    return res.status(503).json({ error: 'Could not load this home’s record. Please try again.', code: 'HOME_RECORD_UNAVAILABLE' });
  }
});

module.exports = router;
