'use strict';

/**
 * Plans for the holidays, the extras: gift exchange (docs/product/plans-holidays/08-extras.md, section 4; the
 * founder's go on November 15 and 16, 2026). Behind `plans_gift_exchange`, read for the plan's host.
 *
 * People who are in may join. On the draw each gets one name. Nobody sees who drew whom: not the host and not
 * Pantopus's screens.
 *
 *  - Plan.gift: { rev, budget_cents, draw_at, state: 'open' | 'drawn', people: [{ who, wish, at }], drawn_at,
 *    draw_count, short_told_at }. Changed by revision as every extra (plan_extra_swap).
 *  - Plan.gift_pairs: { "<giver key>": "<receiver key>" }, written only by the draw (plan_gift_draw, with the gift in
 *    the same write) and **never selected**: it is not in planService.PLAN_COLUMNS, and the one read that touches it
 *    (plan_gift_mine) answers a single person's own receiver, for that person's own card.
 *  - Joining needs being in; a wish is 0 to 120 characters. One key a party: a guest's row with its adults is one
 *    person in the draw, so two people of one party never draw each other.
 *  - The draw runs on the Plans tick at draw_at, or when the host taps "Draw names now". It needs three people; with
 *    fewer it doesn't run and the host is told once. Nobody draws themselves (one cycle through everyone).
 *  - After the draw nobody can join. Someone who drew and leaves: the host is told, with "Draw again", which draws
 *    for everyone who is still in and tells them.
 */

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { recordFunnelEvent } = require('../funnelEvents');
const planService = require('./planService');
const planNotify = require('./planNotifications');
const rules = require('./planRules');
const extras = require('./planExtras');

const actions = () => require('./planActions');
const guests = () => require('./planGuests');

const FLAG = 'plans_gift_exchange';
const COLUMN = 'gift';
const LIMITS = Object.freeze({ minCents: 100, maxCents: 50000, wish: 120, people: 3 });

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();

const enabledFor = (hostId) => extras.enabledFor(FLAG, hostId);
const switchByHost = (hostIds) => extras.switchByHost(FLAG, hostIds);

// ── Words ────────────────────────────────────────────────────

const fmt = (iso, tz, opts) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(new Date(iso));
function timeWords(iso, tz) {
  const t = fmt(iso, tz, { hour: 'numeric', minute: '2-digit' });
  if (t === '12:00 PM') return 'noon';
  if (t === '12:00 AM') return 'midnight';
  return t.replace(':00 ', ' ');
}
/** "Friday at noon"; "Friday, Dec 4 at 6 PM" a week or more away. */
function drawWhen(iso, tz) {
  const days = (new Date(iso).getTime() - Date.now()) / 86400000;
  const day = days >= 6 ? fmt(iso, tz, { weekday: 'long', month: 'short', day: 'numeric' }) : fmt(iso, tz, { weekday: 'long' });
  return `${day} at ${timeWords(iso, tz)}`;
}

// ── The host form ────────────────────────────────────────────

/** "Spend up to": $1 to $500, in cents. */
function checkedBudget(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(422, 'validation', 'Fill in the gift exchange.');
  const cents = body.budget_cents;
  if (!Number.isInteger(cents) || cents < LIMITS.minCents || cents > LIMITS.maxCents) {
    fail(422, 'validation', 'Spend up to $1 to $500.', { field: 'budget_cents' });
  }
  return cents;
}

/** The host form's gift: { budget_cents, draw_at }, checked against the plan's start. */
function checkedInput(body, startsAt) {
  const cents = checkedBudget(body);
  const drawAt = typeof body.draw_at === 'string' ? Date.parse(body.draw_at) : NaN;
  if (!Number.isFinite(drawAt) || drawAt <= Date.now() || drawAt > new Date(startsAt).getTime()) {
    fail(422, 'validation', 'Draw names between now and the start of the plan.', { field: 'draw_at' });
  }
  return { budget_cents: cents, draw_at: new Date(drawAt).toISOString() };
}

function initialValue(body, startsAt) {
  if (body == null) return null;
  return { rev: 1, ...checkedInput(body, startsAt), state: 'open', people: [] };
}

/**
 * The change call's gift, checked: before the draw the budget and the draw time; after it (08-extras section 4) the
 * budget alone, and a draw time sent along is ignored (the stored one stays).
 */
function checkedChange(plan, body, startsAt) {
  if (plan?.gift?.state === 'drawn') return { budget_cents: checkedBudget(body) };
  return checkedInput(body, startsAt);
}

/** The change call's gift: the budget and draw time change before the draw; null takes it away (and its pairs). */
async function replaceFromForm(plan, body) {
  if (body === null) {
    await removeAll(plan.post_id);
    return;
  }
  const asked = checkedChange(plan, body, plan.post.event_date);
  await extras.swap(plan.post_id, COLUMN, (current) => {
    if (current?.state === 'drawn') {
      if (current.budget_cents === asked.budget_cents) return undefined;
      return { ...current, budget_cents: asked.budget_cents };
    }
    // Read as drawn, but taken away since: a new exchange needs its draw time.
    if (!asked.draw_at) checkedInput(body, plan.post.event_date);
    return { rev: 0, state: 'open', people: [], ...current, ...asked, short_told_at: null };
  });
}

async function removeAll(postId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await extras.readValue(postId, COLUMN);
    if (!current) return;
    const { data, error } = await supabaseAdmin.rpc('plan_gift_draw', {
      p_post_id: postId, p_expected_rev: Number(current.rev) || 0, p_gift: null, p_pairs: null,
    });
    if (error) throw new Error(`Failed to save the change: ${error.message}`);
    if (data === true) return;
  }
  fail(409, 'changed', 'Someone just changed this. Here’s the latest.');
}

// ── The card ─────────────────────────────────────────────────

/** Who a key names, as Plans shows names ("Sam K."), and their wish. */
async function personOf(plan, key) {
  if (!key) return null;
  if (key.startsWith('p:')) {
    const id = key.slice(2);
    const names = await require('./planInvites').names([id]);
    return { name: names.get(id)?.display_name || planService.NO_NAME };
  }
  const { data } = await supabaseAdmin.from('PlanInvite').select('guest_name').eq('id', key.slice(2)).maybeSingle();
  return { name: planService.displayName({ name: data?.guest_name || '' }) };
}

/**
 * The reader's own receiver, read with the one call that touches gift_pairs: { name, wish } or null. Only ever for
 * the reader's own card.
 */
async function givingTo(plan, mineKey) {
  if (!mineKey || plan.gift?.state !== 'drawn') return null;
  const { data, error } = await supabaseAdmin.rpc('plan_gift_mine', { p_post_id: plan.post_id, p_key: mineKey });
  if (error) {
    logger.warn('plans.gift.mine_failed', { planId: plan.post_id, error: error.message });
    return null;
  }
  const to = typeof data === 'string' ? data : null;
  if (!to) return null;
  const person = await personOf(plan, to);
  const wish = (plan.gift.people || []).find((p) => p.who === to)?.wish || null;
  return { name: person.name, first: actions().firstOf(person.name), wish };
}

/**
 * The card's gift for the host and people who are in. `mineKey`: the reader's key (the host's too: a host may join).
 * `giving` is the reader's own receiver (givingTo), never anyone else's.
 */
function view(plan, { mineKey, isIn, giving = null }) {
  const gift = plan.gift;
  if (!gift) return null;
  const tz = rules.timezoneForPlan(plan);
  const me = (gift.people || []).find((p) => p.who === mineKey) || null;
  const drawn = gift.state === 'drawn';
  const day = fmt(plan.post.event_date, tz, { weekday: 'long' });
  return {
    budget_cents: gift.budget_cents,
    budget_text: `Up to ${extras.moneyText(gift.budget_cents)}`,
    draw_at: gift.draw_at,
    draw_text: drawn ? 'Names are drawn' : `Names are drawn ${drawWhen(gift.draw_at, tz)}`,
    state: drawn ? 'drawn' : 'open',
    joined: (gift.people || []).length,
    joined_text: `${(gift.people || []).length} joined`,
    can_join: Boolean(isIn && !drawn && !me),
    mine: {
      in: Boolean(me),
      wish: me?.wish || null,
      giving_to: me && drawn && giving ? { name: giving.name, wish: giving.wish } : null,
      ...(me && drawn && giving ? {
        wish_text: giving.wish ? `${giving.first}’s wish` : null,
        secret_text: `Only you can see who you drew. Bring it on ${day}.`,
      } : {}),
    },
  };
}

// ── Joining ──────────────────────────────────────────────────

function cleanWish(value) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length > LIMITS.wish) fail(422, 'validation', `Use up to ${LIMITS.wish} characters for your wish.`, { field: 'wish' });
  return text || null;
}

async function assertOpenPlan(plan) {
  const state = rules.planState(plan, plan.post.event_date, plan.post.event_end_date);
  if (state === 'cancelled') fail(409, 'ended', 'This plan was cancelled.');
  if (state === 'ended') fail(409, 'ended', 'This plan is over.');
}

async function joinFor(plan, key, body, mode) {
  await assertOpenPlan(plan);
  const keys = await extras.keysIn(plan);
  if (key !== hostKey(plan) && !keys.includes(key)) fail(403, 'not_in', "You're not in this plan.");
  const wish = mode === 'leave' ? null : cleanWish(body.wish);
  await extras.swap(plan.post_id, COLUMN, (current) => {
    if (!current) fail(404, 'not_found', "This plan doesn't have a gift exchange.");
    const people = current.people || [];
    const me = people.find((p) => p.who === key);
    if (current.state === 'drawn' && mode !== 'wish') fail(409, 'drawn', 'Names are drawn, so the exchange is closed.');
    if (mode === 'join') {
      if (me) return { ...current, people: people.map((p) => (p.who === key ? { ...p, wish } : p)) };
      return { ...current, people: [...people, { who: key, wish, at: nowIso() }] };
    }
    if (!me) fail(409, 'not_joined', 'You haven’t joined the exchange.');
    if (mode === 'wish') return { ...current, people: people.map((p) => (p.who === key ? { ...p, wish } : p)) };
    return { ...current, people: people.filter((p) => p.who !== key) };
  });
  const fresh = await planService.loadPlanRow(plan.post_id);
  return { gift: view(fresh, { mineKey: key, isIn: true, giving: await givingTo(fresh, key) }) };
}

const hostKey = (plan) => extras.personKey(plan.host_user_id);

/** POST /join { wish }, PATCH /mine { wish }, DELETE /mine (before the draw): the host or someone in. */
async function act(user, postId, body, mode) {
  const { plan, role, key } = await extras.personFor(user, postId, FLAG);
  if (!plan.gift) fail(404, 'not_found', "This plan doesn't have a gift exchange.");
  return joinFor(plan, role === 'host' ? hostKey(plan) : key, body || {}, mode);
}
async function guestAct(postId, secret, body, mode) {
  const { plan, key } = await extras.guestFor(postId, secret, FLAG);
  if (!plan.gift) fail(404, 'not_found', "This plan doesn't have a gift exchange.");
  return joinFor(plan, key, body || {}, mode);
}

// ── The draw ─────────────────────────────────────────────────

/** One cycle through everyone, in a random order: nobody draws themselves. */
function cycle(keys) {
  const order = [...keys];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pairs = {};
  order.forEach((k, i) => { pairs[k] = order[(i + 1) % order.length]; });
  return pairs;
}

/**
 * Draw (or draw again) for everyone who joined and is still in. Answers { drawn: true, count } or { drawn: false,
 * joined } when fewer than three. Tells everyone once: "Names are drawn for {title}. See who you're giving to." (again:
 * "Names were drawn again."), by notice or by email.
 */
async function draw(plan, { again = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await extras.readValue(plan.post_id, COLUMN);
    if (!current) return { drawn: false, joined: 0 };
    if (current.state === 'drawn' && !again) return { drawn: false, already: true };
    const keysIn = new Set([...(await extras.keysIn(plan)), hostKey(plan)]);
    const people = (current.people || []).filter((p) => keysIn.has(p.who));
    if (people.length < LIMITS.people) return { drawn: false, joined: people.length };
    const pairs = cycle(people.map((p) => p.who));
    const next = {
      ...current, people, state: 'drawn', drawn_at: nowIso(), draw_count: (Number(current.draw_count) || 0) + 1,
      rev: (Number(current.rev) || 0) + 1,
    };
    const { data, error } = await supabaseAdmin.rpc('plan_gift_draw', {
      p_post_id: plan.post_id, p_expected_rev: Number(current.rev) || 0, p_gift: next, p_pairs: pairs,
    });
    if (error) throw new Error(`Failed to draw names: ${error.message}`);
    if (data !== true) continue;
    recordFunnelEvent('plan_gift_drawn', { meta: { plan_id: plan.post_id, kind: plan.kind, people: people.length, again } });
    await tellDrawn(plan, next, again);
    return { drawn: true, count: people.length };
  }
  fail(409, 'changed', 'Someone just changed this. Here’s the latest.');
  return null;
}

async function tellDrawn(plan, gift, again) {
  const title = again ? 'Names were drawn again.' : `Names are drawn for ${plan.post.title}. See who you’re giving to.`;
  for (const p of gift.people) {
    try {
      if (p.who.startsWith('p:')) {
        await planNotify.notify({
          userId: p.who.slice(2),
          type: 'plan_gift_drawn',
          title,
          body: again ? plan.post.title : null,
          link: `/plans/${plan.post_id}`,
          plan,
          recipientIsIn: true,
          metadata: { opens: 'plan', again },
          idempotencyKey: `plan_gift_drawn:${plan.post_id}:${p.who}:${gift.draw_count}`,
        });
      } else {
        const { data: row } = await supabaseAdmin.from('PlanInvite').select(guests().GUEST_COLUMNS_TEXT).eq('id', p.who.slice(2)).maybeSingle();
        if (row && row.email) await guests().sendGiftEmail(plan, row, again ? 'gift_redrawn' : 'gift_drawn');
      }
    } catch (err) {
      logger.warn('plans.gift.tell_failed', { planId: plan.post_id, error: err.message });
    }
  }
}

/** POST /api/plans/:id/gift/draw (the host): "Draw names now", or "Draw again" after someone who drew left. */
async function drawNow(user, postId) {
  const { plan, role } = await extras.personFor(user, postId, FLAG);
  if (role !== 'host') fail(403, 'not_host', 'Only the host can do that.');
  if (!plan.gift) fail(404, 'not_found', "This plan doesn't have a gift exchange.");
  await assertOpenPlan(plan);
  const result = await draw(plan, { again: plan.gift.state === 'drawn' });
  if (!result.drawn) {
    const n = result.joined || 0;
    fail(409, 'too_few', `Only ${n} joined the gift exchange. Invite more, or call it off.`, { joined: n });
  }
  const fresh = await planService.loadPlanRow(plan.post_id);
  return { gift: view(fresh, { mineKey: hostKey(plan), isIn: true, giving: await givingTo(fresh, hostKey(plan)) }) };
}

/** The Plans tick: draws that are due, and the one "only {2} joined" to the host when there are too few. */
async function runDue() {
  const { data, error } = await supabaseAdmin.from('Plan').select(planService.PLAN_SELECT)
    .eq('status', 'open').not('gift', 'is', null).eq('gift->>state', 'open')
    .lte('gift->>draw_at', nowIso()).limit(100);
  if (error) throw new Error(`Failed to read gift exchanges: ${error.message}`);
  let drawn = 0;
  for (const plan of data || []) {
    try {
      if (!extras.takesExtras(plan) || !(await enabledFor(plan.host_user_id))) continue;
      const result = await draw(plan);
      if (result.drawn) { drawn += 1; continue; }
      if (result.already || plan.gift.short_told_at) continue;
      const n = result.joined || 0;
      await extras.swap(plan.post_id, COLUMN, (current) => (current && !current.short_told_at ? { ...current, short_told_at: nowIso() } : undefined));
      await planNotify.notify({
        userId: plan.host_user_id,
        type: 'plan_gift_short',
        title: `Only ${n} joined the gift exchange. Invite more, or call it off.`,
        body: plan.post.title,
        link: `/plans/${plan.post_id}`,
        plan,
        recipientIsIn: true,
        metadata: { opens: 'plan', joined: n },
        idempotencyKey: `plan_gift_short:${plan.post_id}`,
      });
    } catch (err) {
      logger.warn('plans.gift.tick_failed', { planId: plan?.post_id, error: err.message });
    }
  }
  return drawn;
}

/**
 * Someone left the plan (or was removed): before the draw they leave the exchange; after it, if they drew, the host is
 * told "{Name} left after the names were drawn." with "Draw again". Never fails the caller.
 */
async function onLeave(postId, key) {
  try {
    const plan = await planService.loadPlanRow(postId);
    if (!plan?.gift || !extras.takesExtras(plan) || !(plan.gift.people || []).some((p) => p.who === key)) return;
    if (plan.gift.state !== 'drawn') {
      await extras.swap(postId, COLUMN, (current) => (current && current.state !== 'drawn'
        ? { ...current, people: (current.people || []).filter((p) => p.who !== key) } : undefined));
      return;
    }
    if (!(await enabledFor(plan.host_user_id))) return;
    const person = await personOf(plan, key);
    await planNotify.notify({
      userId: plan.host_user_id,
      type: 'plan_gift_left',
      title: `${actions().firstOf(person.name)} left after the names were drawn.`,
      body: plan.post.title,
      link: `/plans/${plan.post_id}`,
      plan,
      recipientIsIn: true,
      metadata: { opens: 'plan', action: 'gift_draw_again' },
      idempotencyKey: `plan_gift_left:${postId}:${key}:${plan.gift.draw_count || 1}`,
    });
  } catch (err) {
    logger.warn('plans.gift.leave_failed', { postId, error: err.message });
  }
}

/** For a guest who is in (the web page's for_guest), while the host has the switch. */
async function forGuest(plan, row) {
  if (!plan.gift || !extras.takesExtras(plan) || !(await enabledFor(plan.host_user_id))) return null;
  const key = extras.guestKey(row.id);
  return view(plan, { mineKey: key, isIn: true, giving: await givingTo(plan, key) });
}

module.exports = {
  FLAG,
  LIMITS,
  enabledFor,
  switchByHost,
  checkedInput,
  checkedChange,
  initialValue,
  replaceFromForm,
  view,
  givingTo,
  hostKey,
  join: (user, postId, body) => act(user, postId, body, 'join'),
  setWish: (user, postId, body) => act(user, postId, body, 'wish'),
  leave: (user, postId) => act(user, postId, {}, 'leave'),
  guestJoin: (postId, secret, body) => guestAct(postId, secret, body, 'join'),
  guestSetWish: (postId, secret, body) => guestAct(postId, secret, body, 'wish'),
  guestLeave: (postId, secret) => guestAct(postId, secret, {}, 'leave'),
  drawNow,
  runDue,
  onLeave,
  forGuest,
  _cycle: cycle,
};
