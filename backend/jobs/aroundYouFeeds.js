/**
 * Around you, the everywhere layer (AROUNDFEEDS, November 24, 2026): every hour the worker reads public feeds that work
 * for any US address and writes what is near each active region into seeder_content_queue, the list the Around you
 * page already reads (services/aroundYouService.js): wildfires (National Interagency Fire Center), federal disaster
 * declarations for the region's county (FEMA), state road projects (the federal work zone registry) and the region's
 * calendar files (seeder_sources rows of type 'ical').
 *
 * Each country-wide or state-wide feed is read once a run for all regions. A feed that fails is skipped for this run
 * and logged by host, never with a point. A run never throws and never overlaps the next. Nothing runs while Around
 * you is off (AROUND_YOU). Earthquakes and weather alerts stay with the seeder Lambda.
 */

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { aroundYouEnabled } = require('../utils/featureFlags');
const { fillRegionFacts } = require('../services/aroundYou/regionFacts');
const { writeRows } = require('../services/aroundYou/feeds/rows');
const wildfire = require('../services/aroundYou/feeds/wildfire');
const fema = require('../services/aroundYou/feeds/fema');
const roadwork = require('../services/aroundYou/feeds/roadwork');
const ical = require('../services/aroundYou/feeds/ical');
const { writeChecked } = require('../services/aroundYou/checked');

let running = false;

function hostOf(link) {
  try { return new URL(link).host; } catch { return 'unknown'; }
}

async function activeRegions() {
  const { data, error } = await supabaseAdmin
    .from('seeder_config')
    .select('region, lat, lng, display_name, timezone, state, county_fips, county_name')
    .eq('active', true);
  if (error) throw error;
  return (data || []).filter((region) => Number.isFinite(Number(region.lat)) && Number.isFinite(Number(region.lng)));
}

async function calendarSources(regionIds) {
  if (!regionIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from('seeder_sources')
    .select('id, source_id, url, display_name, region')
    .eq('source_type', 'ical')
    .eq('active', true)
    .in('region', regionIds);
  if (error) throw error;
  return data || [];
}

async function run() {
  const stats = { regions: 0, added: 0, refreshed: 0, failed_feeds: 0 };
  const failed = (feed, err) => {
    stats.failed_feeds += 1;
    logger.warn('Around you feeds: a feed was skipped this run', { feed, error: err.message });
  };
  const regions = await fillRegionFacts(await activeRegions());
  stats.regions = regions.length;
  if (!regions.length) return stats;

  const rowsByRegion = new Map(regions.map((region) => [region.region, []]));
  const add = (region, rows) => rowsByRegion.get(region.region).push(...rows);

  // Country-wide feeds, read once.
  const [fires, declarations, registry] = await Promise.all([
    wildfire.readWildfires().catch((err) => { failed('wildfire', err); return null; }),
    fema.readDeclarations().catch((err) => { failed('fema', err); return null; }),
    roadwork.readRegistry().catch((err) => { failed('roadwork registry', err); return null; }),
  ]);
  for (const region of regions) {
    if (fires) add(region, wildfire.wildfireRows(region, fires.fires, fires.pages));
    if (declarations) add(region, fema.declarationRows(region, declarations));
  }

  // State road feeds: each feed once, for every region in its states.
  const roadStatesRead = new Set();
  if (registry) {
    const states = new Set(regions.map((region) => String(region.state || '').toUpperCase()).filter(Boolean));
    for (const entry of registry.filter((feed) => feed.states.some((state) => states.has(state)))) {
      let features;
      try {
        features = await roadwork.readFeedEvents(entry);
      } catch (err) {
        failed(`roadwork ${hostOf(entry.url)}`, err);
        continue;
      }
      entry.states.forEach((state) => roadStatesRead.add(state));
      for (const region of regions.filter((r) => entry.states.includes(String(r.state || '').toUpperCase()))) {
        add(region, roadwork.roadworkRows(region, entry, features));
      }
    }
  }

  // Calendar files, each read once.
  const sources = await calendarSources(regions.map((region) => region.region))
    .catch((err) => { failed('calendar list', err); return []; });
  const regionById = new Map(regions.map((region) => [region.region, region]));
  for (const source of sources) {
    const region = regionById.get(source.region);
    if (!region) continue;
    try {
      add(region, ical.calendarRows(region, source, await ical.readCalendar(source)));
    } catch (err) {
      failed(`calendar ${hostOf(source.url)}`, err);
    }
  }

  // What was really checked for each region, for the On watch card (services/aroundYou/checked.js).
  await writeChecked(Object.fromEntries(regions.map((region) => [region.region, {
    wildfire: Boolean(fires),
    fema: Boolean(declarations) && /^\d{5}$/.test(String(region.county_fips || '')),
    roads: roadStatesRead.has(String(region.state || '').toUpperCase()),
  }]))).catch((err) => logger.warn('Around you feeds: checks not recorded', { error: err.message }));

  for (const region of regions) {
    try {
      const { added, refreshed } = await writeRows(region.region, rowsByRegion.get(region.region));
      stats.added += added;
      stats.refreshed += refreshed;
    } catch (err) {
      logger.warn('Around you feeds: rows not written for a region', { region: region.region, error: err.message });
    }
  }
  return stats;
}

module.exports = async function aroundYouFeeds() {
  if (!aroundYouEnabled()) return { skipped: 'off' };
  if (running) return { skipped: 'running' };
  running = true;
  try {
    const stats = await run();
    logger.info('Around you feeds: run done', stats);
    return stats;
  } catch (err) {
    logger.warn('Around you feeds: run failed', { error: err.message });
    return { error: err.message };
  } finally {
    running = false;
  }
};
