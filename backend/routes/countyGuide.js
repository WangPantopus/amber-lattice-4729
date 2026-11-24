// ============================================================
// County pages (/property-records/<state>/<county> on the web): public, read-only, the same answer for everyone.
//   GET /api/public/county-guide                   every state and county page, for the sitemap and the index page
//   GET /api/public/county-guide/:state            one state's page: its counties with a page
//   GET /api/public/county-guide/:state/:county    one county's page (services/countyGuide)
//
// No session is read and nothing is written per visit. The web builds each page from these answers and keeps it a
// day, so a visitor's request never reaches here; caches in front may keep an answer an hour.
// ============================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const { clientIpKey } = require('../utils/clientIpKey');
const countyGuide = require('../services/countyGuide');
const logger = require('../utils/logger');

const router = express.Router();

// The web's servers rebuild pages from here; a crawl of every page reaches here once a day at most per page.
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `county-guide:${clientIpKey(req)}`,
  message: { error: 'Too many requests. Please try again shortly.' },
}));

const SLUG = /^[a-z0-9-]{1,80}$/;

function cached(res) {
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
}

router.get('/', (req, res) => {
  cached(res);
  res.json(countyGuide.indexAnswer());
});

router.get('/:state', (req, res) => {
  const state = String(req.params.state || '');
  const answer = SLUG.test(state) ? countyGuide.stateAnswer(state) : null;
  if (!answer) return res.status(404).json({ error: 'No page for this state' });
  cached(res);
  return res.json(answer);
});

router.get('/:state/:county', async (req, res) => {
  const state = String(req.params.state || '');
  const county = String(req.params.county || '');
  if (!SLUG.test(state) || !SLUG.test(county)) return res.status(404).json({ error: 'No page for this county' });
  try {
    const answer = await countyGuide.countyAnswer(state, county);
    if (!answer) return res.status(404).json({ error: 'No page for this county' });
    cached(res);
    return res.json(answer);
  } catch (err) {
    logger.warn('countyGuide: answer failed', { state, county, error: err.message });
    return res.status(503).json({ error: 'This page is not available right now' });
  }
});

module.exports = router;
