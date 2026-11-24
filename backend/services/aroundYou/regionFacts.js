/**
 * A region's state and county (seeder_config.state, county_fips, county_name), filled once by the feeds job for each
 * active region that lacks them. The county comes from the lookup the Place page already uses (homeCountyFips: the
 * Census geocoder, cached), asked with the region's centre rounded to two decimals; the name and state from HUD's
 * county list (HudFmr), and the state from the county code when HUD has no row.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { homeCountyFips, hudFmrRow } = require('../placeSectionAdapters');
const { STATE_BY_FIPS } = require('../nfipPremiumService');
const { centre } = require('./feeds/place');

async function factsFor(region) {
  const point = centre(region);
  const countyFips = await homeCountyFips({ id: null, map_center_lat: point.lat, map_center_lng: point.lng });
  if (!countyFips) return null;
  const hud = await hudFmrRow(countyFips).catch(() => null);
  const state = (hud?.state_abbr || STATE_BY_FIPS[countyFips.slice(0, 2)] || '').toUpperCase() || null;
  return { state, county_fips: countyFips, county_name: hud?.county_name || null };
}

// Fills the regions that lack a county and returns them all with their facts. A region the lookup cannot place is
// tried again on the next run.
async function fillRegionFacts(regions) {
  const out = [];
  for (const region of regions) {
    if (region.county_fips) {
      out.push(region);
      continue;
    }
    try {
      const facts = await factsFor(region);
      if (!facts) {
        logger.info('Around you feeds: region not placed in a county yet', { region: region.region });
        out.push(region);
        continue;
      }
      const { error } = await supabaseAdmin.from('seeder_config').update(facts)
        .eq('region', region.region).is('county_fips', null);
      if (error) throw error;
      out.push({ ...region, ...facts });
    } catch (err) {
      logger.warn('Around you feeds: region facts failed', { region: region.region, error: err.message });
      out.push(region);
    }
  }
  return out;
}

module.exports = { fillRegionFacts };
