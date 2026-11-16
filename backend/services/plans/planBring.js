'use strict';

/**
 * Plans for the holidays, H2: the bring list (docs/product/plans-holidays/03-build-contract.md, section 7; the
 * founder's go on November 15, 2026). Behind `plans_bring_list`, read for the plan's host; with it off every route
 * answers "not found" and no card or page carries the list.
 *
 *  - One JSON value on the plan (K4): { rev, guests_can_add, items: [{ id, label, note, by, claim }] }, up to 30
 *    items. Every change writes the whole value with rev + 1, only if rev is still the one read
 *    (plan_bring_swap); the server reads again and tries up to three times, then answers 409 bring_changed.
 *  - A claim is { kind: 'host' | 'user' | 'guest', id, name, at }: the host, an account that is in (id: its request)
 *    or a guest without an account who is in (id: their invitation). One claim an item. `name` is a first name.
 *  - Readers get the list with each claim reduced to { name, mine } and how many items are still open.
 *  - Someone who leaves or is removed gives back what they claimed. A business's plan has no bring list.
 */

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { isFeatureEnabled } = require('../featureFlagService');
const { recordFunnelEvent } = require('../funnelEvents');
const planService = require('./planService');
const planNotify = require('./planNotifications');

const actions = () => require('./planActions');
const guests = () => require('./planGuests');

const FLAG = 'plans_bring_list';
const LIMITS = Object.freeze({ items: 30, label: 60, note: 80, retries: 3 });
const CLAIM_NOTICE_WINDOW_MS = 30 * 60 * 1000;
const OPEN_NOTICE_BEFORE_MS = 2 * 24 * 60 * 60 * 1000;

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();
const newItemId = () => crypto.randomBytes(4).toString('hex');

/** A person's plan may have a bring list; a business's never does. */
const takesBringList = (plan) => Boolean(plan) && !plan.business_user_id;

async function enabledFor(hostId) {
  return Boolean(hostId) && isFeatureEnabled(FLAG, String(hostId));
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
  await Promise.all(ids.map(async (id) => out.set(id, await enabledFor(id))));
  return out;
}

const itemsOf = (list) => (list && Array.isArray(list.items) ? list.items : []);
const openCountOf = (list) => itemsOf(list).filter((item) => !item.claim).length;

/** Things still open on the plan's list (0 without a list, or with the switch off): the reminder email's line. */
async function openCount(plan) {
  if (!takesBringList(plan) || !plan.bring_list || !(await enabledFor(plan.host_user_id))) return 0;
  return openCountOf(plan.bring_list);
}

function cleanLine(value, max, what) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length > max) fail(422, 'validation', `Use up to ${max} characters for ${what}.`);
  return text;
}

/**
 * The list as readers get it: each claim reduced to { name, mine }, and how many are still open. `mineOf(claim)`
 * says whether a claim is the reader's. Null when there is no list or it has nothing on it.
 */
function view(list, mineOf = () => false) {
  const items = itemsOf(list);
  if (!list || items.length === 0) return null;
  return {
    rev: Number(list.rev) || 0,
    guests_can_add: Boolean(list.guests_can_add),
    open_count: openCountOf(list),
    items: items.map((item) => ({
      id: item.id,
      label: item.label,
      note: item.note || null,
      claim: item.claim ? { name: item.claim.name, mine: Boolean(mineOf(item.claim)) } : null,
    })),
  };
}

/** Whose claim is the reader's: the host's own, an account's by its request, a guest's by their invitation. */
function mineFor({ role, requestId = null, inviteId = null }) {
  return (claim) => (role === 'host' && claim.kind === 'host')
    || (requestId && claim.kind === 'user' && claim.id === requestId)
    || (inviteId && claim.kind === 'guest' && claim.id === inviteId);
}

/** The list changes only while the plan is on: never once it is cancelled or over. */
async function assertOpen(plan) {
  const state = require('./planRules').planState(plan, plan.post.event_date, plan.post.event_end_date);
  if (state === 'cancelled') fail(409, 'ended', `${await actions().hostFirstOf(plan)} cancelled this plan.`);
  if (state === 'ended') fail(409, 'ended', 'This plan is over.');
}

async function readList(postId) {
  const { data, error } = await supabaseAdmin.from('Plan').select('bring_list').eq('post_id', postId).maybeSingle();
  if (error) throw new Error(`Failed to read the bring list: ${error.message}`);
  return data ? data.bring_list || null : null;
}

/**
 * Change the list: `mutate(current)` returns the new value (or throws a PlanError, which stops at once). Written only
 * if nobody changed it since it was read; read again and retried up to three times, then 409 bring_changed.
 */
async function swap(postId, mutate) {
  for (let attempt = 0; attempt < LIMITS.retries; attempt += 1) {
    const current = await readList(postId);
    const rev = Number(current?.rev) || 0;
    const next = mutate(current);
    if (next === null) return current;
    next.rev = rev + 1;
    const { data, error } = await supabaseAdmin.rpc('plan_bring_swap', { p_post_id: postId, p_expected_rev: rev, p_list: next });
    if (error) throw new Error(`Failed to save the bring list: ${error.message}`);
    if (data === true) return next;
  }
  fail(409, 'bring_changed', 'Someone just changed the list. Here’s the latest.', { bring_latest: true });
  return null;
}

// ── Who is changing it ───────────────────────────────────────

/** The host, or an account that is in, of a plan the viewer can read. */
async function personFor(user, postId) {
  const viewer = await require('./planViewer').loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (!takesBringList(plan) || !(await enabledFor(plan.host_user_id))) fail(404, 'not_found', "This isn't available right now.");
  await assertOpen(plan);
  if (require('./planBusiness').runsPlan(plan, viewer)) {
    return { viewer, plan, who: { kind: 'host', id: String(plan.host_user_id), name: await actions().hostFirstOf(plan) }, mine: mineFor({ role: 'host' }) };
  }
  const { data: request, error } = await supabaseAdmin.from('PlanRequest').select('id, status')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (error) throw new Error(`Failed to load your request: ${error.message}`);
  if (!request || request.status !== 'accepted') fail(403, 'not_in', "You're not in this plan.");
  const name = actions().firstOf((await actions().userNames([viewer.id])).get(viewer.id));
  return { viewer, plan, who: { kind: 'user', id: request.id, name }, mine: mineFor({ role: 'guest', requestId: request.id }) };
}

/** A guest without an account who is in, by their key (`guest` or the web's cookie). */
async function guestFor(postId, key) {
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !guests().takesAnswers(plan) || !(await guests().switchFor(plan.host_user_id)) || !(await enabledFor(plan.host_user_id))) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  const row = await guests().rowByKey(postId, key);
  if (!row || row.status === 'cancelled') fail(404, 'not_found', 'This invitation is no longer open.');
  if (row.status !== 'accepted' || row.needs_host_ok) fail(403, 'not_in', "You're not in this plan yet.");
  await assertOpen(plan);
  return {
    plan,
    who: { kind: 'guest', id: row.id, name: actions().firstOf(row.guest_name) },
    mine: mineFor({ role: 'guest', inviteId: row.id }),
  };
}

// ── Changing it ──────────────────────────────────────────────

/**
 * PUT /api/plans/:id/bring { items: [{ id?, label, note?, mine? }], guests_can_add? } (the host): replaces the items.
 * An item that keeps its id keeps its claim; `mine` claims (or gives back) an item for the host.
 */
/** The host's items, checked: up to 30, each a label of 1 to 60 characters, a note up to 80, and `mine`. */
function checkedItems(body) {
  const raw = Array.isArray(body?.items) ? body.items : null;
  if (!raw) fail(422, 'validation', 'Send the list’s items.');
  if (raw.length > LIMITS.items) fail(422, 'validation', `The list can have up to ${LIMITS.items} things.`);
  return raw.map((item) => {
    const label = cleanLine(item?.label, LIMITS.label, 'a thing');
    if (!label) fail(422, 'validation', 'Name each thing on the list.');
    return {
      id: typeof item?.id === 'string' && /^[0-9a-f]{8}$/.test(item.id) ? item.id : null,
      label,
      note: cleanLine(item?.note, LIMITS.note, 'a note') || null,
      mine: typeof item?.mine === 'boolean' ? item.mine : undefined,
    };
  });
}

/** The new value from the host's items: kept ids keep their claims; `mine` claims or gives back for the host. */
function rebuilt(current, asked, body, who) {
  const kept = new Map(itemsOf(current).map((item) => [item.id, item]));
  const used = new Set();
  const items = asked.map((item) => {
    const before = item.id && !used.has(item.id) ? kept.get(item.id) : null;
    const id = before ? item.id : newItemId();
    used.add(id);
    let claim = before ? before.claim || null : null;
    if (item.mine === true && (!claim || claim.kind === 'host')) claim = claim || { ...who, at: nowIso() };
    if (item.mine === false && claim?.kind === 'host') claim = null;
    return { id, label: item.label, note: item.note, by: before ? before.by || 'host' : 'host', claim };
  });
  const guestsCanAdd = typeof body.guests_can_add === 'boolean' ? body.guests_can_add : Boolean(current?.guests_can_add);
  return { rev: 0, guests_can_add: guestsCanAdd, items };
}

async function replace(user, postId, body = {}) {
  const { plan, who, mine } = await personFor(user, postId);
  if (who.kind !== 'host') fail(403, 'not_host', 'Only the host can do that.');
  const asked = checkedItems(body);
  const next = await swap(plan.post_id, (current) => rebuilt(current, asked, body, who));
  return { bring: view(next, mine) };
}

/**
 * A plan's first list, from the host form (A3: `bring` on the create call). Null when there is nothing to save.
 * @param {{ id: string, name: string }} host  the plan's host, for an item the host marks `mine`
 */
function initialList(body, host) {
  if (!body || typeof body !== 'object') return null;
  const asked = checkedItems(body);
  if (asked.length === 0) return null;
  const list = rebuilt(null, asked, body, { kind: 'host', id: String(host.id), name: host.name });
  return { ...list, rev: 1 };
}

/**
 * The host form's `bring` on the change call (A3): the same as PUT …/bring, or null to take the list away (the
 * "Bring list" switch turned off). Claims on kept items stay.
 */
async function replaceFromForm(plan, body, hostName) {
  const who = { kind: 'host', id: String(plan.host_user_id), name: hostName };
  if (body === null) {
    await swap(plan.post_id, (current) => (current ? { rev: 0, guests_can_add: Boolean(current.guests_can_add), items: [] } : null));
    return;
  }
  const asked = checkedItems(body);
  await swap(plan.post_id, (current) => rebuilt(current, asked, body, who));
}

/** Claim an item for `who`, or 409 taken with the latest list when someone got to it first. */
async function claimFor(plan, who, mine, itemId) {
  let takenBy = null;
  const before = await readList(plan.post_id);
  const next = await swap(plan.post_id, (current) => {
    const items = itemsOf(current);
    const item = items.find((i) => i.id === itemId);
    if (!item) fail(404, 'not_found', 'That isn’t on the list any more.', { bring: view(current, mine) });
    if (item.claim) {
      if (item.claim.kind === who.kind && item.claim.id === who.id) return null;
      takenBy = item.claim.name;
      fail(409, 'taken', `${item.claim.name} got to that one first.`, { claim_name: item.claim.name, bring: view(current, mine) });
    }
    return { ...current, items: items.map((i) => (i.id === itemId ? { ...i, claim: { ...who, at: nowIso() } } : i)) };
  });
  if (!takenBy && next && next !== before) {
    recordFunnelEvent('plan_bring_claimed', { meta: { plan_id: plan.post_id, kind: plan.kind, by: who.kind } });
    if (who.kind !== 'host') await claimedNotice(plan, next).catch((err) => logger.warn('plans.bring.notice_failed', { error: err.message }));
  }
  return { bring: view(next, mine) };
}

async function giveBackFor(plan, who, mine, itemId) {
  const next = await swap(plan.post_id, (current) => {
    const items = itemsOf(current);
    const item = items.find((i) => i.id === itemId);
    if (!item) fail(404, 'not_found', 'That isn’t on the list any more.', { bring: view(current, mine) });
    if (!item.claim || item.claim.kind !== who.kind || item.claim.id !== who.id) return null;
    return { ...current, items: items.map((i) => (i.id === itemId ? { ...i, claim: null } : i)) };
  });
  return { bring: view(next, mine) };
}

/** Add one item, claimed by whoever adds it: someone in, when the host lets guests add their own. */
async function addFor(plan, who, mine, body = {}) {
  const label = cleanLine(body.label, LIMITS.label, 'a thing');
  if (!label) fail(422, 'validation', 'Name what you’ll bring.');
  const note = cleanLine(body.note, LIMITS.note, 'a note') || null;
  const next = await swap(plan.post_id, (current) => {
    if (who.kind !== 'host' && !current?.guests_can_add) fail(403, 'not_allowed', 'The host is keeping this list.', { bring: view(current, mine) });
    const items = itemsOf(current);
    if (items.length >= LIMITS.items) fail(422, 'validation', `The list can have up to ${LIMITS.items} things.`);
    const item = { id: newItemId(), label, note, by: who.kind, claim: { ...who, at: nowIso() } };
    return { rev: 0, guests_can_add: Boolean(current?.guests_can_add), ...current, items: [...items, item] };
  });
  recordFunnelEvent('plan_bring_claimed', { meta: { plan_id: plan.post_id, kind: plan.kind, by: who.kind, added: true } });
  if (who.kind !== 'host') await claimedNotice(plan, next).catch((err) => logger.warn('plans.bring.notice_failed', { error: err.message }));
  return { bring: view(next, mine) };
}

async function claim(user, postId, itemId) {
  const { plan, who, mine } = await personFor(user, postId);
  return claimFor(plan, who, mine, String(itemId || ''));
}
async function giveBack(user, postId, itemId) {
  const { plan, who, mine } = await personFor(user, postId);
  return giveBackFor(plan, who, mine, String(itemId || ''));
}
async function add(user, postId, body) {
  const { plan, who, mine } = await personFor(user, postId);
  return addFor(plan, who, mine, body);
}
async function guestClaim(postId, key, itemId) {
  const { plan, who, mine } = await guestFor(postId, key);
  return claimFor(plan, who, mine, String(itemId || ''));
}
async function guestGiveBack(postId, key, itemId) {
  const { plan, who, mine } = await guestFor(postId, key);
  return giveBackFor(plan, who, mine, String(itemId || ''));
}
async function guestAdd(postId, key, body) {
  const { plan, who, mine } = await guestFor(postId, key);
  return addFor(plan, who, mine, body);
}

/**
 * Someone left or was removed: what they claimed goes back on the list. `kind` 'user' with their request's id, or
 * 'guest' with their invitation's id. Never fails the caller.
 */
async function clearClaims(postId, kind, id) {
  try {
    const current = await readList(postId);
    if (!itemsOf(current).some((item) => item.claim && item.claim.kind === kind && item.claim.id === id)) return;
    await swap(postId, (list) => {
      const items = itemsOf(list);
      if (!items.some((item) => item.claim && item.claim.kind === kind && item.claim.id === id)) return null;
      return { ...list, items: items.map((item) => (item.claim && item.claim.kind === kind && item.claim.id === id ? { ...item, claim: null } : item)) };
    });
  } catch (err) {
    logger.warn('plans.bring.clear_failed', { postId, kind, error: err.message });
  }
}

// ── Notices ──────────────────────────────────────────────────

const thingsText = (n) => `${n} ${n === 1 ? 'thing' : 'things'}`;

/** To the host, at most one in 30 minutes: "3 things are taken. 2 are still open." */
async function claimedNotice(plan, list) {
  const items = itemsOf(list);
  const taken = items.filter((i) => i.claim).length;
  const open = items.length - taken;
  const bucket = Math.floor(Date.now() / CLAIM_NOTICE_WINDOW_MS);
  return planNotify.notify({
    userId: plan.host_user_id,
    type: 'plan_bring_claimed',
    title: open > 0
      ? `${thingsText(taken)} ${taken === 1 ? 'is' : 'are'} taken. ${open} ${open === 1 ? 'is' : 'are'} still open.`
      : `All ${thingsText(items.length)} are taken.`,
    body: plan.post.title,
    link: `/plans/${plan.post_id}`,
    plan,
    recipientIsIn: true,
    metadata: { opens: 'plan', taken, open },
    idempotencyKey: `plan_bring_claimed:${plan.post_id}:${bucket}`,
  });
}

/**
 * The Plans tick: two days before a plan with things still open, each account in who claimed nothing hears it once:
 * "2 things are still open for Thanksgiving dinner." (Guests without an account read it in their reminder email.)
 */
async function sendStillOpen(plans) {
  let sent = 0;
  const now = Date.now();
  for (const plan of plans || []) {
    try {
      if (!takesBringList(plan) || plan.status !== 'open' || !plan.bring_list) continue;
      const start = new Date(plan.post.event_date).getTime();
      if (!(start > now && start - now <= OPEN_NOTICE_BEFORE_MS)) continue;
      const open = openCountOf(plan.bring_list);
      if (open === 0 || !(await enabledFor(plan.host_user_id))) continue;
      const claimedBy = new Set(itemsOf(plan.bring_list).filter((i) => i.claim?.kind === 'user').map((i) => i.claim.id));
      const requests = (await actions().activeRequests(plan.post_id)).filter((r) => r.status === 'accepted' && !claimedBy.has(r.id));
      for (const request of requests) {
        const row = await planNotify.notify({
          userId: request.user_id,
          type: 'plan_bring_open',
          title: `${thingsText(open)} ${open === 1 ? 'is' : 'are'} still open for ${plan.post.title}.`,
          body: planNotify.whenText(plan.post.event_date, require('./planRules').timezoneForPlan(plan), { long: true, at: true }),
          link: `/plans/${plan.post_id}`,
          plan,
          recipientIsIn: true,
          metadata: { request_id: request.id, opens: 'plan', open },
          idempotencyKey: `plan_bring_open:${plan.post_id}:${request.user_id}`,
        });
        if (row) sent += 1;
      }
    } catch (err) {
      logger.warn('plans.bring.still_open_failed', { planId: plan?.post_id, error: err.message });
    }
  }
  return sent;
}

module.exports = {
  FLAG,
  LIMITS,
  takesBringList,
  enabledFor,
  switchByHost,
  view,
  mineFor,
  openCount,
  replace,
  initialList,
  replaceFromForm,
  checkedItems,
  claim,
  giveBack,
  add,
  guestClaim,
  guestGiveBack,
  guestAdd,
  clearClaims,
  sendStillOpen,
};
