// ============================================================
// County pages (/property-records/<state>/<county> on the web): public, read-only, the same answer for everyone.
//   GET /api/public/county-guide                   every state and county page, for the sitemap and the index page
//   GET /api/public/county-guide/:state            one state's page: its counties with a page
//   GET /api/public/county-guide/:state/:county    one county's page (services/countyGuide)
//   GET /api/public/county-guide/:state/:county/:city    one city's page (services/countyGuide/cities.js)
//   POST /api/public/county-guide/visits           a page's visit beacon: { fips } (a county's FIPS or a city's place
//                                                  GEOID), counted per page and day
//
// No session is read and nothing is written per visit. The web builds each page from these answers and keeps it a
// day, so a visitor's request never reaches here; caches in front may keep an answer an hour.
// ============================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const { clientIpKey } = require('../utils/clientIpKey');
const countyGuide = require('../services/countyGuide');
const visits = require('../services/countyGuide/visits');
const logger = require('../utils/logger');

const router = express.Router();

// The web's servers rebuild pages from here, at most once a day per page; a search engine crawling every page can
// bring a few hundred rebuilds a minute from the same servers, and a refused rebuild fails a page with no copy yet.
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `county-guide:${clientIpKey(req)}`,
  message: { error: 'Too many requests. Please try again shortly.' },
}));

const SLUG = /^[a-z0-9-]{1,80}$/;

function cached(res) {
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
}

// One visit to a county's or a city's page, from the page's own beacon: counted per page and day, nothing else kept
// (services/countyGuide/visits.js). Always 204, as the funnel's beacons are.
router.post('/visits', express.json({ limit: '1kb' }), (req, res) => {
  const fips = typeof req.body?.fips === 'string' ? req.body.fips : '';
  if (countyGuide.isPage(fips)) visits.noteVisit(fips, req.get('user-agent'));
  return res.status(204).end();
});

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

router.get('/:state/:county/:city', (req, res) => {
  const { state, county, city } = req.params;
  const answer = [state, county, city].every((slug) => SLUG.test(String(slug || ''))) ? countyGuide.cityAnswer(state, county, city) : null;
  if (!answer) return res.status(404).json({ error: 'No page for this city' });
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
    // An answer missing a part that couldn't be read just now is kept only minutes.
    if (answer.incomplete) res.set('Cache-Control', 'public, max-age=300');
    else cached(res);
    return res.json(answer);
  } catch (err) {
    logger.warn('countyGuide: answer failed', { state, county, error: err.message });
    return res.status(503).json({ error: 'This page is not available right now' });
  }
});

module.exports = router;
