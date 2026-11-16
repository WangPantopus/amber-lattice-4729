'use strict';

/**
 * Plans for the holidays, the extras (docs/product/plans-holidays/08-extras.md, section 1): what they share.
 *
 *  - Each extra has its own switch (a FeatureFlag row, off), read for the plan's host. Off, nothing of it shows.
 *  - Each keeps one JSON value on `Plan`, changed by revision number as the bring list is: a write carries the
 *    revision it read (plan_extra_swap) and is retried after a fresh read, up to three times, then refused
 *    `409 changed`.
 *  - The app marker `extras=1` (req.user.plansExtras, viewer.extras): without it a plan reads without the extras'
 *    fields.
 *  - Private plans hosted by a person, never a playdate (paying for a group is a business's paid plan, apart).
 *  - Who someone is in an extra's value: `p:<user id>` for a person with an account, `g:<invitation id>` for a guest
 *    without one.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const { isFeatureEnabled, getFlag } = require('../featureFlagService');
const planService = require('./planService');
const rules = require('./planRules');

const actions = () => require('./planActions');
const guests = () => require('./planGuests');

const RETRIES = 3;

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};

/** A plan an extra may be on: a private plan hosted by a person, never a playdate. */
const takesExtras = (plan) => Boolean(plan) && !plan.business_user_id && plan.kind !== 'playdate' && rules.isPrivate(plan);

async function enabledFor(flag, hostId) {
  return Boolean(hostId) && isFeatureEnabled(flag, String(hostId));
}

/** Each host's switch for `flag` (one read a host; none while it is off for everyone). */
async function switchByHost(flag, hostIds) {
  const ids = [...new Set((hostIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (ids.length === 0) return out;
  const row = await getFlag(flag);
  if (!row || (!row.enabled_globally && !row.enabled_for_internal_team && !(row.beta_user_ids || []).length)) {
    for (const id of ids) out.set(id, false);
    return out;
  }
  await Promise.all(ids.map(async (id) => out.set(id, await enabledFor(flag, id))));
  return out;
}

const personKey = (userId) => `p:${String(userId).toLowerCase()}`;
const guestKey = (inviteId) => `g:${String(inviteId).toLowerCase()}`;
const KEY_RE = /^[pg]:[0-9a-f-]{36}$/;
const isKey = (value) => typeof value === 'string' && KEY_RE.test(value.toLowerCase());

async function readValue(postId, column) {
  const { data, error } = await supabaseAdmin.from('Plan').select(column).eq('post_id', postId).maybeSingle();
  if (error) throw new Error(`Failed to read the plan: ${error.message}`);
  return data ? data[column] || null : null;
}

/**
 * Change one extra's value: `mutate(current)` answers the new value (null removes it, `undefined` changes nothing),
 * or throws a PlanError, which stops at once. Written only if nobody changed it since it was read; read again and
 * retried, then 409 changed.
 */
async function swap(postId, column, mutate) {
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const current = await readValue(postId, column);
    const rev = Number(current?.rev) || 0;
    const next = mutate(current);
    if (next === undefined) return current;
    if (next) next.rev = rev + 1;
    const { data, error } = await supabaseAdmin.rpc('plan_extra_swap', {
      p_post_id: postId, p_column: column, p_expected_rev: rev, p_value: next,
    });
    if (error) throw new Error(`Failed to save the change: ${error.message}`);
    if (data === true) return next;
  }
  fail(409, 'changed', 'Someone just changed this. Here’s the latest.');
  return null;
}

/**
 * The people in a plan, as an extra counts them: each account whose ask is accepted (not the host) and each guest
 * without an account who is in (not waiting for the host's yes). One key each, in the order they came in.
 */
async function keysIn(plan) {
  const [requests, rows] = await Promise.all([
    actions().activeRequests(plan.post_id),
    guests().guestRows([plan.post_id]),
  ]);
  const accounts = requests.filter((r) => r.status === 'accepted' && String(r.user_id) !== String(plan.host_user_id))
    .sort((a, b) => new Date(a.decided_at || a.created_at) - new Date(b.decided_at || b.created_at))
    .map((r) => personKey(r.user_id));
  const guestsIn = (rows.get(plan.post_id) || []).filter((r) => r.status === 'accepted' && !r.needs_host_ok)
    .sort((a, b) => new Date(a.answered_at || 0) - new Date(b.answered_at || 0))
    .map((r) => guestKey(r.id));
  return [...accounts, ...guestsIn];
}

/**
 * The signed-in caller of an extra's route on a plan whose host has `flag`: the host, or a person with an account who
 * is in. 404 when the plan isn't theirs to read or the extra is off; 403 not_in for anyone else.
 * @returns {Promise<{ viewer, plan, role: 'host' | 'guest', key: string | null, requestId: string | null }>}
 */
async function personFor(user, postId, flag, { allowOut = false } = {}) {
  const viewer = await require('./planViewer').loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (!takesExtras(plan) || !(await enabledFor(flag, plan.host_user_id))) fail(404, 'not_found', "This isn't available right now.");
  if (String(plan.host_user_id) === viewer.id) return { viewer, plan, role: 'host', key: null, requestId: null };
  const { data: request, error } = await supabaseAdmin.from('PlanRequest').select('id, status')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (error) throw new Error(`Failed to load your request: ${error.message}`);
  const isIn = request && request.status === 'accepted';
  if (!isIn && !allowOut) fail(403, 'not_in', "You're not in this plan.");
  return { viewer, plan, role: isIn ? 'guest' : 'none', key: personKey(viewer.id), requestId: isIn ? request.id : null };
}

/** A guest without an account, by their key, on a plan whose host has `flag`. 403 not_in unless they are in. */
async function guestFor(postId, secret, flag, { allowOut = false } = {}) {
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !takesExtras(plan) || !guests().takesAnswers(plan) || !(await guests().switchFor(plan.host_user_id))
    || !(await enabledFor(flag, plan.host_user_id))) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  const row = await guests().rowByKey(postId, secret);
  if (!row || row.status === 'cancelled') fail(404, 'not_found', 'This invitation is no longer open.');
  const isIn = row.status === 'accepted' && !row.needs_host_ok;
  if (!isIn && !allowOut) fail(403, 'not_in', "You're not in this plan yet.");
  return { plan, row, role: isIn ? 'guest' : 'none', key: guestKey(row.id), name: actions().firstOf(row.guest_name) };
}

/** "$12", or "$12.50" when there are cents. */
function moneyText(cents) {
  const n = Number(cents) || 0;
  return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}

module.exports = {
  takesExtras,
  enabledFor,
  switchByHost,
  personKey,
  guestKey,
  isKey,
  readValue,
  swap,
  keysIn,
  personFor,
  guestFor,
  moneyText,
};
