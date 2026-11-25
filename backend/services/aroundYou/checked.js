/**
 * What the feeds job really checked for each region on its last run, so the On watch card lists only that: whether the
 * wildfire list, the federal notices for the region's county and a road feed for its state were read. Kept as one row
 * in the existing section cache (placeSectionCache, no new table), written by jobs/aroundYouFeeds.js after each run and
 * read with each page build. Older than 6 hours, it no longer counts (the job runs hourly).
 */

const { readRow, writeRow } = require('../placeSectionCache');

const CACHE_KEY = 'around-you:checked';
const SECTION_ID = '_around_you_checked';
const TTL_MS = 6 * 3_600_000;

// regions: { [region id]: { wildfire, fema, roads } }
async function writeChecked(regions) {
  const at = new Date().toISOString();
  await writeRow(CACHE_KEY, SECTION_ID, { at, regions }, TTL_MS, at);
}

async function readChecked() {
  try {
    const row = await readRow(CACHE_KEY, SECTION_ID);
    if (!row?.payload || Date.parse(row.expires_at) < Date.now()) return null;
    return row.payload;
  } catch {
    return null;
  }
}

module.exports = { readChecked, writeChecked };
