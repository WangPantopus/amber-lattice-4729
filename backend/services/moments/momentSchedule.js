// "Share later" for Moments (the Sky, phase A; behind the `sky_places` flag): a Moment is made, uploaded and checked
// at once, then held until a time its author picks (in 1 hour, in 3 hours, or tonight at 8), so nobody learns where
// they are while they are still there. Until then only its author sees it ('scheduled'); at its time it goes live, its
// hours count from then and the push to connections goes out. The Moment keeps the time in
// post_metadata.moment.share_at, and every read works out from it whether the time has come (momentStore.momentState),
// so it goes live on time even with the scheduled jobs off; only the push needs the tick (jobs/momentsShareLater.js).

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { timezoneFromCoordinates, resolveHomeTimezone, validTimezone } = require('../../utils/timezone');

const HOUR_MS = 60 * 60 * 1000;
// "Tonight" shares at 8 pm in the author's time zone, and is offered only before 7 pm there.
const TONIGHT_HOUR = 20;
const TONIGHT_LAST_HOUR = 19;
// Where neither the Moment's point nor a home says which zone the author is in (the pilot is in the Pacific zone).
const FALLBACK_ZONE = 'America/Los_Angeles';
const KEYS = ['1h', '3h', 'tonight'];

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * The author's time zone for "tonight": the Moment's own point's, else the zone of a home they live at, else the
 * pilot's. Never throws.
 */
async function zoneFor(userId, latitude, longitude) {
  if (latitude != null && longitude != null) return timezoneFromCoordinates(latitude, longitude, FALLBACK_ZONE);
  try {
    const { householdHomeIds } = require('../../utils/homeMailAccess');
    const homeIds = await householdHomeIds(userId);
    if (homeIds.length) {
      const { data } = await supabaseAdmin.from('Home').select('id, location, map_center_lat, map_center_lng')
        .in('id', homeIds).limit(5);
      const zone = (data || []).map((home) => resolveHomeTimezone(home, null)).find(validTimezone);
      if (zone) return zone;
    }
  } catch (error) {
    logger.warn('moments.share_later_zone_failed', { error: error.message });
  }
  return FALLBACK_ZONE;
}

/** When each choice would share now, as { key, label, at } (ISO); "tonight" only before 7 pm in `zone`. */
function choices(now, zone) {
  const local = DateTime.fromMillis(now, { zone });
  const list = [
    { key: '1h', label: 'In 1 hour', at: new Date(now + HOUR_MS).toISOString() },
    { key: '3h', label: 'In 3 hours', at: new Date(now + 3 * HOUR_MS).toISOString() },
  ];
  if (local.hour < TONIGHT_LAST_HOUR) {
    list.push({
      key: 'tonight',
      label: 'Tonight at 8',
      at: local.set({ hour: TONIGHT_HOUR, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO(),
    });
  }
  return list;
}

/** The time a Moment posted now with `key` shares (ISO). Throws 422 SHARE_TIME_PASSED for "tonight" after 7 pm. */
function shareAtFor(key, now, zone) {
  const found = choices(now, zone).find((choice) => choice.key === key);
  if (!found) {
    throw fail(422, 'SHARE_TIME_PASSED', "It's too late to share this tonight. Pick another time.");
  }
  return new Date(found.at).toISOString();
}

module.exports = { zoneFor, choices, shareAtFor, KEYS, TONIGHT_HOUR, TONIGHT_LAST_HOUR };
