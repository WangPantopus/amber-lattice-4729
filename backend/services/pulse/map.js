'use strict';

// Pulse, reinvented, phase 1: the one map and the strip "Alive right now" (coord CONTRACT 6b and 6c,
// GET /api/reinvented/map and /strip), for a reader whose `pulse_reinvented` switch is on (routes/reinvented.js).
//
// Like the list (list.js), nothing here decides who may see what. Rings come from today's Moments map
// (momentStore.mapRings) and people rings (peopleRings), marks from today's post map (feedService.getMapFeed, Place),
// tickets from today's plan pins (plans/planMap.planPins: the Plans map's own rules, its area points, its `plans`
// flag), guess spots from momentGuess. This file picks among them by time and puts them in one answer.

const { DateTime } = require('luxon');
const feedService = require('../feedService');
const store = require('../moments/momentStore');
const momentGuess = require('../moments/momentGuess');
const { planPins } = require('../plans/planMap');
const { timezoneFromCoordinates } = require('../../utils/timezone');
const { haversineMeters } = require('../../utils/trustState');
const logger = require('../../utils/logger');
const list = require('./list');
const postStudio = require('./postStudio');

const TIMES = ['live', 'today', 'week', 'all', 'tonight', 'weekend'];
const BACK = ['today', 'week', 'all'];
const FORWARD = ['tonight', 'weekend'];
const MAX_MARKS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const STRIP_MILES = 25;
const MAX_LIVE_HERE = 10;
const MAX_PLANS_SOON = 10;
const MAX_PEOPLE = 20;
const FALLBACK_ZONE = 'America/Los_Angeles';

/** A read that may fail without failing the answer: its part is left empty and the failure logged. */
function orEmpty(read, what, empty = []) {
  return read.catch((error) => {
    logger.warn(`reinvented.${what}_failed`, { error: error.message });
    return empty;
  });
}

/** When the time row's back views start (ms), at the place's own midnight for `today`; null for no limit. */
function backSince(time, box, now = Date.now()) {
  if (time === 'week') return now - 7 * DAY_MS;
  if (time !== 'today') return null;
  const zone = timezoneFromCoordinates((box.south + box.north) / 2, (box.west + box.east) / 2, FALLBACK_ZONE);
  return DateTime.fromMillis(now, { zone }).startOf('day').toMillis();
}

/** The plan pins for the time row: Plans' own windows; `tonight` is today's plans still on at 5 pm or later. */
async function ticketsFor(user, box, time) {
  if (BACK.includes(time)) return [];
  // A business's plan waits for server step 6 (shown when someone the reader knows is going): `biz` stays off.
  const window = time === 'weekend' ? 'weekend' : 'today';
  const pins = await planPins(user, box, { window, more: '1' });
  if (time !== 'tonight') return pins;
  return pins.filter((pin) => {
    const zone = pin.timezone || FALLBACK_ZONE;
    const fivePm = DateTime.now().setZone(zone).set({ hour: 17, minute: 0, second: 0, millisecond: 0 }).toMillis();
    return Date.parse(pin.ends_at) > fivePm;
  });
}

/** A post on the map: its shown point, whether it is a Heads-up, and the post as the list carries it. */
function markOf(post) {
  const { distance_meters: _distance, ...shown } = post;
  return {
    id: post.id, latitude: post.latitude, longitude: post.longitude, heads_up: post.post_type === 'alert', post: shown,
  };
}

/** GET /api/reinvented/map for `user` (CONTRACT 6b). `box` is checked by the route. */
async function mapFor(user, box, { time = 'live' } = {}) {
  const userId = user.id;
  const forward = FORWARD.includes(time);
  const since = backSince(time, box);
  const [rings, posts, tickets, spots, heights, float, stamps] = await Promise.all([
    forward ? [] : store.mapRings(userId, box),
    forward ? [] : feedService.getMapFeed({ userId, surface: 'place', ...box, limit: MAX_MARKS }),
    orEmpty(ticketsFor(user, box, time), 'map_tickets'),
    orEmpty(momentGuess.guessSpotsIn(userId, box), 'map_guess_spots'),
    store.heightsOn(user),
    store.floatOn(user),
    // A post made in the Studio shows its stamps (CONTRACT 6d), read alongside; a failed read only leaves them off.
    forward ? new Map() : orEmpty(postStudio.stampsInBox(box), 'map_stamps', new Map()),
  ]);
  // Back: the reader's own Moments posted in the window (an ended Moment of someone else stays ended).
  const shownRings = BACK.includes(time)
    ? rings.filter((ring) => ring.mine && (since == null || Date.parse(ring.newest_at) >= since))
    : rings;
  const marks = postStudio.withStamps(posts, stamps)
    .filter((post) => post.latitude != null && post.longitude != null)
    .filter((post) => since == null || Date.parse(post.created_at) >= since)
    .map(markOf)
    // Heads-ups first (drawn on top), then newest first, as the map reads them.
    .sort((a, b) => Number(b.heads_up) - Number(a.heads_up));
  return {
    time,
    rings: shownRings,
    marks,
    tickets,
    guess_spots: spots,
    heights_on: heights,
    float_on: float,
  };
}

/** GET /api/reinvented/strip for `user` (CONTRACT 6c): Live from here, plans starting soon, people you know. */
async function stripFor(user, { latitude = null, longitude = null } = {}) {
  const userId = user.id;
  const placeRead = list.readerPlace(userId, latitude, longitude);
  const peopleRead = store.connectionIds(userId)
    .then((ids) => store.peopleRings(userId, ids))
    .then((rings) => rings.sort((a, b) => Date.parse(b.newest_at) - Date.parse(a.newest_at)).slice(0, MAX_PEOPLE));
  const place = await placeRead;
  if (!place) {
    return { live_here: [], plans_soon: [], people: await orEmpty(peopleRead, 'strip_people') };
  }
  const bands = list.bandsUpTo(STRIP_MILES, null);
  const box = list.boxAround(place.latitude, place.longitude, STRIP_MILES * 1609.344);
  const liveRead = store.shownInBox(userId, box).then(async (entries) => {
    // The Live mark is checked again when each Moment is read (serializeMoments); this only skips the rest.
    const marked = entries.filter((entry) => store.meta(entry.row).taken_here === true)
      .map((entry) => ({
        entry,
        meters: haversineMeters(place.latitude, place.longitude, entry.point.latitude, entry.point.longitude),
      }))
      .filter(({ meters }) => Number.isFinite(meters) && meters <= STRIP_MILES * 1609.344)
      .sort((a, b) => Date.parse(store.shownAt(b.entry.row)) - Date.parse(store.shownAt(a.entry.row)))
      .slice(0, MAX_LIVE_HERE * 3);
    const moments = await store.serializeMoments(marked.map(({ entry }) => entry.row), userId);
    const now = Date.now();
    return moments
      .map((moment, index) => ({ moment, meters: marked[index].meters }))
      .filter(({ moment }) => moment.taken_here && (!moment.live_until || Date.parse(moment.live_until) > now))
      .slice(0, MAX_LIVE_HERE)
      .map(({ moment, meters }) => ({ band: bands[list.bandIndexOf(meters, bands)]?.band ?? null, moment }));
  });
  const soonRead = planPins(user, box, { window: 'now', more: '1' })
    .then((pins) => pins.filter((pin) => haversineMeters(place.latitude, place.longitude, pin.latitude, pin.longitude)
      <= STRIP_MILES * 1609.344)
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
      .slice(0, MAX_PLANS_SOON));
  const [liveHere, plansSoon, people] = await Promise.all([
    orEmpty(liveRead, 'strip_live'), orEmpty(soonRead, 'strip_plans'), orEmpty(peopleRead, 'strip_people'),
  ]);
  return { live_here: liveHere, plans_soon: plansSoon, people };
}

module.exports = { mapFor, stripFor, TIMES };
