'use strict';

/**
 * Repeating plans (the founder's go on 2026-11-14): a host posts a plan that repeats every week on chosen days,
 * every two weeks, or every month, until a date or for a number of times.
 *
 * Each date is its own plan, posted one at a time: when one ends (or its host skips it), the next is posted as a
 * copy with the next date, so the map never fills with copies and every Plans rule, limit, reminder and chat works
 * as it does for a single plan. The pattern rides on each plan (Plan.repeat); Plan.series_id ties the dates
 * together and Plan.series_index counts them.
 *
 * The people who came last time (and, for a private plan, everyone its host invited) are invited to the next one:
 * the ordinary invitation, so they answer "I'm in" or "Can't make it" with one tap and the count stays true.
 */

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const rules = require('./planRules');
const planService = require('./planService');
const planNotify = require('./planNotifications');

// planActions requires this module; it is read when called.
const actions = () => require('./planActions');

const FLAG = 'plans_repeat';
const FREQS = ['weekly', 'biweekly', 'monthly'];
const LIMITS = Object.freeze({
  // A series runs for a year at most, and for at most this many dates.
  maxDays: 366,
  maxCount: 100,
  defaultWeeks: 12,
  monthDays: 4,
  // The next date is posted only when it starts at least this far ahead; one that would start sooner is skipped.
  leadMinutes: 60,
  // The host is asked whether to keep it going once the last date is this close to the one just posted.
  endNoticeDays: 14,
  // A date a series posts may be this far ahead (a monthly series posts a month out), whatever the plan's own limit.
  maxDaysAhead: 62,
});
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'last' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (message, code = 'validation') => { throw new (actions().PlanError)(422, code, message); };
const zoneOf = (timezone) => (DateTime.local().setZone(timezone).isValid ? timezone : rules.DEFAULT_TIMEZONE);
const day = (isoDate, zone) => DateTime.fromISO(isoDate, { zone });
const int = (value) => (Number.isInteger(value) ? value : null);

function nth(n) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

function listText(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ── The pattern ──────────────────────────────────────────────

/** Does this local date belong to the pattern? */
function matches(repeat, date) {
  if (repeat.freq === 'monthly') {
    return (repeat.month_days || []).some((rule) => {
      if (rule.day) return date.day === rule.day;
      if (date.weekday !== rule.weekday) return false;
      return rule.week === -1 ? date.plus({ days: 7 }).month !== date.month : Math.ceil(date.day / 7) === rule.week;
    });
  }
  if (!(repeat.weekdays || []).includes(date.weekday)) return false;
  if (repeat.freq !== 'biweekly') return true;
  const anchorWeek = day(repeat.anchor, date.zoneName).startOf('week');
  const weeks = Math.round(date.startOf('week').diff(anchorWeek, 'days').days / 7);
  return weeks % 2 === 0;
}

/** The pattern's dates after `after` (a local date), in order, up to its end date. Skipped dates are left out. */
function* datesAfter(repeat, after, zone) {
  const until = repeat.until ? day(repeat.until, zone) : null;
  const last = day(repeat.anchor, zone).plus({ days: LIMITS.maxDays });
  const skip = new Set(repeat.skip || []);
  for (let date = after.startOf('day').plus({ days: 1 }); date <= last; date = date.plus({ days: 1 })) {
    if (until && date > until) return;
    if (matches(repeat, date) && !skip.has(date.toISODate())) yield date;
  }
}

/**
 * The pattern's own run: how many dates it has from its first (`anchor`) on, and its last date. A count that
 * can't fit in the year ends with the year, so the numbers a card shows are the dates that will be posted.
 */
function runOf(repeat, zone) {
  let last = day(repeat.anchor, zone);
  let dates = 1;
  if (!repeat.count || repeat.count > 1) {
    for (const date of datesAfter(repeat, last, zone)) {
      last = date;
      dates += 1;
      if (repeat.count && dates >= repeat.count) break;
    }
  }
  return { dates, lastOn: last.toISODate() };
}

/** The series' dates before the pattern's first: a pattern changed on a later date starts there (`before`). */
const beforeOf = (repeat) => (Number.isInteger(repeat.before) && repeat.before > 0 ? repeat.before : 0);

/** How many dates the series has in all, the ones before a changed pattern's first date included. */
function totalOf(repeat, zone) {
  return beforeOf(repeat) + runOf(repeat, zone).dates;
}

/** The series' last date: its end date's last matching day, or the date its count lands on. */
function lastOn(repeat, zone) {
  return runOf(repeat, zone).lastOn;
}

/** "Every Tuesday and Thursday", "Every 2 weeks on Friday", "The 1st and 3rd Saturday of each month". */
function patternText(repeat, { short = false } = {}) {
  const names = short ? SHORT : WEEKDAYS;
  if (repeat.freq === 'monthly') {
    const parts = (repeat.month_days || []).map((rule) => (rule.day
      ? { text: nth(rule.day), date: true }
      : { text: `${ORDINAL[rule.week]} ${names[rule.weekday - 1]}`, weekday: rule.weekday, week: rule.week }));
    const sameWeekday = parts.length > 1 && parts.every((p) => p.weekday && p.weekday === parts[0].weekday);
    const said = sameWeekday
      ? `${listText(parts.map((p) => ORDINAL[p.week]))} ${names[parts[0].weekday - 1]}`
      : listText(parts.map((p) => p.text));
    return short ? `Monthly on the ${said}` : `The ${said} of each month`;
  }
  const days = [...(repeat.weekdays || [])].sort((a, b) => a - b).map((w) => names[w - 1]);
  if (repeat.freq === 'biweekly') return `Every 2 weeks on ${listText(days)}`;
  return days.length === 7 ? 'Every day' : `Every ${listText(days)}`;
}

function cleanMonthDays(value) {
  if (!Array.isArray(value) || value.length === 0) fail('Choose the day of the month it repeats on.');
  if (value.length > LIMITS.monthDays) fail(`A plan can repeat on up to ${LIMITS.monthDays} days a month.`);
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const rule = raw && typeof raw === 'object' ? raw : {};
    let clean = null;
    if (rule.day !== undefined) {
      const d = int(rule.day);
      if (d && d >= 1 && d <= 31) clean = { day: d };
    } else {
      const week = int(rule.week);
      const weekday = int(rule.weekday);
      if ([1, 2, 3, 4, -1].includes(week) && weekday >= 1 && weekday <= 7) clean = { week, weekday };
    }
    if (!clean) fail('Choose the day of the month it repeats on.');
    const key = JSON.stringify(clean);
    if (!seen.has(key)) { seen.add(key); out.push(clean); }
  }
  return out;
}

/**
 * The pattern as a plan saves it, from the body, checked against the plan's own start. Null for "doesn't repeat".
 * The pattern starts at this plan's date (`anchor`), also when it replaces the pattern of a later date of a
 * series: its days, the every-2-weeks rhythm, the one-year limit and the count are all measured from here.
 * @param {object|null} input  { freq, weekdays?, month_days?, until?, count? }
 * @param {{ startsAt: string, timezone: string, before?: number }} at  the plan's start and time zone, and how
 *   many dates of its series came before it (kept so "5 of 16" stays true after a change)
 */
function checkedRepeat(input, { startsAt, timezone, before = 0 }) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) fail('Choose how often it repeats.');
  if (!FREQS.includes(input.freq)) fail('Choose how often it repeats.');
  const zone = zoneOf(timezone);
  const start = DateTime.fromISO(new Date(startsAt).toISOString(), { zone: 'utc' }).setZone(zone);
  const anchor = start.toISODate();
  const repeat = { freq: input.freq, anchor };

  if (input.freq === 'monthly') {
    repeat.month_days = cleanMonthDays(input.month_days);
  } else {
    const days = Array.isArray(input.weekdays) ? [...new Set(input.weekdays)] : [];
    if (days.length === 0 || days.some((w) => !Number.isInteger(w) || w < 1 || w > 7)) fail('Choose the days it repeats on.');
    repeat.weekdays = days.sort((a, b) => a - b);
  }
  if (!matches(repeat, start.startOf('day'))) {
    fail(input.freq === 'monthly'
      ? 'The plan’s own date has to be one of the days it repeats on.'
      : `The plan starts on a ${WEEKDAYS[start.weekday - 1]}, so ${WEEKDAYS[start.weekday - 1]} has to be one of its days.`);
  }

  const hasUntil = input.until !== undefined && input.until !== null;
  const hasCount = input.count !== undefined && input.count !== null;
  if (hasUntil && hasCount) fail('Choose an end date or a number of times, not both.');
  const latest = day(anchor, zone).plus({ days: LIMITS.maxDays });
  if (hasCount) {
    const count = int(input.count);
    if (!count || count < 2 || count > LIMITS.maxCount) fail(`A plan can repeat 2 to ${LIMITS.maxCount} times.`);
    repeat.count = count;
    repeat.until = null;
  } else {
    const until = hasUntil
      ? (typeof input.until === 'string' && DATE_RE.test(input.until) ? day(input.until, zone) : null)
      : start.startOf('day').plus({ weeks: LIMITS.defaultWeeks });
    if (!until || !until.isValid) fail('Choose the date it ends.');
    if (until < start.startOf('day')) fail('It has to end after the plan’s own date.');
    if (until > latest) fail('A plan can repeat for up to a year.');
    repeat.until = until.toISODate();
    repeat.count = null;
  }
  // A plan that repeats has a second date: an end on the plan's own date, or before the next day the pattern
  // lands on, would leave it with one.
  if (runOf(repeat, zone).dates < 2) {
    const second = datesAfter({ ...repeat, until: null }, start, zone).next().value;
    fail(second
      ? `It has to end on or after its second date, ${second.toFormat('cccc, LLLL d')}.`
      : 'It has to end after the plan’s own date.');
  }
  if (Number.isInteger(before) && before > 0) repeat.before = before;
  return repeat;
}

/**
 * When the date after this plan starts and ends, or null when the series is over. A date that would start within
 * the lead time (the host skipped or cancelled late, or the server was down) is passed over.
 */
function nextTimes(plan, now = Date.now()) {
  const repeat = plan.repeat;
  if (!repeat || !FREQS.includes(repeat.freq) || !DATE_RE.test(repeat.anchor || '')) return null;
  // The count is the pattern's own: dates before a changed pattern's first one don't use it up.
  const index = (plan.series_index || 1) - beforeOf(repeat);
  if (repeat.count && index >= repeat.count) return null;
  const zone = zoneOf(rules.timezoneForPlan(plan));
  const start = DateTime.fromISO(new Date(plan.post.event_date).toISOString(), { zone: 'utc' }).setZone(zone);
  const minutes = Math.round((new Date(plan.post.event_end_date) - new Date(plan.post.event_date)) / 60000);
  for (const date of datesAfter(repeat, start, zone)) {
    const at = date.set({ hour: start.hour, minute: start.minute });
    if (at.toMillis() < now + LIMITS.leadMinutes * 60000) continue;
    return { startsAt: at.toUTC().toISO(), endsAt: at.plus({ minutes }).toUTC().toISO(), date: date.toISODate() };
  }
  return null;
}

/** What a card says about a repeating plan, for anyone who may read the card. Null when it doesn't repeat. */
function view(plan) {
  const repeat = plan.repeat;
  if (!repeat || !FREQS.includes(repeat.freq) || !DATE_RE.test(repeat.anchor || '')) return null;
  try {
    const zone = zoneOf(rules.timezoneForPlan(plan));
    const run = runOf(repeat, zone);
    const index = plan.series_index || 1;
    const total = Math.max(index, beforeOf(repeat) + run.dates);
    return {
      freq: repeat.freq,
      weekdays: repeat.weekdays || null,
      month_days: repeat.month_days || null,
      until: repeat.until || null,
      // How many dates from this one through the last, for a series that ends after a number of times: sent
      // back with a changed pattern, the series still ends where it did.
      count: repeat.count ? total - index + 1 : null,
      // "Every Tuesday and Thursday" and "Every Tue and Thu".
      text: patternText(repeat),
      short: patternText(repeat, { short: true }),
      // Which date of the series this plan is, of how many, and the series' last date.
      index,
      total,
      last_on: run.lastOn,
    };
  } catch (err) {
    logger.warn('plans.series.view_failed', { planId: plan.post_id, error: err.message });
    return null;
  }
}

// ── Posting the next date ────────────────────────────────────

/** The next date's place, as a request would give it: the same home, public place, or link. */
function placeOf(plan) {
  // An online date keeps its link; its area point and time zone ride along in the series (postNext).
  if (plan.place_kind === 'online') return { kind: 'online', link: plan.online_link };
  if (plan.place_kind === 'home') return { kind: 'home', home_id: plan.place_home_id };
  return {
    kind: 'public', name: plan.place_name, address: plan.place_address,
    latitude: Number(plan.place_latitude), longitude: Number(plan.place_longitude),
    place_id: plan.place_ref || undefined,
  };
}

/** The next date's plan, copied from this one with new times (the host's edits carry forward). */
async function nextInput(plan, times, host) {
  const { repeatDetailsForViewer } = require('./planGames');
  const details = await repeatDetailsForViewer(plan.kind, plan.details, Date.parse(times.startsAt), host);
  return {
    kind: plan.kind,
    title: plan.post.title,
    about: plan.post.content || null,
    guest_note: plan.guest_note || null,
    starts_at: times.startsAt,
    ends_at: times.endsAt,
    spots: plan.spots,
    place: placeOf(plan),
    auto_rules: Array.isArray(plan.auto_rules) ? plan.auto_rules : [],
    join_requirement: plan.join_requirement,
    details,
    audience: rules.isPrivate(plan) ? 'invited' : 'nearby',
    guests_can_invite: Boolean(plan.guests_can_invite),
  };
}

/**
 * Who is asked to the next date: the people who were in at this one and, for a private plan, everyone its host
 * invited whose invitation still stands (pending, yes or "can't make it"): saying no to one date isn't leaving.
 */
async function regularsOf(plan) {
  const hostId = String(plan.host_user_id);
  const [requests, invites] = await Promise.all([
    supabaseAdmin.from('PlanRequest').select('user_id').eq('post_id', plan.post_id).eq('status', 'accepted'),
    rules.isPrivate(plan)
      ? supabaseAdmin.from('PlanInvite').select('invitee_user_id').eq('post_id', plan.post_id).eq('host_user_id', hostId)
        .in('status', ['pending', 'accepted', 'declined']).not('invitee_user_id', 'is', null)
      : { data: [] },
  ]);
  if (requests.error || invites.error) throw new Error(`Failed to read who came: ${(requests.error || invites.error).message}`);
  const ids = new Set([...(requests.data || []).map((r) => String(r.user_id)), ...(invites.data || []).map((r) => String(r.invitee_user_id))]);
  ids.delete(hostId);
  return [...ids];
}

/** Invite the regulars to the new date and tell them it is posted. Never fails the post. */
async function inviteRegulars(previous, next, hostFirst) {
  let invited = 0;
  try {
    const hostId = String(next.host_user_id);
    const { getMuteAndHideFilters } = require('../feedService');
    const hostFilters = await getMuteAndHideFilters(hostId);
    for (const userId of await regularsOf(previous)) {
      if (hostFilters.blockedUserIds?.has(userId)) continue;
      const theirs = await getMuteAndHideFilters(userId).catch(() => null);
      if (!theirs || theirs.blockedUserIds?.has(hostId) || theirs.mutedUserIds?.has(hostId)) continue;
      const { data, error } = await supabaseAdmin.from('PlanInvite')
        .insert({ post_id: next.post_id, host_user_id: hostId, channel: 'account', invitee_user_id: userId })
        .select('id, post_id, host_user_id, channel, invitee_user_id, status, needs_host_ok, created_at').single();
      if (error) {
        if (error.code !== '23505') logger.warn('plans.series.invite_failed', { planId: next.post_id, error: error.message });
        continue;
      }
      await planNotify.invited({ plan: next, invite: data, userId, hostFirst, series: true });
      invited += 1;
    }
  } catch (err) {
    logger.warn('plans.series.regulars_failed', { planId: next.post_id, error: err.message });
  }
  return invited;
}

/**
 * Post the date after `plan`, once. Called when the plan has ended (the Plans tick) or its host skipped it.
 * @returns {Promise<{ posted: string|null, reason?: string }>} the new plan's id, or why none was posted
 */
async function postNext(plan, { now = Date.now() } = {}) {
  if (!plan?.repeat) return { posted: null, reason: 'no_repeat' };
  // One caller posts: the claim is the write.
  const stamp = new Date(now).toISOString();
  const { data: claimed, error } = await supabaseAdmin.from('Plan')
    .update({ series_next_at: stamp }).eq('post_id', plan.post_id).is('series_next_at', null).not('repeat', 'is', null).select('post_id');
  if (error) throw new Error(`Failed to claim the next date: ${error.message}`);
  if (!claimed || claimed.length === 0) return { posted: null, reason: 'already_handled' };

  const hostFirst = await actions().hostFirstOf(plan);
  const times = nextTimes(plan, now);
  if (!times) {
    await planNotify.seriesNotice({ plan, what: 'ended' });
    return { posted: null, reason: 'ended' };
  }
  // Posted as the host, by the server, which can read every plan it posts: an online date or one of the newer kinds
  // is copied too (`plansMore`), whatever app its host uses.
  const host = { id: String(plan.host_user_id), role: null, plansMore: true };
  let created;
  try {
    created = await actions().createPlan(host, await nextInput(plan, times, host), {
      series: {
        id: plan.series_id || plan.post_id,
        index: (plan.series_index || 1) + 1,
        repeat: plan.repeat,
        // An online date stays in the same area (or none) and the same time zone as the one before.
        ...(plan.place_kind === 'online' ? {
          point: { latitude: Number(plan.place_latitude), longitude: Number(plan.place_longitude) },
          timezone: rules.timezoneForPlan(plan),
        } : {}),
      },
    });
  } catch (err) {
    if (!(err instanceof actions().PlanError)) {
      // Not a rule: let the next tick try again.
      await supabaseAdmin.from('Plan').update({ series_next_at: null }).eq('post_id', plan.post_id);
      throw err;
    }
    await planNotify.seriesNotice({ plan, what: 'stopped', reason: err.message });
    return { posted: null, reason: err.code };
  }
  const next = await planService.loadPlanRow(created.id);
  if (!next) return { posted: null, reason: 'unreadable' };
  const invited = await inviteRegulars(plan, next, hostFirst);

  // Close to the end, once: "keep it going?"
  const view_ = view(next);
  if (view_ && !next.repeat.end_notice) {
    const zone = zoneOf(rules.timezoneForPlan(next));
    const daysLeft = day(view_.last_on, zone).diff(DateTime.fromISO(times.startsAt).setZone(zone).startOf('day'), 'days').days;
    if (daysLeft <= LIMITS.endNoticeDays) {
      await supabaseAdmin.from('Plan').update({ repeat: { ...next.repeat, end_notice: true } }).eq('post_id', next.post_id);
      await planNotify.seriesNotice({ plan: next, what: 'ending', lastOn: view_.last_on });
    }
  }
  logger.info('plans.series.posted', { from: plan.post_id, planId: next.post_id, index: next.series_index, invited });
  return { posted: next.post_id, invited };
}

/** The Plans tick: every repeating plan that has ended and whose next date isn't posted yet. */
async function runDue(now = Date.now()) {
  const { data, error } = await supabaseAdmin.from('Plan').select(planService.PLAN_SELECT)
    .not('repeat', 'is', null).is('series_next_at', null).eq('status', 'ended').limit(100);
  if (error) throw new Error(`Failed to read repeating plans: ${error.message}`);
  let posted = 0;
  for (const plan of data || []) {
    try {
      if ((await postNext(plan, { now })).posted) posted += 1;
    } catch (err) {
      logger.warn('plans.series.post_failed', { planId: plan.post_id, error: err.message });
    }
  }
  return posted;
}

module.exports = {
  FLAG,
  LIMITS,
  checkedRepeat,
  nextTimes,
  totalOf,
  lastOn,
  patternText,
  view,
  postNext,
  runDue,
};
