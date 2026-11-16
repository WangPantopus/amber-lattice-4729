'use strict';

/**
 * Plans for the holidays, H3: occasions (docs/product/plans-holidays/03-build-contract.md, section 8; the founder's go
 * on November 15, 2026). Behind `plans_occasions` (which needs `plans_kinds`), read for the person hosting.
 *
 * An occasion is a start, not a kind (H1): it fills in an existing kind and the usual things, and everything stays
 * editable. A plan saves its occasion's key; its card says the occasion's name where it would say the kind's, and an
 * app from before occasions reads the plan as its kind. The server sends the list by date (H9), so the "Coming up"
 * strip follows the season with no app release.
 */

const { isFeatureEnabled } = require('../featureFlagService');
const rules = require('./planRules');

const FLAG = 'plans_occasions';

// The usual things on the boards' bring lists (board 19 for Thanksgiving dinner, board 06 for Friendsgiving).
const THANKSGIVING_BRING = ['Turkey', 'Mashed potatoes', 'Green beans', 'Cranberry sauce', 'Rolls', 'Pumpkin pie', 'Sparkling cider'];
const FRIENDSGIVING_BRING = ['Stuffing', 'Big salad', 'A dessert', 'Drinks for the kids'];

/**
 * The fixed list, in the order the strip shows it. `season(year)` answers the first and last day (YYYY-MM-DD, local)
 * the occasion is offered, or null for always. `time(year)` the day and hours it starts as, or null. `spots` the room
 * it starts with (added November 16, after the two-phone check: a form that started at 6 met a full plan at the first
 * "Let in"); each fits any host's room (30 without H1's switch).
 */
const OCCASIONS = Object.freeze([
  {
    key: 'thanksgiving', text: 'Thanksgiving dinner', kind: 'food_drinks', details: { food_kind: 'dinner' },
    home: true, kids: true, spots: 12, bring: THANKSGIVING_BRING,
    season: (y) => [`${y}-11-01`, thanksgivingDay(y)],
    time: (y) => ({ date: thanksgivingDay(y), start: '15:00', end: '20:00', endsNextDay: false }),
  },
  {
    key: 'friendsgiving', text: 'Friendsgiving', kind: 'food_drinks', details: { food_kind: 'potluck' },
    home: false, kids: true, spots: 12, bring: FRIENDSGIVING_BRING,
    season: (y) => [`${y}-11-01`, thanksgivingDay(y)],
    time: null,
  },
  {
    key: 'holiday_party', text: 'Holiday party', kind: 'food_drinks', details: {},
    home: false, kids: false, spots: 20, bring: null,
    season: (y) => [`${y}-11-15`, `${y}-12-31`],
    time: null,
  },
  {
    // The gift exchange extra (names drawn, a budget, wish lists) is a later step.
    key: 'gift_exchange', text: 'Gift exchange', kind: 'something_else', details: {},
    home: false, kids: false, spots: 12, bring: null,
    season: (y) => [`${y}-11-15`, `${y}-12-31`],
    time: null,
  },
  {
    key: 'new_years_eve', text: 'New Year\'s Eve', kind: 'food_drinks', details: { food_kind: 'drinks' },
    home: false, kids: false, spots: 20, bring: null,
    season: (y) => [`${y}-12-10`, `${y}-12-31`],
    time: (y) => ({ date: `${y}-12-31`, start: '20:00', end: '01:00', endsNextDay: true }),
  },
  {
    key: 'birthday', text: 'Birthday', kind: 'something_else', details: {},
    home: false, kids: true, spots: 12, bring: null,
    season: null,
    time: null,
  },
]);
const BY_KEY = new Map(OCCASIONS.map((o) => [o.key, o]));

/** The fourth Thursday of November, YYYY-MM-DD. */
function thanksgivingDay(year) {
  const firstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return `${year}-11-${String(firstThursday + 21).padStart(2, '0')}`;
}

/** An occasion's key, if it is one of the list's; else null. */
function checkedKey(value) {
  return typeof value === 'string' && BY_KEY.has(value) ? value : null;
}

/** What a card says for a plan's occasion: { key, text }, or null. */
function view(key) {
  const occasion = key ? BY_KEY.get(key) : null;
  return occasion ? { key: occasion.key, text: occasion.text } : null;
}

async function enabledFor(user) {
  return isFeatureEnabled(FLAG, typeof user === 'string' ? user : user);
}

/** Each host's switch, for the cards (one read a host; none while it's off for everyone). */
async function switchByHost(hostIds) {
  const ids = [...new Set((hostIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (ids.length === 0) return out;
  const flag = await require('../featureFlagService').getFlag(FLAG);
  if (!flag || (!flag.enabled_globally && !flag.enabled_for_internal_team && !(flag.beta_user_ids || []).length)) {
    for (const id of ids) out.set(id, false);
    return out;
  }
  await Promise.all(ids.map(async (id) => out.set(id, await isFeatureEnabled(FLAG, id))));
  return out;
}

/** The viewer's own time zone: their first home's, else where they are, else the default. */
function zoneOf(viewer) {
  const home = viewer.homes.find((h) => h.point);
  const point = home ? home.point : viewer.origin;
  if (!point) return 'America/Los_Angeles';
  return rules.timezoneForPlan({ place_latitude: point.latitude, place_longitude: point.longitude, timezone: 'America/Los_Angeles' });
}

function instant(date, hhmm, zone, nextDay = false) {
  const [y, m, d] = date.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  return rules.zonedInstant(y, m, d + (nextDay ? 1 : 0), hour, minute, zone).toISOString();
}

/**
 * GET /api/plans/occasions: the occasions in season for today (the viewer's own date), in the list's order, each
 * with what it fills in on the host form. Only what this host can use is filled in: kids welcome with H1's switch,
 * a bring list with H2's.
 * @param {object} viewer  planViewer.loadViewer's answer
 */
async function inSeason(viewer, { now = new Date() } = {}) {
  const zone = zoneOf(viewer);
  const today = rules.localParts(now, zone).date;
  const year = Number(today.slice(0, 4));
  const bringOn = await require('./planBring').enabledFor(viewer.id);
  const out = [];
  for (const occasion of OCCASIONS) {
    if (occasion.season) {
      const [from, to] = occasion.season(year);
      if (today < from || today > to) continue;
    }
    const time = occasion.time ? occasion.time(year) : null;
    out.push({
      key: occasion.key,
      text: occasion.text,
      kind: occasion.kind,
      details: occasion.details,
      fills: {
        title: occasion.text,
        audience: 'invited',
        spots: occasion.spots,
        place_kind: occasion.home ? 'home' : null,
        kids_welcome: Boolean(occasion.kids && viewer.guestAnswersFlag),
        bring: occasion.bring && bringOn ? { guests_can_add: true, items: occasion.bring.map((label) => ({ label })) } : null,
        date: time ? time.date : null,
        start_time: time ? time.start : null,
        end_time: time ? time.end : null,
        starts_at: time ? instant(time.date, time.start, zone) : null,
        ends_at: time ? instant(time.date, time.end, zone, time.endsNextDay) : null,
        timezone: zone,
      },
    });
  }
  return { occasions: out };
}

module.exports = { FLAG, OCCASIONS, thanksgivingDay, checkedKey, view, enabledFor, switchByHost, inSeason };
