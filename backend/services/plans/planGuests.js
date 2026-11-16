'use strict';

/**
 * Plans for the holidays, H1: answers without an account (docs/product/plans-holidays/03-build-contract.md,
 * sections 4 to 6, 12 and 13; the founder's go on November 15, 2026). Everything here is behind the switch
 * `plans_guest_answers`, read for the plan's host; with it off every route answers "not found".
 *
 *  - A guest is saved on their PlanInvite row (K1): an email or text invitation the host made, filled in, or a row
 *    made by the plan's open link (channel 'open'). No account, no PlanRequest.
 *  - Two secrets. A way in lets someone answer: an email or text invitation's token, or the plan's open link
 *    (Plan.open_invite_token, kept as given, K2). A guest's key is made at their first answer; only its sha256 is
 *    saved (K3). Only the key reads anything private (for_guest), and only while the guest is in.
 *  - The home address. At a home the key never comes back in the browser: every way in answers `check_email`, and
 *    the key arrives only in the guest's own email, to the address they gave (or the host typed), and after the
 *    host's yes when they came by the open link with "I say yes first" (H4). Away from a home the key comes back on
 *    the first answer and the web keeps it in an HttpOnly cookie. An answer for an address that already has a row,
 *    without a key of that row (another browser, or someone typing another person's address), changes nothing and
 *    returns no key: the address gets its link.
 *  - A guest may hold several keys (K3, made precise on November 15): one from the answer and one for each email
 *    that carries their link. None replaces another (at most 6; a seventh drops the oldest), and all of them stop
 *    together when the host removes the guest.
 *  - Seats: a guest's adults and kids count from the moment they say they're in, also while they wait (K5).
 *  - Limits (6.6, 6.7): three emails a guest a plan, five an address a day from every host together, none to an
 *    address that said "don't send me invitations"; ten answers an address an hour; the open link makes at most the
 *    room plus 20 rows.
 */

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { isFeatureEnabled } = require('../featureFlagService');
const { recordFunnelEvent } = require('../funnelEvents');
const rules = require('./planRules');
const planService = require('./planService');
const planNotify = require('./planNotifications');

// planInvites and planActions require modules that require this one; they are read when called.
const invites = () => require('./planInvites');
const actions = () => require('./planActions');

const LIMITS = Object.freeze({
  answersPerAddressPerHour: 10,
  // Rows the open link may make: the room plus this many.
  openRowsOverRoom: 20,
  emailsPerGuestPerPlan: 3,
  nameMax: 100,
  peopleMax: rules.PRIVATE_PARTY_MAX,
});

const GUEST_COLUMNS = [
  'id', 'post_id', 'host_user_id', 'channel', 'invitee_user_id', 'email', 'token_hash', 'status', 'needs_host_ok',
  'email_status', 'email_opted_out_at', 'guest_name', 'guest_adults', 'guest_kids', 'guest_key_hashes',
  'address_sent_at', 'reminded_at', 'changed_at', 'changed_reason', 'guest_emails', 'email_sent_times', 'opened_at', 'answered_at',
  'created_at', 'updated_at',
].join(', ');
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_PREFIX = 'pantopus_plan_guest_';
const COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ANSWER_STATUS = { in: 'accepted', maybe: 'maybe', cant: 'declined' };

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();

// ── Small parts ──────────────────────────────────────────────

const newKey = () => crypto.randomBytes(32).toString('base64url');
const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const isKey = (value) => typeof value === 'string' && KEY_RE.test(value);
// A guest may hold several keys and none replaces another; a seventh drops the oldest (K3).
const MAX_KEYS = 6;
const withKey = (row, key) => [...(row?.guest_key_hashes || []), hashKey(key)].slice(-MAX_KEYS);

/** The HttpOnly cookie the web keeps a guest's key in, one a plan. */
const cookieName = (postId) => `${COOKIE_PREFIX}${String(postId).toLowerCase()}`;
const cookieOptions = (isProduction) => ({
  httpOnly: true, secure: Boolean(isProduction), sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE_MS,
});

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** A person's plan takes answers without an account; a playdate and a business's plan never do (rule 9). */
function takesAnswers(plan) {
  return Boolean(plan) && !plan.business_user_id && plan.kind !== 'playdate';
}

/** The open link: a private plan hosted by a person, never a playdate (H5). */
function takesOpenLink(plan) {
  return takesAnswers(plan) && rules.isPrivate(plan);
}

const atHome = (plan) => plan.place_kind === 'home';

/** in | waiting_ok | maybe | cant | removed, or null for an invitation nobody answered. */
function stateOf(row) {
  if (!row) return null;
  if (row.status === 'cancelled') return 'removed';
  if (row.status === 'accepted') return row.needs_host_ok ? 'waiting_ok' : 'in';
  if (row.status === 'maybe') return 'maybe';
  if (row.status === 'declined') return 'cant';
  return null;
}

const isGuest = (row) => Boolean(row && row.guest_name && !row.invitee_user_id);
const isGuestIn = (row) => isGuest(row) && row.status === 'accepted' && !row.needs_host_ok;
const firstOf = (name) => actions().firstOf(name);

/** The page's link for the open link: `/plans/<id>?open=<token>`. */
function openUrl(postId, token) {
  return `${planService.shareUrl(postId)}?open=${encodeURIComponent(token)}`;
}

/**
 * The guest's own link, in their emails only. It goes to a web page the apps don't open (so an installed app never
 * takes it), which keeps the key in the HttpOnly cookie and opens `/plans/<id>` without it.
 */
function guestUrl(postId, key) {
  const base = planService.shareUrl('x').replace(/\/plans\/x$/, '');
  return `${base}/plan-invitation/${postId}?key=${encodeURIComponent(key)}`;
}

/** Is the switch on for this host (with private plans and invitations, which it needs)? */
async function switchFor(hostId) {
  if (!hostId) return false;
  const id = String(hostId);
  const [on, priv, inv] = await Promise.all([
    isFeatureEnabled(rules.GUEST_ANSWERS_FLAG, id),
    isFeatureEnabled(rules.PRIVATE_FLAG, id),
    isFeatureEnabled('plans_invites', id),
  ]);
  return Boolean(on && priv && inv);
}

/** Each host's switch, for the cards (one read a host). */
async function switchByHost(hostIds) {
  const ids = [...new Set((hostIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (ids.length === 0) return out;
  const flag = await require('../featureFlagService').getFlag(rules.GUEST_ANSWERS_FLAG);
  // Off for everyone: no host needs a read.
  if (!flag || (!flag.enabled_globally && !flag.enabled_for_internal_team && !(flag.beta_user_ids || []).length)) {
    for (const id of ids) out.set(id, false);
    return out;
  }
  await Promise.all(ids.map(async (id) => out.set(id, await switchFor(id))));
  return out;
}

// ── Reading rows ─────────────────────────────────────────────

/**
 * Guests without an account on these plans who are in (or waiting for the host's yes) or said maybe: each plan's
 * rows, for seats, the headcount and the people line.
 */
async function guestRows(planIds) {
  const out = new Map();
  const ids = [...new Set((planIds || []).filter(Boolean))];
  if (ids.length === 0) return out;
  const { data, error } = await supabaseAdmin.from('PlanInvite')
    .select('id, post_id, channel, status, needs_host_ok, guest_name, guest_adults, guest_kids, answered_at')
    .in('post_id', ids).not('guest_name', 'is', null).is('invitee_user_id', null).in('status', ['accepted', 'maybe']);
  if (error) throw new Error(`Failed to load guests: ${error.message}`);
  for (const row of data || []) {
    if (!out.has(row.post_id)) out.set(row.post_id, []);
    out.get(row.post_id).push(row);
  }
  return out;
}

/** The seats guests hold: adults and kids of every guest who said they're in, waiting or not (K5). */
function seatsOf(rows, { except = null } = {}) {
  return (rows || [])
    .filter((r) => r.status === 'accepted' && r.id !== except)
    .reduce((sum, r) => sum + (Number(r.guest_adults) || 1) + (Number(r.guest_kids) || 0), 0);
}

async function guestSeats(postId, { except = null } = {}) {
  return seatsOf((await guestRows([postId])).get(postId) || [], { except });
}

async function rowByKey(postId, key) {
  if (!isKey(key) || !planService.isUuid(postId)) return null;
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(GUEST_COLUMNS)
    .contains('guest_key_hashes', [hashKey(key)]).eq('post_id', postId).maybeSingle();
  if (error) throw new Error(`Failed to load the invitation: ${error.message}`);
  return data || null;
}

async function rowByToken(postId, token) {
  if (!isKey(token) || !planService.isUuid(postId)) return null;
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(GUEST_COLUMNS)
    .eq('token_hash', invites().hashToken(token)).eq('post_id', postId).in('channel', ['email', 'link']).maybeSingle();
  if (error) throw new Error(`Failed to load the invitation: ${error.message}`);
  return data || null;
}

/** This plan's rows for an address: the live one (any channel), and whether the host removed a guest who gave it. */
async function rowsByEmail(postId, email) {
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(GUEST_COLUMNS)
    .eq('post_id', postId).eq('email', email);
  if (error) throw new Error(`Failed to load the invitation: ${error.message}`);
  const rows = data || [];
  return {
    live: rows.find((r) => r.status !== 'cancelled') || null,
    removed: rows.some((r) => r.status === 'cancelled' && r.guest_name),
  };
}

// ── What the page reads (GET /api/public/plans/:id) ──────────

/** Where the plan is, for a guest who is in: never a business's (no guests there), never before they're in. */
async function placeFor(plan, hostFirst) {
  if (rules.isOnline(plan)) {
    return { name: plan.place_name || 'Online', address: null, latitude: null, longitude: null, link: plan.online_link || null };
  }
  return {
    name: atHome(plan) ? `${hostFirst}'s place` : (plan.place_name || plan.area_label),
    address: plan.place_address || null,
    latitude: Number(plan.place_latitude),
    longitude: Number(plan.place_longitude),
  };
}

/** First names of the people going, besides the host and this guest: accounts in, then guests in. */
async function goingNames(plan, exceptInviteId) {
  const requests = (await actions().activeRequests(plan.post_id))
    .filter((r) => r.status === 'accepted')
    .sort((a, b) => new Date(a.decided_at || a.created_at) - new Date(b.decided_at || b.created_at));
  const names = await actions().userNames(requests.map((r) => r.user_id));
  const rows = ((await guestRows([plan.post_id])).get(plan.post_id) || [])
    .filter((r) => r.status === 'accepted' && !r.needs_host_ok && r.id !== exceptInviteId)
    .sort((a, b) => new Date(a.answered_at || 0) - new Date(b.answered_at || 0));
  return [
    ...requests.map((r) => firstOf(names.get(String(r.user_id)))),
    ...rows.map((r) => firstOf(r.guest_name)),
  ];
}

/**
 * What the page reads beside the plan's card, for a plan whose host has the switch: `answer` (a live way in, or the
 * guest's own key) and `for_guest` (the key, while the guest is in). `live` says the private card may be shown.
 * `removed`: the key is a guest's the host removed; the page says the invitation is no longer open, and nothing else.
 * @param {{ inviteToken?: string, openToken?: string, guestKey?: string }} secrets
 */
async function forPage(plan, { inviteToken = null, openToken = null, guestKey = null } = {}) {
  const none = { live: false, answer: null, for_guest: null, removed: false };
  if (!takesAnswers(plan)) return none;
  const mine = guestKey ? await rowByKey(plan.post_id, guestKey) : null;
  if (mine && mine.status === 'cancelled') return { ...none, removed: true };
  let via = mine ? mine.channel : null;
  if (!via && openToken && takesOpenLink(plan) && sameSecret(openToken, plan.open_invite_token)) via = 'open';
  if (!via && inviteToken) {
    const row = await rowByToken(plan.post_id, inviteToken);
    // An invitation an account opened is answered in the app.
    if (row && row.status !== 'cancelled' && !row.invitee_user_id) via = row.channel;
  }
  if (!via) return none;
  const seats = planService.seatsTaken(plan, await actions().activeRequests(plan.post_id), await guestSeats(plan.post_id));
  const answer = {
    can: invites().isOpenForAnswers(plan),
    via,
    // The open link always asks for an address, and a text invitation to a plan at a home does: the address goes
    // only by email.
    needs_email: via === 'open' || (via === 'link' && atHome(plan)),
    kids_welcome: Boolean(plan.kids_welcome),
    room_left: Math.max(0, plan.spots - seats),
    host_says_yes_first: via === 'open' && Boolean(plan.open_invite_ok_first),
    mine: mine ? mineView(mine) : null,
  };
  let forGuest = null;
  if (isGuestIn(mine) && plan.status !== 'cancelled') {
    const hostFirst = await actions().hostFirstOf(plan);
    const changedSince = mine.changed_at && (!mine.answered_at || new Date(mine.changed_at) > new Date(mine.answered_at));
    forGuest = {
      place: await placeFor(plan, hostFirst),
      guest_note: plan.guest_note || null,
      going: await goingNames(plan, mine.id),
      // The bring list (H2), while the host has its switch.
      bring: await bringFor(plan, mine),
      // The plan's time or place changed since the guest last answered: 'time', 'place' or 'both'.
      changed: changedSince ? mine.changed_reason || null : null,
    };
  }
  return { live: true, answer, for_guest: forGuest, removed: false };
}

/** The guest's own answer, read with their key. `email_hint` ("da•••@example.com") is for their page's own words. */
async function bringFor(plan, row) {
  const planBring = require('./planBring');
  if (!plan.bring_list || !planBring.takesBringList(plan) || !(await planBring.enabledFor(plan.host_user_id))) return null;
  return planBring.view(plan.bring_list, planBring.mineFor({ role: 'guest', inviteId: row.id }));
}

function mineView(row) {
  return {
    state: stateOf(row), name: row.guest_name, adults: row.guest_adults, kids: row.guest_kids,
    email_hint: row.email ? invites().emailHint(row.email) : null,
  };
}

// ── Answering (POST and PATCH /api/public/plans/:id/answers) ──

// Answers an address gave in the last hour, in this process (as the app's other per-process limits).
const answersByAddress = new Map();
function takeAnswerAllowance(email) {
  if (!email) return true;
  const now = Date.now();
  const recent = (answersByAddress.get(email) || []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= LIMITS.answersPerAddressPerHour) {
    answersByAddress.set(email, recent);
    return false;
  }
  recent.push(now);
  answersByAddress.set(email, recent);
  if (answersByAddress.size > 5000) {
    for (const [key, times] of answersByAddress) if (!times.some((t) => now - t < HOUR_MS)) answersByAddress.delete(key);
  }
  return true;
}

async function loadAnswerablePlan(postId) {
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !plan.post || !takesAnswers(plan)) fail(404, 'not_found', "This plan isn't available.");
  if (!(await isFeatureEnabled('plans', String(plan.host_user_id))) || !(await switchFor(plan.host_user_id))) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  return plan;
}

function invalid(field, message) {
  fail(422, 'validation', message, { field });
}

/** The answer's fields, checked: a name, adults and kids, an answer, and the address where one is asked for. */
function checkedFields(plan, body, current, { via }) {
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);
  // Cleaned as plan text is: spaces folded, ends trimmed.
  const name = typeof pick('name', current?.guest_name) === 'string' ? pick('name', current?.guest_name).replace(/\s+/g, ' ').trim() : '';
  if (!name) invalid('name', 'Add your name.');
  if (name.length > LIMITS.nameMax) invalid('name', 'Use up to 100 characters for your name.');
  const adults = Number(pick('adults', current?.guest_adults ?? 1));
  if (!Number.isInteger(adults) || adults < 1 || adults > LIMITS.peopleMax) invalid('adults', 'Adults can be 1 to 10.');
  const kids = plan.kids_welcome ? Number(pick('kids', current?.guest_kids ?? 0)) : 0;
  if (!Number.isInteger(kids) || kids < 0 || kids > LIMITS.peopleMax) invalid('kids', 'Kids can be 0 to 10.');
  // A public plan keeps one answer to 4 seats, as an ask does.
  if (!rules.isPrivate(plan) && adults + kids > rules.PARTY_MAX) invalid('adults', 'You can bring up to 3 people.');
  const answerWord = pick('answer', current ? { accepted: 'in', maybe: 'maybe', declined: 'cant' }[current.status] : undefined);
  if (!ANSWER_STATUS[answerWord]) invalid('answer', "Choose I'm in, Maybe or Can't make it.");
  let email = null;
  if (via === 'open' || via === 'link') {
    const raw = typeof body.email === 'string' ? body.email.trim() : '';
    if (raw) {
      email = invites().normalizeEmail(raw);
      if (!email) invalid('email', 'That email doesn’t look right.');
    } else if (!current?.email && (via === 'open' || (via === 'link' && atHome(plan)))) {
      // Required from the open link, and for a text invitation to a plan at a home (a change keeps the one given).
      invalid('email', 'That email doesn’t look right.');
    }
  }
  return { name, adults, kids, answer: answerWord, email };
}

/**
 * The row an answer writes, and how it came: by one of the guest's own keys, an email or text invitation, or the open
 * link.
 * @returns {{ row: object|null, via: string, presentedKey: string|null }}
 */
async function resolveAnswerRow(plan, body, { cookieKey = null, patch = false } = {}) {
  // A change (PATCH) is made with a guest's key: sent as `guest`, else the web's cookie for this plan.
  const key = isKey(body.guest) ? body.guest : (patch ? cookieKey : null);
  if (key) {
    const row = await rowByKey(plan.post_id, key);
    if (!row) fail(404, 'not_found', "This invitation isn't available.");
    if (row.status === 'cancelled') fail(404, 'not_found', 'This invitation is no longer open.');
    return { row, via: row.channel, presentedKey: key };
  }
  if (patch) fail(404, 'not_found', "This invitation isn't available.");
  if (isKey(body.invite)) {
    const row = await rowByToken(plan.post_id, body.invite);
    if (!row || row.status === 'cancelled') fail(404, 'not_found', "This invitation isn't available.");
    if (row.invitee_user_id) fail(409, 'invite_used', 'This invitation was opened in the Pantopus app. Answer it there.');
    return { row, via: row.channel, presentedKey: null };
  }
  if (isKey(body.open)) {
    if (!takesOpenLink(plan) || !sameSecret(body.open, plan.open_invite_token)) fail(404, 'not_found', "This invitation isn't available.");
    return { row: null, via: 'open', presentedKey: null };
  }
  fail(404, 'not_found', "This invitation isn't available.");
  return null;
}

/**
 * Why a guest email to this address can't go now: 'opted_out', or 'too_many' (three a guest a plan, or five an
 * address a day from every host together, every email counted by its own time), else null.
 */
async function guestEmailHeld(row) {
  if (!row?.email) return 'no_address';
  if ((Number(row.guest_emails) || 0) >= LIMITS.emailsPerGuestPerPlan) return 'too_many';
  return invites().emailHeld(row.email);
}

/** The words every guest email shares. */
async function guestEmailWords(plan, row) {
  const hostFirst = await actions().hostFirstOf(plan);
  return {
    hostFirst,
    title: plan.post.title,
    icon: planNotify.ICON_BY_KIND[plan.kind] || '📅',
    when: invites().dateText(plan),
    people: planNotify.peopleText(row.guest_adults, row.guest_kids, { and: true }),
  };
}

/** After an email went: its key joins the row's keys, and the email is counted (and its moment stamped). */
async function saveEmailed(row, key, stamp) {
  const patch = {
    guest_key_hashes: withKey(row, key),
    guest_emails: (Number(row.guest_emails) || 0) + 1,
    email_sent_times: invites().withEmailSent(row),
    updated_at: nowIso(),
    ...(stamp ? { [stamp]: nowIso() } : {}),
  };
  const { error } = await supabaseAdmin.from('PlanInvite').update(patch).eq('id', row.id);
  if (error) logger.warn('plans.guests.email_unsaved', { inviteId: row.id, error: error.message });
  Object.assign(row, patch);
}

/**
 * Send one email to a guest (You're in, the reminder, a change, a cancellation). Each email that carries the guest's
 * link carries a key of its own, which joins the guest's keys once the email went; none replaces another (K3).
 * Answers whether it went. `stamp`: the row's column to stamp ('address_sent_at' or 'reminded_at').
 */
async function sendGuestEmail(plan, row, kind, { words = {}, stamp = null } = {}) {
  const held = await guestEmailHeld(row);
  if (held) {
    logger.info('plans.guests.email_held', { inviteId: row.id, kind, reason: held });
    return false;
  }
  const key = newKey();
  const { sendPlanGuestEmail } = require('../emailService');
  let sent;
  try {
    sent = await sendPlanGuestEmail({
      toEmail: row.email,
      kind,
      words: { ...(await guestEmailWords(plan, row)), ...words },
      link: kind === 'cancelled' ? null : guestUrl(plan.post_id, key),
      unsubscribeLink: invites().unsubscribeUrl(key),
      oneClickUnsubscribeLink: invites().oneClickUnsubscribeUrl(key),
    });
  } catch (err) {
    logger.warn('plans.guests.email_failed', { inviteId: row.id, kind, error: err.message });
    return false;
  }
  if (!sent?.success) {
    logger.warn('plans.guests.email_failed', { inviteId: row.id, kind });
    return false;
  }
  await saveEmailed(row, key, stamp);
  return true;
}

/**
 * An answer came for an address that already has a row, without a key of that row (6.3): that address gets its link.
 * Someone in gets "You're in" again; anyone else (waiting, maybe, can't make it, or an invitation the host typed and
 * nobody answered yet) gets the invitation email's own words with their link, which opens their answer to see or
 * change.
 */
async function sendLinkAgain(plan, row) {
  if (isGuestIn(row)) return sendGuestEmail(plan, row, 'in', { stamp: 'address_sent_at' });
  const held = await guestEmailHeld(row);
  if (held) {
    logger.info('plans.guests.email_held', { inviteId: row.id, kind: 'link_again', reason: held });
    return false;
  }
  const key = newKey();
  const { sendPlanInviteEmail } = require('../emailService');
  try {
    const sent = await sendPlanInviteEmail({
      toEmail: row.email,
      words: invites().emailWords(plan, await actions().hostFirstOf(plan)),
      link: guestUrl(plan.post_id, key),
      unsubscribeLink: invites().unsubscribeUrl(key),
      oneClickUnsubscribeLink: invites().oneClickUnsubscribeUrl(key),
    });
    if (!sent?.success) return false;
  } catch (err) {
    logger.warn('plans.guests.email_failed', { inviteId: row.id, kind: 'link_again', error: err.message });
    return false;
  }
  await saveEmailed(row, key, null);
  return true;
}

/**
 * POST /api/public/plans/:id/answers (and, with `patch`, PATCH …/answers/mine): a guest without an account answers.
 * Answers { state, mine, guest, set_cookie }:
 *  - At a home, by every way in, "I'm in" answers `check_email` and no key: the key travels only in the email, to the
 *    address the guest gave or the host typed (after the host's yes from the open link with "I say yes first").
 *  - Away from a home the first answer's key comes back (`guest`; the route keeps it in the HttpOnly cookie).
 *  - An answer for an address that already has a row, without a key of that row, changes nothing, returns no key,
 *    answers `check_email` with `already_answered`, and sends that address its link.
 *  - With a key, the answer changes the row.
 * @param {{ cookieKey?: string|null, patch?: boolean }} opts  cookieKey: the key from the web's cookie for this plan
 */
async function answer(postId, body = {}, { cookieKey = null, patch = false } = {}) {
  const plan = await loadAnswerablePlan(postId);
  let { row, via, presentedKey } = await resolveAnswerRow(plan, body || {}, { cookieKey, patch });
  if (!invites().isOpenForAnswers(plan)) {
    const hostFirst = await actions().hostFirstOf(plan);
    fail(409, 'ended', plan.status === 'cancelled' ? `${hostFirst} cancelled this plan.` : 'This plan is over.');
  }
  const fields = checkedFields(plan, body || {}, presentedKey ? row : null, { via });

  // An address that already has a row on this plan, without a key of that row: nothing changes and no key comes
  // back; the address gets its link. A guest the host removed doesn't come back by the open link.
  if (!presentedKey) {
    let existing = null;
    if (via === 'open' || (via === 'link' && fields.email && !row.guest_name)) {
      const found = await rowsByEmail(plan.post_id, fields.email);
      if (via === 'open' && !found.live && found.removed) fail(404, 'not_found', 'This invitation is no longer open.');
      if (found.live && found.live.id !== row?.id) existing = found.live;
    }
    if (row && row.guest_name) {
      // A text invitation is the first answer's: someone else with its link can't change it.
      if (via === 'link' && fields.email !== row.email) {
        fail(409, 'invite_used', 'Someone else already used this invitation. Ask the host for a new one.');
      }
      existing = row;
    }
    if (existing) {
      if (existing.invitee_user_id || existing.channel === 'account') {
        fail(409, 'invite_used', 'This invitation was opened in the Pantopus app. Answer it there.');
      }
      if (!takeAnswerAllowance(existing.email)) fail(429, 'too_many', 'Try again in a little while.');
      await sendLinkAgain(plan, existing);
      recordFunnelEvent('plan_guest_answered', { meta: { plan_id: plan.post_id, kind: plan.kind, via, answer: fields.answer, again: true } });
      return { state: 'check_email', already_answered: true, mine: null, guest: null, set_cookie: false };
    }
  }

  const email = via === 'email' ? row.email : (fields.email || row?.email || null);
  if (!takeAnswerAllowance(email)) fail(429, 'too_many', 'Try again in a little while.');

  const hostFirst = await actions().hostFirstOf(plan);
  const status = ANSWER_STATUS[fields.answer];
  const before = row ? { ...row } : null;
  const wasIn = Boolean(before && before.status === 'accepted');
  const wasWaiting = Boolean(before && before.status === 'accepted' && before.needs_host_ok);
  const wasLetIn = wasIn && !wasWaiting;
  // From the open link with "I say yes first", the host lets each one in. Someone the host let in once (their
  // "You're in" went) doesn't wait again after a Maybe.
  const letInBefore = wasLetIn || Boolean(before?.address_sent_at);
  const needsHostOk = status === 'accepted' && via === 'open' && plan.open_invite_ok_first && !letInBefore;
  const seatsNeeded = status === 'accepted' ? fields.adults + fields.kids : 0;
  const othersTaken = status === 'accepted'
    ? planService.seatsTaken(plan, await actions().activeRequests(plan.post_id), await guestSeats(plan.post_id, { except: row?.id || null }))
    : 0;
  if (status === 'accepted' && othersTaken + seatsNeeded > plan.spots) {
    fail(409, 'full', `This is full. You can say Maybe, and ${hostFirst} will see it.`, { can_maybe: true });
  }

  // Away from a home the first answer's key comes back in this browser; at a home it never does.
  const browserKey = !presentedKey && !atHome(plan) ? newKey() : null;
  const stamp = nowIso();
  const values = {
    guest_name: fields.name,
    guest_adults: fields.adults,
    guest_kids: fields.kids,
    status,
    needs_host_ok: needsHostOk,
    answered_at: stamp,
    updated_at: stamp,
  };
  if (browserKey) values.guest_key_hashes = withKey(row, browserKey);
  if (via === 'link' && fields.email && !row?.email) values.email = fields.email;

  if (!row) {
    // A new answer from the open link, within the link's own limit and the plan's invitations.
    const existingRows = await invites().loadInvites(plan.post_id);
    const openRows = existingRows.filter((r) => r.channel === 'open').length;
    if (openRows >= plan.spots + LIMITS.openRowsOverRoom || existingRows.length >= invites().invitesLimit(plan)) {
      fail(429, 'too_many', 'Try again in a little while.');
    }
    const { data, error } = await supabaseAdmin.from('PlanInvite').insert({
      ...values, post_id: plan.post_id, host_user_id: plan.host_user_id, channel: 'open', email: fields.email, opened_at: stamp,
    }).select(GUEST_COLUMNS).single();
    if (error) {
      // The same address answered at the same moment: its row is there now.
      if (error.code === '23505') fail(409, 'try_again', 'Please try again.');
      throw new Error(`Failed to save your answer: ${error.message}`);
    }
    row = data;
  } else {
    const { data, error } = await supabaseAdmin.from('PlanInvite')
      .update({ ...values, ...(row.opened_at ? {} : { opened_at: stamp }) })
      .eq('id', row.id).neq('status', 'cancelled').select(GUEST_COLUMNS);
    if (error) throw new Error(`Failed to save your answer: ${error.message}`);
    if (!data || data.length === 0) fail(404, 'not_found', 'This invitation is no longer open.');
    row = data[0];
  }

  // Two answers at once can both pass the room check: the later one is taken back.
  if (status === 'accepted' && planService.seatsTaken(plan, await actions().activeRequests(plan.post_id), await guestSeats(plan.post_id)) > plan.spots) {
    if (before) {
      const restore = Object.fromEntries(Object.keys(values).map((k) => [k, before[k] ?? null]));
      if (!before.guest_key_hashes) restore.guest_key_hashes = [];
      await supabaseAdmin.from('PlanInvite').update({ ...restore, updated_at: nowIso() }).eq('id', row.id);
    } else {
      await supabaseAdmin.from('PlanInvite').delete().eq('id', row.id);
    }
    fail(409, 'full', `This is full. You can say Maybe, and ${hostFirst} will see it.`, { can_maybe: true });
  }

  const nowIn = status === 'accepted' && !needsHostOk;
  // "You're in" with the guest's link, once: at the answer, at a change to in, or when the host lets them in.
  if (nowIn && row.email && !row.address_sent_at) await sendGuestEmail(plan, row, 'in', { stamp: 'address_sent_at' });

  if (nowIn && !wasLetIn) {
    await planNotify.guestAnswered({ plan, invite: row })
      .catch((err) => logger.warn('plans.guests.notice_failed', { planId: plan.post_id, error: err.message }));
  } else if (needsHostOk && !wasWaiting) {
    await planNotify.guestWaiting({ plan, invite: row })
      .catch((err) => logger.warn('plans.guests.notice_failed', { planId: plan.post_id, error: err.message }));
  }
  // Seats given back go to someone waiting, and what they were bringing goes back on the list.
  if (wasIn && status !== 'accepted') {
    await require('./planBring').clearClaims(plan.post_id, 'guest', row.id);
    const fresh = await planService.loadPlanRow(plan.post_id);
    if (fresh) await actions().offerOpenSpots(fresh).catch((err) => logger.warn('plans.guests.offer_failed', { error: err.message }));
  }
  recordFunnelEvent('plan_guest_answered', { meta: { plan_id: plan.post_id, kind: plan.kind, via, answer: fields.answer } });

  const mine = mineView(row);
  const state = atHome(plan) && !presentedKey && (mine.state === 'in' || mine.state === 'waiting_ok') ? 'check_email' : mine.state;
  return { state, mine, guest: browserKey || presentedKey || null, set_cookie: Boolean(browserKey) };
}

// ── The host's side ──────────────────────────────────────────

async function hostPlanWithSwitch(user, postId) {
  const { viewer, plan } = await invites().hostPlan(user, postId);
  if (!viewer.guestAnswersFlag) fail(404, 'not_found', "This isn't available right now.");
  return { viewer, plan };
}

/** The message the host shares with the open link, in the host's voice (as a text invitation's). */
function openLinkMessage(plan) {
  return invites().inviteMessage(plan, 'my');
}

function openLinkView(plan) {
  return {
    on: Boolean(plan.open_invite_token),
    url: plan.open_invite_token ? openUrl(plan.post_id, plan.open_invite_token) : null,
    host_says_yes_first: Boolean(plan.open_invite_ok_first),
  };
}

/**
 * POST /api/plans/:id/invites/open-link { host_says_yes_first?, rotate?, confirm_shares_address? }: makes or returns
 * the plan's one link for everyone. At a home "I say yes first" starts on, and the first invitation's address
 * confirmation applies. `rotate` replaces the token; answers already given stay.
 */
async function makeOpenLink(user, postId, body = {}) {
  const { viewer, plan } = await hostPlanWithSwitch(user, postId);
  if (!takesOpenLink(plan)) fail(422, 'validation', 'One link for everyone is for a private plan.');
  invites().assertInvitable(plan, viewer);
  // At a home the first way in (an invitation or this link) asks the host to confirm sharing the address, once.
  if (!plan.open_invite_token) await invites().assertSharesAddressConfirmed(plan, body);
  const yesFirst = typeof body.host_says_yes_first === 'boolean'
    ? body.host_says_yes_first
    : (plan.open_invite_token ? Boolean(plan.open_invite_ok_first) : atHome(plan));
  const fresh = !plan.open_invite_token || body.rotate === true;
  const token = fresh ? newKey() : plan.open_invite_token;
  const { error } = await supabaseAdmin.from('Plan')
    .update({ open_invite_token: token, open_invite_ok_first: yesFirst, updated_at: nowIso() }).eq('post_id', plan.post_id);
  if (error) throw new Error(`Failed to make the link: ${error.message}`);
  if (fresh) recordFunnelEvent('plan_open_link_made', { userId: viewer.id, meta: { plan_id: plan.post_id, kind: plan.kind, rotated: Boolean(plan.open_invite_token) } });
  return { url: openUrl(plan.post_id, token), message: openLinkMessage(plan), host_says_yes_first: yesFirst };
}

/** DELETE /api/plans/:id/invites/open-link: the link stops letting anyone answer. Answers already given stay. */
async function closeOpenLink(user, postId) {
  const { plan } = await hostPlanWithSwitch(user, postId);
  const { error } = await supabaseAdmin.from('Plan')
    .update({ open_invite_token: null, updated_at: nowIso() }).eq('post_id', plan.post_id);
  if (error) throw new Error(`Failed to turn the link off: ${error.message}`);
  return { open_link: { on: false, url: null, host_says_yes_first: Boolean(plan.open_invite_ok_first) } };
}

async function guestRowFor(plan, inviteId) {
  if (!planService.isUuid(inviteId)) fail(404, 'not_found', "That invitation isn't here.");
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(GUEST_COLUMNS)
    .eq('id', inviteId).eq('post_id', plan.post_id).maybeSingle();
  if (error) throw new Error(`Failed to load the invitation: ${error.message}`);
  if (!data || data.status === 'cancelled') fail(404, 'not_found', "That invitation isn't here.");
  return data;
}

/** POST /api/plans/:id/invites/:inviteId/ok: lets a waiting guest in and sends their email with their link. */
async function letIn(user, postId, inviteId) {
  const { viewer, plan } = await hostPlanWithSwitch(user, postId);
  const row = await guestRowFor(plan, inviteId);
  if (!isGuest(row) || row.status !== 'accepted') fail(409, 'not_waiting', 'They’re not waiting any more.');
  if (row.needs_host_ok) {
    if (!invites().isOpenForAnswers(plan)) fail(409, 'ended', 'This plan has started.');
    const { data, error } = await supabaseAdmin.from('PlanInvite')
      .update({ needs_host_ok: false, updated_at: nowIso() })
      .eq('id', row.id).eq('status', 'accepted').eq('needs_host_ok', true).select(GUEST_COLUMNS);
    if (error) throw new Error(`Failed to let them in: ${error.message}`);
    if (data && data.length) {
      await sendGuestEmail(plan, data[0], 'in', { stamp: 'address_sent_at' });
      await planNotify.guestAnswered({ plan, invite: data[0] })
        .catch((err) => logger.warn('plans.guests.notice_failed', { planId: plan.post_id, error: err.message }));
      recordFunnelEvent('plan_guest_let_in', { userId: viewer.id, meta: { plan_id: plan.post_id, kind: plan.kind } });
    }
  }
  return invites().listForHost(user, postId);
}

/**
 * The host removed a guest without an account (DELETE /api/plans/:id/invites/:inviteId on a guest's row): the row is
 * cancelled, which ends all their keys together; it keeps their hashes, so their links say the invitation is no
 * longer open and show nothing else.
 * Their seats go to someone waiting.
 */
async function removeGuest(plan, row) {
  const { data, error } = await supabaseAdmin.from('PlanInvite')
    .update({ status: 'cancelled', needs_host_ok: false, updated_at: nowIso() })
    .eq('id', row.id).neq('status', 'cancelled').select('id');
  if (error) throw new Error(`Failed to remove them: ${error.message}`);
  if (data && data.length) await require('./planBring').clearClaims(plan.post_id, 'guest', row.id);
  if (data && data.length && row.status === 'accepted') {
    const fresh = await planService.loadPlanRow(plan.post_id);
    if (fresh) await actions().offerOpenSpots(fresh).catch((err) => logger.warn('plans.guests.offer_failed', { error: err.message }));
  }
}

/**
 * POST /api/plans/:id/invites/remind: everyone invited who hasn't answered, the way each was invited: a notice to an
 * account, the invitation again to an address. A text invitation nobody opened has nobody to remind. Once a plan a
 * day, once a person (K6). Answers { reminded, skipped }.
 */
async function remind(user, postId) {
  const { viewer, plan } = await hostPlanWithSwitch(user, postId);
  invites().assertInvitable(plan, viewer);
  const { data: rows, error } = await supabaseAdmin.from('PlanInvite').select(GUEST_COLUMNS)
    .eq('post_id', plan.post_id).neq('status', 'cancelled');
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  const dayAgo = Date.now() - DAY_MS;
  // Reminded by Remind in the last day: still unanswered, or answered since (a guest's own reminder before the plan
  // comes after their answer, and doesn't count).
  const remindedToday = (r) => r.reminded_at && new Date(r.reminded_at).getTime() > dayAgo
    && (r.status === 'pending' || (r.answered_at && new Date(r.answered_at) > new Date(r.reminded_at)));
  if ((rows || []).some(remindedToday)) {
    fail(429, 'too_many', 'You reminded people today. Try again tomorrow.');
  }
  const requests = await actions().activeRequests(plan.post_id);
  const asked = new Set(requests.map((r) => String(r.user_id)));
  const hostFirst = await actions().hostFirstOf(plan);
  let reminded = 0;
  let skipped = 0;
  for (const row of rows || []) {
    if (row.status !== 'pending' || row.reminded_at) continue;
    if (row.invitee_user_id) {
      if (asked.has(String(row.invitee_user_id))) continue;
      const claimed = await claimReminder(row);
      if (!claimed) continue;
      const shown = await require('./planBusiness').peopleShown(plan, [String(row.invitee_user_id)]);
      if (!shown.has(String(row.invitee_user_id))) { skipped += 1; continue; }
      await planNotify.invited({ plan, invite: row, userId: row.invitee_user_id, hostFirst, reminder: true });
      reminded += 1;
    } else if (row.channel === 'email') {
      if (!(await claimReminder(row))) continue;
      if (await invites().resendInviteEmail(plan, row, hostFirst)) reminded += 1;
      else skipped += 1;
    } else {
      // A text invitation nobody opened: nobody to remind.
      skipped += 1;
    }
  }
  return { reminded, skipped };
}

async function claimReminder(row) {
  const { data } = await supabaseAdmin.from('PlanInvite').update({ reminded_at: nowIso(), updated_at: nowIso() })
    .eq('id', row.id).is('reminded_at', null).eq('status', 'pending').select('id');
  return Boolean(data && data.length);
}

/**
 * POST /api/plans/:id/invites/maybe: an invited account says Maybe. Someone in or waiting is taken out first; the
 * ordinary ask or "can't make it" replaces it later.
 */
async function sayMaybe(user, postId, { io = null } = {}) {
  const viewer = await require('./planViewer').loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (!(await switchFor(plan.host_user_id)) || !takesAnswers(plan)) fail(404, 'not_found', "This isn't available right now.");
  const invite = (await invites().viewerInvites(viewer.id, [postId])).get(postId);
  if (!invite) fail(404, 'not_found', 'You don’t have an invitation to this plan.');
  if (!invites().isOpenForAnswers(plan)) fail(409, 'ended', 'This plan has started.');
  const { data: mine } = await supabaseAdmin.from('PlanRequest').select('status')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (mine && ['pending', 'waitlisted', 'accepted'].includes(mine.status)) await actions().withdrawMine(user, postId, { io });
  const { error } = await supabaseAdmin.from('PlanInvite')
    .update({ status: 'maybe', answered_at: nowIso(), updated_at: nowIso() })
    .eq('post_id', postId).eq('invitee_user_id', viewer.id).in('status', ['pending', 'accepted', 'declined']);
  if (error) throw new Error(`Failed to save your answer: ${error.message}`);
  const { body } = await planService.getForViewer(postId, viewer);
  return { plan: body };
}

// ── The card and the host's list (`guests=1`) ────────────────

/** Adults and kids who are in: accounts' parties (kids where welcome) and guests let in. Never the host. */
function headcountOf(plan, requests, rows) {
  let adults = 0;
  let kids = 0;
  for (const r of requests || []) {
    if (r.status !== 'accepted') continue;
    adults += Number(r.party_size) || 1;
    kids += plan.kids_welcome || plan.kind === 'playdate' ? Number(r.kids_count) || 0 : 0;
  }
  for (const r of rows || []) {
    if (r.status !== 'accepted' || r.needs_host_ok) continue;
    adults += Number(r.guest_adults) || 1;
    kids += Number(r.guest_kids) || 0;
  }
  return { adults, kids };
}

/**
 * The card's H1 parts (6.5), for an app that sent `guests=1` while the host has the switch: kids_welcome; the
 * headcount for the host and people who are in; for the host, the answers counted in people.
 */
function addCardFields(card, plan, { role, requests, guestRows: rows, counts }) {
  card.kids_welcome = Boolean(plan.kids_welcome);
  if (role === 'host' || role === 'guest') card.headcount = headcountOf(plan, requests, rows);
  if (role === 'host') {
    const head = card.headcount;
    const maybeGuests = (rows || []).filter((r) => r.status === 'maybe')
      .reduce((sum, r) => sum + (Number(r.guest_adults) || 1) + (Number(r.guest_kids) || 0), 0);
    card.answers = {
      in: head.adults + head.kids,
      maybe: maybeGuests + (counts?.maybe_accounts || 0),
      no_answer: counts?.pending || 0,
    };
  }
}

/** Guests in, for the plan's people line (H1, `guests=1`): no account, their typed name, their numbers. */
function peopleEntries(plan, rows, { viewerIsHost }) {
  return (rows || [])
    .filter((r) => r.status === 'accepted' && !r.needs_host_ok)
    .sort((a, b) => new Date(a.answered_at || 0) - new Date(b.answered_at || 0))
    .map((r) => ({
      user_id: null,
      guest_id: r.id,
      // The host sees the name as typed; people in see it as Plans shows names ("Dana L.").
      display_name: viewerIsHost ? r.guest_name : planService.displayName({ name: r.guest_name }),
      avatar_url: null,
      party_size: Number(r.guest_adults) || 1,
      kids_count: Number(r.guest_kids) || 0,
      verified_address: false,
      is_host: false,
      on_my_way: false,
      guest: true,
    }));
}

/** A row in the host's list (`guests=1`): what a guest without an account adds. Never the address they gave. */
function hostRowParts(row) {
  if (!isGuest(row)) return {};
  return { guest: { name: row.guest_name, adults: row.guest_adults, kids: row.guest_kids } };
}

// ── After the host changes or cancels the plan (planActions.editPlan, cancelOpenPlan) ──

async function guestsIn(postId) {
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(GUEST_COLUMNS)
    .eq('post_id', postId).not('guest_name', 'is', null).is('invitee_user_id', null).eq('status', 'accepted');
  if (error) throw new Error(`Failed to load guests: ${error.message}`);
  return data || [];
}

/**
 * The time or the place changed: guests who are in see it on their page, and get one email about a change (the
 * first), with their link. Nothing ends a guest's keys but their removal (K3).
 */
async function planChanged(plan, { timeMoved, placeChanged }) {
  if (!takesAnswers(plan) || (!timeMoved && !placeChanged)) return;
  const reason = timeMoved && placeChanged ? 'both' : timeMoved ? 'time' : 'place';
  const hostFirst = await actions().hostFirstOf(plan);
  for (const row of await guestsIn(plan.post_id)) {
    try {
      const firstChange = !row.changed_at;
      const { error } = await supabaseAdmin.from('PlanInvite')
        .update({ changed_at: nowIso(), changed_reason: reason, updated_at: nowIso() })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
      if (row.needs_host_ok) continue;
      if (firstChange) {
        const newPlace = (await placeFor(plan, hostFirst)).name;
        await sendGuestEmail(plan, row, 'changed', { words: { changed: reason, newPlace, when: invites().dateText(plan) } });
      }
    } catch (err) {
      logger.warn('plans.guests.change_failed', { inviteId: row.id, error: err.message });
    }
  }
}

/** The plan was cancelled: guests who are in get the one email about it, with the host's note. */
async function planCancelled(plan, note) {
  if (!takesAnswers(plan)) return;
  for (const row of await guestsIn(plan.post_id)) {
    try {
      await sendGuestEmail(plan, row, 'cancelled', { words: { cancelNote: note || null } });
    } catch (err) {
      logger.warn('plans.guests.cancel_email_failed', { inviteId: row.id, error: err.message });
    }
  }
}

/**
 * The Plans tick: the one reminder for guests who are in, at the time people who are in are reminded
 * (rules.reminderAt), for plans starting within 16 hours.
 */
async function sendReminders(plans) {
  let sent = 0;
  for (const plan of plans || []) {
    if (!takesAnswers(plan) || plan.status !== 'open') continue;
    const tz = rules.timezoneForPlan(plan);
    const remindAt = rules.reminderAt(plan.post.event_date, tz);
    if (remindAt.getTime() > Date.now()) continue;
    let rows;
    try {
      rows = (await guestsIn(plan.post_id)).filter((r) => !r.needs_host_ok && !r.reminded_at && r.email);
    } catch (err) {
      logger.warn('plans.guests.reminders_unavailable', { planId: plan.post_id, error: err.message });
      continue;
    }
    const startDay = rules.localParts(new Date(plan.post.event_date), tz).date;
    const today = rules.localParts(new Date(), tz).date;
    for (const row of rows) {
      const { data: claimed } = await supabaseAdmin.from('PlanInvite').update({ reminded_at: nowIso() })
        .eq('id', row.id).is('reminded_at', null).select('id');
      if (!claimed || claimed.length === 0) continue;
      // Someone who just got "You're in" after the reminder time needs no second email.
      if (row.address_sent_at && new Date(row.address_sent_at).getTime() > remindAt.getTime()) continue;
      // Things still open on the bring list (H2).
      const openCount = await require('./planBring').openCount(plan);
      if (await sendGuestEmail(plan, row, 'reminder', { words: { day: startDay === today ? 'Today' : 'Tomorrow', openCount } })) sent += 1;
    }
  }
  return sent;
}

module.exports = {
  LIMITS,
  COOKIE_PREFIX,
  cookieName,
  cookieOptions,
  isKey,
  hashKey,
  takesAnswers,
  takesOpenLink,
  stateOf,
  isGuest,
  switchFor,
  switchByHost,
  guestRows,
  guestSeats,
  seatsOf,
  rowByKey,
  forPage,
  answer,
  makeOpenLink,
  closeOpenLink,
  openLinkView,
  letIn,
  removeGuest,
  remind,
  sayMaybe,
  addCardFields,
  peopleEntries,
  hostRowParts,
  planChanged,
  planCancelled,
  sendReminders,
};
