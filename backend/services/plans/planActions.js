'use strict';

/**
 * Nearby Plans: everything that changes a plan or a request (build brief §5, §7).
 *
 * Seats are taken only by accepted requests. Every write that can fill the last
 * spot re-checks capacity afterwards (enforceCapacity), so two people saying yes
 * to the same last spot at once can't overfill a plan: the later one goes back
 * to the waitlist.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { canPostToPlace } = require('../../utils/trustState');
const { recordFunnelEvent } = require('../funnelEvents');
const { filePostReport } = require('../postReportService');
const blockService = require('../blockService');
const rules = require('./planRules');
const planService = require('./planService');
const { loadChatPeople } = require('../chatPeople');
const { loadViewer, verifiedUserIds } = require('./planViewer');
const planPlace = require('./planPlace');
const planChat = require('./planChat');
const planNotify = require('./planNotifications');
const planInvites = require('./planInvites');
const planBusiness = require('./planBusiness');
const planSeries = require('./planSeries');
const businessActing = require('../businessActing');
const planGuests = require('./planGuests');
const { findGame } = require('./planGames');
const { validTimezone } = require('../../utils/timezone');

class PlanError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const fail = (status, code, message, extra) => { throw new PlanError(status, code, message, extra); };

const REASON_ERRORS = {
  ended: [409, 'Asking has closed for this plan.'],
  declined: [403, "The host couldn't fit you this time, so you can't ask again."],
  removed: [403, "You can't ask to join this plan again."],
  blocked: [404, "This plan isn't available."],
  too_many_requests: [429, "You've asked as many times as you can for now."],
  needs_location: [403, 'Share your location or add your home to ask to join.'],
  too_far: [403, 'This plan is too far from where you are or live.'],
};

const nowIso = () => new Date().toISOString();

// ── Shared reads ─────────────────────────────────────────────

async function loadVisiblePlan(postId, viewer) {
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  // Someone in or waiting on a business's plan keeps it after the business may no longer host, so they can leave.
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  return plan;
}

async function loadHostedPlan(postId, viewer) {
  const plan = await loadVisiblePlan(postId, viewer);
  // A neighbor's plan: its host. A business's plan: the team members who run its plans (planBusiness.runsPlan).
  if (!planBusiness.runsPlan(plan, viewer)) fail(403, 'not_host', 'Only the host can do that.');
  return plan;
}

/**
 * What a plan's host is called in a notice or a chat line: a person's first name, a business's own name. It is
 * read from the plan, never from whoever is acting, so a staff member running a business's plan is never named.
 */
async function hostFirstOf(plan) {
  if (plan.business_user_id) return plan.business?.name || 'The host';
  const id = String(plan.host_user_id);
  return firstOf((await userNames([id])).get(id));
}

/** The audit line for something done to a business's plan by one of its team. Nothing for a neighbor's plan. */
function auditBusinessPlan(plan, viewer, action, metadata = {}) {
  if (!plan.business_user_id) return Promise.resolve();
  return businessActing.audit({
    businessUserId: plan.business_user_id, actorUserId: viewer.id, action, targetType: 'plan', targetId: plan.post_id, metadata,
  });
}

/** Seats taken now: accepted requests and guests without an account who said they're in (planGuests.js). */
async function seatsNow(plan, requests) {
  return planService.seatsTaken(plan, requests, await planGuests.guestSeats(plan.post_id));
}

async function activeRequests(postId) {
  const { data, error } = await supabaseAdmin
    .from('PlanRequest')
    .select(planService.REQUEST_COLUMNS)
    .eq('post_id', postId)
    .in('status', planService.ACTIVE_REQUEST_STATUSES);
  if (error) throw new Error(`Failed to load requests: ${error.message}`);
  return data || [];
}

/**
 * Requests still waiting for the host's answer, without people on either side of a block
 * (the requests screen hides them): for the host's summary and the assistant's nudge.
 */
async function waitingRequests(plan, requests) {
  const pending = (requests || []).filter((r) => r.status === 'pending');
  if (pending.length === 0) return pending;
  const blocked = await blockService.blockedUserIds(plan.host_user_id).catch(() => new Set());
  return pending.filter((r) => !blocked.has(String(r.user_id)));
}

async function loadRequest(requestId, postId) {
  if (!planService.isUuid(requestId)) fail(404, 'not_found', "That request isn't here.");
  const { data, error } = await supabaseAdmin
    .from('PlanRequest')
    .select(planService.REQUEST_COLUMNS)
    .eq('id', requestId)
    .eq('post_id', postId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the request: ${error.message}`);
  if (!data) fail(404, 'not_found', "That request isn't here.");
  return data;
}

async function userNames(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  const users = new Map();
  if (ids.length === 0) return users;
  const { localDisplayNames } = require('../../utils/identityProfiles');
  const names = await localDisplayNames(ids);
  for (const id of ids) users.set(id, planService.displayName({ local_display_name: names.get(id) || null }));
  return users;
}

function firstOf(name) {
  const text = String(name || '').trim();
  // Someone with no name is "Someone" (planService.displayName): kept whole, never "S asked to join…".
  return !text || text === planService.NO_NAME ? planService.NO_NAME : text.split(' ')[0];
}

function partyLabel(name, partySize) {
  const extra = (Number(partySize) || 1) - 1;
  return extra > 0 ? `${firstOf(name)} + ${extra}` : firstOf(name);
}

/** The response body after a write: PlanDetail or PlanCard for the person who wrote. */
async function planBodyFor(postId, viewer) {
  const fresh = await loadViewer({ id: viewer.id, role: viewer.role, plansBiz: viewer.bizMarker, plansMore: viewer.more, plansGuests: viewer.guests }, { gps: viewer.gps, point: viewer.origin });
  const { body } = await planService.getForViewer(postId, fresh);
  return body;
}

// ── Validation ───────────────────────────────────────────────

function validateTimes(startsAt, endsAt, { allowPastStart = false, maxDaysAhead = rules.LIMITS.maxDaysAhead, isPrivate = false } = {}) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) fail(422, 'validation', 'Choose when the plan starts and ends.');
  const now = Date.now();
  if (!allowPastStart && start < now - rules.LIMITS.startGraceMinutes * 60 * 1000) fail(422, 'validation', "A plan can't start in the past.");
  if (start > now + maxDaysAhead * 24 * 60 * 60 * 1000) {
    fail(422, 'validation', `${isPrivate ? 'Private plans' : 'Plans'} can start up to ${maxDaysAhead} days ahead.`);
  }
  const minutes = (end - start) / 60000;
  if (minutes < rules.LIMITS.minDurationMinutes) fail(422, 'validation', 'A plan lasts at least 15 minutes.');
  if (minutes > rules.LIMITS.maxDurationMinutes) fail(422, 'validation', 'A plan lasts at most 8 hours.');
  if (end <= now) fail(422, 'validation', 'This plan would already be over.');
}

/**
 * Rules a plan can use: none for playdates, only "people I've hosted" at home, "anyone nearby" only for pickup games
 * and walks in a public place (it is for meeting in person, so never online; the newer kinds don't take it either).
 */
function normalizeAutoRules(kind, placeKind, requested) {
  const list = [...new Set(Array.isArray(requested) ? requested : [])];
  for (const rule of list) {
    if (!rules.AUTO_RULES.includes(rule)) fail(422, 'validation', `Unknown rule: ${rule}.`);
  }
  if (kind === 'playdate') return [];
  return list.filter((rule) => {
    if (placeKind === 'home') return rule === 'hosted_before';
    if (rule === 'anyone_nearby') return placeKind !== 'online' && (kind === 'pickup_game' || kind === 'walk_coffee');
    return true;
  });
}

function oneOf(value, allowed, label) {
  if (value === undefined || value === null) return undefined;
  if (!allowed.includes(value)) fail(422, 'validation', `Choose a ${label}.`);
  return value;
}

function bool(value, label) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') fail(422, 'validation', `${label} must be true or false.`);
  return value;
}

function normalizeDetails(kind, details, resolvedGame = null) {
  const input = details && typeof details === 'object' ? details : {};
  const out = {};
  if (kind === 'watch_party') {
    if (input.game && typeof input.game === 'object') {
      const known = resolvedGame || findGame(input.game.id);
      if (known) out.game = known;
      else {
        // Unknown ids and old clients keep the free-text game contract. Never trust
        // client-supplied team identity or times as a verified schedule record.
        const label = String(input.game.label || '').trim().slice(0, 60);
        if (label) out.game = { label };
        const at = input.game.starts_at ? new Date(input.game.starts_at) : null;
        if (out.game && at && !Number.isNaN(at.getTime())) out.game.starts_at = at.toISOString();
      }
    }
  } else if (kind === 'pickup_game') {
    out.sport = oneOf(input.sport, rules.SPORTS, 'sport') || 'other';
    out.level = oneOf(input.level, rules.LEVELS, 'level') || 'any';
    const gear = bool(input.extra_gear, 'Extra gear');
    if (gear !== undefined) out.extra_gear = gear;
  } else if (kind === 'playdate') {
    const bands = Array.isArray(input.kids_age_bands) ? [...new Set(input.kids_age_bands)] : [];
    for (const band of bands) if (!rules.KIDS_AGE_BANDS.includes(band)) fail(422, 'validation', 'Choose the kids’ ages.');
    if (bands.length === 0) fail(422, 'validation', 'Choose the kids’ ages.');
    out.kids_age_bands = rules.KIDS_AGE_BANDS.filter((band) => bands.includes(band));
  } else if (kind === 'walk_coffee') {
    out.walk_kind = oneOf(input.walk_kind, rules.WALK_KINDS, 'kind of walk') || 'walk';
    out.pace = oneOf(input.pace, rules.PACES, 'pace') || 'easy';
    const dogs = bool(input.dogs_welcome, 'Dogs welcome');
    if (dogs !== undefined) out.dogs_welcome = dogs;
  } else if (kind === 'study_group') {
    const subject = String(input.subject || '').replace(/\s+/g, ' ').trim();
    if (!subject) fail(422, 'validation', 'Add what you’re studying.');
    if (subject.length > 60) fail(422, 'validation', 'Keep the subject under 60 characters.');
    out.subject = subject;
    out.study_style = oneOf(input.study_style, rules.STUDY_STYLES, 'way to study') || 'quiet';
  } else if (kind === 'food_drinks') {
    out.food_kind = oneOf(input.food_kind, rules.FOOD_KINDS, 'kind of get-together') || 'dinner';
  } else if (kind === 'game_night') {
    out.game_kind = oneOf(input.game_kind, rules.GAME_KINDS, 'kind of game') || 'board_games';
  } else if (kind === 'outdoors') {
    out.outdoor_kind = oneOf(input.outdoor_kind, rules.OUTDOOR_KINDS, 'kind of outing') || 'hike';
    out.pace = oneOf(input.pace, rules.PACES, 'pace') || 'easy';
  }
  // something_else has no details: its title says what it is.
  return out;
}

function cleanTitle(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title) fail(422, 'validation', 'Give the plan a title.');
  if (title.length > 80) fail(422, 'validation', 'Keep the title under 80 characters.');
  return title;
}

function cleanText(value, max, label) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text.length > max) fail(422, 'validation', `${label} can be up to ${max} characters.`);
  return text || null;
}

// Watch parties and walks may be hosted at home (decision D6); pickup games, playdates and study groups
// (founder, 2026-10-17) meet in public.
const AT_HOME_MESSAGES = {
  watch_party: 'That’s at your home. To host there, choose “My place”: only people you accept see your address.',
  walk_coffee: 'That’s at your home. To host there, choose “My porch”: only people you accept see your address.',
  pickup_game: 'That’s at your home. Choose a public place nearby, like a park or a court.',
  playdate: 'That’s at your home. Playdates meet in public places: choose one nearby.',
  study_group: 'That’s at your home. Study groups meet in public places, like a library or a café.',
  // The newer kinds may be at home too (step 4).
  food_drinks: 'That’s at your home. To host there, choose “My place”: only people you accept see your address.',
  game_night: 'That’s at your home. To host there, choose “My place”: only people you accept see your address.',
  outdoors: 'That’s at your home. To host there, choose “My place”: only people you accept see your address.',
  something_else: 'That’s at your home. To host there, choose “My place”: only people you accept see your address.',
  // H11 moves a public plan to another public place only.
  move: 'That’s at your home. Choose another public place nearby.',
};

const ONLINE_LINK_MESSAGE = 'Add the link people will join with. It has to start with https://';
const NEEDS_LOCATION_ONLINE = 'Add your home or share your location to host an online plan for people nearby.';

/**
 * An online plan's place: its link, and where it "is", the host's own area, so a public one is shown to people near
 * the host. The point is the host's first trusted home with a point, else a fresh fix sent with the request; a
 * series' next date keeps the date before's (`seriesPoint`). A private plan with neither is posted with no area
 * (0, 0: in no list or map box); a public one can't be.
 */
function resolveOnlinePlace(viewer, kind, place, { isPrivate = false, details = null, seriesPoint = null } = {}) {
  if (!rules.ONLINE_KINDS.includes(kind)) {
    fail(422, 'validation', `A ${planNotify.noun({ kind, details: details && typeof details === 'object' ? details : {} })} meets in person.`);
  }
  const parsed = planPlace.parseOnlineLink(place.link, rules.ONLINE_LINK_MAX);
  if (!parsed) fail(422, 'validation', ONLINE_LINK_MESSAGE);
  const home = viewer.homes.find((h) => h.trusted && h.point) || null;
  let point = null;
  if (seriesPoint) point = seriesPoint;
  else if (home) point = home.point;
  else if (viewer.gps) point = { latitude: viewer.gps.latitude, longitude: viewer.gps.longitude };
  const noArea = !point || (Number(point.latitude) === 0 && Number(point.longitude) === 0);
  if (noArea && !isPrivate) fail(403, 'needs_location', NEEDS_LOCATION_ONLINE);
  return {
    kind: 'online',
    name: planPlace.ONLINE_NAME,
    address: null,
    latitude: noArea ? 0 : Number(point.latitude),
    longitude: noArea ? 0 : Number(point.longitude),
    home_id: null,
    // The home the point came from: its city names the area when the map can't.
    home: seriesPoint ? null : home,
    link: parsed.link,
    link_host: parsed.host,
    noArea,
    // With no area there is no place to read a time zone from: the app sends the phone's (an IANA name).
    timezone: noArea ? validTimezone(typeof place.timezone === 'string' ? place.timezone.slice(0, 64) : null) || null : null,
  };
}

/**
 * The time zone a plan keeps: its place's, or for an online plan posted with no area the one it already has (a
 * series' next date, an edit), else the phone's own (`place.timezone`), else the host's home's, else the default.
 */
function placeTimezone(viewer, place, { keepTimezone = null } = {}) {
  if (!place.noArea) return planPlace.timezoneFor(place.latitude, place.longitude);
  if (keepTimezone) return keepTimezone;
  if (place.timezone) return place.timezone;
  const home = viewer.homes.find((h) => h.point);
  return home ? planPlace.timezoneFor(home.point.latitude, home.point.longitude) : rules.DEFAULT_TIMEZONE;
}

/** The place, from the body: a public place, the host's own home, or online (a link). */
function resolvePlace(viewer, kind, place, { moving = false, isPrivate = false, details = null, seriesPoint = null } = {}) {
  if (!place || typeof place !== 'object') fail(422, 'validation', 'Choose where the plan happens.');
  if (place.kind === 'online') return resolveOnlinePlace(viewer, kind, place, { isPrivate, details, seriesPoint });
  if (place.kind === 'home') {
    if (kind === 'playdate') fail(422, 'validation', 'Playdates meet in public places.');
    if (kind === 'study_group') fail(422, 'validation', 'Study groups meet in public places.');
    const home = viewer.homes.find((h) => String(h.id) === String(place.home_id));
    if (!home || !home.trusted) fail(403, 'not_your_home', 'You can host at home only at a home you live in on Pantopus.');
    if (!home.point) fail(422, 'validation', "We couldn't find your home on the map.");
    return {
      kind: 'home',
      name: null,
      address: planPlace.homeAddressLine(home),
      latitude: home.point.latitude,
      longitude: home.point.longitude,
      home_id: home.id,
      home,
    };
  }
  if (place.kind !== 'public') fail(422, 'validation', 'Choose a public place or your home.');
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    fail(422, 'validation', 'Choose the place on the map.');
  }
  const name = cleanText(place.name, 120, 'The place name');
  if (!name) fail(422, 'validation', 'Name the place.');
  // A "public" place at the host's own home would hand its exact spot to everyone who gets in,
  // without the at-home rules (the host approves each person and confirms sharing the address).
  const point = { latitude, longitude };
  if (viewer.homes.some((h) => h.point && rules.distanceMeters(h.point, point) <= rules.HOME_GUARD_METERS)) {
    fail(422, 'place_at_home', moving ? AT_HOME_MESSAGES.move : AT_HOME_MESSAGES[kind] || AT_HOME_MESSAGES.pickup_game);
  }
  return {
    kind: 'public',
    name,
    address: cleanText(place.address, 300, 'The address'),
    latitude,
    longitude,
    home_id: null,
    home: null,
    // The picker's id for the place, as the app sent it. Nothing is saved from it until placeRefOf has checked it.
    picked_id: typeof place.place_id === 'string' ? place.place_id.slice(0, 64) : null,
  };
}

/**
 * The key a plan keeps for its place (Plan.place_ref): the picker's own id for a public place the host chose
 * from the list, checked against what the picker listed there. Null at a home, and for a place typed or
 * dropped on the map by hand.
 */
async function placeRefOf(place) {
  if (!place || place.kind !== 'public' || !place.picked_id) return null;
  return require('./planPlaces').pickedPlaceRef({
    placeId: place.picked_id, latitude: place.latitude, longitude: place.longitude,
  });
}

/**
 * Hosting: within the existing 5 km canPostToPlace proximity (about 3 miles) of
 * where the host lives or where they are now. Playdates too: anyone on Pantopus
 * may host one, without a verified address (founder decision, November 7).
 */
function assertHostNear(viewer, place) {
  const target = { latitude: place.latitude, longitude: place.longitude };
  const homeNear = (h) => h.point && rules.distanceMeters(h.point, target) <= rules.HOST_RADIUS_METERS;
  if (place.kind === 'home') return;
  if (viewer.homes.some(homeNear)) return;
  if (viewer.gps) {
    const gps = canPostToPlace({
      trustLevel: 'remote_viewer',
      gpsTimestamp: viewer.gps.timestamp,
      gpsLatitude: viewer.gps.latitude,
      gpsLongitude: viewer.gps.longitude,
      targetLatitude: target.latitude,
      targetLongitude: target.longitude,
    });
    if (gps.eligible) return;
  }
  fail(403, 'not_near', 'You can host within 3 miles of where you live or where you are now.');
}

/** A host's limits. Public and private plans are counted apart: a dinner with friends never uses a public slot. */
async function assertHostLimits(userId, { isPrivate = false, seriesDate = false } = {}) {
  const audience = isPrivate ? 'invited' : 'nearby';
  const limits = isPrivate ? rules.PRIVATE_LIMITS : rules.LIMITS;
  const [upcoming, today] = await Promise.all([
    supabaseAdmin.from('Plan').select('post_id, post:Post!inner(event_end_date)', { count: 'exact', head: true })
      .eq('host_user_id', userId).eq('audience', audience).eq('status', 'open').gt('post.event_end_date', nowIso()),
    supabaseAdmin.from('Plan').select('post_id', { count: 'exact', head: true })
      .eq('host_user_id', userId).eq('audience', audience).gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);
  if (upcoming.error || today.error) throw new Error(`Failed to count plans: ${(upcoming.error || today.error).message}`);
  if ((upcoming.count || 0) >= limits.upcomingPlansPerHost) {
    fail(429, 'too_many_plans', isPrivate
      ? `You can host ${limits.upcomingPlansPerHost} upcoming private plans at a time.`
      : 'You can host 3 upcoming plans at a time.');
  }
  // The day's limit is on what a person posts themselves. A series' own next date isn't one of those: the plan
  // it follows has ended, so the series still holds one upcoming slot, as it did.
  if (!seriesDate && (today.count || 0) >= limits.newPlansPerDay) {
    fail(429, 'too_many_plans', isPrivate ? `You can post ${limits.newPlansPerDay} private plans a day.` : 'You can post 5 plans a day.');
  }
}

/**
 * Who the plan is for, from the body: people nearby (the default), or only the people the host invites. A private
 * plan needs its switch and invitations, and is never a business's.
 */
function checkedAudience(viewer, input, hostAs) {
  const audience = oneOf(input.audience, rules.AUDIENCES, 'who can see the plan') || 'nearby';
  if (audience !== 'invited') return 'nearby';
  if (hostAs) fail(422, 'validation', "A business's plan can't be private.");
  if (!viewer.privateFlag) fail(422, 'private_unavailable', "Private plans aren't available yet.");
  return 'invited';
}

// ── Create ───────────────────────────────────────────────────

const UPDATE_PANTOPUS = 'Update Pantopus to do that.';

/**
 * An online plan and the newer kinds: only from an app that can draw them (`more=1`), while their switches are on,
 * and never a business's. A series' own next date carries on whatever the switches say: a plan already posted
 * stays as it is.
 */
function assertMoreAllowed(viewer, { kind, online, hostAs, series = false }) {
  const newKind = rules.NEW_KINDS.includes(kind);
  if (!newKind && !online) return;
  if (!viewer.more) fail(422, 'validation', UPDATE_PANTOPUS);
  if (!series && newKind && !viewer.kindsFlag) fail(422, 'kinds_unavailable', "That kind of plan isn't available yet.");
  if (!series && online && !viewer.onlineFlag) fail(422, 'online_unavailable', "Online plans aren't available yet.");
  if (hostAs && newKind) fail(422, 'validation', "A business can't host that kind of plan.");
  if (hostAs && online) fail(422, 'validation', "A business's plan meets at one of the business's own locations.");
}

/** A new plan's input checked by the hosting rules: what createPlan would save, or a PlanError. */
async function checkedPlanInput(viewer, input, internal = {}) {
  const kind = input.kind;
  if (!rules.ALL_KINDS.includes(kind)) fail(422, 'validation', 'Choose what kind of plan this is.');
  const online = input.place?.kind === 'online';
  assertMoreAllowed(viewer, { kind, online, hostAs: input.host_as != null, series: Boolean(internal.series) });
  // Posting as a business (`host_as`): who may, for which business, where, and what it is called
  // (planBusiness.checkedHostAs). Null for a neighbor's own plan, which is checked exactly as before.
  const hostAs = input.host_as != null ? await planBusiness.checkedHostAs(viewer, input) : null;
  if (!hostAs && kind === 'playdate' && !viewer.playdatesFlag) fail(404, 'not_found', "Playdates aren't available yet.");

  const audience = checkedAudience(viewer, input, hostAs);
  const isPrivate = audience === 'invited';
  const title = cleanTitle(input.title);
  const about = cleanText(input.about, 500, 'About') || '';
  const guestNote = cleanText(input.guest_note, 500, 'The note');
  // A series posts its own next date: up to two months out (a monthly plan), at a place its host already posted at.
  const series = internal.series || null;
  validateTimes(input.starts_at, input.ends_at, hostAs ? { maxDaysAhead: rules.BUSINESS_LIMITS.maxDaysAhead }
    : series ? { maxDaysAhead: planSeries.LIMITS.maxDaysAhead }
      : isPrivate ? { maxDaysAhead: rules.PRIVATE_LIMITS.maxDaysAhead, isPrivate } : {});
  // Room for up to 100 on a private plan a person hosts, with the switch on (H1); else 30.
  const maxSpots = rules.maxSpots({ isPrivate, business: Boolean(hostAs), guestAnswers: viewer.guestAnswersFlag });
  const spots = Number(input.spots);
  if (!Number.isInteger(spots) || spots < 1 || spots > maxSpots) fail(422, 'validation', `Spots can be 1 to ${maxSpots}.`);
  // Kids welcome (H1): guests say how many adults and kids. A person's plan, with the switch on; a playdate has its own.
  const kidsWelcome = !hostAs && kind !== 'playdate' && viewer.guestAnswersFlag && bool(input.kids_welcome, 'Kids welcome') === true;
  // A business's plan is at one of its own locations: no home guard and no 3-mile rule.
  const place = hostAs ? hostAs.place : resolvePlace(viewer, kind, input.place, {
    isPrivate, details: input.details, seriesPoint: series ? series.point || null : null,
  });
  // A private plan may be anywhere: the 3-mile rule keeps the public map honest, and this one isn't on it. An
  // online plan is in the host's own area already.
  if (!hostAs && !isPrivate && !series && place.kind !== 'online') assertHostNear(viewer, place);
  // The people invited to a private plan get in by their invitation: it has no rules of its own.
  const autoRules = hostAs ? hostAs.autoRules : isPrivate ? [] : normalizeAutoRules(kind, place.kind, input.auto_rules);
  // Since November 7 no plan asks for a verified address, whatever this says (askEligibility). A playdate keeps
  // 'verified' because the table's plan_playdate_rules check requires it of a neighbor's.
  const joinRequirement = hostAs ? 'located' : kind === 'playdate' ? 'verified' : isPrivate ? 'located'
    : (oneOf(input.join_requirement, ['located', 'verified'], 'who can ask') || 'located');
  const guestsCanInvite = isPrivate && bool(input.guests_can_invite, 'Guests can bring a friend') === true;
  const resolvedGame = viewer.sportsFlag && kind === 'watch_party'
    ? await require('./planGames').resolveGame(input.details?.game?.id, input.details?.game?.team) : null;
  if (viewer.sportsFlag && kind === 'watch_party' && /^(tsdb|cfbd):/.test(input.details?.game?.id || '') && !resolvedGame) {
    fail(409, 'game_unavailable', 'This game is no longer available. Choose another game or enter your own.');
  }
  const details = normalizeDetails(kind, input.details, resolvedGame);
  // How it repeats: a series' next date carries the series' own pattern; a new plan's comes from the body.
  let repeat = null;
  if (series) {
    repeat = series.repeat;
  } else if (input.repeat !== undefined && input.repeat !== null) {
    if (hostAs) fail(422, 'validation', "A business's plan can't repeat yet. Post each date.");
    if (!viewer.repeatFlag) fail(422, 'repeat_unavailable', "Repeating plans aren't available yet.");
    repeat = planSeries.checkedRepeat(input.repeat, { startsAt: input.starts_at, timezone: placeTimezone(viewer, place) });
  }
  if (hostAs) await planBusiness.assertBusinessLimits(hostAs.business.id);
  else await assertHostLimits(viewer.id, { isPrivate, seriesDate: Boolean(series) });
  const timezone = hostAs ? planPlace.timezoneFor(place.latitude, place.longitude)
    : placeTimezone(viewer, place, { keepTimezone: series ? series.timezone || null : null });
  return { kind, title, about, guestNote, spots, place, autoRules, joinRequirement, details, hostAs, audience, guestsCanInvite, repeat, timezone, kidsWelcome };
}

/**
 * The plan this host posted in the last ten minutes with the same kind, title and
 * start, or null: a second tap on the same "Post plan" (the assistant's card, a
 * retried request) gets the plan already posted instead of a copy.
 */
async function recentSamePlan(hostId, input, { more = false } = {}) {
  const start = new Date(input?.starts_at);
  const title = typeof input?.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : '';
  if (!(more ? rules.ALL_KINDS : rules.KINDS).includes(input?.kind) || !title || Number.isNaN(start.getTime())) return null;
  let query = supabaseAdmin.from('Plan')
    .select('post_id, post:Post!inner(title, event_date)')
    .eq('host_user_id', hostId)
    .eq('kind', input.kind)
    // A private plan posted right after a public one of the same name (or the other way) is its own plan.
    .eq('audience', input.audience === 'invited' ? 'invited' : 'nearby')
    .eq('status', 'open')
    .eq('post.title', title)
    .eq('post.event_date', start.toISOString())
    .gt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());
  // An app that can't draw an online plan never gets one back as its "already posted".
  if (!more) query = query.neq('place_kind', 'online');
  const { data, error } = await query.limit(1);
  if (error) return null;
  return data && data[0] ? data[0].post_id : null;
}

/**
 * What createPlan would save from `input`, checked by the same rules, without
 * saving anything. The assistant's plan card is built from it, so the card never
 * offers a plan the server would refuse.
 */
async function previewPlan(user, input) {
  const viewer = await loadViewer(user, { gps: input.gps });
  const checked = await checkedPlanInput(viewer, input);
  return {
    ...checked,
    startsAt: new Date(input.starts_at).toISOString(),
    endsAt: new Date(input.ends_at).toISOString(),
  };
}

/**
 * @param {object} user   who posts
 * @param {object} input  the request body
 * @param {{ series?: { id: string, index: number, repeat: object, point?: object, timezone?: string } }} [internal]
 *   never from a request: a series posting its own next date (planSeries.postNext), which skips the second-tap
 *   check and the 3-mile rule. An online date keeps the date before's area point and time zone.
 */
async function createPlan(user, input, internal = {}) {
  const viewer = await loadViewer(user, { gps: input.gps });
  // A second tap on the same "Post plan": a neighbor's is caught before the checks, as before; a business's
  // after them, once the person is known to post for that business.
  const secondTap = input.host_as == null && !internal.series ? await recentSamePlan(viewer.id, input, { more: viewer.more }) : null;
  if (secondTap) return planBodyFor(secondTap, viewer);
  const {
    kind, title, about, guestNote, spots, place, autoRules, joinRequirement, details, hostAs, audience, guestsCanInvite, repeat, timezone,
    kidsWelcome,
  } = await checkedPlanInput(viewer, input, internal);
  // The host: the person, or the business they post for. The business's own account is the plan's host and its
  // post's author, so nothing a guest reads names the staff member (who is kept in posted_by_user_id).
  const hostId = hostAs ? hostAs.business.id : viewer.id;
  if (hostAs) {
    const again = await recentSamePlan(hostId, input);
    if (again) return planBodyFor(again, viewer);
  }

  // An online plan with no area is at 0, 0 and is called "Online"; any other plan's area is the jittered point.
  const area = place.noArea ? { latitude: 0, longitude: 0 } : planPlace.areaPointFor(kind, place.latitude, place.longitude);
  // What the area is called when the map can't name it: the host's own city, or for a business's plan the
  // location's (never the home city of the staff member posting).
  const fallbackCity = hostAs ? place.city : place.home?.city || viewer.homes.find((h) => h.city)?.city || null;
  const { label, city } = place.noArea
    ? { label: planPlace.ONLINE_NAME, city: null }
    : await planPlace.areaLabelFor(area, { fallbackCity });
  const startsAt = new Date(input.starts_at).toISOString();
  const endsAt = new Date(input.ends_at).toISOString();
  const placeRef = hostAs ? place.ref : await placeRefOf(place);

  const { data: post, error: postError } = await supabaseAdmin.from('Post').insert({
    user_id: hostId,
    author_user_id: hostId,
    title,
    content: about,
    post_type: 'event',
    post_format: 'standard',
    visibility: 'private',
    visibility_scope: 'neighborhood',
    location_precision: planPlace.locationPrecisionFor(kind),
    latitude: area.latitude,
    longitude: area.longitude,
    effective_latitude: area.latitude,
    effective_longitude: area.longitude,
    location_name: label,
    location_address: null,
    // A plan's post row is never shown as a post: it carries the plan's words, time and area for Plans alone.
    // A business's is written the same way, under the business's account, with none of the fields that list a
    // post on a business's page or its team's posts screen.
    post_as: 'personal',
    audience: 'nearby',
    distribution_targets: ['plans'],
    event_date: startsAt,
    event_end_date: endsAt,
    profile_visibility_scope: 'hidden',
    show_on_profile: false,
    is_visitor_post: false,
    state: 'open',
    post_metadata: { plan: true },
    origin: 'user',
    allow_external_share: false,
  }).select('id').single();
  if (postError) throw new Error(`Failed to save the plan: ${postError.message}`);

  const { error: planError } = await supabaseAdmin.from('Plan').insert({
    post_id: post.id,
    host_user_id: hostId,
    ...(hostAs ? {
      business_user_id: hostId,
      posted_by_user_id: viewer.id,
      business_location_id: place.business_location_id,
      label: hostAs.label,
      guests_can_invite: hostAs.guestsCanInvite,
    } : {}),
    audience,
    ...(audience === 'invited' ? { guests_can_invite: guestsCanInvite } : {}),
    ...(repeat ? {
      repeat,
      series_id: internal.series ? internal.series.id : post.id,
      series_index: internal.series ? internal.series.index : 1,
    } : {}),
    kind,
    spots,
    auto_rules: autoRules,
    join_requirement: joinRequirement,
    place_kind: place.kind,
    area_label: label,
    city,
    details,
    guest_note: guestNote,
    place_name: place.name,
    place_address: place.address,
    place_latitude: place.latitude,
    place_longitude: place.longitude,
    place_home_id: place.home_id,
    place_ref: placeRef,
    // Only an online plan has a link (the table's plan_online_has_link).
    ...(place.kind === 'online' ? { online_link: place.link } : {}),
    ...(kidsWelcome ? { kids_welcome: true } : {}),
    timezone,
    status: 'open',
  });
  if (planError) {
    await supabaseAdmin.from('Post').delete().eq('id', post.id);
    throw new Error(`Failed to save the plan: ${planError.message}`);
  }

  recordFunnelEvent('plan_created', { userId: viewer.id, meta: {
    plan_id: post.id, kind, ...(hostAs ? { business: true } : {}), ...(audience === 'invited' ? { private: true } : {}),
    ...(place.kind === 'online' ? { online: true } : {}),
    ...(repeat ? { repeats: repeat.freq, series_index: internal.series ? internal.series.index : 1 } : {}),
  } });
  if (hostAs) {
    await auditBusinessPlan({ business_user_id: hostId, post_id: post.id }, viewer, 'plans.post', { kind, label: hostAs.label });
    return planBodyFor(post.id, viewer);
  }
  if (planService.isUuid(input.hosted_again_from)) {
    const { data: earlier } = await supabaseAdmin.from('Plan').select('post_id')
      .eq('post_id', input.hosted_again_from).eq('host_user_id', viewer.id).maybeSingle();
    if (earlier) recordFunnelEvent('plan_hosted_again', { userId: viewer.id, meta: { plan_id: post.id, from_plan_id: earlier.post_id, kind } });
  }
  // A private plan's first invitations go out as it is posted (the preview's "Post and invite 2"). The plan is
  // posted either way; what happened to each invitation rides along on the answer, so the app can say.
  const inviteIds = audience === 'invited' && Array.isArray(input.invite_user_ids) ? input.invite_user_ids.slice(0, 30) : [];
  if (inviteIds.length === 0) return planBodyFor(post.id, viewer);
  let invited;
  try {
    const sent = await planInvites.createInvites(user, post.id, { user_ids: inviteIds, confirm_shares_address: true });
    invited = { invite_results: sent.results };
  } catch (err) {
    logger.warn('plans.create.invites_failed', { planId: post.id, error: err.message });
    invited = { invite_results: [], invite_error: err instanceof PlanError ? err.message : "We couldn't send the invitations. Invite them from the plan." };
  }
  return { ...(await planBodyFor(post.id, viewer)), ...invited };
}

// Schedule cards are snapshots. A later provider update or host edit requires
// another review; saving old party times with new game metadata hides the drift.
async function checkedSportsRevision(viewer, plan, revision, cancelling = false) {
  if (revision === undefined) return null;
  const stale = () => fail(409, 'sports_revision_changed', 'The game or your plan changed. Review a new card before saving.');
  if (!viewer.sportsFlag || plan.kind !== 'watch_party' || !revision?.game
    || revision.game.id !== plan.details?.game?.id || revision.game.team !== plan.details?.game?.team
    || revision.plan_updated_at !== plan.updated_at
    || Date.parse(revision.plan_starts_at) !== Date.parse(planService.startsAt(plan))
    || Date.parse(revision.plan_ends_at) !== Date.parse(planService.endsAt(plan))) stale();
  const { games } = await require('../sports/schedule').gamesForTeams([revision.game.team]);
  const current = games.find((game) => game.id === revision.game.id && game.team === revision.game.team);
  const { scheduleRevision, gameDetails } = require('./planGames');
  if (!current || !require('node:util').isDeepStrictEqual(scheduleRevision(current), revision.game)) stale();
  if (cancelling) {
    if (!['cancelled', 'postponed'].includes(current.status)) stale();
    return null;
  }
  if (current.status !== 'scheduled' || current.time_tbd || !current.starts_at || !current.ends_at) stale();
  return gameDetails(current);
}

// ── Edit ─────────────────────────────────────────────────────

async function editPlan(user, postId, patch, { io = null } = {}) {
  const viewer = await loadViewer(user, { gps: patch.gps });
  const plan = await loadHostedPlan(postId, viewer);
  const reviewedGame = await checkedSportsRevision(viewer, plan, patch.sports_revision);
  const state = rules.planState(plan, plan.post.event_date, plan.post.event_end_date);
  if (state === 'ended' || state === 'cancelled') fail(409, 'ended', 'This plan is over, so it can’t change.');

  const postUpdate = {};
  const planUpdate = {};
  let timeMoved = false;
  let placeChanged = false;
  const isPrivate = rules.isPrivate(plan);
  // Making a private plan public would put it on the map for people it was never meant for, and making a public
  // one private would drop the people already asking: who a plan is for is set when it is posted.
  if (patch.audience !== undefined && patch.audience !== (isPrivate ? 'invited' : 'nearby')) {
    fail(422, 'audience_fixed', 'Who can see a plan can’t change after it’s posted.');
  }

  if (patch.title !== undefined) postUpdate.title = cleanTitle(patch.title);
  if (patch.about !== undefined) postUpdate.content = cleanText(patch.about, 500, 'About') || '';
  if (patch.guest_note !== undefined) planUpdate.guest_note = cleanText(patch.guest_note, 500, 'The note');

  if (patch.starts_at !== undefined || patch.ends_at !== undefined) {
    const startsAt = patch.starts_at !== undefined ? patch.starts_at : plan.post.event_date;
    const endsAt = patch.ends_at !== undefined ? patch.ends_at : plan.post.event_end_date;
    const startChanged = new Date(startsAt).getTime() !== new Date(plan.post.event_date).getTime();
    validateTimes(startsAt, endsAt, {
      allowPastStart: state === 'live' && !startChanged,
      ...(plan.business_user_id ? { maxDaysAhead: rules.BUSINESS_LIMITS.maxDaysAhead } : {}),
      ...(isPrivate ? { maxDaysAhead: rules.PRIVATE_LIMITS.maxDaysAhead, isPrivate } : {}),
    });
    postUpdate.event_date = new Date(startsAt).toISOString();
    postUpdate.event_end_date = new Date(endsAt).toISOString();
    const shift = Math.abs(new Date(startsAt).getTime() - new Date(plan.post.event_date).getTime()) / 60000;
    timeMoved = shift > rules.LIMITS.reconfirmShiftMinutes;
  }

  let placeKind = plan.place_kind;
  // Another link for a plan already online: the place changed, in its own words ("Sam changed the link").
  let linkChanged = false;
  // A business's plan moves only between the business's own locations (`business_location_id`).
  if (plan.business_user_id && patch.place !== undefined) {
    fail(422, 'validation', "A business's plan meets at one of the business's own locations.");
  }
  const movingBusiness = Boolean(plan.business_user_id) && patch.business_location_id !== undefined;
  const toOnline = !movingBusiness && patch.place && typeof patch.place === 'object' && patch.place.kind === 'online';
  if (toOnline) {
    // Moving a plan online is posting an online plan: the app must draw it and the switch be on. A plan already
    // online may change its link whatever the switch says.
    if (!viewer.more) fail(422, 'validation', UPDATE_PANTOPUS);
    if (!rules.isOnline(plan) && !viewer.onlineFlag) fail(422, 'online_unavailable', "Online plans aren't available yet.");
  }
  if (toOnline && rules.isOnline(plan)) {
    // The plan keeps its area; only the link changes.
    const parsed = planPlace.parseOnlineLink(patch.place.link, rules.ONLINE_LINK_MAX);
    if (!parsed) fail(422, 'validation', ONLINE_LINK_MESSAGE);
    linkChanged = parsed.link !== plan.online_link;
    placeChanged = linkChanged;
    if (linkChanged) planUpdate.online_link = parsed.link;
  } else if (patch.place !== undefined || movingBusiness) {
    const place = movingBusiness
      ? await planBusiness.placeAt(plan.business, patch.business_location_id)
      : resolvePlace(viewer, plan.kind, patch.place, { moving: true, isPrivate, details: plan.details });
    if (!movingBusiness && !isPrivate && place.kind !== 'online') assertHostNear(viewer, place);
    placeKind = place.kind;
    placeChanged = place.kind !== plan.place_kind
      || String(place.home_id || '') !== String(plan.place_home_id || '')
      || rules.distanceMeters(place, { latitude: plan.place_latitude, longitude: plan.place_longitude }) > 25
      || (place.name || '') !== (plan.place_name || '');
    const area = place.noArea ? { latitude: 0, longitude: 0 } : planPlace.areaPointFor(plan.kind, place.latitude, place.longitude);
    const fallbackCity = movingBusiness ? place.city || plan.city || null : place.home?.city || plan.city || null;
    const { label, city } = place.noArea
      ? { label: planPlace.ONLINE_NAME, city: null }
      : await planPlace.areaLabelFor(area, { fallbackCity });
    Object.assign(planUpdate, {
      place_kind: place.kind,
      place_name: place.name,
      place_address: place.address,
      place_latitude: place.latitude,
      place_longitude: place.longitude,
      place_home_id: place.home_id,
      // The key follows the place: a move to a place typed by hand, or to a home, clears it.
      place_ref: movingBusiness ? place.ref : await placeRefOf(place),
      ...(movingBusiness ? { business_location_id: place.business_location_id } : {}),
      // Moving online sets the link; moving back to a place clears it (plan_online_has_link).
      ...(place.kind === 'online' || rules.isOnline(plan) ? { online_link: place.kind === 'online' ? place.link : null } : {}),
      area_label: label,
      city,
      timezone: movingBusiness ? planPlace.timezoneFor(place.latitude, place.longitude)
        : placeTimezone(viewer, place, { keepTimezone: rules.timezoneForPlan(plan) }),
    });
    Object.assign(postUpdate, {
      latitude: area.latitude,
      longitude: area.longitude,
      effective_latitude: area.latitude,
      effective_longitude: area.longitude,
      location_name: label,
    });
  }

  const requests = await activeRequests(postId);
  const going = await seatsNow(plan, requests);
  let spotsGrew = false;
  if (patch.spots !== undefined) {
    const maxSpots = rules.maxSpots({ isPrivate, business: Boolean(plan.business_user_id), guestAnswers: viewer.guestAnswersFlag });
    const spots = Number(patch.spots);
    if (!Number.isInteger(spots) || spots < 1 || spots > maxSpots) fail(422, 'validation', `Spots can be 1 to ${maxSpots}.`);
    if (spots < going) fail(422, 'validation', `${going} ${going === 1 ? 'person is' : 'people are'} in, so spots can’t go below that.`);
    spotsGrew = spots > plan.spots;
    planUpdate.spots = spots;
  }
  if (plan.business_user_id) {
    if (patch.auto_rules !== undefined) planUpdate.auto_rules = planBusiness.checkedAutoRules(patch.auto_rules);
    if (patch.label !== undefined) planUpdate.label = planBusiness.checkedLabel(plan.kind, patch.label);
    if (patch.guests_can_invite !== undefined) {
      planUpdate.guests_can_invite = planBusiness.checkedGuestsCanInvite(patch.guests_can_invite) === true;
    }
  } else if (isPrivate) {
    if (patch.guests_can_invite !== undefined) {
      planUpdate.guests_can_invite = bool(patch.guests_can_invite, 'Guests can bring a friend') === true;
    }
  } else if (patch.auto_rules !== undefined || patch.place !== undefined) {
    planUpdate.auto_rules = normalizeAutoRules(plan.kind, placeKind, patch.auto_rules !== undefined ? patch.auto_rules : plan.auto_rules);
  }
  // How it repeats, from this date on: a new pattern, or null to stop (this date stays; none follows).
  if (patch.repeat !== undefined) {
    if (patch.repeat === null) {
      planUpdate.repeat = null;
    } else {
      if (plan.business_user_id) fail(422, 'validation', "A business's plan can't repeat yet. Post each date.");
      if (!plan.repeat && !viewer.repeatFlag) fail(422, 'repeat_unavailable', "Repeating plans aren't available yet.");
      // The new pattern starts at this date, whichever date of its series it is: its days, its year and its
      // count are measured from here, and the dates before it stay counted ("5 of 16").
      planUpdate.repeat = planSeries.checkedRepeat(patch.repeat, {
        startsAt: postUpdate.event_date || plan.post.event_date,
        timezone: planUpdate.timezone || rules.timezoneForPlan(plan),
        before: plan.series_id ? (plan.series_index || 1) - 1 : 0,
      });
      if (!plan.series_id) Object.assign(planUpdate, { series_id: plan.post_id, series_index: 1 });
    }
  }
  // Kids welcome (H1): with the switch on, on a person's plan that isn't a playdate.
  if (patch.kids_welcome !== undefined && viewer.guestAnswersFlag && !plan.business_user_id && plan.kind !== 'playdate') {
    planUpdate.kids_welcome = bool(patch.kids_welcome, 'Kids welcome') === true;
  }
  if (patch.join_requirement !== undefined && plan.kind !== 'playdate' && !plan.business_user_id && !isPrivate) {
    planUpdate.join_requirement = oneOf(patch.join_requirement, ['located', 'verified'], 'who can ask');
  }
  if (patch.details !== undefined) {
    const resolvedGame = reviewedGame || (viewer.sportsFlag && plan.kind === 'watch_party'
      ? await require('./planGames').resolveGame(patch.details?.game?.id, patch.details?.game?.team) : null);
    if (viewer.sportsFlag && plan.kind === 'watch_party' && /^(tsdb|cfbd):/.test(patch.details?.game?.id || '') && !resolvedGame) {
      fail(409, 'game_unavailable', 'This game is no longer available. Choose another game or enter your own.');
    }
    planUpdate.details = normalizeDetails(plan.kind, patch.details, resolvedGame);
  }

  // A plan moved to another time is reminded again (when its new reminder time is still
  // ahead) and, moved to a later day, gets that day's morning summary.
  const tz = planUpdate.timezone || rules.timezoneForPlan(plan);
  let remindAgain = false;
  if (timeMoved) {
    remindAgain = rules.reminderAt(postUpdate.event_date, tz).getTime() > Date.now();
    const newDay = rules.localParts(new Date(postUpdate.event_date), tz).date;
    const oldDay = rules.localParts(new Date(plan.post.event_date), tz).date;
    if (newDay !== oldDay && newDay > rules.localParts(new Date(), tz).date) planUpdate.host_summary_sent_at = null;
  }

  const stamp = nowIso();
  if (Object.keys(postUpdate).length > 0) {
    const { error } = await supabaseAdmin.from('Post').update({ ...postUpdate, updated_at: stamp, is_edited: true, edited_at: stamp }).eq('id', postId);
    if (error) throw new Error(`Failed to save the change: ${error.message}`);
  }
  if (Object.keys(planUpdate).length > 0) {
    const { error } = await supabaseAdmin.from('Plan').update({ ...planUpdate, updated_at: stamp }).eq('post_id', postId);
    if (error) throw new Error(`Failed to save the change: ${error.message}`);
  }
  if (postUpdate.title && postUpdate.title !== plan.post.title) await planChat.renameRoom(plan, postUpdate.title);

  const updated = await planService.loadPlanRow(postId);
  if (timeMoved || placeChanged) {
    const accepted = requests.filter((r) => r.status === 'accepted');
    if (accepted.length > 0) {
      const { error } = await supabaseAdmin.from('PlanRequest')
        .update({
          reconfirm_requested_at: stamp,
          reconfirmed: null,
          reconfirm_reason: timeMoved && placeChanged ? 'both' : timeMoved ? 'time' : 'place',
          updated_at: stamp,
          ...(remindAgain ? { reminded_at: null } : {}),
        })
        .eq('post_id', postId).eq('status', 'accepted');
      if (error) throw new Error(`Failed to ask "Still coming?": ${error.message}`);
      const hostFirst = await hostFirstOf(updated);
      for (const request of accepted) {
        await planNotify.changed({ plan: updated, request, hostFirst, timeMoved, placeChanged, linkChanged });
      }
      if (updated.chat_room_id) {
        // "Sam moved the plan to Sunday at 2:00 PM", in the push's words.
        const when = planNotify.whenText(updated.post.event_date, updated.timezone, { long: true, at: true });
        await planChat.systemLine(updated.chat_room_id, updated.host_user_id,
          timeMoved && placeChanged ? `${hostFirst} moved the plan to ${when}, ${planNotify.newPlaceWords(updated, linkChanged)}`
            : timeMoved ? `${hostFirst} moved the plan to ${when}` : `${hostFirst} changed the ${linkChanged ? 'link' : 'place'}`);
      }
    }
  }
  // Guests without an account who are in (H1): their page says what changed, and one email goes.
  if (timeMoved || placeChanged) {
    await planGuests.planChanged(updated, { timeMoved, placeChanged }).catch((err) => logger.warn('plans.edit.guests_failed', { planId: postId, error: err.message }));
  }
  if (spotsGrew) await offerOpenSpots(updated, { io });
  await auditBusinessPlan(plan, viewer, 'plans.edit', { fields: [...Object.keys(postUpdate), ...Object.keys(planUpdate)] });
  return planBodyFor(postId, viewer);
}

// ── Cancel ───────────────────────────────────────────────────

/**
 * `repeat` (a repeating plan): 'keep' cancels this date only and posts the next one now ("Skip Thursday"); anything
 * else, and every app from before repeating plans, cancels this date and stops the series.
 */
async function cancelPlan(user, postId, { note, sports_revision: sportsRevision, repeat: afterwards } = {}) {
  const viewer = await loadViewer(user);
  const plan = await loadHostedPlan(postId, viewer);
  if (plan.status === 'cancelled') return planBodyFor(postId, viewer);
  await checkedSportsRevision(viewer, plan, sportsRevision, true);
  const state = rules.planState(plan, plan.post.event_date, plan.post.event_end_date);
  if (state === 'ended') fail(409, 'ended', 'This plan is already over.');
  const cancelNote = cleanText(note, 280, 'The note');
  if (await cancelOpenPlan(plan, { hostFirst: await hostFirstOf(plan), cancelNote })) {
    await auditBusinessPlan(plan, viewer, 'plans.cancel');
    if (plan.repeat && afterwards === 'keep') {
      const next = await planSeries.postNext(plan).catch((err) => {
        logger.warn('plans.cancel.next_failed', { planId: postId, error: err.message });
        return { posted: null };
      });
      // The app opens the date that took its place.
      return { ...(await planBodyFor(postId, viewer)), next_plan_id: next.posted || null };
    }
    if (plan.repeat) {
      const { error } = await supabaseAdmin.from('Plan').update({ repeat: null, updated_at: nowIso() }).eq('post_id', postId);
      if (error) logger.warn('plans.cancel.stop_failed', { planId: postId, error: error.message });
    }
  }
  return planBodyFor(postId, viewer);
}

/**
 * Cancels an open plan and tells everyone: the people waiting stop waiting, the chat gets its line and closes,
 * and the people who were in, waiting or invited get the notice. False when the plan wasn't open any more.
 */
async function cancelOpenPlan(plan, { hostFirst, cancelNote }) {
  const postId = plan.post_id;
  const stamp = nowIso();
  const requests = await activeRequests(postId);
  const { data: cancelled, error } = await supabaseAdmin.from('Plan')
    .update({ status: 'cancelled', cancelled_at: stamp, cancel_note: cancelNote, updated_at: stamp })
    .eq('post_id', postId).eq('status', 'open').select('post_id');
  if (error) throw new Error(`Failed to cancel: ${error.message}`);
  if (!cancelled || cancelled.length === 0) return false;

  // People still waiting stop waiting; people who were in keep their place in the record.
  const { error: expireError } = await supabaseAdmin.from('PlanRequest')
    .update({ status: 'expired', updated_at: stamp })
    .eq('post_id', postId).in('status', ['pending', 'waitlisted']);
  if (expireError) logger.warn('plans.cancel.expire_failed', { postId, error: expireError.message });

  if (plan.chat_room_id) {
    await planChat.systemLine(plan.chat_room_id, plan.host_user_id, `${hostFirst} cancelled the plan`);
  }
  await planChat.closeRoom(plan);
  const updated = await planService.loadPlanRow(postId);
  for (const request of requests) {
    await planNotify.cancelled({ plan: updated, request, hostFirst, note: cancelNote, wasIn: request.status === 'accepted' });
  }
  await planInvites.notifyCancelled(updated, hostFirst, cancelNote);
  // Guests without an account who are in (H1): the one email about it.
  await planGuests.planCancelled(updated, cancelNote)
    .catch((err) => logger.warn('plans.cancel.guests_failed', { postId, error: err.message }));
  return true;
}

const BUSINESS_GONE_NOTE = 'This business is no longer on Pantopus.';

/**
 * A business that has left Pantopus (its account is no longer a business) has nobody to run its plans, so the
 * ones still open are cancelled and everyone in, waiting or invited is told (the Plans tick calls this). A
 * business that is only unpublished, unverified or switched off keeps its plans: they are hidden from new
 * people, and its team can still cancel them.
 * @param {object} plan  a plan row with `business` attached and null (planBusiness.attachBusinessHosts)
 */
async function cancelForGoneBusiness(plan) {
  // Only a row whose business was looked up and found gone: `business` is null. A row nobody attached one to
  // (undefined) is left alone.
  if (!plan || !plan.business_user_id || plan.business !== null) return false;
  return cancelOpenPlan(plan, { hostFirst: 'The host', cancelNote: BUSINESS_GONE_NOTE });
}

// ── Capacity, rules and the waitlist ─────────────────────────

/**
 * After a write that may have filled the plan: seats go to accepted requests in
 * the order they were decided; anyone past the capacity goes back to the
 * waitlist. Returns the ids sent back.
 */
async function enforceCapacity(plan) {
  const requests = await activeRequests(plan.post_id);
  const accepted = requests
    .filter((r) => r.status === 'accepted')
    .sort((a, b) => (new Date(a.decided_at || a.created_at) - new Date(b.decided_at || b.created_at)) || String(a.id).localeCompare(String(b.id)));
  // Guests without an account hold their seats first: they have no waitlist to go back to.
  let seats = await planGuests.guestSeats(plan.post_id);
  const overflow = [];
  for (const request of accepted) {
    seats += rules.seatsFor(plan, request.party_size, request.kids_count);
    if (seats > plan.spots) overflow.push(request.id);
  }
  if (overflow.length > 0) {
    const { error } = await supabaseAdmin.from('PlanRequest')
      .update({ status: 'waitlisted', decided_by: null, decided_at: null, updated_at: nowIso() })
      .in('id', overflow).eq('status', 'accepted');
    if (error) throw new Error(`Failed to keep the plan to its spots: ${error.message}`);
  }
  return new Set(overflow);
}

/** Whether a rule, or the host's invitation, lets this person in now (for someone already in line). */
async function ruleFor(plan, userId) {
  const invite = (await planInvites.viewerInvites(String(userId), [plan.post_id])).get(plan.post_id);
  if (invite && invite.status === 'accepted' && !invite.needs_host_ok) return 'invite';
  const autoRules = Array.isArray(plan.auto_rules) ? plan.auto_rules : [];
  // A business's plan: "right away, anyone", or the business approves each (planService.matchingAutoRule).
  if (plan.business_user_id) return autoRules.includes('open') ? 'open' : null;
  if (plan.kind === 'playdate' || autoRules.length === 0) return null;
  if (autoRules.includes('hosted_before')) {
    const stats = await planService.requesterStats(plan.host_user_id, [userId]);
    if (stats.get(String(userId))?.hosted_before) return 'hosted_before';
  }
  if (plan.place_kind === 'home') return null;
  if (autoRules.includes('verified') && (await verifiedUserIds([userId])).has(String(userId))) return 'verified';
  // They were nearby when they asked (asking checks the location).
  if (autoRules.includes('anyone_nearby') && ['pickup_game', 'walk_coffee'].includes(plan.kind)) return 'anyone_nearby';
  return null;
}

/**
 * Someone who leaves or is removed is out of the plan's chat before their request changes, so a failure leaves
 * them in the plan and doing it again finishes the job, never an "out" answer while they can still read the room.
 */
async function leaveChat(plan, userId, { io, message }) {
  try {
    await planChat.removeMember(plan.chat_room_id, userId, { io });
  } catch (err) {
    logger.error('plans.chat.remove_failed', { planId: plan.post_id, error: err.message });
    fail(503, 'unavailable', message);
  }
}

/** Let someone in: the chat, the grey line, the notice. When a rule did it, the host hears who is in. */
async function admit(plan, request, { byRule, hostFirst, io, viaWaitlist = false, rule = null }) {
  const roomId = await planChat.ensureRoom(plan, { io });
  await planChat.addMember(roomId, request.user_id, { io });
  const names = await userNames([request.user_id]);
  const who = partyLabel(names.get(String(request.user_id)), rules.seatsFor(plan, request.party_size, request.kids_count));
  await planChat.systemLine(roomId, byRule ? request.user_id : plan.host_user_id,
    byRule ? `${who} ${who.includes(' + ') ? 'are' : 'is'} in` : `${hostFirst} let in ${who}`);
  if (viaWaitlist) {
    await planNotify.spotOpened({ plan, request, hostFirst, nowIn: true });
  } else {
    await planNotify.accepted({ plan, request, hostFirst, byRule });
  }
  if (byRule) {
    await activeRequests(plan.post_id)
      .then(async (requests) => planNotify.guestAutoJoined({
        plan, request, guestName: who, rule, goingCount: await seatsNow(plan, requests), viaWaitlist,
      }))
      .catch((err) => logger.warn('plans.notify.auto_joined_failed', { planId: plan.post_id, error: err.message }));
  }
  recordFunnelEvent('plan_accepted', { userId: request.user_id, meta: { plan_id: plan.post_id, kind: plan.kind, by: byRule ? 'rule' : 'host' } });
}

/**
 * A spot opened: the first person waiting gets it if a rule lets them in,
 * otherwise the host is asked. Only while asking is open.
 */
async function offerOpenSpots(plan, { io = null } = {}) {
  if (!rules.isAskingOpen(plan, plan.post.event_date, plan.post.event_end_date)) return;
  const hostFirst = await hostFirstOf(plan);
  for (let round = 0; round < 30; round += 1) {
    const requests = await activeRequests(plan.post_id);
    const spotsLeft = plan.spots - (await seatsNow(plan, requests));
    if (spotsLeft <= 0) return;
    const next = planService.waitlistOrder(requests).find((r) => rules.seatsFor(plan, r.party_size, r.kids_count) <= spotsLeft);
    if (!next) return;
    const rule = await ruleFor(plan, next.user_id);
    const stamp = nowIso();
    if (rule) {
      const { data: moved } = await supabaseAdmin.from('PlanRequest')
        .update({ status: 'accepted', decided_by: 'rule', decided_at: stamp, updated_at: stamp })
        .eq('id', next.id).eq('status', 'waitlisted').select(planService.REQUEST_COLUMNS);
      if (!moved || moved.length === 0) continue;
      const overflow = await enforceCapacity(plan);
      if (overflow.has(next.id)) return;
      await admit(plan, moved[0], { byRule: true, hostFirst, io, viaWaitlist: true, rule });
      continue;
    }
    const { data: moved } = await supabaseAdmin.from('PlanRequest')
      .update({ status: 'pending', updated_at: stamp })
      .eq('id', next.id).eq('status', 'waitlisted').select(planService.REQUEST_COLUMNS);
    if (!moved || moved.length === 0) continue;
    await planNotify.spotOpened({ plan, request: moved[0], hostFirst, nowIn: false });
    const names = await userNames([next.user_id]);
    await planNotify.requestReceived({ plan, request: moved[0], hostFirst, requesterFirst: firstOf(names.get(String(next.user_id))) });
    return;
  }
}

// ── Asking ───────────────────────────────────────────────────

/**
 * @param {{ guestAnswers?: boolean }} [opts]  the host has the switch (H1): a private plan takes up to 10 people in one
 *   answer, and a plan with kids welcome takes adults (party_size) and kids (kids_count).
 */
function cleanAsk(plan, body, { guestAnswers = false } = {}) {
  const out = {};
  if (plan.kind === 'playdate') {
    out.party_size = 1;
    const kids = Number(body.kids_count);
    if (!Number.isInteger(kids) || kids < 1 || kids > 8) fail(422, 'validation', 'How many kids are coming?');
    const bands = Array.isArray(body.kids_age_bands) ? [...new Set(body.kids_age_bands)] : [];
    if (bands.length === 0 || bands.some((b) => !rules.KIDS_AGE_BANDS.includes(b))) fail(422, 'validation', 'Choose your kids’ ages.');
    if (body.stays_with_kids !== true) fail(422, 'validation', 'Parents stay with their kids at playdates.');
    out.kids_count = kids;
    out.kids_age_bands = rules.KIDS_AGE_BANDS.filter((b) => bands.includes(b));
    out.stays_with_kids = true;
  } else {
    const max = guestAnswers && rules.isPrivate(plan) ? rules.PRIVATE_PARTY_MAX : rules.PARTY_MAX;
    const party = body.party_size === undefined ? 1 : Number(body.party_size);
    if (!Number.isInteger(party) || party < 1 || party > max) fail(422, 'validation', `You can bring up to ${max - 1} people.`);
    out.party_size = party;
    if (guestAnswers && plan.kids_welcome) {
      const kids = body.kids_count === undefined || body.kids_count === null ? 0 : Number(body.kids_count);
      if (!Number.isInteger(kids) || kids < 0 || kids > rules.PRIVATE_PARTY_MAX) fail(422, 'validation', 'Kids can be 0 to 10.');
      // A public plan keeps one answer to 4 seats, kids included.
      if (!rules.isPrivate(plan) && party + kids > rules.PARTY_MAX) fail(422, 'validation', 'You can bring up to 3 people.');
      out.kids_count = kids > 0 ? kids : null;
    }
  }
  out.note = cleanText(body.note, 280, 'Your hello');
  return out;
}

/**
 * Where the person lives (or is), as a band from the exact place: what the host sees. Someone invited from farther
 * away than the bands go has none (asking is within 5 miles, so everyone else is "about 5 mi" at most).
 */
function requesterBand(plan, viewer, { invited = false } = {}) {
  const exact = { latitude: Number(plan.place_latitude), longitude: Number(plan.place_longitude) };
  const homes = viewer.homes.filter((h) => h.point).map((h) => h.point);
  const points = homes.length > 0 ? homes : viewer.locations;
  let best = null;
  for (const point of points) {
    const d = rules.distanceMeters(point, exact);
    if (d != null && (best == null || d < best)) best = d;
  }
  if (invited) return rules.distanceBandFromMeters(best) || null;
  return rules.distanceBandFromMeters(best) || (best != null ? 'about_5_mi' : null);
}

async function requestResult(postId, viewer, requestId) {
  const plan = await planBodyFor(postId, viewer);
  const request = plan?.my_request && plan.my_request.id === requestId ? plan.my_request : null;
  return {
    request: request ? { id: request.id, status: request.status, waitlist_position: request.waitlist_position } : null,
    plan,
  };
}

async function askToJoin(user, postId, body, { io = null } = {}) {
  const viewer = await loadViewer(user, { gps: body.gps });
  const plan = await loadVisiblePlan(postId, viewer);
  if (planBusiness.runsPlan(plan, viewer)) fail(409, 'host', "You're hosting this plan.");
  // A business that may no longer host takes nobody new, and nobody waiting moves up by asking again.
  if (plan.business_user_id && !planBusiness.hostsNow(plan)) fail(409, 'ended', REASON_ERRORS.ended[1]);
  const ctx = await planService.loadCardContext([plan], viewer);
  const mine = ctx.myRequestByPlan.get(postId) || null;
  const waiting = mine && (mine.status === 'pending' || mine.status === 'waitlisted');
  // A second ask while waiting changes only what it sends; the rest stays as asked.
  const keep = (key) => (body[key] !== undefined ? body[key] : mine[key]);
  const guestAnswers = await planGuests.switchFor(plan.host_user_id);
  const ask = cleanAsk(plan, waiting
    ? { party_size: keep('party_size'), note: keep('note'), kids_count: keep('kids_count'), kids_age_bands: keep('kids_age_bands'), stays_with_kids: keep('stays_with_kids') }
    : body, { guestAnswers });
  const stamp = nowIso();

  // Already in line: a second ask changes who's coming and the hello. It doesn't use an ask.
  if (waiting) {
    const { error } = await supabaseAdmin.from('PlanRequest').update({ ...ask, updated_at: stamp }).eq('id', mine.id);
    if (error) throw new Error(`Failed to update your request: ${error.message}`);
    return { status: 200, body: await requestResult(postId, viewer, mine.id) };
  }
  if (mine && mine.status === 'accepted') return { status: 200, body: await requestResult(postId, viewer, mine.id) };

  const requests = ctx.requestsByPlan.get(postId) || [];
  const spotsLeft = plan.spots - (await seatsNow(plan, requests));
  const state = rules.planState(plan, plan.post.event_date, plan.post.event_end_date);
  const eligibility = planService.askEligibility(plan, viewer, ctx, { myRequest: mine, spotsLeft, state });
  if (!eligibility.can_ask && eligibility.cannot_ask_reason !== 'full_use_waitlist') {
    const [status, message] = REASON_ERRORS[eligibility.cannot_ask_reason] || [403, "You can't ask to join this plan."];
    fail(status, eligibility.cannot_ask_reason || 'cannot_ask', message);
  }

  // The host's invitation is their yes: in at once (the waitlist when it's full), or, for an email invite opened by
  // an account the address isn't verified for, an ordinary ask the host answers.
  const invite = ctx.myInviteByPlan.get(postId) || null;
  const seats = rules.seatsFor(plan, ask.party_size, ask.kids_count);
  let status = 'waitlisted';
  let decidedBy = null;
  let rule = null;
  if (seats <= spotsLeft) {
    rule = invite ? (invite.needs_host_ok ? null : 'invite') : planService.matchingAutoRule(plan, viewer, ctx);
    if (rule) {
      status = 'accepted';
      decidedBy = 'rule';
    } else {
      status = 'pending';
    }
  }
  const row = {
    ...ask,
    status,
    decided_by: decidedBy,
    decided_at: decidedBy ? stamp : null,
    // A business never learns how far away a guest lives: nothing is saved for its plans. Nor for an online plan,
    // which nobody travels to.
    distance_band: plan.business_user_id || rules.isOnline(plan) ? null : requesterBand(plan, viewer, { invited: Boolean(invite) }),
    // How the guest arrived at a business's plan (planBusiness.wayInFor). Null on a neighbor's plan.
    ...(plan.business_user_id ? { way_in: await planBusiness.wayInFor(plan, viewer.id, body.via, { invite }) } : {}),
    queued_at: stamp,
    reconfirm_requested_at: null,
    reconfirmed: null,
    reconfirm_reason: null,
    on_my_way_at: null,
    updated_at: stamp,
  };

  let request;
  if (mine) {
    // Asking again after withdrawing, leaving or expiring; invited again after a no or a removal.
    const again = invite ? ['withdrawn', 'left', 'expired', 'declined', 'removed'] : ['withdrawn', 'left', 'expired'];
    const { data, error } = await supabaseAdmin.from('PlanRequest')
      .update({ ...row, ask_count: Math.min(rules.LIMITS.asksPerPlan, (mine.ask_count || 1) + 1) })
      .eq('id', mine.id).in('status', again).select(planService.REQUEST_COLUMNS);
    if (error) throw new Error(`Failed to send your request: ${error.message}`);
    if (!data || data.length === 0) return { status: 200, body: await requestResult(postId, viewer, mine.id) };
    request = data[0];
  } else {
    const { data, error } = await supabaseAdmin.from('PlanRequest')
      .insert({ ...row, post_id: postId, user_id: viewer.id, ask_count: 1, created_at: stamp })
      .select(planService.REQUEST_COLUMNS).single();
    if (error) {
      if (error.code === '23505') {
        const again = await loadViewer(user, { gps: body.gps });
        const { body: planBody } = await planService.getForViewer(postId, again);
        return { status: 200, body: { request: planBody?.my_request ? { id: planBody.my_request.id, status: planBody.my_request.status, waitlist_position: planBody.my_request.waitlist_position } : null, plan: planBody } };
      }
      throw new Error(`Failed to send your request: ${error.message}`);
    }
    request = data;
  }

  recordFunnelEvent('plan_requested', { userId: viewer.id, meta: {
    plan_id: postId, kind: plan.kind, status: request.status, ...(plan.business_user_id ? { business: true, way_in: row.way_in } : {}),
  } });
  if (invite) await planInvites.markAccepted(plan, viewer.id, request);
  const names = await userNames([viewer.id]);
  const hostFirst = await hostFirstOf(plan);
  if (request.status === 'accepted') {
    const overflow = await enforceCapacity(plan);
    if (!overflow.has(request.id)) {
      await admit(plan, request, { byRule: true, hostFirst, io, rule });
    }
  } else if (request.status === 'pending') {
    await planNotify.requestReceived({
      plan, request, hostFirst, requesterFirst: firstOf(names.get(viewer.id)),
      invitedEmail: invite?.needs_host_ok ? invite.email : null,
    });
  }
  return { status: mine ? 200 : 201, body: await requestResult(postId, viewer, request.id) };
}

/** Withdraw (pending or waitlisted) or leave (accepted). */
async function withdrawMine(user, postId, { io = null, reason = 'withdraw' } = {}) {
  const viewer = await loadViewer(user);
  const plan = await loadVisiblePlan(postId, viewer);
  const { data: mine, error } = await supabaseAdmin.from('PlanRequest')
    .select(planService.REQUEST_COLUMNS).eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (error) throw new Error(`Failed to load your request: ${error.message}`);
  if (!mine) fail(404, 'not_found', "You haven't asked to join this plan.");
  if (!['pending', 'waitlisted', 'accepted'].includes(mine.status)) return requestResult(postId, viewer, mine.id);

  const stamp = nowIso();
  const leaving = mine.status === 'accepted';
  if (leaving) await leaveChat(plan, viewer.id, { io, message: "We couldn't take you out of the plan. Please try again." });
  const patch = { status: leaving ? 'left' : 'withdrawn', updated_at: stamp };
  if (reason === 'not_coming') patch.reconfirmed = false;
  const { data: changed, error: updateError } = await supabaseAdmin.from('PlanRequest')
    .update(patch).eq('id', mine.id).eq('status', mine.status).select('id');
  if (updateError) throw new Error(`Failed to update your request: ${updateError.message}`);
  if (changed && changed.length > 0 && leaving) {
    const names = await userNames([viewer.id]);
    const who = partyLabel(names.get(viewer.id), rules.seatsFor(plan, mine.party_size, mine.kids_count));
    if (plan.chat_room_id) {
      await planChat.systemLine(plan.chat_room_id, viewer.id, `${who} can't make it`);
    }
    // The host hears it before a spot goes to someone waiting (who then has their own notice).
    await activeRequests(postId)
      .then(async (requests) => planNotify.guestLeft({ plan, request: mine, guestName: who, goingCount: await seatsNow(plan, requests) }))
      .catch((err) => logger.warn('plans.notify.guest_left_failed', { planId: postId, error: err.message }));
    await offerOpenSpots(plan, { io });
  }
  return requestResult(postId, viewer, mine.id);
}

// ── Host decisions ───────────────────────────────────────────

async function listRequests(user, postId) {
  const viewer = await loadViewer(user);
  const plan = await loadHostedPlan(postId, viewer);
  const requests = (await activeRequests(postId))
    .filter((r) => r.status === 'pending' || r.status === 'waitlisted')
    .filter((r) => !viewer.blockedUserIds.has(String(r.user_id)));
  const userIds = requests.map((r) => String(r.user_id));
  const [users, names, people, verified, stats, mutual, invites] = await Promise.all([
    userIds.length ? supabaseAdmin.from('User').select('id, profile_picture_url, created_at').in('id', userIds) : { data: [] },
    userNames(userIds),
    loadChatPeople(userIds),
    verifiedUserIds(userIds),
    planService.requesterStats(plan.host_user_id, userIds),
    // Connections are a person's: a business's team sees none.
    plan.business_user_id ? new Map() : planService.mutualConnectionCounts(viewer.id, userIds),
    userIds.length
      ? supabaseAdmin.from('PlanInvite').select('invitee_user_id, channel, email, needs_host_ok')
        .eq('post_id', postId).in('invitee_user_id', userIds).neq('status', 'cancelled')
      : { data: [] },
  ]);
  if (users.error) throw new Error(`Failed to load people: ${users.error.message}`);
  const userRows = new Map((users.data || []).map((u) => [String(u.id), u]));
  // Asks that came through the host's invitations: "You invited them", or the address an opened email was for.
  const inviteByUser = new Map();
  for (const invite of (invites.error ? [] : invites.data) || []) inviteByUser.set(String(invite.invitee_user_id), invite);
  const view = (r) => {
    const id = String(r.user_id);
    const row = userRows.get(id);
    const stat = stats.get(id) || { plans_joined: 0, hosted_before: false };
    // A business's team sees less than a neighbor host: a first name, who is coming and their note, and whether
    // they have been before. Never a last initial, how far away they live, their address standing, their
    // connections or what else they have joined.
    const forBusiness = Boolean(plan.business_user_id);
    return {
      id: r.id,
      user: {
        user_id: id,
        display_name: forBusiness ? firstOf(names.get(id)) : names.get(id) || planService.NO_NAME,
        avatar_url: planService.avatarUrl(planService.withLocalAvatar(row || { id }, people)),
        verified_address: forBusiness ? false : verified.has(id),
        distance_band: forBusiness ? null : r.distance_band || null,
        plans_joined: forBusiness ? 0 : stat.plans_joined,
        mutual_connections: mutual.get(id) || 0,
        hosted_before: stat.hosted_before,
        new_to_pantopus: forBusiness ? false
          : Boolean(row?.created_at) && Date.now() - new Date(row.created_at).getTime() < 30 * 24 * 60 * 60 * 1000,
      },
      party_size: r.party_size,
      note: r.note || null,
      // A playdate's kids, or with kids welcome (H1, `guests=1`) how many kids come with them.
      kids_count: plan.kind === 'playdate' || (viewer.guests && plan.kids_welcome) ? r.kids_count ?? null : null,
      kids_age_bands: plan.kind === 'playdate' ? r.kids_age_bands || [] : null,
      created_at: planService.iso(r.queued_at || r.created_at),
      invited: inviteByUser.has(id),
      opened_invite_to: inviteByUser.get(id)?.needs_host_ok ? inviteByUser.get(id).email : null,
    };
  };
  const byQueue = (a, b) => new Date(a.queued_at) - new Date(b.queued_at);
  return {
    pending: requests.filter((r) => r.status === 'pending').sort(byQueue).map(view),
    waitlisted: planService.waitlistOrder(requests).map(view),
  };
}

async function decide(user, postId, requestId, action, body = {}, { io = null } = {}) {
  const viewer = await loadViewer(user);
  const plan = await loadHostedPlan(postId, viewer);
  const request = await loadRequest(requestId, postId);
  const stamp = nowIso();
  const hostFirst = await hostFirstOf(plan);
  const state = rules.planState(plan, plan.post.event_date, plan.post.event_end_date);

  if (action === 'accept') {
    if (request.status === 'accepted') return requestResult(postId, viewer, null).then((r) => ({ ...r, request: { id: request.id, status: 'accepted' } }));
    if (!['pending', 'waitlisted'].includes(request.status)) fail(409, 'not_waiting', 'This person is no longer waiting.');
    if (state === 'ended' || state === 'cancelled') fail(409, 'ended', 'This plan is over.');
    if (plan.place_kind === 'home' && body.confirm_shares_address !== true) {
      const { count } = await supabaseAdmin.from('PlanRequest').select('id', { count: 'exact', head: true })
        .eq('post_id', postId).eq('decided_by', 'host').in('status', ['accepted', 'left', 'removed']);
      if (!count) fail(409, 'confirm_shares_address', 'Accepting shares your address with them.');
    }
    const requests = await activeRequests(postId);
    const spotsLeft = plan.spots - (await seatsNow(plan, requests));
    if (rules.seatsFor(plan, request.party_size, request.kids_count) > spotsLeft) fail(409, 'full', 'This plan is full. They can stay on the waitlist.');
    const { data: moved, error } = await supabaseAdmin.from('PlanRequest')
      .update({ status: 'accepted', decided_by: 'host', decided_at: stamp, updated_at: stamp })
      .eq('id', request.id).in('status', ['pending', 'waitlisted']).select(planService.REQUEST_COLUMNS);
    if (error) throw new Error(`Failed to accept: ${error.message}`);
    if (!moved || moved.length === 0) fail(409, 'not_waiting', 'This person is no longer waiting.');
    const overflow = await enforceCapacity(plan);
    if (overflow.has(request.id)) fail(409, 'full', 'This plan is full. They can stay on the waitlist.');
    await admit(plan, moved[0], { byRule: false, hostFirst, io });
  } else if (action === 'decline') {
    if (request.status !== 'declined') {
      if (!['pending', 'waitlisted'].includes(request.status)) fail(409, 'not_waiting', 'This person is no longer waiting.');
      const { data: moved, error } = await supabaseAdmin.from('PlanRequest')
        .update({ status: 'declined', decided_by: 'host', decided_at: stamp, updated_at: stamp })
        .eq('id', request.id).in('status', ['pending', 'waitlisted']).select('id');
      if (error) throw new Error(`Failed to decline: ${error.message}`);
      if (moved && moved.length > 0) {
        await planInvites.cancelForPerson(postId, request.user_id);
        await planNotify.declined({ plan, request, hostFirst });
      }
    }
  } else if (action === 'remove') {
    if (request.status !== 'removed') {
      if (request.status !== 'accepted') fail(409, 'not_in', 'This person isn’t in the plan.');
      await leaveChat(plan, request.user_id, { io, message: "We couldn't remove them from the plan. Please try again." });
      const { data: moved, error } = await supabaseAdmin.from('PlanRequest')
        .update({ status: 'removed', decided_by: 'host', decided_at: stamp, updated_at: stamp })
        .eq('id', request.id).eq('status', 'accepted').select('id');
      if (error) throw new Error(`Failed to remove: ${error.message}`);
      if (moved && moved.length > 0) {
        await planInvites.cancelForPerson(postId, request.user_id);
        await planNotify.declined({ plan, request, hostFirst });
        await offerOpenSpots(plan, { io });
      }
    }
  } else {
    fail(404, 'not_found', 'Unknown action.');
  }
  const { data: after } = await supabaseAdmin.from('PlanRequest').select('id, status').eq('id', request.id).maybeSingle();
  await auditBusinessPlan(plan, viewer, `plans.${action}`, { request_id: request.id });
  return { request: after || { id: request.id, status: request.status }, plan: await planBodyFor(postId, viewer) };
}

// ── Guests ───────────────────────────────────────────────────

async function myAcceptedRequest(viewer, postId) {
  const { data, error } = await supabaseAdmin.from('PlanRequest')
    .select(planService.REQUEST_COLUMNS).eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (error) throw new Error(`Failed to load your request: ${error.message}`);
  if (!data || data.status !== 'accepted') fail(403, 'not_in', "You're not in this plan.");
  return data;
}

async function onMyWay(user, postId) {
  const viewer = await loadViewer(user);
  const plan = await loadVisiblePlan(postId, viewer);
  const mine = await myAcceptedRequest(viewer, postId);
  const state = rules.planState(plan, plan.post.event_date, plan.post.event_end_date);
  if (state === 'ended' || state === 'cancelled') fail(409, 'ended', 'This plan is over.');
  if (!mine.on_my_way_at) {
    const { data: changed, error } = await supabaseAdmin.from('PlanRequest')
      .update({ on_my_way_at: nowIso(), updated_at: nowIso() }).eq('id', mine.id).is('on_my_way_at', null).select('id');
    if (error) throw new Error(`Failed to say you're on the way: ${error.message}`);
    if (changed && changed.length > 0 && plan.chat_room_id) {
      const names = await userNames([viewer.id]);
      await planChat.systemLine(plan.chat_room_id, viewer.id, `${firstOf(names.get(viewer.id))} is on the way`);
    }
  }
  return planBodyFor(postId, viewer);
}

async function stillComing(user, postId, { coming }, { io = null } = {}) {
  if (typeof coming !== 'boolean') fail(422, 'validation', 'Say whether you’re still coming.');
  const viewer = await loadViewer(user);
  await loadVisiblePlan(postId, viewer);
  const mine = await myAcceptedRequest(viewer, postId);
  if (!coming) return withdrawMine(user, postId, { io, reason: 'not_coming' });
  const { error } = await supabaseAdmin.from('PlanRequest').update({ reconfirmed: true, updated_at: nowIso() }).eq('id', mine.id);
  if (error) throw new Error(`Failed to save that you're coming: ${error.message}`);
  return requestResult(postId, viewer, mine.id);
}

async function giveFeedback(user, postId, { answer, note }) {
  if (!['great', 'ok', 'not_right'].includes(answer)) fail(422, 'validation', 'Choose how it went.');
  const viewer = await loadViewer(user);
  const plan = await loadVisiblePlan(postId, viewer);
  if (planBusiness.runsPlan(plan, viewer)) fail(403, 'host', 'Hosts don’t rate their own plans.');
  const mine = await myAcceptedRequest(viewer, postId);
  const state = rules.planState(plan, plan.post.event_date, plan.post.event_end_date);
  if (state === 'upcoming') fail(409, 'not_started', 'You can say how it went once it starts.');
  const cleanNote = cleanText(note, 500, 'Your note');
  const first = !mine.feedback;
  const { error } = await supabaseAdmin.from('PlanRequest')
    .update({ feedback: answer, feedback_note: cleanNote, feedback_at: nowIso(), updated_at: nowIso() })
    .eq('id', mine.id);
  if (error) throw new Error(`Failed to save how it went: ${error.message}`);
  if (first && answer !== 'not_right') {
    recordFunnelEvent('plan_attended', { userId: viewer.id, meta: { plan_id: postId, kind: plan.kind, answer } });
  }
  if (answer === 'not_right') {
    await filePostReport({
      postId,
      userId: viewer.id,
      reason: 'safety',
      details: `Nearby Plans feedback: something wasn't right.${cleanNote ? ` ${cleanNote}` : ''}`,
    });
  }
  return { feedback: { answer, note: cleanNote }, plan: await planBodyFor(postId, viewer) };
}

async function reportPlan(user, postId, { reason, details }) {
  const viewer = await loadViewer(user);
  const plan = await loadVisiblePlan(postId, viewer);
  if (planBusiness.runsPlan(plan, viewer)) fail(403, 'host', "You can't report your own plan.");
  const { REPORT_REASONS } = require('../postReportService');
  if (!REPORT_REASONS.includes(reason)) fail(422, 'validation', 'Choose a reason.');
  await filePostReport({ postId, userId: viewer.id, reason, details: cleanText(details, 1000, 'Details') });
  return { reported: true, message: "Thanks. We'll look into it." };
}

module.exports = {
  seatsNow,
  PlanError,
  hostFirstOf,
  cancelForGoneBusiness,
  createPlan,
  previewPlan,
  editPlan,
  cancelPlan,
  askToJoin,
  withdrawMine,
  listRequests,
  decide,
  onMyWay,
  stillComing,
  giveFeedback,
  reportPlan,
  offerOpenSpots,
  enforceCapacity,
  // For the jobs.
  activeRequests,
  waitingRequests,
  firstOf,
  userNames,
  partyLabel,
};
