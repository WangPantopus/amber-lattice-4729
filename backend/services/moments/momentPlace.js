// Where a Moment is, in words others read (docs/location-privacy-matrix.md, place labels): a named place ("Esther Short
// Park"), else the street's name without a number ("West 13th Street"), else the town ("Vancouver, WA"); never a street
// address. A Moment shown as an area, and one posted at the author's own home, says only the town: a place's or a
// street's name would give the spot away. The Post sheet asks first (POST /api/moments/place-preview), so the author
// sees the words before posting, and may pick another of the names that fit the spot (`places`): the server makes that
// list and takes back only a key from it, so nobody writes a place's name themselves. The Post sheet's place picker
// (the Pulse composer's, around the Moment's pin) may also name a venue a little farther off, the coffee shop or the
// stadium the photo was taken in: the app sends only the venue's id, and venueNear finds it again near the pin.
// With the Sky's places on for the author (`sky_places`), a Moment is where it was taken unless its author pins it at a
// public place close by, picked by name (namingPlace, venueForKey, venueNear; never a school or a preschool, and no
// farther than pickWithinM, which is shorter where the spot is built up); at home it shows only its area, named by the
// town at the area's own point (townAt).

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const geoProvider = require('../geo');
const venues = require('../geo/venues');
const parsePostGISPoint = require('../../utils/parsePostGISPoint');
const { haversineMeters } = require('../../utils/trustState');
const { knownStepAt } = require('../../utils/areaCells');

// The place whose outline holds the point names the spot (the park, the stadium; the smallest one when several do),
// unless the pin is right at a venue mapped as a point; with no outline, a venue this close does.
const VENUE_NAMES_SPOT_M = 40;
const RIGHT_AT_VENUE_M = 10;
// The Post sheet's list of names for an exact pin: the places at or within this far of it, then the street, then the
// town; this many at most.
const PICK_VENUE_M = 100;
const MAX_PLACES = 6;
// The place picker's venues: this far from the pin at most (a venue whose outline holds the pin is 0 m away). The pin
// moves to the venue, so it stays in the same part of town as the photo.
const PICK_PLACE_M = 1500;
// With the Sky on (founder 2026-11-17: a place close by, nearer where it's built up, farther in open country): how far
// by how built-up the spot is, from the homes around it (the five steps of utils/areaCells.js): a quarter mile
// downtown, half a mile, a mile, a mile and a half, and two miles in open country. A mile where nobody counted the
// homes (abroad).
const PICK_PLACE_BY_STEP_M = [400, 800, 1600, 2400, 3200];
const PICK_PLACE_UNKNOWN_M = 1600;
// The Post sheet's home notice: a pin this close to a home the person lives at.
const AT_HOME_M = 60;
const VENUE_WAIT_MS = 2500;
const CACHE_MS = 60 * 60 * 1000;
// What's said when no provider answers; rare, and still not an address.
const FALLBACK_LABEL = 'Nearby';
// A house number and then a word: how the geocoder writes a street line ("4014 Tacoma Court").
const STREET_LINE = /^\s*\d+[a-z]?(?:-\d+)?\s+(\S.*)$/i;

const cache = new Map();

function cached(key, make) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = make().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { value, until: Date.now() + CACHE_MS });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return value;
}

// The town and the street's name at a point (one reverse geocode, kept for an hour per ~11 m).
function townAndStreet(latitude, longitude) {
  return cached(`ts:${latitude.toFixed(4)}:${longitude.toFixed(4)}`, async () => {
    const found = await geoProvider.reverseGeocode(latitude, longitude);
    const town = found?.city ? [found.city, found.state].filter(Boolean).join(', ') : null;
    const street = STREET_LINE.exec(String(found?.address || ''))?.[1]?.split(',')[0]?.trim() || null;
    return { town, street };
  });
}

// The place that names the spot among the venues around it, or null.
function namingVenue(places) {
  const holding = places.find((place) => place.contains);
  const nearest = places.find((place) => !place.contains && place.distance_m <= VENUE_NAMES_SPOT_M);
  return holding && !(nearest && nearest.distance_m <= RIGHT_AT_VENUE_M) ? holding : nearest || holding || null;
}

// The named places around the point, the one that names the spot first, then the others at or within PICK_VENUE_M,
// nearest first. venuesNear lists the outlines that hold the point smallest first.
function venuesAt(latitude, longitude) {
  return cached(`v:${latitude.toFixed(4)}:${longitude.toFixed(4)}`, async () => {
    const { places, loading } = await venues.venuesNear({ latitude, longitude, limit: 12, waitMs: VENUE_WAIT_MS });
    const named = (places || []).filter((place) => place?.name);
    const best = namingVenue(named);
    // Still loading: the next ask may know more, so it isn't kept.
    if (loading && !best) throw Object.assign(new Error('venues still loading'), { quiet: true });
    const others = named.filter((place) => place !== best && (place.contains || place.distance_m <= PICK_VENUE_M))
      .sort((a, b) => (a.contains ? 0 : a.distance_m) - (b.contains ? 0 : b.distance_m));
    return [best, ...others].filter(Boolean).map((place) => ({
      // Opaque, and the same every time this venue is listed.
      key: venueKey(place),
      label: String(place.name).slice(0, 80),
      // Kept on the server (labelsAt hands out only key and label): where a pin at this place stands, and whether it
      // may take one (the Sky: never a school or a preschool).
      latitude: Number(place.center?.lat),
      longitude: Number(place.center?.lng),
      pinnable: isPinnable(place),
    }));
  });
}

function venueKey(place) {
  return `v_${crypto.createHash('sha256').update(String(place.place_id ?? place.name)).digest('hex').slice(0, 16)}`;
}

// The Sky (phase A, call C9): a post may be pinned exactly at any place the picker lists except schools and preschools
// (colleges and universities may). The venues index labels them (services/geo/venues.js).
const NOT_PINNABLE = new Set(['School', 'Preschool']);
function isPinnable(place) {
  return !NOT_PINNABLE.has(place?.category) && Number.isFinite(Number(place?.center?.lat))
    && Number.isFinite(Number(place?.center?.lng));
}

async function settle(promise, what) {
  try {
    return await promise;
  } catch (error) {
    if (!error.quiet) logger.warn('moments.place_lookup_failed', { what, error: error.message });
    return null;
  }
}

/**
 * The labels for a point: { place_label, area_label, places }. `place_label` is what an exact pin says unless its
 * author picks another of `places`, `area_label` what an area pin (and a home) says. `places` are the names that fit
 * an exact pin, [{ key, label }], at most MAX_PLACES: the places right there, then the street's name, then the town;
 * the first is `place_label`. Never throws; a label nobody could find is FALLBACK_LABEL. `pinnableOnly` (the Sky)
 * leaves out the places that never take a pin, so a Moment taken at a school reads the street's name or the town's.
 */
async function labelsAt(latitude, longitude, { pinnableOnly = false } = {}) {
  const [around, ts] = await Promise.all([
    settle(venuesAt(latitude, longitude), 'venues'),
    settle(townAndStreet(latitude, longitude), 'reverse'),
  ]);
  const venueList = (around || []).filter((place) => !pinnableOnly || place.pinnable);
  const town = ts?.town || null;
  const fixed = [ts?.street && { key: 'street', label: ts.street }, town && { key: 'town', label: town }].filter(Boolean);
  const places = [];
  for (const { key, label } of [...venueList.slice(0, MAX_PLACES - fixed.length), ...fixed]) {
    if (!places.some((listed) => listed.label.toLowerCase() === label.toLowerCase())) places.push({ key, label });
  }
  if (!places.length) places.push({ key: 'auto', label: FALLBACK_LABEL });
  return { place_label: places[0].label, area_label: town || FALLBACK_LABEL, places };
}

/** The label a Post sheet's pick (`key`, from labelsAt's places for this same point) stands for, or null. */
function pickedLabel(labels, key) {
  if (typeof key !== 'string' || !key) return null;
  return (labels?.places || []).find((place) => place.key === key)?.label || null;
}

/**
 * How far from a spot a place picked for it may be, in metres, with the Sky on: PICK_PLACE_BY_STEP_M by how built-up
 * the spot is, PICK_PLACE_UNKNOWN_M where the homes file can't say. Never throws.
 */
async function pickWithinM(latitude, longitude) {
  const step = await knownStepAt(latitude, longitude);
  return step ? PICK_PLACE_BY_STEP_M[step - 1] : PICK_PLACE_UNKNOWN_M;
}

/**
 * The venue the place picker listed as `venueId` (an `osm:` id) when it is within `maxDistance` of the pin
 * (PICK_PLACE_M unless given): { latitude, longitude, label } at the venue's point, or null. Never throws (a lookup
 * that fails is null).
 */
async function venueNear(venueId, latitude, longitude, maxDistance = PICK_PLACE_M) {
  const venue = await settle(venues.venueNear({ placeId: venueId, latitude, longitude, maxDistance }), 'venue');
  if (!venue?.name || !Number.isFinite(venue.center?.lat) || !Number.isFinite(venue.center?.lng)) return null;
  return {
    latitude: venue.center.lat, longitude: venue.center.lng, label: String(venue.name).slice(0, 80), pinnable: isPinnable(venue),
  };
}

// ─── The Sky (phase A): a pin only at a public place picked by name ─────────

/**
 * The public place that names the spot and may take a pin, { key, label, latitude, longitude } at the place's own
 * point, or null: the first pinnable one of the venues labelsAt lists there (the one naming the spot, else the
 * nearest within PICK_VENUE_M). What "Pin it at a place" starts with. Never throws.
 */
async function namingPlace(latitude, longitude) {
  const list = await settle(venuesAt(latitude, longitude), 'venues');
  const found = (list || []).find((place) => place.pinnable);
  return found ? { key: found.key, label: found.label, latitude: found.latitude, longitude: found.longitude } : null;
}

/** The venue a Post sheet's `place_key` names among the venues at this point, when it may take a pin; else null. */
async function venueForKey(latitude, longitude, key) {
  if (typeof key !== 'string' || !key.startsWith('v_')) return null;
  const found = ((await settle(venuesAt(latitude, longitude), 'venues')) || []).find((place) => place.key === key);
  return found?.pinnable ? { label: found.label, latitude: found.latitude, longitude: found.longitude } : null;
}

/** The town a floating post's area says ("Vancouver, WA"), read at the area's own point; FALLBACK_LABEL when unknown. */
async function townAt(latitude, longitude) {
  return (await settle(townAndStreet(latitude, longitude), 'reverse'))?.town || FALLBACK_LABEL;
}

/** Whether the point is within AT_HOME_M of a home the person lives at (householdHomeIds; fails closed to false). */
async function isAtHome(userId, latitude, longitude) {
  const { householdHomeIds } = require('../../utils/homeMailAccess');
  const homeIds = await householdHomeIds(userId);
  if (!homeIds.length) return false;
  const { data, error } = await supabaseAdmin.from('Home').select('id, location').in('id', homeIds);
  if (error) {
    logger.warn('moments.at_home_failed', { error: error.message });
    return false;
  }
  return (data || []).some((home) => {
    const point = parsePostGISPoint(home.location);
    return point && haversineMeters(latitude, longitude, point.latitude, point.longitude) <= AT_HOME_M;
  });
}

/**
 * What kind of name `label` is among a point's labels: 'place' (a venue), 'street', 'town', or 'none' when nobody
 * could name the spot. The push says "At" a place, "On" a street and "In" a town.
 */
function labelKind(labels, label) {
  if (!label || label === FALLBACK_LABEL) return 'none';
  const key = (labels?.places || []).find((place) => place.label === label)?.key;
  if (key === 'street' || key === 'town') return key;
  if (key === 'auto') return 'none';
  return label === labels?.area_label ? 'town' : 'place';
}

module.exports = {
  labelsAt, pickedLabel, labelKind, isAtHome, venueNear, namingPlace, venueForKey, townAt, pickWithinM,
  FALLBACK_LABEL, AT_HOME_M, PICK_PLACE_M,
};
