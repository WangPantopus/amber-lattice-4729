'use strict';

/**
 * Visits to the county and city pages, counted per page per day: the one number the funnel's beacons can't give (they start
 * at a lookup). The page sends one beacon per browser tab and county (routes/countyGuide.js POST /visits); search
 * engines' crawlers are not counted. Counts only: no address, account, IP or browser id is read or kept.
 *
 * As propertyRecords/counts.js does, each process keeps its day in memory and writes it as one row of the shared
 * PlaceSectionCache every few minutes and as it stops; report.cjs adds the rows up. Storage trouble is only logged.
 */

const os = require('os');
const logger = require('../../utils/logger');

const SECTION = '_county_page_visits';
const FLUSH_EVERY_MS = 5 * 60 * 1000;
const KEEP_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COUNTIES = 4000;

// Loaded when first needed, so the module loads without a database.
const database = () => require('../../config/supabaseAdmin');

const dayOf = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const processId = `${os.hostname()}:${process.pid}:${Date.now().toString(36)}`;
const days = new Map();
let timer = null;

const CRAWLER = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

/** Count one visit to a county's page (its FIPS) or a city's (its place GEOID), unless the visitor is a crawler. */
function noteVisit(fips, userAgent) {
  if (!/^(\d{5}|\d{7})$/.test(String(fips || '')) || CRAWLER.test(String(userAgent || ''))) return false;
  const day = dayOf();
  if (!days.has(day)) days.set(day, { counts: {}, dirty: false });
  const today = days.get(day);
  if (!today.counts[fips] && Object.keys(today.counts).length >= MAX_COUNTIES) return false;
  today.counts[fips] = (today.counts[fips] || 0) + 1;
  today.dirty = true;
  if (!timer) {
    timer = setInterval(() => flush().catch(() => {}), FLUSH_EVERY_MS);
    timer.unref();
  }
  return true;
}

/** Write each day with new counts as this process's row for that day. */
async function flush() {
  for (const [day, entry] of days) {
    if (!entry.dirty) continue;
    entry.dirty = false;
    const now = new Date();
    const { error } = await database().from('PlaceSectionCache').upsert({
      cache_key: `${day}:${processId}`,
      section_id: SECTION,
      payload: { day, counts: entry.counts },
      fetched_at: now.toISOString(),
      expires_at: new Date(now.getTime() + KEEP_DAYS * DAY_MS).toISOString(),
    }, { onConflict: 'cache_key,section_id' });
    if (error) {
      entry.dirty = true;
      logger.warn('countyGuide: visit counts not written', { error: error.message });
    }
  }
  // Days before yesterday are written and done.
  const yesterday = dayOf(new Date(Date.now() - DAY_MS));
  for (const day of [...days.keys()]) if (day < yesterday && !days.get(day).dirty) days.delete(day);
}

/** Every process's rows for the last `count` days, added up: { day: { fips: visits } }. */
async function readDays(count = 30) {
  const since = dayOf(new Date(Date.now() - count * DAY_MS));
  const { data, error } = await database().from('PlaceSectionCache')
    .select('payload').eq('section_id', SECTION).gte('cache_key', since).limit(10000);
  if (error) throw new Error(error.message);
  const total = {};
  for (const { payload } of data || []) {
    if (!payload?.day || !payload.counts) continue;
    total[payload.day] = total[payload.day] || {};
    for (const [fips, n] of Object.entries(payload.counts)) total[payload.day][fips] = (total[payload.day][fips] || 0) + Number(n || 0);
  }
  return total;
}

process.once('beforeExit', () => flush().catch(() => {}));
process.once('SIGTERM', () => flush().catch(() => {}));

module.exports = { noteVisit, flush, readDays, SECTION };
