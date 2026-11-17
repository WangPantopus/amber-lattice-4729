'use strict';

/**
 * Who is looking at a plan: their flags, where they can be (homes, saved
 * places, a fresh GPS fix), whether their address is verified, and whom they
 * block or mute. One read per request; every Plans route builds on it.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const parsePostGISPoint = require('../../utils/parsePostGISPoint');
const { isFeatureEnabled } = require('../featureFlagService');
const { getMuteAndHideFilters } = require('../feedService');
const { verifiedRows, FAST_CHECK_COLUMNS } = require('../../utils/homePermissions');
const { isFreshGps, PRIVATE_FLAG, ONLINE_FLAG, KINDS_FLAG, GUEST_ANSWERS_FLAG } = require('./planRules');
const { postScopeAccess } = require('../pulse/readAccess');

// The Verified gate (homePermissions.isVerified): mail-level proof, or a standing fast check while home_fast_verify is on.
const VERIFIED_SELECT = `home_id, user_id, verification_status, verification_source, verified_at, is_active, ${FAST_CHECK_COLUMNS}`;
// A household member in a trusted state (the household states in utils/homeMailAccess.js,
// householdHomeIds): never a pending claim, which anyone can file on any address.
const TRUSTED_OCCUPANCY_STATUSES = ['verified', 'provisional', 'provisional_bootstrap'];

/** Coordinates of a Home row: its geography point, or the map center the setup flow stored. */
function homePoint(home) {
  if (!home) return null;
  const point = parsePostGISPoint(home.location);
  if (point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)) return point;
  const lat = Number(home.map_center_lat);
  const lng = Number(home.map_center_lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { latitude: lat, longitude: lng };
  return null;
}

/** Users (of the given ids) who have a verified address: postcard, document, landlord or admin, never a household invite. */
async function verifiedUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('HomeOccupancy')
    .select(VERIFIED_SELECT)
    .in('user_id', ids)
    .eq('is_active', true)
    .eq('verification_status', 'verified');
  if (error) throw new Error(`Failed to read address verification: ${error.message}`);
  const verified = new Set();
  const isVerifiedRow = await verifiedRows(data || []);
  for (const occupancy of data || []) {
    if (isVerifiedRow(occupancy)) verified.add(String(occupancy.user_id));
  }
  return verified;
}

async function loadHomes(userId) {
  const [occupancies, owned] = await Promise.all([
    supabaseAdmin
      .from('HomeOccupancy')
      .select(`${VERIFIED_SELECT}, home:home_id (id, address, address2, city, state, zipcode, location, map_center_lat, map_center_lng)`)
      .eq('user_id', userId)
      .eq('is_active', true),
    supabaseAdmin
      .from('Home')
      .select('id, address, address2, city, state, zipcode, location, map_center_lat, map_center_lng')
      .eq('owner_id', userId),
  ]);
  if (occupancies.error) throw new Error(`Failed to read homes: ${occupancies.error.message}`);
  if (owned.error) throw new Error(`Failed to read homes: ${owned.error.message}`);

  const homes = new Map();
  const isVerifiedRow = await verifiedRows(occupancies.data || []);
  for (const row of occupancies.data || []) {
    if (!row.home) continue;
    homes.set(String(row.home.id), {
      ...row.home,
      verified: isVerifiedRow(row),
      // Probation is provisional without proof (home claims PR 4), so it isn't trusted.
      trusted: TRUSTED_OCCUPANCY_STATUSES.includes(row.verification_status) && row.verification_source !== 'probation',
    });
  }
  for (const home of owned.data || []) {
    if (!homes.has(String(home.id))) homes.set(String(home.id), { ...home, verified: false, trusted: false });
  }
  return [...homes.values()].map((home) => ({ ...home, point: homePoint(home) }));
}

async function loadSavedPlaces(userId) {
  const { data, error } = await supabaseAdmin
    .from('SavedPlace')
    .select('id, latitude, longitude, city')
    .eq('user_id', userId);
  if (error) {
    logger.warn('plans.viewer.saved_places_unavailable', { userId, error: error.message });
    return [];
  }
  return (data || []).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
}

function parseGps(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gps = {
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    timestamp: raw.timestamp,
  };
  return isFreshGps(gps) ? gps : null;
}

/**
 * @param {{ id: string, role?: string, plansBiz?: boolean, plansMore?: boolean }} user  req.user. `plansBiz`: the
 *   request said the app can draw a business's plan (`biz=1`, set by the Plans routes). Without it, and for every
 *   job and nudge, a business's plan does not exist for this viewer, and nothing about businesses is read.
 *   `plansMore`: the app can draw an online plan and the four newer kinds (`more=1`); without it those plans don't
 *   exist for this viewer either (planRules.needsMore).
 *   `plansGuests`: the app can draw guests without an account, Maybe, adults and kids, and room over 30
 *   (`guests=1`, Plans for the holidays H1); without it the server answers as it did before (K10).
 * @param {{ gps?: object, point?: { latitude: number, longitude: number } }} [opts]
 *   gps: a fix the app sent with this request (counts as a location for 5 minutes);
 *   point: where the app is looking from (the map or list center), used for distances
 *   only when the person has no home, saved place or fresh fix.
 */
async function loadViewer(user, opts = {}) {
  const userId = String(user.id);
  const bizMarker = user.plansBiz === true;
  const more = user.plansMore === true;
  const guests = user.plansGuests === true;
  const extras = user.plansExtras === true;
  const planBusiness = require('./planBusiness');
  const [
    playdatesFlag, filters, homes, savedPlaces, scopeAccess, sportsFlag, invitesFlag, bizFlag, bizKidsFlag, privateFlag, repeatFlag,
    onlineFlag, kindsFlag, guestAnswersFlag,
  ] = await Promise.all([
    isFeatureEnabled('plans_playdates', user),
    getMuteAndHideFilters(userId),
    loadHomes(userId),
    loadSavedPlaces(userId),
    postScopeAccess(userId),
    isFeatureEnabled('plans_sports', user),
    isFeatureEnabled('plans_invites', user),
    bizMarker ? isFeatureEnabled(planBusiness.FLAG, user) : false,
    bizMarker ? isFeatureEnabled(planBusiness.KIDS_FLAG, user) : false,
    isFeatureEnabled(PRIVATE_FLAG, user),
    isFeatureEnabled('plans_repeat', user),
    more ? isFeatureEnabled(ONLINE_FLAG, user) : false,
    more ? isFeatureEnabled(KINDS_FLAG, user) : false,
    isFeatureEnabled(GUEST_ANSWERS_FLAG, user),
  ]);
  // Plans with businesses: on only for a person who has the switch, in an app that can draw a business's plan.
  const biz = Boolean(bizMarker && bizFlag);
  const team = await planBusiness.teamRolesOf(userId, { enabled: biz });
  const gps = parseGps(opts.gps);
  const verified = homes.some((home) => home.verified);

  const locations = [];
  if (gps) locations.push({ kind: 'gps', latitude: gps.latitude, longitude: gps.longitude });
  for (const home of homes) {
    if (home.point) locations.push({ kind: 'home', latitude: home.point.latitude, longitude: home.point.longitude, home_id: home.id });
  }
  for (const place of savedPlaces) {
    locations.push({ kind: 'saved_place', latitude: Number(place.latitude), longitude: Number(place.longitude) });
  }

  // Where distances are measured from: the person's own place (the first home,
  // else a saved place), so one plan shows one distance on every screen, in
  // both apps and after every action, whatever the request carried. Without
  // one: a fresh fix, then the point the app is looking from.
  const ownPlace = locations.find((l) => l.kind === 'home' || l.kind === 'saved_place');
  let origin = null;
  if (ownPlace) {
    origin = { latitude: ownPlace.latitude, longitude: ownPlace.longitude };
  } else if (gps) {
    origin = { latitude: gps.latitude, longitude: gps.longitude };
  } else if (opts.point && Number.isFinite(opts.point.latitude) && Number.isFinite(opts.point.longitude)) {
    origin = { latitude: opts.point.latitude, longitude: opts.point.longitude };
  }

  return {
    id: userId,
    role: user.role || null,
    scopeAccess,
    verified,
    // Playdates exist for everyone on Pantopus with the flag on. A verified address is no longer a
    // Plans rule (founder decision, November 7); it still earns the badge and the "verified" auto rule.
    seesPlaydates: Boolean(playdatesFlag),
    playdatesFlag: Boolean(playdatesFlag),
    sportsFlag: Boolean(sportsFlag),
    // Hosts can invite people (planInvites.js).
    invitesFlag: Boolean(invitesFlag),
    // May post a private plan (planRules.PRIVATE_FLAG); it needs invitations too, or nobody could come.
    privateFlag: Boolean(privateFlag && invitesFlag),
    // May set a plan to repeat (planSeries.js).
    repeatFlag: Boolean(repeatFlag),
    // The app can draw an online plan and the newer kinds (`more=1`); and whether this person may post them.
    more,
    onlineFlag: Boolean(more && onlineFlag),
    kindsFlag: Boolean(more && kindsFlag),
    // The app can draw H1's guests, Maybe and room over 30 (`guests=1`); and whether this person, as a host, has
    // the switch (with private plans and invitations, which it needs). Read for the host wherever a plan is read.
    guests,
    guestAnswersFlag: Boolean(guestAnswersFlag && privateFlag && invitesFlag),
    // The app can draw the extras of Plans for the holidays (`extras=1`, 08-extras.md). Each extra's switch is read
    // for the plan's host.
    extras,
    // Plans with businesses (planBusiness.js): whether a business's plan exists for this viewer, whether one
    // for kids does, and the businesses whose plans they post or run.
    biz,
    bizKids: Boolean(biz && bizKidsFlag),
    bizMarker,
    businessPost: team.post,
    businessManage: team.manage,
    sports: filters.sports || {},
    homes,
    savedPlaces,
    gps,
    locations,
    origin,
    blockedUserIds: filters.blockedUserIds || new Set(),
    mutedUserIds: filters.mutedUserIds || new Set(),
    hiddenPostIds: filters.hiddenPostIds || new Set(),
  };
}

module.exports = {
  TRUSTED_OCCUPANCY_STATUSES,
  loadViewer,
  verifiedUserIds,
  homePoint,
  parseGps,
};
