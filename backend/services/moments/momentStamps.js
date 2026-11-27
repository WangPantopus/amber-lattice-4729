// Stamps on a Moment (Pulse, reinvented, phase 0; behind the `pulse_reinvented` switch, read per person): the marks an
// author places on the picture in the Studio (postmark, weather, elevation, place, time, sunset, miles from home).
// The author chooses only where a stamp sits (which one, its centre as 0 to 1 of the picture, its size and turn); the
// server fills every value itself when the Moment is posted, so nobody can type one. Kept in post_metadata.moment:
//   stamps        [{ kind, x, y, scale, rotation }]  where the author placed them (an edit may change these)
//   stamp_values  { v: 1, place_label, town, at, zone, time_label, date_label, weather, elevation, sunset,
//                   home_distance }                  what the server read at posting; never read again
// Only a reader with the switch on gets `stamps` (momentStore.serializeMoment); everyone else's answer is today's.
// The home rules hold as everywhere in Moments: nothing at home says the weather, the height or how far from home,
// a made-up name's Moment says none of those, and one shared later never says when it was taken.

const Joi = require('joi');
const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const parsePostGISPoint = require('../../utils/parsePostGISPoint');
const { haversineMeters } = require('../../utils/trustState');
const { sunPosition } = require('./sunPosition');
const momentWeather = require('./momentWeather');
const momentSchedule = require('./momentSchedule');
const { FALLBACK_LABEL } = require('./momentPlace');

const KINDS = ['postmark', 'weather', 'elevation', 'place', 'time', 'sunset', 'home_distance'];
const METERS_PER_MILE = 1609.344;
// "Miles from home" is for trips (the lead, 2026-11-27): nearer than MIN_HOME_MILES it would help find the home, so
// there is no stamp, and from there it says only a band ("100+ mi from home"), never the distance itself. The private
// choice: only the founder loosens it.
const HOME_MILE_BANDS = [25, 50, 100, 250, 500, 1000, 2500, 5000];
const MIN_HOME_MILES = HOME_MILE_BANDS[0];
// The sun's centre this far below the horizon is sunset (refraction and the sun's own size).
const SUNSET_ELEVATION_DEG = -0.833;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// A camera whose clock was never set says 1970 or so; a phone's clock may run a little ahead.
const EARLIEST_TAKEN_MS = Date.UTC(2000, 0, 1);
const CLOCK_SKEW_MS = 2 * MINUTE_MS;

function fail(message) {
  return Object.assign(new Error(message), { status: 400, code: 'MOMENT_INVALID' });
}

const placementsSchema = Joi.array().items(Joi.object({
  kind: Joi.string().valid(...KINDS).required(),
  x: Joi.number().min(0).max(1).required(),
  y: Joi.number().min(0).max(1).required(),
  scale: Joi.number().min(0.25).max(4).default(1),
  rotation: Joi.number().min(-180).max(180).default(0),
})).max(KINDS.length).unique('kind');

// The phone's height reading for the elevation stamp, as "Show height" sends it (store.shownAltitude decides).
const readingSchema = Joi.object({
  meters: Joi.number().required(),
  accuracy_m: Joi.number().allow(null),
  speed_mps: Joi.number().allow(null),
});

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places || 0;

/** The placements in `value` as stored (rounded), or throws 400 MOMENT_INVALID. Null or missing: []. */
function parsePlacements(value) {
  if (value == null) return [];
  const { error, value: list } = placementsSchema.validate(value, { abortEarly: true, stripUnknown: true });
  if (error) throw fail(`stamps: ${error.details[0].message.replace(/"/g, '')}`);
  return list.map((stamp) => ({
    kind: stamp.kind, x: round(stamp.x, 4), y: round(stamp.y, 4), scale: round(stamp.scale, 3), rotation: round(stamp.rotation, 1),
  }));
}

/** The phone's elevation reading in `value`, or null; throws 400 MOMENT_INVALID for a malformed one. */
function parseReading(value) {
  if (value == null) return null;
  const { error, value: reading } = readingSchema.validate(value, { abortEarly: true, stripUnknown: true });
  if (error) throw fail(`elevation: ${error.details[0].message.replace(/"/g, '')}`);
  return reading;
}

/** What a Studio post's body adds (`stamps`, `elevation`), read only for an author with the switch on. */
function parseStudio(body) {
  return { placements: parsePlacements(body?.stamps), reading: parseReading(body?.elevation) };
}

/** A time a photo's file or the album says it was taken, in ms, or null when it can't be right. */
function takenMs(value, now = Date.now()) {
  const at = Date.parse(value || '');
  return Number.isFinite(at) && at >= EARLIEST_TAKEN_MS && at <= now + CLOCK_SKEW_MS ? at : null;
}

/**
 * When the sun sets on the local day of `atMs` at the point, in ms, or null where it doesn't that day (polar day or
 * night). From sunPosition (good to about a degree, so a minute or two).
 */
function sunsetMs(latitude, longitude, atMs, zone) {
  const noon = DateTime.fromMillis(atMs, { zone }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toMillis();
  const height = (ms) => sunPosition(latitude, longitude, new Date(ms)).elevation_deg;
  if (height(noon) < SUNSET_ELEVATION_DEG) return null;
  const step = 10 * MINUTE_MS;
  for (let at = noon + step; at <= noon + 14 * HOUR_MS; at += step) {
    if (height(at) >= SUNSET_ELEVATION_DEG) continue;
    let up = at - step;
    let down = at;
    while (down - up > MINUTE_MS) {
      const mid = up + Math.floor((down - up) / 2);
      if (height(mid) >= SUNSET_ELEVATION_DEG) up = mid; else down = mid;
    }
    return Math.round(down / MINUTE_MS) * MINUTE_MS;
  }
  return null;
}

/** The sunset stamp for a Moment taken at `atMs`: { at, minutes, label }, or null. */
function sunsetStamp(latitude, longitude, atMs, zone) {
  const sets = sunsetMs(latitude, longitude, atMs, zone);
  if (sets == null) return null;
  const minutes = Math.round((sets - atMs) / MINUTE_MS);
  let label;
  if (minutes > 0 && minutes < 60) label = `Sunset in ${minutes} min`;
  else if (minutes === 0) label = 'Sunset now';
  else if (minutes < 0 && minutes > -60) label = `${-minutes} min after sunset`;
  else label = `Sunset at ${DateTime.fromMillis(sets, { zone }).toFormat('h:mm a')}`;
  return { at: new Date(sets).toISOString(), minutes, label };
}

/** The band a distance falls in (the highest of HOME_MILE_BANDS it reaches), or null under MIN_HOME_MILES. */
function homeMileBand(miles) {
  if (!(miles >= MIN_HOME_MILES)) return null;
  return HOME_MILE_BANDS.filter((band) => miles >= band).pop();
}

/** The home-distance stamp for a band: { miles (the band's floor), label: "100+ mi from home" }. */
function homeDistanceOf(band) {
  return band == null ? null : { miles: band, label: `${band.toLocaleString('en-US')}+ mi from home` };
}

/**
 * How far the point is from the nearest home the author lives at, in miles (unrounded), or null when they have none.
 * Throws when the homes can't be read (the stamp is then left out).
 */
async function milesFromHome(userId, latitude, longitude) {
  const { householdHomeIdsOrThrow } = require('../../utils/homeMailAccess');
  const homeIds = await householdHomeIdsOrThrow(userId);
  if (!homeIds.length) return null;
  const { data, error } = await supabaseAdmin.from('Home').select('id, location').in('id', homeIds);
  if (error) throw new Error(`Failed to read homes: ${error.message}`);
  const meters = (data || []).map((home) => parsePostGISPoint(home.location)).filter(Boolean)
    .map((home) => haversineMeters(latitude, longitude, home.latitude, home.longitude));
  return meters.length ? Math.min(...meters) / METERS_PER_MILE : null;
}

async function homeDistance(userId, latitude, longitude) {
  try {
    return homeDistanceOf(homeMileBand(await milesFromHome(userId, latitude, longitude)));
  } catch (error) {
    logger.warn('moments.stamps.home_read_failed', { error: error.message });
    return null;
  }
}

/**
 * What the server keeps for a Moment's stamps (stamp_values), read once when it is posted:
 *   userId      the author's account (never the system account a made-up name's Moment is stored under)
 *   point       the point everyone sees ({ latitude, longitude }, nulls with no location)
 *   placeLabel  the place everyone reads; town: the town it is in (the postmark's words)
 *   atHome, penName, sharedLater
 *   fresh       a photo, video or card made now where its author is (no album time): only then weather and sunset
 *   takenAt     an album item's own time, when it says one
 *   elevation   { altitude_ft, flying } as store.shownAltitude kept it, or null
 *   weather     a weather stamp the post already read (the Live mark's), or undefined to read one here
 */
async function valuesFor({ userId, point, placeLabel, town, atHome = false, penName = false, sharedLater = false,
  fresh = true, takenAt = null, elevation = null, weather, now = Date.now() }) {
  const placed = point?.latitude != null && point?.longitude != null;
  const atMs = fresh ? now : takenMs(takenAt, now);
  const nowStamps = placed && fresh && !sharedLater;
  const [zone, weatherStamp, distance] = await Promise.all([
    momentSchedule.zoneFor(userId, placed ? point.latitude : null, placed ? point.longitude : null),
    nowStamps && !atHome && !penName
      ? (weather !== undefined ? weather : momentWeather.weatherAt(point.latitude, point.longitude)) : null,
    placed && !atHome && !penName ? homeDistance(userId, point.latitude, point.longitude) : null,
  ]);
  const local = atMs == null ? null : DateTime.fromMillis(atMs, { zone });
  const values = { v: 1, zone };
  if (placed && placeLabel) values.place_label = String(placeLabel).slice(0, 80);
  // The postmark names the town; where none was found ("Nearby"), the place everyone reads.
  const townWords = town && town !== FALLBACK_LABEL ? town : placeLabel;
  if (placed && townWords) values.town = String(townWords).slice(0, 80);
  if (local) values.date_label = local.toFormat('LLL d');
  if (local && !sharedLater) {
    values.at = new Date(atMs).toISOString();
    values.time_label = local.toFormat('h:mm a');
  }
  if (weatherStamp) values.weather = weatherStamp;
  if (elevation && !penName && !atHome && placed && Number.isFinite(elevation.altitude_ft)) {
    values.elevation = { altitude_ft: elevation.altitude_ft, ...(elevation.flying ? { flying: true } : {}) };
  }
  if (nowStamps) {
    const sunset = sunsetStamp(point.latitude, point.longitude, atMs, zone);
    if (sunset) values.sunset = sunset;
  }
  if (distance) values.home_distance = distance;
  return values;
}

/**
 * One kind's value from what was kept, or null. The home rules are checked again on the row's own record (`guard`:
 * { atHome, penName, placed }), so nothing stored before a rule changed says more than it may now.
 */
function valueOf(kind, values, guard = {}) {
  const v = values || {};
  const placed = guard.placed !== false;
  const private_ = guard.atHome || guard.penName;
  switch (kind) {
    case 'place':
      return placed && v.place_label ? { label: v.place_label } : null;
    case 'time':
      return v.at && v.time_label ? { at: v.at, zone: v.zone || null, label: v.time_label, date_label: v.date_label || null } : null;
    case 'weather':
      return placed && !private_ ? momentWeather.shownStamp(v.weather) : null;
    case 'elevation': {
      const ft = v.elevation?.altitude_ft;
      if (!placed || private_ || !Number.isFinite(ft)) return null;
      return { altitude_ft: ft, flying: Boolean(v.elevation.flying), label: `${ft.toLocaleString('en-US')} ft` };
    }
    case 'sunset':
      return placed && v.sunset?.at && typeof v.sunset.label === 'string'
        ? { at: v.sunset.at, minutes: Number(v.sunset.minutes), label: v.sunset.label } : null;
    case 'home_distance':
      // Banded again on reading, so a value kept under an earlier rule never says more than the bands.
      return placed && !private_ && Number.isFinite(v.home_distance?.miles)
        ? homeDistanceOf(homeMileBand(v.home_distance.miles)) : null;
    case 'postmark':
      return placed && (v.town || v.place_label) ? {
        place: v.town || v.place_label,
        date_label: v.date_label || null,
        time_label: v.time_label || null,
        weather: private_ ? null : momentWeather.shownStamp(v.weather),
      } : null;
    default:
      return null;
  }
}

/** The stamps a Moment shows: its placements with the values kept, a placement without a value left out. */
function shownStamps(moment, guard) {
  const placements = Array.isArray(moment?.stamps) ? moment.stamps : [];
  return placements.filter((stamp) => KINDS.includes(stamp?.kind)).map((stamp) => {
    const value = valueOf(stamp.kind, moment.stamp_values, guard);
    return value ? {
      kind: stamp.kind, x: Number(stamp.x), y: Number(stamp.y), scale: Number(stamp.scale ?? 1),
      rotation: Number(stamp.rotation ?? 0), value,
    } : null;
  }).filter(Boolean);
}

/**
 * The kept value of every kind, for the author's own Moment while it may still be edited (`stamp_choices`, CONTRACT
 * 3): an edit may place any of them. Null for a kind with no value (and every kind of a Moment posted with the switch
 * off, which kept none).
 */
function choicesOf(moment, guard) {
  const out = {};
  for (const kind of KINDS) out[kind] = valueOf(kind, moment?.stamp_values, guard);
  return out;
}

/** The tray's values before posting (POST /place-preview `stamps: true`): each kind's value as a post now would keep it. */
function previewOf(values, guard) {
  const out = {};
  for (const kind of KINDS) if (kind !== 'elevation') out[kind] = valueOf(kind, values, guard);
  return out;
}

module.exports = {
  KINDS, MIN_HOME_MILES, choicesOf, parsePlacements, parseReading, parseStudio, valuesFor, valueOf, shownStamps, previewOf,
  sunsetStamp, sunsetMs, homeMileBand, HOME_MILE_BANDS, takenMs,
};
