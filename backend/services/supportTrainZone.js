// Where a Support Train is in time: its IANA zone and today's date there. Every "already passed", "today", reminder
// hour and auto-end uses this, so a train's day is the same for everyone on it.
const supabaseAdmin = require('../config/supabaseAdmin');
const { validTimezone, timezoneFromCoordinates, resolveHomeTimezone } = require('../utils/timezone');

const HOME_POINT_COLUMNS = 'map_center_lat, map_center_lng, location';

/** The zone of a Home's point (null when it has none). `preferred` settles a point on a zone boundary. */
async function homeTimezone(homeId, preferred = null) {
  if (!homeId) return null;
  const { data: home, error } = await supabaseAdmin.from('Home').select(HOME_POINT_COLUMNS).eq('id', homeId).maybeSingle();
  if (error || !home) return null;
  return resolveHomeTimezone(home, validTimezone(preferred) || null);
}

/**
 * A train's zone: the delivery point's when it has a typed or GPS address, else the zone stored on its Activity, else
 * its Home's point. `train` is a SupportTrain row with `Activity` (or pass `activityTimezone`). Null when none can be told.
 */
async function resolveTrainTimezone(train, activityTimezone = undefined) {
  const stored = validTimezone(activityTimezone !== undefined ? activityTimezone : train?.Activity?.timezone);
  const fromPoint = timezoneFromCoordinates(train?.delivery_lat, train?.delivery_lng, stored || null);
  if (fromPoint) return fromPoint;
  return homeTimezone(train?.recipient_home_id || train?.Activity?.home_id || null);
}

/** Today's date (YYYY-MM-DD) in `timezone` (UTC when it can't be told). */
function todayIn(timezone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: validTimezone(timezone) || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Today's date where the train is. */
async function trainToday(train, activityTimezone = undefined) {
  return todayIn(await resolveTrainTimezone(train, activityTimezone));
}

module.exports = { homeTimezone, resolveTrainTimezone, todayIn, trainToday };
