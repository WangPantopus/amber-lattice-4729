/**
 * Location Resolver — resolves the best location anchor for context,
 * weather, and daily briefing requests.
 *
 * Preference-aware hierarchy:
 *   1. Honor explicit location_mode when possible
 *   2. Fall back to the best available location
 *   3. null (no location available)
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const directDb = require('../../config/directDb');
const logger = require('../../utils/logger');
const ngeohash = require('ngeohash');
const { timezoneFromCoordinates: inferTimezone, validTimezone, coordinates } = require('../../utils/timezone');
const parseHomeLocation = require('../../utils/parsePostGISPoint');

const GEOHASH_PRECISION = 5;
const HOME_LOCATION_SELECT = 'id, name, address, city, state, map_center_lat, map_center_lng, location';

// Confidence scores by source type
const CONFIDENCE = {
  // A private bookmark, not a home or a pinned location (pilot brief WP2).
  saved_place: 0.60,
  custom: 0.95,
  viewing_pinned: 0.90,
  primary_home: 0.95,
  home: 0.85,
  viewing_recent: 0.70,
  none: 0.0,
};

const EMPTY_RESULT = {
  latitude: null,
  longitude: null,
  label: 'Unknown',
  source: 'none',
  timezone: 'UTC',
  geohash: null,
  confidence: 0.0,
  homeId: null,
};

/**
 * Compute geohash5 from coordinates, or null if invalid.
 */
function computeGeohash(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return null;
  try {
    return ngeohash.encode(lat, lng, GEOHASH_PRECISION);
  } catch {
    return null;
  }
}

/**
 * Build the standard result shape.
 */
function makeResult(lat, lng, label, source, homeId = null, fallbackTimezone = 'UTC') {
  return {
    latitude: lat,
    longitude: lng,
    label,
    source,
    timezone: inferTimezone(lat, lng, fallbackTimezone),
    geohash: computeGeohash(lat, lng),
    confidence: CONFIDENCE[source] ?? 0.0,
    homeId,
  };
}

function makeViewingLocationResult(vl, fallbackTimezone, preferredSource = null) {
  const point = coordinates(vl?.latitude, vl?.longitude);
  if (!point) return null;
  const { latitude: lat, longitude: lng } = point;
  const source = preferredSource || (vl.is_pinned ? 'viewing_pinned' : 'viewing_recent');
  const label = vl.label || 'Viewing location';
  return makeResult(lat, lng, label, source, null, fallbackTimezone);
}

function makePrimaryHomeResult(occupancies, fallbackTimezone) {
  if (!occupancies?.length) return null;

  for (let i = 0; i < occupancies.length; i++) {
    const home = occupancies[i].home;
    if (!home) continue;

    // Prefer flat coords, fall back to PostGIS location column
    const parsed = parseHomeLocation(home.location);
    const point = coordinates(home.map_center_lat, home.map_center_lng)
      || coordinates(parsed?.latitude, parsed?.longitude);
    if (!point) continue;
    const { latitude: lat, longitude: lng } = point;

    const source = i === 0 ? 'primary_home' : 'home';
    const label = home.city
      ? `Near ${[home.city, home.state].filter(Boolean).join(', ')}`
      : 'Near Home';

    return { ...makeResult(lat, lng, label, source, home.id, fallbackTimezone), state: home.state || null };
  }

  return null;
}

function dedupeHomeCandidates(...candidateLists) {
  const merged = [];
  const seen = new Set();

  for (const list of candidateLists) {
    for (const row of list || []) {
      const homeId = row?.home?.id || row?.home_id || row?.id || null;
      if (!homeId || seen.has(homeId)) continue;
      seen.add(homeId);
      merged.push(row.home ? row : { home_id: homeId, home: row });
    }
  }

  return merged;
}

// The Home the person chose as their default goes first when it is one of the candidates.
function preferDefaultHome(candidates, homeId) {
  const index = homeId ? candidates.findIndex((row) => (row?.home?.id || row?.home_id) === homeId) : -1;
  return index > 0 ? [candidates[index], ...candidates.slice(0, index), ...candidates.slice(index + 1)] : candidates;
}

// A caller that keeps the answer passes `report`; it learns whether a read failed and the answer rests on the rest.
function markDegraded(report) {
  if (report) report.degraded = true;
}

// Homes a person owns without an occupancy row: verified HomeOwner rows first, then legacy Home.owner_id homes.
function fallbackHomeCandidates(ownerRows, legacyRows) {
  return dedupeHomeCandidates((ownerRows || []).filter((row) => row?.home), legacyRows || []);
}

async function loadFallbackHomeCandidates(userId, report = null) {
  const [ownerResult, legacyResult] = await Promise.all([
    supabaseAdmin
      .from('HomeOwner')
      .select(`home_id, home:home_id(${HOME_LOCATION_SELECT})`)
      .eq('subject_id', userId)
      .eq('owner_status', 'verified')
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('Home')
      .select(HOME_LOCATION_SELECT)
      .eq('owner_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  if (ownerResult.error) {
    markDegraded(report);
    logger.warn('locationResolver: owner fallback query error', {
      userId,
      error: ownerResult.error.message,
    });
  }

  if (legacyResult.error) {
    markDegraded(report);
    logger.warn('locationResolver: legacy owner fallback query error', {
      userId,
      error: legacyResult.error.message,
    });
  }

  return fallbackHomeCandidates(ownerResult.data, legacyResult.data);
}

// A read's outcome held until it is used: { value } or { error }, so a reply nobody waits for never rejects.
const settle = (read) => read.then((value) => ({ value }), (error) => ({ error }));
const outcome = async (pending) => {
  const { value, error } = await pending;
  if (error) throw error;
  return value;
};

/**
 * Decide one person's location from their reads, in the order of preference below. Shared by resolveLocation (one
 * person, reads started together) and resolveNotificationTimezones (the briefing scheduler's batch, reads done for
 * everyone at once), so both follow the same rules.
 *
 * `reads`: prefs() and savedPlace() return a read's reply ({ data, error }) when called; viewing, homes ([occupancy
 * reply, fallback home candidates]) and defaultHome are settled outcomes ({ value } or { error }).
 */
async function chooseLocation(userId, reads, report) {
  // ── Step 1: Read preferences ──
  const { data: prefs, error: prefsErr } = await reads.prefs();

  if (prefsErr) {
    markDegraded(report);
    logger.warn('locationResolver: prefs query error', { userId, error: prefsErr.message });
  }

  const fallbackTimezone = validTimezone(prefs?.daily_briefing_timezone) || 'UTC';
  const locationMode = prefs?.location_mode || 'primary_home';

  const customPoint = coordinates(prefs?.custom_latitude, prefs?.custom_longitude);
  if (locationMode === 'custom' && customPoint) {
    const { latitude: lat, longitude: lng } = customPoint;
    const label = prefs.custom_label || 'Custom location';
    logger.debug('locationResolver: resolved via custom', { userId, label });
    return makeResult(lat, lng, label, 'custom', null, fallbackTimezone);
  }

  // ── Step 2: Load current viewing location ──
  const { data: vl, error: vlErr } = await outcome(reads.viewing);

  if (vlErr && vlErr.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is expected
    markDegraded(report);
    logger.warn('locationResolver: VL query error', { userId, error: vlErr.message });
  }

  // ── Step 3: Load homes ──
  // Select both flat coords and PostGIS location for fallback.
  // Homes created before map_center_lat/lng were populated only have PostGIS location.
  const [{ data: occupancies, error: occErr }, fallbackHomes] = await outcome(reads.homes);

  if (occErr) {
    markDegraded(report);
    logger.warn('locationResolver: occupancy query error', { userId, error: occErr.message });
  }

  const { value: defaultHome, error: defaultHomeError } = await reads.defaultHome;
  if (defaultHomeError || defaultHome?.error) markDegraded(report);
  const homeCandidates = preferDefaultHome(
    dedupeHomeCandidates(occupancies || [], fallbackHomes),
    defaultHome?.error ? null : defaultHome?.data?.default_home_id || null,
  );

  // ── Step 4: Honor the explicit location_mode when possible ──
  if (locationMode === 'viewing_location') {
    const preferredViewing = makeViewingLocationResult(vl, fallbackTimezone);
    if (preferredViewing) {
      logger.debug('locationResolver: resolved via viewing location preference', {
        userId,
        label: preferredViewing.label,
      });
      return preferredViewing;
    }
  }

  if (locationMode === 'device_location') {
    const deviceLocation = makeViewingLocationResult(vl, fallbackTimezone);
    if (deviceLocation) {
      logger.debug('locationResolver: resolved via device location preference', {
        userId,
        label: deviceLocation.label,
        type: vl?.type,
      });
      return deviceLocation;
    }
  }

  if (locationMode === 'primary_home') {
    const preferredHome = makePrimaryHomeResult(homeCandidates, fallbackTimezone);
    if (preferredHome) {
      logger.debug('locationResolver: resolved via primary home preference', {
        userId,
        homeId: preferredHome.homeId,
      });
      return preferredHome;
    }
  }

  // ── Step 5: Best-available fallback chain ──
  if (vl?.is_pinned && vl.latitude != null && vl.longitude != null) {
    const pinned = makeViewingLocationResult(vl, fallbackTimezone, 'viewing_pinned');
    if (pinned) return pinned;
  }

  const homeLocation = makePrimaryHomeResult(homeCandidates, fallbackTimezone);
  if (homeLocation) {
    logger.debug('locationResolver: resolved via home fallback', {
      userId,
      source: homeLocation.source,
      homeId: homeLocation.homeId,
    });
    return homeLocation;
  }

  // A private saved address supplies Today and opted-in briefings without
  // creating residency. The existing explicit preferences, pinned location and
  // Home fallback above keep their priority.
  const { data: saved, error: savedError } = await reads.savedPlace();
  if (savedError) {
    markDegraded(report);
    logger.warn('locationResolver: saved place query error', { userId, error: savedError.message });
  }
  if (!savedError && saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)
    && Math.abs(saved.latitude) <= 90 && Math.abs(saved.longitude) <= 180
    && (saved.latitude !== 0 || saved.longitude !== 0)) {
    return { ...makeResult(saved.latitude, saved.longitude, saved.label, 'saved_place', null, fallbackTimezone), savedPlaceId: saved.id, state: saved.state || null };
  }

  // ── Step 6: Last known viewing location (not pinned) ──
  if (vl && vl.latitude != null && vl.longitude != null) {
    const recent = makeViewingLocationResult(vl, fallbackTimezone, 'viewing_recent');
    if (recent) return recent;
  }

  // ── Step 7: No location available ──
  logger.debug('locationResolver: no location found', { userId });
  return { ...EMPTY_RESULT, timezone: fallbackTimezone };
}

function locationFailed(userId, err, report) {
  markDegraded(report);
  logger.error('locationResolver: unexpected error', { userId, error: err.message });
  return { ...EMPTY_RESULT };
}

/**
 * Resolve the best location for a user.
 *
 * @param {string} userId
 * @param {{degraded: boolean}|null} [report] set to degraded when a read failed and the answer comes from the others
 * @returns {Promise<{latitude: number|null, longitude: number|null, label: string, source: string, timezone: string, geohash: string|null, confidence: number, homeId: string|null}>}
 */
async function resolveLocation(userId, report = null) {
  const mode = directDb.mode();
  if (mode === 'on') {
    try {
      // A direct read that worked failed nothing, so `report` stays as it is.
      return await chooseLocation(userId, await directLocationReads(userId), report);
    } catch (error) {
      directDb.fellBack('location', error);
      return apiLocation(userId, report);
    }
  }
  if (mode !== 'shadow') return apiLocation(userId, report);
  const started = performance.now();
  const direct = directLocationReads(userId).then((reads) => chooseLocation(userId, reads, null))
    .then((location) => ({ location, ms: performance.now() - started }), (error) => ({ error }));
  const answer = await apiLocation(userId, report);
  const apiMs = performance.now() - started;
  direct.then(({ location, ms, error }) => directDb.compared('location', error ? { error }
    : { differs: JSON.stringify(location) === JSON.stringify(answer) ? [] : ['location'], directMs: ms, apiMs }));
  return answer;
}

// Every row chooseLocation may use, in one query on a direct connection (config/directDb.js), shaped as the Data API
// sends them (json_build_object / json_agg, so the Home's PostGIS point and the timestamps arrive in the same form):
// the location preferences and default Home, the viewing location, active occupancies and verified owner Homes
// (oldest first, each with HOME_LOCATION_SELECT's columns), legacy owned Homes, and the newest saved place.
const homeJson = (alias) => `json_build_object('id', ${alias}.id, 'name', ${alias}.name, 'address', ${alias}.address,
  'city', ${alias}.city, 'state', ${alias}.state, 'map_center_lat', ${alias}.map_center_lat,
  'map_center_lng', ${alias}.map_center_lng, 'location', ${alias}.location)`;
const LOCATION_SQL = `
select
  (select json_build_object('location_mode', p.location_mode, 'custom_latitude', p.custom_latitude,
     'custom_longitude', p.custom_longitude, 'custom_label', p.custom_label,
     'daily_briefing_timezone', p.daily_briefing_timezone, 'default_home_id', p.default_home_id)
   from "UserNotificationPreferences" p where p.user_id = $1) as prefs,
  (select json_build_object('latitude', v.latitude, 'longitude', v.longitude, 'label', v.label, 'is_pinned', v.is_pinned,
     'type', v.type, 'updated_at', v.updated_at)
   from "UserViewingLocation" v where v.user_id = $1) as viewing,
  (select coalesce(json_agg(json_build_object('home_id', o.home_id,
     'home', case when h.id is null then null else ${homeJson('h')} end) order by o.created_at), '[]')
   from "HomeOccupancy" o left join "Home" h on h.id = o.home_id
   where o.user_id = $1 and o.is_active = true) as occupancies,
  (select coalesce(json_agg(json_build_object('home_id', w.home_id,
     'home', case when h.id is null then null else ${homeJson('h')} end) order by w.created_at), '[]')
   from "HomeOwner" w left join "Home" h on h.id = w.home_id
   where w.subject_id = $1 and w.owner_status = 'verified') as owners,
  (select coalesce(json_agg(${homeJson('h')} order by h.created_at), '[]')
   from "Home" h where h.owner_id = $1) as legacy,
  (select json_build_object('id', s.id, 'label', s.label, 'latitude', s.latitude, 'longitude', s.longitude, 'state', s.state)
   from "SavedPlace" s where s.user_id = $1 order by s.created_at desc, s.id desc limit 1) as saved`;

// chooseLocation's reads from that query, each as the Data API reply it stands for.
async function directLocationReads(userId) {
  const [row] = await directDb.read('location', LOCATION_SQL, [userId]);
  if (!row) throw new Error('No location row');
  const prefs = row.prefs ? { ...row.prefs } : null;
  if (prefs) delete prefs.default_home_id;
  const value = (data) => Promise.resolve({ value: data });
  return {
    prefs: async () => ({ data: prefs, error: null }),
    // .single(): no row is "no rows" (PGRST116), which isn't a failure.
    viewing: value(row.viewing ? { data: row.viewing, error: null }
      : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }),
    homes: value([{ data: row.occupancies, error: null }, fallbackHomeCandidates(row.owners, row.legacy)]),
    defaultHome: value({ data: row.prefs ? { default_home_id: row.prefs.default_home_id } : null, error: null }),
    savedPlace: async () => ({ data: row.saved, error: null }),
  };
}

// The Data API path (DIRECT_DB_READS off, a fallback, or the answer in shadow mode).
async function apiLocation(userId, report) {
  try {
    // The viewing location and the homes don't depend on the preferences, so
    // all three reads start together: one round trip instead of three (Today
    // resolves twice per load). Until awaited, the two early reads hold their
    // outcome rather than reject, so a custom location still returns without
    // them and a thrown error surfaces where it always did.
    const reads = {
      viewing: settle(supabaseAdmin
        .from('UserViewingLocation')
        .select('latitude, longitude, label, is_pinned, type, updated_at')
        .eq('user_id', userId)
        .single()),
      homes: settle(Promise.all([
        supabaseAdmin
          .from('HomeOccupancy')
          .select(`home_id, home:home_id(${HOME_LOCATION_SELECT})`)
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        loadFallbackHomeCandidates(userId, report),
      ])),
      // Read on its own so a database without the column (before its migration) keeps every other preference.
      defaultHome: settle(supabaseAdmin
        .from('UserNotificationPreferences')
        .select('default_home_id')
        .eq('user_id', userId)
        .maybeSingle()),
      prefs: () => supabaseAdmin
        .from('UserNotificationPreferences')
        .select('location_mode, custom_latitude, custom_longitude, custom_label, daily_briefing_timezone')
        .eq('user_id', userId)
        .maybeSingle(),
      savedPlace: () => supabaseAdmin
        .from('SavedPlace')
        .select('id, label, latitude, longitude, state')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
    };
    return await chooseLocation(userId, reads, report);
  } catch (err) {
    return locationFailed(userId, err, report);
  }
}

/**
 * A location anchor for EXPLICIT coordinates — the Place Intelligence
 * path, where the payload must be about the requested home, not about
 * wherever the viewer happens to be. Bypasses the per-user preference
 * hierarchy entirely; timezone and geohash are derived from the coords.
 *
 * @returns the standard location shape, or null for missing/invalid coords.
 */
function locationFromCoordinates({ latitude, longitude, label, homeId } = {}) {
  const point = coordinates(latitude, longitude);
  if (!point) return null;
  const { latitude: lat, longitude: lng } = point;
  return makeResult(lat, lng, label || 'Home', 'home', homeId || null);
}

// The selected briefing location defines its clock. A legacy Pacific
// default (or a phone's old zone) must not override a known location.
function notificationTimezone(location, prefs) {
  if (location?.source && location.source !== 'none') return validTimezone(location.timezone);
  return validTimezone(prefs?.daily_briefing_timezone);
}

async function resolveNotificationTimezone(userId, prefs, report = null) {
  if (prefs === undefined) {
    const { data, error } = await supabaseAdmin.from('UserNotificationPreferences')
      .select('daily_briefing_timezone').eq('user_id', userId).maybeSingle();
    if (error) throw new Error('Could not read notification timezone');
    prefs = data;
  }
  return notificationTimezone(await resolveLocation(userId, report), prefs);
}

function rowsByPerson(rows, column) {
  const byPerson = new Map();
  for (const row of rows || []) {
    const list = byPerson.get(row[column]);
    if (list) list.push(row);
    else byPerson.set(row[column], [row]);
  }
  return byPerson;
}

// A list reply cut short by the API's row cap (it said how many rows matched).
const cutShort = (read) => !read.error && !read.value.error && Number.isInteger(read.value.count)
  && (read.value.data || []).length < read.value.count;

/**
 * Notification time zones for many people at once (the briefing scheduler's tick): the reads one person's answer
 * takes, done for the whole set together (seven reads in one round, however many people), and each person's
 * location decided by chooseLocation exactly as resolveNotificationTimezone(userId, undefined, report) decides it.
 * A read that fails counts as failed for each person; a person whose answer rests on a failed read is `degraded`.
 *
 * @param {string[]} userIds
 * @returns {Promise<Map<string, {zone: string|null, degraded: boolean}>>} throws when the preferences can't be read
 */
async function resolveNotificationTimezones(userIds) {
  const ids = [...new Set(userIds)];
  const answers = new Map();
  if (!ids.length) return answers;

  const [prefsRead, defaultHomeRead, viewingRead, occupancyRead, ownerRead, legacyRead, savedRead] = await Promise.all([
    settle(supabaseAdmin
      .from('UserNotificationPreferences')
      .select('user_id, location_mode, custom_latitude, custom_longitude, custom_label, daily_briefing_timezone')
      .in('user_id', ids)),
    // On its own, as for one person: a database without the column keeps every other preference.
    settle(supabaseAdmin
      .from('UserNotificationPreferences')
      .select('user_id, default_home_id')
      .in('user_id', ids)),
    settle(supabaseAdmin
      .from('UserViewingLocation')
      .select('user_id, latitude, longitude, label, is_pinned, type, updated_at')
      .in('user_id', ids)),
    // The list reads say how many rows matched, so a reply cut short by the row cap is noticed.
    settle(supabaseAdmin
      .from('HomeOccupancy')
      .select(`user_id, home_id, home:home_id(${HOME_LOCATION_SELECT})`, { count: 'exact' })
      .in('user_id', ids)
      .eq('is_active', true)
      .order('created_at', { ascending: true })),
    settle(supabaseAdmin
      .from('HomeOwner')
      .select(`subject_id, home_id, home:home_id(${HOME_LOCATION_SELECT})`, { count: 'exact' })
      .in('subject_id', ids)
      .eq('owner_status', 'verified')
      .order('created_at', { ascending: true })),
    settle(supabaseAdmin
      .from('Home')
      .select(`owner_id, ${HOME_LOCATION_SELECT}`, { count: 'exact' })
      .in('owner_id', ids)
      .order('created_at', { ascending: true })),
    settle(supabaseAdmin
      .from('SavedPlace')
      .select('user_id, id, label, latitude, longitude, state', { count: 'exact' })
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })),
  ]);

  // As for one person: preferences that can't be read stop the whole answer.
  if (prefsRead.error || prefsRead.value.error) throw new Error('Could not read notification timezone');

  if ([occupancyRead, ownerRead, legacyRead, savedRead].some(cutShort)) {
    logger.warn('locationResolver: batch read cut short, resolving one by one', { people: ids.length });
    for (const userId of ids) {
      const report = { degraded: false };
      const zone = await resolveNotificationTimezone(userId, undefined, report);
      answers.set(userId, { zone, degraded: report.degraded });
    }
    return answers;
  }

  // Each person's reply, as their own read would have returned it.
  const replyFor = (read, column, pick) => {
    if (read.error) return () => ({ error: read.error });
    if (read.value.error) return () => ({ value: { data: null, error: read.value.error } });
    const byPerson = rowsByPerson(read.value.data, column);
    return (userId) => ({ value: pick(byPerson.get(userId) || []) });
  };
  const oneRow = (rows) => ({ data: rows[0] || null, error: null }); // maybeSingle on a unique column
  const prefsFor = rowsByPerson(prefsRead.value.data, 'user_id');
  const defaultHomeFor = replyFor(defaultHomeRead, 'user_id', oneRow);
  // .single(): exactly one row, else "no rows" (PGRST116), which isn't a failure.
  const viewingFor = replyFor(viewingRead, 'user_id', (rows) => (rows.length === 1
    ? { data: rows[0], error: null }
    : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }));
  const occupancyFor = replyFor(occupancyRead, 'user_id', (rows) => ({ data: rows, error: null }));
  const ownerFor = replyFor(ownerRead, 'subject_id', (rows) => ({ data: rows, error: null }));
  const legacyFor = replyFor(legacyRead, 'owner_id', (rows) => ({ data: rows, error: null }));
  const savedFor = replyFor(savedRead, 'user_id', oneRow); // newest first, so the first row is the one limit(1) gives

  // The owner fallback reads count as failed for everyone, as loadFallbackHomeCandidates counts them for one person.
  for (const [read, message] of [[ownerRead, 'owner fallback query error'], [legacyRead, 'legacy owner fallback query error']]) {
    if (!read.error && read.value.error) {
      logger.warn(`locationResolver: ${message}`, { people: ids.length, error: read.value.error.message });
    }
  }

  for (const userId of ids) {
    const report = { degraded: false };
    const prefs = (prefsFor.get(userId) || [])[0] || null;
    const occupancy = occupancyFor(userId);
    const owner = ownerFor(userId);
    const legacy = legacyFor(userId);
    if (owner.value?.error) markDegraded(report);
    if (legacy.value?.error) markDegraded(report);
    const thrown = occupancy.error || owner.error || legacy.error;
    const saved = savedFor(userId);
    const reads = {
      prefs: async () => ({ data: prefs, error: null }),
      viewing: Promise.resolve(viewingFor(userId)),
      homes: Promise.resolve(thrown ? { error: thrown } : {
        value: [occupancy.value, fallbackHomeCandidates(owner.value.data, legacy.value.data)],
      }),
      defaultHome: Promise.resolve(defaultHomeFor(userId)),
      savedPlace: async () => {
        if (saved.error) throw saved.error;
        return saved.value;
      },
    };
    let location;
    try {
      location = await chooseLocation(userId, reads, report);
    } catch (err) {
      location = locationFailed(userId, err, report);
    }
    answers.set(userId, { zone: notificationTimezone(location, prefs), degraded: report.degraded });
  }
  return answers;
}

module.exports = {
  resolveLocation, locationFromCoordinates, inferTimezone, resolveNotificationTimezone, resolveNotificationTimezones,
};
