/**
 * Admin: sources for a new county (Around you everywhere layer, piece 4). The review page /app/admin/sources.
 *
 * Mounted at /api/admin/around-sources. Platform admins only. Every route answers 404 AROUND_YOU_OFF while Around you
 * is off. Nothing the finder proposes is read by the fetcher or the feeds job until it is approved here: approval
 * makes the row active, with the outlet's access (free / subscription) and, for a weekly, how long its stories stay.
 *
 *   GET  /                          regions with their sources, the finder's numbers and each region's last run
 *   POST /regions/:region/find      runs the finder for one region in the background ("Find sources")
 *   POST /regions/:region/sources   tests one address a reviewer typed and proposes it by hand
 *   POST /sources/:id/approve       { access, keep_hours, display_name }
 *   POST /sources/:id/reject
 */

const express = require('express');
const Joi = require('joi');
const verifyToken = require('../middleware/verifyToken');
const { requireAdmin } = require('../middleware/verifyToken');
const validate = require('../middleware/validate');
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { aroundYouEnabled, aroundYouSourceFinderEnabled } = require('../utils/featureFlags');
const finder = require('../services/aroundYou/sourceFinder');
const { TOPIC_IDS } = require('../services/aroundYou/topics');

const router = express.Router();

router.use(verifyToken, requireAdmin);
router.use((req, res, next) => {
  if (!aroundYouEnabled()) return res.status(404).json({ error: 'AROUND_YOU_OFF' });
  return next();
});

const FEED_TYPES = ['rss', 'ical'];

function noteOf(row) {
  return finder.parsedNote(row);
}

// A source as the page shows it. `access` and `keep_hours` are piece 2's columns; null where they are not there yet.
function sourceView(row) {
  return {
    id: row.id,
    source_id: row.source_id,
    source_type: row.source_type,
    url: row.url,
    display_name: row.display_name,
    category: row.category,
    active: row.active,
    review_state: row.review_state || null,
    proposed_by: row.proposed_by || null,
    access: row.access ?? null,
    keep_hours: row.keep_hours ?? null,
    // What the source is about, when it is about one thing (services/aroundYou/topics.js); null: general news.
    topic: row.topic ?? null,
    note: noteOf(row),
  };
}

function runView(run) {
  if (!run) return null;
  const summary = run.summary;
  return {
    state: run.state,
    trigger: run.trigger,
    started_at: run.started_at,
    finished_at: run.finished_at,
    error: run.error || null,
    summary: summary ? {
      claude: summary.claude,
      proposed: summary.proposed,
      noted: summary.noted,
      known: summary.known,
      dropped: summary.dropped,
      ms: summary.ms,
      retry: Boolean(summary.retry),
    } : null,
  };
}

const ORDER = { proposed: 0, approved: 2, rejected: 3 };
function sourceOrder(a, b) {
  const rank = (row) => (row.proposed_by ? ORDER[row.review_state] ?? 1 : 1);
  return rank(a) - rank(b) || String(a.display_name).localeCompare(String(b.display_name));
}

// ── GET / ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [regions, sources] = await Promise.all([
      supabaseAdmin.from('seeder_config')
        .select('region, display_name, state, county_name, provisioned_by, sources_checked_at, active, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('seeder_sources').select('*').in('source_type', FEED_TYPES).limit(5000),
    ]);
    if (regions.error) throw regions.error;
    if (sources.error) throw sources.error;
    const byRegion = new Map();
    for (const row of sources.data || []) {
      if (!byRegion.has(row.region)) byRegion.set(row.region, []);
      byRegion.get(row.region).push(row);
    }
    return res.json({
      finder_on: aroundYouSourceFinderEnabled(),
      kinds: Object.entries(finder.KINDS).map(([id, kind]) => ({ id, label: kind.label })),
      regions: (regions.data || []).map((region) => ({
        region: region.region,
        display_name: region.display_name,
        state: region.state ?? null,
        county_name: region.county_name ?? null,
        provisioned_by: region.provisioned_by,
        sources_checked_at: region.sources_checked_at ?? null,
        run: runView(finder.lastRun(region.region)),
        sources: (byRegion.get(region.region) || []).sort(sourceOrder).map(sourceView),
      })),
    });
  } catch (err) {
    logger.error('adminAroundSources.list error', { error: err.message });
    return res.status(500).json({ error: 'Failed to load sources' });
  }
});

// ── POST /regions/:region/find ────────────────────────────────
router.post('/regions/:region/find', async (req, res) => {
  try {
    const { region } = req.params;
    const { data, error } = await supabaseAdmin.from('seeder_config').select('region').eq('region', region).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No such region' });
    const started = finder.startRun(region, 'button');
    if (!started) return res.status(409).json({ error: 'A run for this region is already going, or two runs are' });
    return res.status(202).json({ started: true, finder_on: aroundYouSourceFinderEnabled(), run: runView(finder.lastRun(region)) });
  } catch (err) {
    logger.error('adminAroundSources.find error', { error: err.message });
    return res.status(500).json({ error: 'Failed to start the finder' });
  }
});

// ── POST /regions/:region/sources ─────────────────────────────
const handSchema = Joi.object({
  kind: Joi.string().valid(...Object.keys(finder.KINDS).filter((kind) => kind !== 'state_outlet')).required(),
  name: Joi.string().trim().min(2).max(80).required(),
  url: Joi.string().trim().max(2048).required(),
});

router.post('/regions/:region/sources', validate(handSchema), async (req, res) => {
  try {
    const answer = await finder.addByHand(req.params.region, req.body);
    return res.json(answer);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('adminAroundSources.add error', { error: err.message });
    return res.status(500).json({ error: 'Failed to add the source' });
  }
});

async function reviewedRow(id) {
  const { data, error } = await supabaseAdmin.from('seeder_sources').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// ── POST /sources/:id/approve ─────────────────────────────────
const approveSchema = Joi.object({
  access: Joi.string().valid('free', 'subscription').required(),
  keep_hours: Joi.number().integer().min(1).max(720).allow(null).default(null),
  display_name: Joi.string().trim().min(2).max(80).allow(null, ''),
  // A source about one thing (a paper's sports feed, a school district's news): its stories carry the topic and stay
  // off the first page's Headlines. Null: general news.
  topic: Joi.string().valid(...TOPIC_IDS).allow(null).default(null),
});

router.post('/sources/:id/approve', validate(approveSchema), async (req, res) => {
  try {
    const row = await reviewedRow(req.params.id);
    if (!row || !row.proposed_by) return res.status(404).json({ error: 'No such proposal' });
    const note = noteOf(row) || {};
    // Only an address the server's own check read can start being read.
    if (note.status !== 'proposed') {
      return res.status(409).json({ error: 'This address did not pass the check; add it again by hand once it reads' });
    }
    const update = {
      active: true,
      review_state: 'approved',
      check_note: JSON.stringify({ ...note, reviewed_at: new Date().toISOString() }),
      ...(req.body.display_name ? { display_name: req.body.display_name } : {}),
    };
    // Piece 2's columns, where they are there.
    if ('access' in row) update.access = req.body.access;
    if ('keep_hours' in row) update.keep_hours = req.body.keep_hours;
    if ('topic' in row) update.topic = req.body.topic;
    const { data, error } = await supabaseAdmin.from('seeder_sources').update(update).eq('id', row.id).select('*').single();
    if (error) throw error;
    logger.info('Around you source approved', { region: row.region, source: row.source_id, reviewer: req.user.id });
    return res.json({ source: sourceView(data) });
  } catch (err) {
    logger.error('adminAroundSources.approve error', { error: err.message });
    return res.status(500).json({ error: 'Failed to approve the source' });
  }
});

// ── POST /sources/:id/reject ──────────────────────────────────
router.post('/sources/:id/reject', async (req, res) => {
  try {
    const row = await reviewedRow(req.params.id);
    if (!row || !row.proposed_by) return res.status(404).json({ error: 'No such proposal' });
    const note = noteOf(row) || {};
    const { data, error } = await supabaseAdmin.from('seeder_sources').update({
      active: false,
      review_state: 'rejected',
      check_note: JSON.stringify({ ...note, reviewed_at: new Date().toISOString() }),
    }).eq('id', row.id).select('*').single();
    if (error) throw error;
    logger.info('Around you source rejected', { region: row.region, source: row.source_id, reviewer: req.user.id });
    return res.json({ source: sourceView(data) });
  } catch (err) {
    logger.error('adminAroundSources.reject error', { error: err.message });
    return res.status(500).json({ error: 'Failed to reject the source' });
  }
});

module.exports = router;
