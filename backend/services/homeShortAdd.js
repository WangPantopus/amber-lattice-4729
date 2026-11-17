'use strict';

// Add Home in two steps (FASTVERIFY, behind home_short_add, off by default). The short form sends no home type and
// no details; POST /api/homes already takes them as optional. Once the Home is created (creation never waits on
// this), its type, bedrooms, bathrooms, size, lot and year built are filled from the county record the way Add
// Home's Details step prefill finds it (services/ai/propertySuggestionsService.js): the county's own record, a stored
// vendor copy, or the building's floor-plan sheet. Guesses (heuristics, a model) never fill. Only the fields the
// request left out are filled, and only while they are still empty, so nothing the household entered is replaced.

const db = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const featureFlagService = require('./featureFlagService');

const FLAG = 'home_short_add';
// Request field → Home column. square_feet is the older name for sq_ft.
const FIELDS = Object.freeze([
  ['home_type', 'home_type'], ['bedrooms', 'bedrooms'], ['bathrooms', 'bathrooms'], ['sq_ft', 'sq_ft'],
  ['lot_sq_ft', 'lot_sq_ft'], ['year_built', 'year_built'],
]);
const RECORD_SOURCES = new Set(['record', 'attom', 'floor_plan']);

/** Which columns the request left out (home_type, bedrooms, ...). */
function omitted(body) {
  return FIELDS.filter(([field, column]) => {
    if (column === 'sq_ft') return body?.sq_ft == null && body?.square_feet == null;
    return body?.[field] == null;
  }).map(([, column]) => column);
}

/** Fill a just-created Home's left-out columns from its county record. Never throws; returns the columns written. */
async function fillFromRecord({ homeId, body, user }) {
  try {
    const missing = omitted(body);
    // The short form leaves out the home type; a full form that sends it keeps today's behavior.
    if (!missing.includes('home_type')) return [];
    if (!(await featureFlagService.isFeatureEnabled(FLAG, user).catch(() => false))) return [];
    const { data: home, error } = await db.from('Home')
      .select('id, address, address2, address_id, city, state, zipcode, home_type, bedrooms, bathrooms, sq_ft, lot_sq_ft, year_built')
      .eq('id', homeId).maybeSingle();
    if (error || !home) return [];
    // eslint-disable-next-line global-require
    const { getPropertySuggestions } = require('./ai/propertySuggestionsService');
    const found = await getPropertySuggestions({
      address: home.address, unit_number: home.address2 || undefined, city: home.city, state: home.state,
      zip_code: home.zipcode, address_id: home.address_id || undefined,
    }, db, { lookup: 'wait' });
    const patch = {};
    for (const column of missing) {
      const value = found?.suggestions?.[column];
      if (value == null || !RECORD_SOURCES.has(found?.field_sources?.[column])) continue;
      // Created with the default type 'house'; every other column was left empty.
      if (column === 'home_type' ? home.home_type !== 'house' : home[column] != null) continue;
      patch[column] = value;
    }
    if (!Object.keys(patch).length) {
      logger.info('home_short_add.no_record_facts', { home_id: homeId });
      return [];
    }
    let update = db.from('Home').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', homeId);
    for (const column of Object.keys(patch)) {
      update = column === 'home_type' ? update.eq('home_type', 'house') : update.is(column, null);
    }
    const { error: updateError } = await update;
    if (updateError) throw updateError;
    logger.info('home_short_add.filled', { home_id: homeId, columns: Object.keys(patch) });
    return Object.keys(patch);
  } catch (error) {
    logger.warn('home_short_add.fill_failed', { home_id: homeId, error: error.message });
    return [];
  }
}

module.exports = { FLAG, fillFromRecord, omitted };
