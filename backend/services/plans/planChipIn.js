'use strict';

/**
 * Plans for the holidays, the extras: chip in (docs/product/plans-holidays/08-extras.md, section 3; the founder's go
 * on November 15 and 16, 2026). Behind `plans_chip_in`, read for the plan's host; off, every route answers "not found"
 * and no card or page carries it.
 *
 * The host suggests an amount and gives their own payment link; a guest pays the host there and marks it. No money
 * moves through Pantopus, and Pantopus never holds or sees it: the server keeps the link, the amount and who said
 * they paid, nothing else.
 *
 *  - Plan.chip_in: { rev, amount_cents, note, link, paid: { "p:<user id>" | "g:<invitation id>": "<when>" } }.
 *  - amount_cents 100 to 50000, each person; note 1 to 60 characters; link https on venmo.com, account.venmo.com,
 *    paypal.me, www.paypal.com (/paypalme/…) or cash.app, kept as given, its service named from its host.
 *  - Only the host and people who are in read it, the link included, as they read the address.
 *  - No notice is sent for chipping in.
 */

const extras = require('./planExtras');

const actions = () => require('./planActions');

const FLAG = 'plans_chip_in';
const COLUMN = 'chip_in';
const LIMITS = Object.freeze({ minCents: 100, maxCents: 50000, note: 60, link: 300 });
const SERVICES = Object.freeze([
  { host: 'venmo.com', name: 'Venmo' },
  { host: 'account.venmo.com', name: 'Venmo' },
  { host: 'paypal.me', name: 'PayPal' },
  { host: 'www.paypal.com', name: 'PayPal', path: /^\/paypalme\/[^/]+/i },
  { host: 'cash.app', name: 'Cash App' },
]);
const LINK_MESSAGE = 'Use a Venmo, PayPal or Cash App link.';

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();

const enabledFor = (hostId) => extras.enabledFor(FLAG, hostId);
const switchByHost = (hostIds) => extras.switchByHost(FLAG, hostIds);

/** The payment link's service ("Venmo", "PayPal", "Cash App"), or null for a link that isn't one of them. */
function serviceOf(link) {
  let url;
  try {
    url = new URL(String(link || ''));
  } catch (_) {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const service = SERVICES.find((s) => s.host === url.hostname.toLowerCase());
  if (!service) return null;
  // A service's home page is nobody's payment link.
  if (!url.pathname || url.pathname === '/') return null;
  if (service.path && !service.path.test(url.pathname)) return null;
  return service.name;
}

/** The host form's chip_in, checked: { amount_cents, note, link }. */
function checkedInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(422, 'validation', 'Fill in the chip in.');
  const cents = body.amount_cents;
  if (!Number.isInteger(cents) || cents < LIMITS.minCents || cents > LIMITS.maxCents) {
    fail(422, 'validation', 'Each person can chip in $1 to $500.', { field: 'amount_cents' });
  }
  const note = typeof body.note === 'string' ? body.note.replace(/\s+/g, ' ').trim() : '';
  if (!note) fail(422, 'validation', 'Say what it’s for.', { field: 'note' });
  if (note.length > LIMITS.note) fail(422, 'validation', `Use up to ${LIMITS.note} characters for what it’s for.`, { field: 'note' });
  const link = typeof body.link === 'string' ? body.link.trim() : '';
  if (!link || link.length > LIMITS.link || !serviceOf(link)) fail(422, 'validation', LINK_MESSAGE, { field: 'link' });
  return { amount_cents: cents, note, link };
}

/** A new plan's chip in (the host form's create call), or null. */
function initialValue(body) {
  if (body == null) return null;
  return { rev: 1, ...checkedInput(body), paid: {} };
}

/** The change call's chip_in: replaced (who paid stays), or null to take it away. Checked before anything is saved. */
async function replaceFromForm(plan, body) {
  const asked = body === null ? null : checkedInput(body);
  await extras.swap(plan.post_id, COLUMN, (current) => {
    if (asked === null) return current ? null : undefined;
    return { rev: 0, ...asked, paid: current?.paid || {} };
  });
}

/**
 * The card's chip_in for the host and people who are in. `keys`: the people in (planExtras.keysIn); `mineKey`: the
 * reader's own key (null for the host).
 */
function view(value, { keys, mineKey = null, hostFirst }) {
  if (!value || !value.link) return null;
  const service = serviceOf(value.link);
  if (!service) return null;
  const paid = value.paid || {};
  const paidCount = keys.filter((k) => paid[k]).length;
  return {
    text: `Chip in ${extras.moneyText(value.amount_cents)}`,
    amount_cents: value.amount_cents,
    note: value.note,
    service,
    link: value.link,
    paid_count: paidCount,
    of: keys.length,
    paid_text: `${paidCount} of ${keys.length} paid`,
    pay_text: `Pay ${hostFirst} on ${service}`,
    straight_text: `This goes straight to ${hostFirst}. Pantopus doesn’t handle this money.`,
    mine: mineKey ? { paid: Boolean(paid[mineKey]) } : null,
  };
}

/** Who has said they paid, among the people in: the host's rows read `chip_in_paid`. */
const paidSet = (value) => new Set(Object.keys(value?.paid || {}));

async function viewFor(plan, value, mineKey) {
  return view(value, { keys: await extras.keysIn(plan), mineKey, hostFirst: await actions().hostFirstOf(plan) });
}

/** Marks change while the plan is on or over; never on a cancelled plan. */
function assertNotCancelled(plan) {
  if (plan.status === 'cancelled') fail(409, 'ended', 'This plan was cancelled.');
}

async function setPaid(plan, key, paid, mineKey) {
  assertNotCancelled(plan);
  const keys = await extras.keysIn(plan);
  if (!keys.includes(key)) fail(422, 'validation', 'They’re not in this plan.');
  const next = await extras.swap(plan.post_id, COLUMN, (current) => {
    if (!current) fail(404, 'not_found', "This plan doesn't have a chip in.");
    const marks = { ...(current.paid || {}) };
    if (paid === Boolean(marks[key])) return undefined;
    if (paid) marks[key] = nowIso();
    else delete marks[key];
    return { ...current, paid: marks };
  });
  return { chip_in: view(next, { keys, mineKey, hostFirst: await actions().hostFirstOf(plan) }) };
}

/** The host names whom they mark: `who` from the body or the query ("p:<user id>" or "g:<guest id>"). */
function whoFrom(who) {
  if (!extras.isKey(who)) fail(422, 'validation', 'Choose who paid.');
  return who.toLowerCase();
}

/**
 * POST | DELETE /api/plans/:id/chip-in/paid [{ who }]: someone in marks (or unmarks) themselves; the host marks someone
 * who paid another way. Answers { chip_in }.
 */
async function markPaid(user, postId, { who = null } = {}, paid = true) {
  const { plan, role, key } = await extras.personFor(user, postId, FLAG);
  if (role === 'host') return setPaid(plan, whoFrom(who), paid, null);
  if (who && String(who).toLowerCase() !== key) fail(403, 'not_host', 'Only the host can do that.');
  return setPaid(plan, key, paid, key);
}

/** POST | DELETE /api/public/plans/:id/chip-in/paid: a guest without an account who is in, by their key. */
async function guestMarkPaid(postId, secret, paid = true) {
  const { plan, key } = await extras.guestFor(postId, secret, FLAG);
  return setPaid(plan, key, paid, key);
}

/** For a guest who is in (the web page's for_guest), while the host has the switch. */
async function forGuest(plan, row) {
  if (!plan.chip_in || !extras.takesExtras(plan) || !(await enabledFor(plan.host_user_id))) return null;
  return viewFor(plan, plan.chip_in, extras.guestKey(row.id));
}

module.exports = {
  FLAG,
  LIMITS,
  enabledFor,
  switchByHost,
  serviceOf,
  checkedInput,
  initialValue,
  replaceFromForm,
  view,
  paidSet,
  markPaid,
  guestMarkPaid,
  forGuest,
};
