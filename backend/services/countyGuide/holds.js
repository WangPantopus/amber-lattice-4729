'use strict';

/**
 * What Pantopus holds for a county: only where its records are live (the switch file, through
 * propertyRecords/router.js), the office whose file it is, the file's date, and how many records it carries,
 * rounded down. Read from the state file the index already serves; never an address, a city, a ZIP or any count
 * below the county.
 */

const logger = require('../../utils/logger');
const router = require('../propertyRecords/router');
const reader = require('../propertyRecords/reader');
const { municipalRelease } = require('../propertyRecords/format');

/** Rounded down, so the page never says more than the file holds: 188,103 → 188,000. */
function roundedDown(count) {
  if (!Number.isFinite(count) || count < 100) return null;
  const step = count >= 10000 ? 1000 : 100;
  return Math.floor(count / step) * step;
}

/** { publisher, dataset, as_of, records } for a live county, or null. */
async function holdsFor(county) {
  if (!router.serves(county.fips)) return null;
  try {
    const file = await reader.stateFile(county.state.abbr);
    let entry = file?.jurisdictions?.[county.fips];
    const municipality = router.municipalityFor(county.fips);
    if (entry && municipality) entry = municipalRelease(entry, municipality);
    if (!entry || typeof entry.publisher !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.as_of || '')) return null;
    return {
      publisher: entry.publisher,
      dataset: typeof entry.dataset === 'string' ? entry.dataset : null,
      as_of: entry.as_of,
      records: roundedDown(Number(entry.records)),
      ...(municipality ? { municipal: true } : {}),
    };
  } catch (err) {
    logger.warn('countyGuide: holdings unavailable', { fips: county.fips, error: err.name });
    return null;
  }
}

/** Whether a county's records are live, for the pages' first batch. */
const isLive = (fips) => router.serves(fips);

module.exports = { holdsFor, isLive, roundedDown };
