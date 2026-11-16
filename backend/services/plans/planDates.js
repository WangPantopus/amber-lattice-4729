'use strict';

/**
 * Plans for the holidays, the extras: find a date (docs/product/plans-holidays/08-extras.md, section 2; the founder's
 * go on November 15 and 16, 2026). Behind `plans_find_date`, read for the plan's host.
 *
 * The host offers two to five times. Everyone invited ticks the ones that work. The host picks one; the people who
 * ticked it are in, the others are asked, each told once.
 *
 *  - Plan.date_options: { rev, options: [{ id, starts_at, ends_at }], ticks: { key: [ids] }, numbers: { key: { party_size,
 *    kids_count } }, answered: { key: when }, picked: null | id }. While it is set and `picked` is null the plan is
 *    "picking": Post.event_date holds the earliest option (lists order by it) and nothing that runs on the plan's time
 *    runs (planJobs skips it). A plan that repeats can't use it.
 *  - Keys are planExtras': `p:<user id>` for an invited person with an account, `g:<invitation id>` for a guest
 *    without one, whose name, numbers and address are on their invitation row (answered, not in, until the pick).
 *  - An app that doesn't send `extras=1` never gets a plan that is picking (planService.isVisibleTo).
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { recordFunnelEvent } = require('../funnelEvents');
const planService = require('./planService');
const planNotify = require('./planNotifications');
const rules = require('./planRules');
const extras = require('./planExtras');

const actions = () => require('./planActions');
const invites = () => require('./planInvites');
const guests = () => require('./planGuests');

const FLAG = 'plans_find_date';
const COLUMN = 'date_options';
const LIMITS = Object.freeze({ min: 2, max: 5, people: 10 });
const IDS = 'abcdefghijklmnopqrstuvwxyz';

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();

const enabledFor = (hostId) => extras.enabledFor(FLAG, hostId);
const switchByHost = (hostIds) => extras.switchByHost(FLAG, hostIds);

/** A plan whose date is still being picked. */
const isPicking = (plan) => Boolean(plan && plan.date_options && Array.isArray(plan.date_options.options) && !plan.date_options.picked);

// ── Words ────────────────────────────────────────────────────

const fmt = (iso, tz, opts) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(new Date(iso));
/** "Sat, Nov 21 · 6:00 PM" (a row of times). */
const optionText = (iso, tz) => `${fmt(iso, tz, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmt(iso, tz, { hour: 'numeric', minute: '2-digit' })}`;
/** "Sunday, Nov 22 at 4:00 PM" (a notice). */
const noticeDate = (iso, tz) => `${fmt(iso, tz, { weekday: 'long', month: 'short', day: 'numeric' })} at ${fmt(iso, tz, { hour: 'numeric', minute: '2-digit' })}`;
/** "Sunday, Nov 22 · 4:00 PM" (the pick button). */
const pickDate = (iso, tz) => `${fmt(iso, tz, { weekday: 'long', month: 'short', day: 'numeric' })} · ${fmt(iso, tz, { hour: 'numeric', minute: '2-digit' })}`;
const dayName = (iso, tz) => fmt(iso, tz, { weekday: 'long' });

// ── The host's times ─────────────────────────────────────────

/**
 * The host form's date_options, checked: 2 to 5 times, each in the future and within a private plan's limits, no two
 * alike. Answers them earliest first.
 */
function checkedTimes(raw) {
  if (!Array.isArray(raw)) fail(422, 'validation', 'Offer two to five times.', { field: 'date_options' });
  if (raw.length < LIMITS.min || raw.length > LIMITS.max) fail(422, 'validation', 'Offer two to five times.', { field: 'date_options' });
  const seen = new Set();
  const out = raw.map((t) => {
    const startsAt = typeof t?.starts_at === 'string' ? t.starts_at : null;
    const endsAt = typeof t?.ends_at === 'string' ? t.ends_at : null;
    if (!startsAt || !endsAt) fail(422, 'validation', 'Choose when each time starts and ends.', { field: 'date_options' });
    actions()._validateTimes(startsAt, endsAt, { isPrivate: true });
    const value = { starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString() };
    if (seen.has(value.starts_at)) fail(422, 'validation', 'Each time needs a different start.', { field: 'date_options' });
    seen.add(value.starts_at);
    return value;
  });
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** A new plan's value from the create call's times (checked), with ids a, b, c… */
function initialValue(times) {
  return {
    rev: 1, options: times.map((t, i) => ({ id: IDS[i], ...t })), ticks: {}, numbers: {}, answered: {}, picked: null,
  };
}

/** The new value from a change of times: kept times keep their ids and ticks; a removed time's ticks go, silently. */
function rebuilt(current, times) {
  const kept = new Map((current.options || []).map((o) => [`${o.starts_at}|${o.ends_at}`, o.id]));
  const used = new Set([...kept.values()]);
  const options = times.map((t) => {
    let id = kept.get(`${t.starts_at}|${t.ends_at}`);
    if (!id) {
      id = [...IDS].find((c) => !used.has(c));
      used.add(id);
    }
    return { id, ...t };
  });
  const live = new Set(options.map((o) => o.id));
  const ticks = Object.fromEntries(Object.entries(current.ticks || {}).map(([k, ids]) => [k, (ids || []).filter((id) => live.has(id))]));
  return { ...current, options, ticks };
}

/** Post.event_date / event_end_date follow the earliest option while the plan is picking, so lists order it. */
async function followEarliest(postId, value) {
  const first = (value.options || [])[0];
  if (!first) return;
  const { error } = await supabaseAdmin.from('Post').update({ event_date: first.starts_at, event_end_date: first.ends_at, updated_at: nowIso() }).eq('id', postId);
  if (error) throw new Error(`Failed to save the times: ${error.message}`);
}

/** The change call's date_options on a plan still picking. */
async function replaceFromForm(plan, raw) {
  if (!isPicking(plan)) fail(409, 'picked', 'The date is picked. Change the time as for any plan.');
  const times = checkedTimes(raw);
  const next = await extras.swap(plan.post_id, COLUMN, (current) => {
    if (!isPicking({ date_options: current })) fail(409, 'picked', 'The date is picked. Change the time as for any plan.');
    return rebuilt(current, times);
  });
  await followEarliest(plan.post_id, next);
}

// ── Ticks ────────────────────────────────────────────────────

/** The times still ahead: a time that has started can't be ticked, picked or counted (08-extras section 2). */
const liveOptions = (value, now = Date.now()) => (value?.options || []).filter((o) => new Date(o.starts_at).getTime() > now);

function checkedIds(value, raw) {
  if (!Array.isArray(raw)) fail(422, 'validation', 'Tick the times that work for you.', { field: 'options' });
  const live = new Set(liveOptions(value).map((o) => o.id));
  if (raw.some((id) => typeof id === 'string' && !live.has(id) && (value.options || []).some((o) => o.id === id))) {
    fail(422, 'validation', 'That time has started. Choose another.', { field: 'options' });
  }
  const known = new Set((value.options || []).map((o) => o.id));
  const ids = [...new Set(raw.filter((id) => typeof id === 'string'))];
  if (ids.length !== raw.length || ids.some((id) => !known.has(id))) fail(422, 'validation', 'One of those times isn’t on the list any more.', { field: 'options' });
  return ids.sort();
}

function checkedNumbers(plan, body) {
  const party = body.party_size === undefined ? 1 : Number(body.party_size);
  if (!Number.isInteger(party) || party < 1 || party > LIMITS.people) fail(422, 'validation', 'Adults can be 1 to 10.', { field: 'party_size' });
  const kids = plan.kids_welcome ? (body.kids_count === undefined ? 0 : Number(body.kids_count)) : 0;
  if (!Number.isInteger(kids) || kids < 0 || kids > LIMITS.people) fail(422, 'validation', 'Kids can be 0 to 10.', { field: 'kids_count' });
  return { party_size: party, kids_count: kids };
}

/** Save one person's ticks (and, for an account, their numbers). The first answer's time keeps their place. */
async function saveTicks(plan, key, rawIds, numbers = null) {
  return extras.swap(plan.post_id, COLUMN, (current) => {
    if (!isPicking({ date_options: current })) fail(409, 'picked', 'The date is picked. Answer the invitation.');
    const ids = checkedIds(current, rawIds);
    return {
      ...current,
      ticks: { ...(current.ticks || {}), [key]: ids },
      numbers: numbers ? { ...(current.numbers || {}), [key]: numbers } : (current.numbers || {}),
      answered: { ...(current.answered || {}), [key]: (current.answered || {})[key] || nowIso() },
    };
  });
}

/** The plan, for an invited person with an account (not the host), while it is picking and the host has the switch. */
async function invitedFor(user, postId) {
  const viewer = await require('./planViewer').loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (!extras.takesExtras(plan) || !plan.date_options || !(await enabledFor(plan.host_user_id))) fail(404, 'not_found', "This isn't available right now.");
  return { viewer, plan };
}

/** PUT /api/plans/:id/dates/mine { options, party_size, kids_count }: an invited person's ticks. [] is "none of these". */
async function tickMine(user, postId, body = {}) {
  const { viewer, plan } = await invitedFor(user, postId);
  if (String(plan.host_user_id) === viewer.id) fail(409, 'host', "You're hosting this plan.");
  if (!isPicking(plan)) fail(409, 'picked', 'The date is picked. Answer the invitation.');
  if (!invites().isOpenForAnswers(plan)) fail(409, 'ended', 'This plan has started.');
  const invite = (await invites().viewerInvites(viewer.id, [plan.post_id])).get(plan.post_id);
  if (!invite) fail(403, 'not_invited', 'Only the people invited can answer.');
  await saveTicks(plan, extras.personKey(viewer.id), body.options, checkedNumbers(plan, body));
  return actions()._planBodyFor(plan.post_id, viewer);
}

// ── The card ─────────────────────────────────────────────────

/**
 * Who has been invited, as keys: accounts invited (by account, by email they took, or the open link they opened in
 * the app) and guests without an account (an address the host typed, or a guest who answered). Unopened text
 * invitations reach nobody yet.
 */
function invitedKeys(rows) {
  const keys = new Set();
  for (const r of rows || []) {
    if (r.status === 'cancelled') continue;
    if (r.invitee_user_id) keys.add(extras.personKey(r.invitee_user_id));
    else if (r.guest_name || (r.channel === 'email' && r.email)) keys.add(extras.guestKey(r.id));
  }
  return keys;
}

/**
 * The card's `dates` while picking (with `extras=1`): each time with how many can make it and whether the reader
 * ticked it; for the host, first names and the favorite. `names`: key → first name (the host's view only).
 */
function view(plan, { mineKey = null, host = false, names = null, invited = 0 }) {
  const value = plan.date_options;
  if (!isPicking(plan)) return null;
  const tz = rules.timezoneForPlan(plan);
  const ticks = value.ticks || {};
  const shown = liveOptions(value);
  // In the order they answered (a JSON object's keys don't keep it).
  const answeredKeys = Object.entries(value.answered || {}).filter(([k]) => ticks[k])
    .sort((x, y) => String(x[1]).localeCompare(String(y[1]))).map(([k]) => k);
  const counts = new Map(shown.map((o) => [o.id, answeredKeys.filter((k) => ticks[k].includes(o.id))]));
  const best = Math.max(0, ...[...counts.values()].map((v) => v.length));
  const options = shown.map((o) => {
    const who = counts.get(o.id);
    const out = { id: o.id, starts_at: o.starts_at, ends_at: o.ends_at, text: optionText(o.starts_at, tz), can: who.length,
      can_text: `${who.length} can make it` };
    if (mineKey) out.mine = Boolean((ticks[mineKey] || []).includes(o.id));
    if (host) {
      out.who = who.map((k) => names?.get(k)).filter(Boolean);
      out.most = best > 0 && who.length === best;
      out.pick_text = `Pick ${pickDate(o.starts_at, tz)}`;
      out.pick_note = pickNote(who.length, answeredKeys.length - who.length, Math.max(0, invited - answeredKeys.length), dayName(o.starts_at, tz));
    }
    return out;
  });
  if (host) options.sort((a, b) => (b.can - a.can) || a.starts_at.localeCompare(b.starts_at));
  const answered = answeredKeys.length;
  const out = {
    state: 'picking', options, answered, invited,
    answered_text: host ? `${answered} of ${invited} have answered` : `${answered} ${answered === 1 ? 'has' : 'have'} answered`,
  };
  if (mineKey) {
    const mineNumbers = (value.numbers || {})[mineKey] || null;
    out.mine = { answered: Boolean(ticks[mineKey]), ...(mineNumbers ? { party_size: mineNumbers.party_size, kids_count: mineNumbers.kids_count } : {}) };
  }
  return out;
}

/** "The 6 who ticked Sunday are in as soon as you pick it. The other 3 are asked if Sunday works. The 5 who haven't answered get the invitation with the date." */
function pickNote(ticked, others, silent, day) {
  const parts = [];
  if (ticked) parts.push(`The ${ticked} who ticked ${day} ${ticked === 1 ? 'is' : 'are'} in as soon as you pick it.`);
  if (others) parts.push(`The other ${others} ${others === 1 ? 'is' : 'are'} asked if ${day} works.`);
  if (silent) parts.push(`The ${silent} who ${silent === 1 ? 'hasn’t' : 'haven’t'} answered ${silent === 1 ? 'gets' : 'get'} the invitation with the date.`);
  return parts.join(' ');
}

/** For a card: the invited keys and (for the host) first names, read for one plan. */
async function cardParts(plan, { host = false } = {}) {
  const rows = await invites().loadInvites(plan.post_id);
  const keys = invitedKeys(rows);
  let names = null;
  if (host) {
    names = new Map();
    const accountIds = rows.filter((r) => r.invitee_user_id).map((r) => String(r.invitee_user_id));
    const accountNames = await actions().userNames(accountIds);
    for (const id of accountIds) names.set(extras.personKey(id), actions().firstOf(accountNames.get(id)));
    for (const r of rows) if (!r.invitee_user_id && r.guest_name) names.set(extras.guestKey(r.id), actions().firstOf(r.guest_name));
  }
  return { invited: keys.size, names };
}

// ── The pick ─────────────────────────────────────────────────

/** "{title} is {Sunday, Nov 22 at 4:00 PM}. You're in." and its kin. */
const pickedTitle = (plan, when, tail) => `${plan.post.title} is ${when}. ${tail}`;

async function noticeTo(plan, userId, title, kind) {
  return planNotify.notify({
    userId,
    type: 'plan_date_picked',
    title,
    body: null,
    link: `/plans/${plan.post_id}`,
    plan,
    recipientIsIn: kind === 'in',
    metadata: { opens: 'plan', outcome: kind },
    idempotencyKey: `plan_date_picked:${plan.post_id}:${userId}`,
  }).catch((err) => logger.warn('plans.dates.notice_failed', { planId: plan.post_id, error: err.message }));
}

/**
 * POST /api/plans/:id/dates/pick { option_id } (the host): sets the plan's time and settles everyone, once. Those who
 * ticked it are in with their numbers, in the order they answered, while there is room (an account past the room is
 * waitlisted; where the host's yes is needed they wait for it); everyone else invited is asked, with the time.
 */
async function pick(user, postId, body = {}, { io = null } = {}) {
  const { viewer, plan } = await invitedFor(user, postId);
  if (String(plan.host_user_id) !== viewer.id) fail(403, 'not_host', 'Only the host can do that.');
  if (!isPicking(plan)) fail(409, 'picked', 'The date is already picked.');
  if (plan.status !== 'open') fail(409, 'ended', 'This plan was cancelled.');
  const option = (plan.date_options.options || []).find((o) => o.id === body.option_id);
  if (!option) fail(422, 'validation', 'Choose one of the times.');
  if (new Date(option.starts_at).getTime() <= Date.now()) fail(409, 'past', 'That time has passed. Choose another.');
  // Once: the pick is written only if nobody picked first.
  const value = await extras.swap(plan.post_id, COLUMN, (current) => {
    if (!isPicking({ date_options: current })) fail(409, 'picked', 'The date is already picked.');
    return { ...current, picked: option.id };
  });
  const { error } = await supabaseAdmin.from('Post')
    .update({ event_date: option.starts_at, event_end_date: option.ends_at, updated_at: nowIso() }).eq('id', plan.post_id);
  if (error) throw new Error(`Failed to set the time: ${error.message}`);
  const fresh = await planService.loadPlanRow(plan.post_id);
  const result = await settle(fresh, value, option, { io });
  recordFunnelEvent('plan_date_picked', { userId: viewer.id, meta: { plan_id: plan.post_id, kind: plan.kind, ...result } });
  const body2 = await actions()._planBodyFor(plan.post_id, viewer);
  return { ...body2, settled: result };
}

async function settle(plan, value, option, { io }) {
  const tz = rules.timezoneForPlan(plan);
  const when = noticeDate(option.starts_at, tz);
  const hostFirst = await actions().hostFirstOf(plan);
  const ticks = value.ticks || {};
  const order = Object.entries(value.answered || {}).sort((a, b) => a[1].localeCompare(b[1])).map(([k]) => k);
  const ticked = order.filter((k) => (ticks[k] || []).includes(option.id));
  const rows = await invites().loadInvites(plan.post_id);
  const fullRows = await guests().guestRowsFull(plan.post_id);
  const rowById = new Map(fullRows.map((r) => [String(r.id), r]));
  const inviteByUser = new Map(rows.filter((r) => r.invitee_user_id).map((r) => [String(r.invitee_user_id), r]));
  const requests = await actions().activeRequests(plan.post_id);
  let free = plan.spots - planService.seatsTaken(plan, requests, await guests().guestSeatsOf(plan.post_id));
  const out = { in: 0, waiting: 0, waitlisted: 0, asked: 0 };
  const settledKeys = new Set();
  const viewer = await require('./planViewer').loadViewer({ id: String(plan.host_user_id) });

  for (const key of ticked) {
    try {
      if (key.startsWith('p:')) {
        const userId = key.slice(2);
        const invite = inviteByUser.get(userId);
        if (!invite || ['cancelled', 'declined'].includes(invite.status) || viewer.blockedUserIds.has(userId)) continue;
        const numbers = (value.numbers || {})[key] || { party_size: 1, kids_count: 0 };
        const seats = rules.seatsFor(plan, numbers.party_size, plan.kids_welcome ? numbers.kids_count : 0);
        const status = seats > free ? 'waitlisted' : invite.needs_host_ok ? 'pending' : 'accepted';
        const request = await joinAccount(plan, userId, numbers, status, value.answered[key]);
        if (!request) continue;
        settledKeys.add(key);
        if (status === 'accepted') {
          free -= seats;
          out.in += 1;
          await invites().markAccepted(plan, userId, request);
          await admitQuietly(plan, request, { io });
          await noticeTo(plan, userId, pickedTitle(plan, when, 'You’re in.'), 'in');
        } else if (status === 'pending') {
          out.waiting += 1;
          await invites().markAccepted(plan, userId, request);
          const names = await actions().userNames([userId]);
          await planNotify.requestReceived({ plan, request, hostFirst, requesterFirst: actions().firstOf(names.get(userId)) });
          await noticeTo(plan, userId, pickedTitle(plan, when, `You’ll hear when ${hostFirst} says yes.`), 'waiting');
        } else {
          out.waitlisted += 1;
          await invites().markAccepted(plan, userId, request);
          await noticeTo(plan, userId, pickedTitle(plan, when, 'You’re on the waitlist.'), 'waitlisted');
        }
      } else {
        const row = rowById.get(key.slice(2));
        if (!row || row.status === 'cancelled' || row.invitee_user_id) continue;
        const seats = (Number(row.guest_adults) || 1) + (plan.kids_welcome ? Number(row.guest_kids) || 0 : 0);
        if (seats > free) {
          // No waitlist without an account: their answer becomes Maybe, with one email in place of "Can you make it?".
          if (await guests().settleFull(plan, row, when)) {
            settledKeys.add(key);
            out.full = (out.full || 0) + 1;
          }
          continue;
        }
        const settled = await guests().settlePicked(plan, row);
        if (!settled) continue;
        settledKeys.add(key);
        free -= seats;
        if (settled === 'in') out.in += 1;
        else out.waiting += 1;
      }
    } catch (err) {
      logger.warn('plans.dates.settle_failed', { planId: plan.post_id, key, error: err.message });
    }
  }

  // Everyone else who was invited is asked, with the time: a notice to an account, an email to an address.
  const askTitle = pickedTitle(plan, when, 'Can you make it?');
  for (const r of rows) {
    if (r.status === 'cancelled' || r.status === 'declined') continue;
    try {
      if (r.invitee_user_id) {
        const key = extras.personKey(r.invitee_user_id);
        if (settledKeys.has(key) || viewer.blockedUserIds.has(String(r.invitee_user_id))) continue;
        await noticeTo(plan, String(r.invitee_user_id), askTitle, 'asked');
        out.asked += 1;
      } else if (r.email) {
        const key = extras.guestKey(r.id);
        if (settledKeys.has(key)) continue;
        const full = rowById.get(String(r.id)) || r;
        const sent = full.guest_name ? await guests().sendDateEmail(plan, full, 'date_ask', { when })
          : await invites().resendInviteEmail(plan, full, hostFirst);
        if (sent) out.asked += 1;
      }
    } catch (err) {
      logger.warn('plans.dates.ask_failed', { planId: plan.post_id, error: err.message });
    }
  }
  return out;
}

/** The account's ask, made by the pick: accepted, pending (the host's yes) or waitlisted, with their numbers. */
async function joinAccount(plan, userId, numbers, status, answeredAt) {
  const stamp = nowIso();
  const row = {
    status,
    party_size: numbers.party_size,
    // None is null on a request (its check: 1 to 10 or nothing).
    kids_count: plan.kids_welcome && numbers.kids_count > 0 ? numbers.kids_count : null,
    decided_by: status === 'accepted' ? 'rule' : null,
    decided_at: status === 'accepted' ? stamp : null,
    queued_at: answeredAt || stamp,
    reconfirm_requested_at: null,
    reconfirmed: null,
    reconfirm_reason: null,
    on_my_way_at: null,
    updated_at: stamp,
  };
  const { data: existing } = await supabaseAdmin.from('PlanRequest').select('id, status').eq('post_id', plan.post_id).eq('user_id', userId).maybeSingle();
  if (existing) {
    if (['accepted', 'pending', 'waitlisted', 'paying'].includes(existing.status)) return null;
    const { data, error } = await supabaseAdmin.from('PlanRequest').update(row).eq('id', existing.id).select(planService.REQUEST_COLUMNS);
    if (error) throw new Error(`Failed to save the answer: ${error.message}`);
    return data?.[0] || null;
  }
  const { data, error } = await supabaseAdmin.from('PlanRequest')
    .insert({ ...row, post_id: plan.post_id, user_id: userId, ask_count: 1, created_at: stamp }).select(planService.REQUEST_COLUMNS).single();
  if (error) {
    if (error.code === '23505') return null;
    throw new Error(`Failed to save the answer: ${error.message}`);
  }
  return data;
}

/** In the chat and the people line, as admit does, without its notices: the pick sends its own, once. */
async function admitQuietly(plan, request, { io }) {
  const planChat = require('./planChat');
  const roomId = await planChat.ensureRoom(plan, { io });
  await planChat.addMember(roomId, request.user_id, { io });
  const names = await actions().userNames([request.user_id]);
  const who = actions().partyLabel(names.get(String(request.user_id)), rules.seatsFor(plan, request.party_size, request.kids_count));
  await planChat.systemLine(roomId, request.user_id, `${who} ${who.includes(' + ') ? 'are' : 'is'} in`);
}

// ── Times going by (the Plans tick) ──────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Each picking plan, on the Plans tick: its place in lists follows the earliest time still ahead; once, 24 hours before
 * that time (never in the first hour after posting), the host hears "Pick a date for {title}. {9} of {14} have
 * answered."; when every time has started with no pick, the plan's end is set to now so the lifecycle ends it as a plan
 * whose time passed, and the host is told once "No date was picked for {title}, and its times have passed." The invited
 * are told nothing.
 */
async function runTimes({ now = Date.now() } = {}) {
  const { data, error } = await supabaseAdmin.from('Plan').select(planService.PLAN_SELECT)
    .eq('status', 'open').not('date_options', 'is', null).is('date_options->>picked', null).limit(200);
  if (error) throw new Error(`Failed to read plans picking a date: ${error.message}`);
  const out = { moved: 0, reminded: 0, lapsed: 0 };
  for (const plan of data || []) {
    try {
      if (!isPicking(plan)) continue;
      const value = plan.date_options;
      const ahead = liveOptions(value, now);
      if (ahead.length) {
        const first = ahead[0];
        if (new Date(plan.post.event_date).toISOString() !== new Date(first.starts_at).toISOString()) {
          await followEarliest(plan.post_id, { options: ahead });
          out.moved += 1;
        }
        const due = now >= new Date(first.starts_at).getTime() - DAY_MS && now >= new Date(plan.created_at).getTime() + HOUR_MS;
        if (due && !value.pick_reminded_at && (await enabledFor(plan.host_user_id))) {
          let won = false;
          await extras.swap(plan.post_id, COLUMN, (current) => {
            if (!isPicking({ date_options: current }) || current.pick_reminded_at) return undefined;
            won = true;
            return { ...current, pick_reminded_at: nowIso() };
          });
          if (won) {
            const parts = await cardParts(plan);
            const answered = Object.keys(value.answered || {}).filter((k) => (value.ticks || {})[k]).length;
            await planNotify.notify({
              userId: plan.host_user_id, type: 'plan_date_pick',
              title: `Pick a date for ${plan.post.title}. ${answered} of ${parts.invited} have answered.`,
              body: null, link: `/plans/${plan.post_id}`, plan, recipientIsIn: true,
              metadata: { opens: 'plan' }, idempotencyKey: `plan_date_pick:${plan.post_id}`,
            });
            out.reminded += 1;
          }
        }
        continue;
      }
      // Every time has started: the plan ends now, as a plan whose time passed, and the host hears it once.
      let lapsed = false;
      await extras.swap(plan.post_id, COLUMN, (current) => {
        if (!isPicking({ date_options: current }) || current.lapsed_at) return undefined;
        lapsed = true;
        return { ...current, lapsed_at: nowIso() };
      });
      if (!lapsed) continue;
      const last = value.options[value.options.length - 1];
      const end = new Date(Math.min(now, new Date(last.ends_at).getTime())).toISOString();
      await supabaseAdmin.from('Post').update({ event_date: last.starts_at, event_end_date: end, updated_at: nowIso() }).eq('id', plan.post_id);
      await planNotify.notify({
        userId: plan.host_user_id, type: 'plan_date_lapsed',
        title: `No date was picked for ${plan.post.title}, and its times have passed.`,
        body: null, link: `/plans/${plan.post_id}`, plan, recipientIsIn: true,
        metadata: { opens: 'plan' }, idempotencyKey: `plan_date_lapsed:${plan.post_id}`,
      });
      out.lapsed += 1;
    } catch (err) {
      logger.warn('plans.dates.times_failed', { planId: plan?.post_id, error: err.message });
    }
  }
  return out;
}

module.exports = {
  runTimes,
  liveOptions,
  FLAG,
  LIMITS,
  enabledFor,
  switchByHost,
  isPicking,
  checkedTimes,
  initialValue,
  replaceFromForm,
  saveTicks,
  checkedIds,
  tickMine,
  invitedKeys,
  view,
  cardParts,
  pick,
  optionText,
  noticeDate,
};
