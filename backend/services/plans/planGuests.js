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
  'address_sent_at', 'reminded_at', 'changed_at', 'changed_reason', 'guest_emails', 'email_sent_times', 'host_ok_at', 'opened_at',
  'answered_at', 'created_at', 'updated_at',
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

/** The web's origin, from the plan share link's shape. */
const siteBase = () => planService.shareUrl('x').replace(/\/plans\/x$/, '');

/**
 * The open link: `/plan-link/<id>?open=<token>` (contract 6.9). Not under `/plans/`, which every iPhone build opens
 * in the app (apple-app-site-association lists it) and no store build knows an open link: the web page serves it, and
 * its "Open app" carries the token into an app that does.
 */
function openUrl(postId, token) {
  return `${siteBase()}/plan-link/${postId}?open=${encodeURIComponent(token)}`;
}

/**
 * The guest's own link, in their emails only. It goes to a web page the apps don't open (so an installed app never
 * takes it), which keeps the key in the HttpOnly cookie and opens the guest's page, `/plan-link/<id>`, without it.
 */
function guestUrl(postId, key) {
  return `${siteBase()}/plan-invitation/${postId}?key=${encodeURIComponent(key)}`;
}

/** Is `token` this plan's live open link? */
function isOpenToken(plan, token) {
  return takesOpenLink(plan) && sameSecret(token, plan.open_invite_token);
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
    // A guest the host removed, or a person with an account (6.9) removed or turned down with the address on their row.
    removed: rows.some((r) => r.status === 'cancelled' && (r.guest_name || r.invitee_user_id)),
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
 * An invitation's own link says who is answering (contract 6.1): with an email or text invitation's token, a guest's
 * key (sent, or the browser's cookie for the plan) that belongs to another invitation row of the plan is not used, so
 * a second invitee opening their own link in a browser where someone else answered never reads that answer. The open
 * link names nobody: with it the key stays, as does a key of the token's own row.
 */
async function keyRowFor(plan, key, inviteToken) {
  const row = key ? await rowByKey(plan.post_id, key) : null;
  if (!row || !isKey(inviteToken)) return row;
  const linkRow = await rowByToken(plan.post_id, inviteToken);
  return linkRow && String(linkRow.id) !== String(row.id) ? null : row;
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
  const mine = await keyRowFor(plan, guestKey, inviteToken);
  if (mine && mine.status === 'cancelled') return { ...none, removed: true };
  const openLive = Boolean(openToken) && isOpenToken(plan, openToken);
  let via = mine ? mine.channel : null;
  if (!via && openLive) via = 'open';
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
    // The page was opened with the plan's live open link (6.9): its "Open app" carries the link into the app.
    open_live: openLive && invites().isOpenForAnswers(plan),
  };
  // Photos afterwards (the extras): a guest who was in, on a plan that is over, may look (GET …/photos).
  const planPhotos = require('./planPhotos');
  if (isGuestIn(mine) && planPhotos.isOver(plan) && require('./planExtras').takesExtras(plan) && (await planPhotos.enabledFor(plan.host_user_id))) {
    const count = ((plan.photos && plan.photos.items) || []).length;
    answer.photos = { count, add_text: 'Add yours in the app.', note: 'Only the people who came can see these. They stay with the plan.' };
  }
  // Find a date (the extras): while the host picks, W1 shows the times in place of the three answers.
  const planDates = require('./planDates');
  if (planDates.isPicking(plan) && (await planDates.enabledFor(plan.host_user_id))) {
    const parts = await planDates.cardParts(plan);
    answer.dates = planDates.view(plan, { mineKey: mine ? require('./planExtras').guestKey(mine.id) : '-', invited: parts.invited });
    answer.dates.host_line = `${await actions().hostFirstOf(plan)} is picking a date`;
  }
  let forGuest = null;
  if (isGuestIn(mine) && plan.status !== 'cancelled') {
    const hostFirst = await actions().hostFirstOf(plan);
    forGuest = {
      place: await placeFor(plan, hostFirst),
      guest_note: plan.guest_note || null,
      going: await goingNames(plan, mine.id),
      // The bring list (H2), while the host has its switch.
      bring: await bringFor(plan, mine),
      // Chip in (the extras), while the host has its switch: the payment link reaches only people who are in.
      ...(await chipInFor(plan, mine)),
      // The gift exchange (the extras): their own card, with whom they drew and nobody else's.
      ...(await giftFor(plan, mine)),
      // The plan's time or place changed since the guest last answered: 'time', 'place' or 'both'.
      changed: changedReason(mine),
    };
  }
  return { live: true, answer, for_guest: forGuest, removed: false };
}

/** What changed ('time', 'place' or 'both') since the guest last answered, or null. */
function changedReason(row) {
  const since = row?.changed_at && (!row.answered_at || new Date(row.changed_at) > new Date(row.answered_at));
  return since ? row.changed_reason || null : null;
}

/** The guest's own answer, read with their key. `email_hint` ("da•••@example.com") is for their page's own words. */
async function bringFor(plan, row) {
  const planBring = require('./planBring');
  if (!plan.bring_list || !planBring.takesBringList(plan) || !(await planBring.enabledFor(plan.host_user_id))) return null;
  return planBring.view(plan.bring_list, planBring.mineFor({ role: 'guest', inviteId: row.id }));
}

async function giftFor(plan, row) {
  if (!plan.gift) return {};
  const gift = await require('./planGift').forGuest(plan, row);
  return gift ? { gift } : {};
}

async function chipInFor(plan, row) {
  if (!plan.chip_in) return {};
  const chipIn = await require('./planChipIn').forGuest(plan, row);
  return chipIn ? { chip_in: chipIn } : {};
}

// ── Find a date (the extras, 08-extras section 2) ──

/**
 * PUT /api/public/plans/:id/dates/mine { open | invite | guest, name, adults, kids, email, options }: a guest without
 * an account ticks the times that work, with the name and email rules of an answer (6.3). The row is saved answered
 * but not in (status pending, its name and numbers) and the ticks go on the plan's date_options. Away from a home the
 * first answer's key comes back; at a home it travels only in an email to the address ("Your times are saved"), and the
 * answer is check_email. An address that already has a row, without its key, changes nothing and gets its link.
 */
async function answerDates(postId, body = {}, { cookieKey = null } = {}) {
  const planDates = require('./planDates');
  const plan = await loadAnswerablePlan(postId);
  if (!plan.date_options || !(await planDates.enabledFor(plan.host_user_id))) fail(404, 'not_found', "This plan isn't available.");
  if (!planDates.isPicking(plan)) fail(409, 'picked', 'The date is picked. Answer the invitation.');
  if (!invites().isOpenForAnswers(plan)) {
    const hostFirst = await actions().hostFirstOf(plan);
    fail(409, 'ended', plan.status === 'cancelled' ? `${hostFirst} cancelled this plan.` : 'This plan is over.');
  }
  const key = isKey(body.guest) ? body.guest : cookieKey;
  let { row, via, presentedKey } = await resolveAnswerRow(plan, { ...(body || {}), guest: key || undefined }, { cookieKey: null, patch: false });
  if (row && !isGuest(row) && row.status !== 'pending') fail(409, 'picked', 'Answer the invitation.');
  const fields = checkedFields(plan, { ...(body || {}), answer: 'maybe' }, presentedKey ? row : null, { via });
  planDates.checkedIds(plan.date_options, body.options);
  if (fields.email && !(presentedKey && row?.email === fields.email) && (await invites().addressOptedOut(fields.email))) {
    fail(409, 'email_opted_out', 'This address asked Pantopus not to email it. Use another one.');
  }
  if (!presentedKey) {
    let existing = null;
    if (via === 'open' || (via === 'link' && fields.email && !row.guest_name)) {
      const found = await rowsByEmail(plan.post_id, fields.email);
      if (via === 'open' && !found.live && found.removed) fail(404, 'not_found', 'This invitation is no longer open.');
      if (found.live && found.live.id !== row?.id) existing = found.live;
    }
    if (row && row.guest_name) {
      if (via === 'link' && fields.email !== row.email) fail(409, 'invite_used', 'Someone else already used this invitation. Ask the host for a new one.');
      existing = row;
    }
    if (existing) {
      if (existing.invitee_user_id || existing.channel === 'account') fail(409, 'invite_used', 'This invitation was opened in the Pantopus app. Answer it there.');
      if (!takeAnswerAllowance(existing.email)) fail(429, 'too_many', 'Try again in a little while.');
      await sendLinkAgain(plan, existing);
      return { state: 'check_email', already_answered: true, mine: null, guest: null, set_cookie: false };
    }
  }
  const email = via === 'email' ? row.email : (fields.email || row?.email || null);
  if (!takeAnswerAllowance(email)) fail(429, 'too_many', 'Try again in a little while.');
  const browserKey = !presentedKey && !atHome(plan) ? newKey() : null;
  const stamp = nowIso();
  const values = { guest_name: fields.name, guest_adults: fields.adults, guest_kids: fields.kids, answered_at: stamp, updated_at: stamp };
  if (browserKey) values.guest_key_hashes = withKey(row, browserKey);
  if (via === 'link' && fields.email && !row?.email) values.email = fields.email;
  if (!row) {
    const existingRows = await invites().loadInvites(plan.post_id);
    const openRows = existingRows.filter((r) => r.channel === 'open').length;
    if (openRows >= plan.spots + LIMITS.openRowsOverRoom || existingRows.length >= invites().invitesLimit(plan)) fail(429, 'too_many', 'Try again in a little while.');
    const { data, error } = await supabaseAdmin.from('PlanInvite').insert({
      ...values, status: 'pending', post_id: plan.post_id, host_user_id: plan.host_user_id, channel: 'open', email: fields.email, opened_at: stamp,
    }).select(GUEST_COLUMNS).single();
    if (error) {
      if (error.code === '23505') fail(409, 'try_again', 'Please try again.');
      throw new Error(`Failed to save your answer: ${error.message}`);
    }
    row = data;
  } else {
    const { data, error } = await supabaseAdmin.from('PlanInvite').update({ ...values, ...(row.opened_at ? {} : { opened_at: stamp }) })
      .eq('id', row.id).eq('status', 'pending').select(GUEST_COLUMNS);
    if (error) throw new Error(`Failed to save your answer: ${error.message}`);
    if (!data || data.length === 0) fail(404, 'not_found', 'This invitation is no longer open.');
    row = data[0];
  }
  await planDates.saveTicks(plan, require('./planExtras').guestKey(row.id), body.options);
  recordFunnelEvent('plan_guest_answered', { meta: { plan_id: plan.post_id, kind: plan.kind, via, answer: 'dates' } });
  if (browserKey || presentedKey) return { state: 'saved', mine: mineView(row), guest: browserKey, set_cookie: Boolean(browserKey) };
  // At a home the key goes only by email, at most once a day.
  if (!emailedWithinDay(row)) await sendDateEmail(plan, row, 'dates_saved');
  return { state: 'check_email', mine: null, guest: null, set_cookie: false };
}

/**
 * The pick settles a guest who ticked it (planDates.settle): in, or, from the open link with "I say yes first" (and
 * never let in by hand), waiting for the host's yes with their seats held. "{title} is {date}. You're in." goes by email
 * with their link, outside the plan's three. Answers 'in', 'waiting' or null.
 */
async function settlePicked(plan, row) {
  const needsHostOk = row.channel === 'open' && Boolean(plan.open_invite_ok_first) && !row.host_ok_at;
  const stamp = nowIso();
  const { data, error } = await supabaseAdmin.from('PlanInvite')
    .update({ status: 'accepted', needs_host_ok: needsHostOk, answered_at: stamp, updated_at: stamp })
    .eq('id', row.id).eq('status', 'pending').select(GUEST_COLUMNS);
  if (error) throw new Error(`Failed to let them in: ${error.message}`);
  if (!data || data.length === 0) return null;
  const fresh = data[0];
  if (needsHostOk) {
    await planNotify.guestWaiting({ plan, invite: fresh }).catch((err) => logger.warn('plans.guests.notice_failed', { error: err.message }));
    return 'waiting';
  }
  await sendDateEmail(plan, fresh, 'date_in', { stamp: 'address_sent_at' });
  await planNotify.guestAnswered({ plan, invite: fresh }).catch((err) => logger.warn('plans.guests.notice_failed', { error: err.message }));
  return 'in';
}

/** A guest who ticked the picked time but doesn't fit: Maybe, and "{title} is full right now" by email. */
async function settleFull(plan, row, when) {
  const { data, error } = await supabaseAdmin.from('PlanInvite')
    .update({ status: 'maybe', answered_at: nowIso(), updated_at: nowIso() })
    .eq('id', row.id).eq('status', 'pending').select(GUEST_COLUMNS);
  if (error) throw new Error(`Failed to save the answer: ${error.message}`);
  if (!data || data.length === 0) return false;
  await sendDateEmail(plan, data[0], 'date_full', { when });
  return true;
}

/** A find-a-date email to a guest (outside the plan's three): 'dates_saved', 'date_in' or 'date_ask'. */
async function sendDateEmail(plan, row, kind, { when = null, stamp = null } = {}) {
  const planDates = require('./planDates');
  const words = { when: when || planDates.noticeDate(plan.post.event_date, rules.timezoneForPlan(plan)) };
  return sendGuestEmail(plan, row, kind, { words, stamp, inThree: false, capped: false });
}

/** The gift exchange's draw, by email to a guest (outside the plan's three): it never carries the name. */
async function sendGiftEmail(plan, row, kind) {
  return sendGuestEmail(plan, row, kind, { inThree: false, capped: false });
}

async function guestRowsFull(postId) {
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(GUEST_COLUMNS).eq('post_id', postId).neq('status', 'cancelled');
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  return data || [];
}

function mineView(row) {
  return {
    state: stateOf(row), name: row.guest_name, adults: row.guest_adults, kids: row.guest_kids,
    email_hint: row.email ? invites().emailHint(row.email) : null,
    // A waiting guest's page says the place changed too (6.8), e.g. after a move to the host's home.
    changed: changedReason(row),
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
  let key = isKey(body.guest) ? body.guest : (patch ? cookieKey : null);
  // An answer that carries an email or text invitation's token is that invitation's: another row's key is not used.
  if (key && !patch && isKey(body.invite)) {
    const [keyRow, linkRow] = await Promise.all([rowByKey(plan.post_id, key), rowByToken(plan.post_id, body.invite)]);
    if (keyRow && linkRow && String(keyRow.id) !== String(linkRow.id)) key = null;
  }
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
 * Why a guest email to this address can't go now: 'opted_out', or 'too_many' (five an address a day from every host
 * together, every email counted by its own time; and, for an email that is one of the plan's three, three a guest a
 * plan), else null. The plan's three are "You're in", the one reminder and the first change of time or place; a
 * cancellation and "its link again" are outside them.
 */
async function guestEmailHeld(row, { inThree = true } = {}) {
  if (!row?.email) return 'no_address';
  if (inThree && (Number(row.guest_emails) || 0) >= LIMITS.emailsPerGuestPerPlan) return 'too_many';
  return invites().emailHeld(row.email);
}

/** Did any email go to this guest for this plan in the last day (their invitation included)? */
function emailedWithinDay(row) {
  const dayAgo = Date.now() - DAY_MS;
  const after = (t) => Boolean(t) && new Date(t).getTime() > dayAgo;
  return (row.email_sent_times || []).some(after) || after(row.address_sent_at) || after(row.reminded_at)
    || (row.channel === 'email' && row.email_status === 'sent' && after(row.created_at));
}

/** The words every guest email shares. While the plan picks its date they name none (08-extras section 2). */
async function guestEmailWords(plan, row) {
  const hostFirst = await actions().hostFirstOf(plan);
  return {
    hostFirst,
    title: plan.post.title,
    icon: planNotify.ICON_BY_KIND[plan.kind] || '📅',
    when: (await require('./planDates').invitesWhilePicking(plan)) ? null : invites().dateText(plan),
    people: planNotify.peopleText(row.guest_adults, row.guest_kids, { and: true }),
  };
}

/**
 * After an email went: its key joins the row's keys, its time is kept (the address's day count), it counts among the
 * plan's three when it is one of them, and its moment is stamped.
 */
async function saveEmailed(row, key, stamp, { inThree = true } = {}) {
  const patch = {
    guest_key_hashes: withKey(row, key),
    ...(inThree ? { guest_emails: (Number(row.guest_emails) || 0) + 1 } : {}),
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
 * Answers whether it went. `stamp`: the row's column to stamp ('address_sent_at' or 'reminded_at'). `inThree`: it
 * counts as one of the plan's three (a cancellation and a move to a home never do); `capped`: the three hold it back
 * once they are used (as a rule the same; "You're in" after the host's own yes never is held, 6.6).
 */
async function sendGuestEmail(plan, row, kind, {
  words = {}, stamp = null, inThree = !['cancelled', 'moved_home'].includes(kind), capped = inThree,
} = {}) {
  const held = await guestEmailHeld(row, { inThree: capped });
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
  await saveEmailed(row, key, stamp, { inThree });
  return true;
}

/**
 * An answer came for an address that already has a row, without a key of that row (6.3): that address gets its link,
 * outside the plan's three, and only if no email went to that guest for this plan in the last day (otherwise nothing
 * goes, and the answer reads the same, so nothing can be told from outside). It counts against the address's day.
 * Someone in gets "You're in" again; anyone else (waiting, maybe, can't make it, or an invitation the host typed and
 * nobody answered yet) gets the invitation email's own words with their link, which opens their answer to see or
 * change.
 */
async function sendLinkAgain(plan, row) {
  if (emailedWithinDay(row)) {
    logger.info('plans.guests.email_held', { inviteId: row.id, kind: 'link_again', reason: 'within_day' });
    return false;
  }
  if (isGuestIn(row)) return sendGuestEmail(plan, row, 'in', { inThree: false });
  const held = await guestEmailHeld(row, { inThree: false });
  if (held) {
    logger.info('plans.guests.email_held', { inviteId: row.id, kind: 'link_again', reason: held });
    return false;
  }
  const key = newKey();
  const { sendPlanInviteEmail } = require('../emailService');
  try {
    const sent = await sendPlanInviteEmail({
      toEmail: row.email,
      words: await invites().emailWords(plan, await actions().hostFirstOf(plan)),
      link: guestUrl(plan.post_id, key),
      unsubscribeLink: invites().unsubscribeUrl(key),
      oneClickUnsubscribeLink: invites().oneClickUnsubscribeUrl(key),
    });
    if (!sent?.success) return false;
  } catch (err) {
    logger.warn('plans.guests.email_failed', { inviteId: row.id, kind: 'link_again', error: err.message });
    return false;
  }
  await saveEmailed(row, key, null, { inThree: false });
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
  // Find a date (the extras): while the date is being picked a guest ticks times instead (answerDates).
  if (require('./planDates').isPicking(plan)) fail(409, 'picking', 'Tick the times that work for you.');
  let { row, via, presentedKey } = await resolveAnswerRow(plan, body || {}, { cookieKey, patch });
  if (!invites().isOpenForAnswers(plan)) {
    const hostFirst = await actions().hostFirstOf(plan);
    fail(409, 'ended', plan.status === 'cancelled' ? `${hostFirst} cancelled this plan.` : 'This plan is over.');
  }
  const fields = checkedFields(plan, body || {}, presentedKey ? row : null, { via });

  // An address that said "don't send me invitations" gets no email, so "Check your email" would never come true: where
  // the form asks for an email, such an address is refused and nothing is saved (6.3). A guest changing their own
  // answer with the address already on their row isn't asked again.
  if (fields.email && !(presentedKey && row?.email === fields.email) && (await invites().addressOptedOut(fields.email))) {
    fail(409, 'email_opted_out', 'This address asked Pantopus not to email it. Use another one.');
  }

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
  // From the open link with "I say yes first", the host lets each one in. Someone in now keeps their place when they
  // change their answer; someone the host let in by hand once (host_ok_at) doesn't wait again after a Maybe. Nothing
  // else counts as let in (6.8): not a "You're in" that once went, and not having been in before the plan moved to the
  // host's home.
  const letInBefore = wasLetIn || Boolean(before?.host_ok_at);
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
    await require('./planGift').onLeave(plan.post_id, require('./planExtras').guestKey(row.id));
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

/** The message the host shares with the open link, in the host's voice (as a text invitation's, picking included). */
async function openLinkMessage(plan) {
  return invites().inviteMessage(plan, 'my', { picking: await require('./planDates').invitesWhilePicking(plan) });
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
  // People with an account who opened the link and haven't said they're in follow "I say yes first" as a guest's next
  // answer does (6.9).
  if (yesFirst !== Boolean(plan.open_invite_ok_first)) await setOpenAccountsYesFirst(plan.post_id, yesFirst);
  return { url: openUrl(plan.post_id, token), message: await openLinkMessage(plan), host_says_yes_first: yesFirst };
}

/**
 * The open link's invitations to accounts (6.9) whose person hasn't asked yet and was never let in by hand: whether
 * their "I'm in" waits for the host's yes. The row's needs_host_ok is what the ask reads; someone already waiting
 * keeps waiting, as a guest does, and someone in stays in.
 */
async function setOpenAccountsYesFirst(postId, yesFirst) {
  const { data: rows, error } = await supabaseAdmin.from('PlanInvite').select('id, invitee_user_id')
    .eq('post_id', postId).eq('channel', 'open').not('invitee_user_id', 'is', null).neq('status', 'cancelled')
    .is('host_ok_at', null).eq('needs_host_ok', !yesFirst);
  if (error) throw new Error(`Failed to load the link's invitations: ${error.message}`);
  if (!rows || rows.length === 0) return;
  const { data: asks, error: askError } = await supabaseAdmin.from('PlanRequest').select('user_id')
    .eq('post_id', postId).in('user_id', rows.map((r) => r.invitee_user_id)).in('status', planService.ACTIVE_REQUEST_STATUSES);
  if (askError) throw new Error(`Failed to load the link's invitations: ${askError.message}`);
  const asked = new Set((asks || []).map((r) => String(r.user_id)));
  const ids = rows.filter((r) => !asked.has(String(r.invitee_user_id))).map((r) => r.id);
  if (ids.length === 0) return;
  const { error: updateError } = await supabaseAdmin.from('PlanInvite')
    .update({ needs_host_ok: yesFirst, updated_at: nowIso() }).in('id', ids).is('host_ok_at', null);
  if (updateError) throw new Error(`Failed to update the link's invitations: ${updateError.message}`);
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

/** This account's ask on the plan while it waits for the host (pending, or on the waitlist), or null. */
async function waitingAskOf(plan, userId) {
  const { data, error } = await supabaseAdmin.from('PlanRequest').select('id, status')
    .eq('post_id', plan.post_id).eq('user_id', userId).in('status', ['pending', 'waitlisted']).maybeSingle();
  if (error) throw new Error(`Failed to load the ask: ${error.message}`);
  return data || null;
}

/**
 * POST /api/plans/:id/invites/:inviteId/ok: lets a waiting guest in, records the host's own yes (host_ok_at, 6.8),
 * and sends "You're in" with their link. That email is never held by the plan's three; it counts as one of them only
 * when it is the guest's first "You're in" (6.6).
 */
async function letIn(user, postId, inviteId, body = {}, { io = null } = {}) {
  const { viewer, plan } = await hostPlanWithSwitch(user, postId);
  const row = await guestRowFor(plan, inviteId);
  // A guest who waited in a browser and has since taken the answer into the app (6.9 item 8) waits as an ask: "Let in"
  // on the notice they sent is the ordinary accept of it, with its address confirmation the first time at a home.
  if (row.channel === 'open' && row.invitee_user_id) {
    const ask = await waitingAskOf(plan, row.invitee_user_id);
    if (!ask) fail(409, 'not_waiting', 'They’re not waiting any more.');
    await actions().decide(user, postId, ask.id, 'accept', body || {}, { io });
    return invites().listForHost(user, postId);
  }
  if (!isGuest(row) || row.status !== 'accepted') fail(409, 'not_waiting', 'They’re not waiting any more.');
  if (row.needs_host_ok) {
    if (!invites().isOpenForAnswers(plan)) fail(409, 'ended', 'This plan has started.');
    const { data, error } = await supabaseAdmin.from('PlanInvite')
      .update({ needs_host_ok: false, host_ok_at: nowIso(), updated_at: nowIso() })
      .eq('id', row.id).eq('status', 'accepted').eq('needs_host_ok', true).select(GUEST_COLUMNS);
    if (error) throw new Error(`Failed to let them in: ${error.message}`);
    if (data && data.length) {
      await sendGuestEmail(plan, data[0], 'in', { stamp: 'address_sent_at', capped: false, inThree: !data[0].address_sent_at });
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
  if (data && data.length) {
    await require('./planBring').clearClaims(plan.post_id, 'guest', row.id);
    await require('./planGift').onLeave(plan.post_id, require('./planExtras').guestKey(row.id));
  }
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
  // Find a date: whoever ticked times has answered.
  const ticked = require('./planDates').isPicking(plan) ? new Set(Object.keys(plan.date_options.answered || {})) : null;
  const extras = require('./planExtras');
  for (const row of rows || []) {
    if (row.status !== 'pending' || row.reminded_at) continue;
    if (ticked && ticked.has(row.invitee_user_id ? extras.personKey(row.invitee_user_id) : extras.guestKey(row.id))) continue;
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

/** Does this edit move a plan that takes answers from anywhere else to a home (6.8)? */
function movesToHome(plan, newPlaceKind) {
  return takesAnswers(plan) && plan.place_kind !== 'home' && newPlaceKind === 'home';
}

/**
 * A plan moving to the host's home (6.8): each guest without an account who came by the open link, is in, and never
 * had the host's own yes goes back to waiting for it. Their seats stay held and their bring-list claims stay; while
 * they wait no key of theirs reads the place, the note, who is going or the list. Guests the host invited by email or
 * text, and accounts, stay in. The edit runs this before the plan row moves, so no key reads the home in between, and
 * once after, for an answer that came in meanwhile. Answers the rows it made wait.
 */
async function holdForHome(postId) {
  const { data, error } = await supabaseAdmin.from('PlanInvite')
    .update({ needs_host_ok: true, updated_at: nowIso() })
    .eq('post_id', postId).eq('channel', 'open').eq('status', 'accepted').eq('needs_host_ok', false)
    .is('host_ok_at', null).is('invitee_user_id', null).not('guest_name', 'is', null)
    .select(GUEST_COLUMNS);
  if (error) throw new Error(`Failed to hold guests for the move: ${error.message}`);
  return data || [];
}

/**
 * A plan moving to the host's home (6.9 item 7), for people with an account whose invitation came by the open link
 * and whom the host never let in by hand (host_ok_at): each who is in goes back to waiting. They leave the plan's
 * chat first, as anyone who is no longer in does, then their ask returns to pending, so they read no address. Their
 * bring-list claims stay, as a waiting guest's do. Everyone else from the link who hasn't been let in by hand waits
 * for the host's yes from now on when they say they're in (needs_host_ok), as a guest's next answer does.
 *
 * Someone the host accepted by hand (their ask was decided by the host) stays in, and that yes is recorded.
 * `strict`: a chat that can't be left stops the move (before the plan row moves); after it, the failure is logged.
 * Answers the asks it made wait.
 */
async function holdAccountsForHome(plan, { io = null, strict = true } = {}) {
  const postId = plan.post_id;
  const { data: rows, error } = await supabaseAdmin.from('PlanInvite').select('id, invitee_user_id')
    .eq('post_id', postId).eq('channel', 'open').not('invitee_user_id', 'is', null).neq('status', 'cancelled')
    .is('host_ok_at', null);
  if (error) throw new Error(`Failed to hold people for the move: ${error.message}`);
  if (!rows || rows.length === 0) return [];
  const inviteByUser = new Map(rows.map((r) => [String(r.invitee_user_id), r]));
  const { data: inNow, error: requestError } = await supabaseAdmin.from('PlanRequest').select(planService.REQUEST_COLUMNS)
    .eq('post_id', postId).in('user_id', [...inviteByUser.keys()]).eq('status', 'accepted');
  if (requestError) throw new Error(`Failed to hold people for the move: ${requestError.message}`);
  const held = [];
  const stamp = nowIso();
  for (const request of inNow || []) {
    const invite = inviteByUser.get(String(request.user_id));
    if (request.decided_by === 'host') {
      // Let in by hand: that is the host's yes.
      await supabaseAdmin.from('PlanInvite').update({ host_ok_at: request.decided_at || stamp, updated_at: stamp }).eq('id', invite.id);
      inviteByUser.delete(String(request.user_id));
      continue;
    }
    try {
      await require('./planChat').removeMember(plan.chat_room_id, request.user_id, { io });
    } catch (err) {
      logger.error('plans.guests.move_chat_failed', { planId: postId, error: err.message });
      if (strict) fail(503, 'unavailable', "We couldn't move the plan. Please try again.");
      continue;
    }
    const { data: moved, error: moveError } = await supabaseAdmin.from('PlanRequest')
      .update({
        status: 'pending', decided_by: null, decided_at: null, reconfirm_requested_at: null, reconfirmed: null,
        reconfirm_reason: null, on_my_way_at: null, updated_at: stamp,
      })
      .eq('id', request.id).eq('status', 'accepted').select(planService.REQUEST_COLUMNS);
    if (moveError) throw new Error(`Failed to hold people for the move: ${moveError.message}`);
    if (moved && moved.length) held.push(moved[0]);
  }
  const waitIds = [...inviteByUser.values()].map((r) => r.id);
  if (waitIds.length > 0) {
    const { error: waitError } = await supabaseAdmin.from('PlanInvite')
      .update({ needs_host_ok: true, updated_at: stamp }).in('id', waitIds).is('host_ok_at', null).eq('needs_host_ok', false);
    if (waitError) throw new Error(`Failed to hold people for the move: ${waitError.message}`);
  }
  return held;
}

/**
 * After the plan moved to the host's home (6.8): each guest it made wait gets one email, outside the plan's three,
 * with their link (it opens the waiting page), so nobody goes to the old place; it is still held for an address that
 * opted out and by the address's five a day. They don't also get the ordinary change email (planChanged skips a
 * guest who waits). Each person with an account it made wait (6.9 item 7) gets one notice, opening the plan. The host
 * gets one notice counting them all, opening Who's coming.
 */
async function movedToHome(plan, rows, asks = []) {
  const count = (rows || []).length + (asks || []).length;
  if (count === 0) return;
  for (const row of rows || []) {
    try {
      await sendGuestEmail(plan, row, 'moved_home');
    } catch (err) {
      logger.warn('plans.guests.move_email_failed', { inviteId: row.id, error: err.message });
    }
  }
  if ((asks || []).length > 0) {
    const hostFirst = await actions().hostFirstOf(plan);
    for (const request of asks) {
      await planNotify.waitAfterMove({ plan, request, hostFirst })
        .catch((err) => logger.warn('plans.guests.notice_failed', { planId: plan.post_id, error: err.message }));
    }
  }
  await planNotify.guestsWaitAfterMove({ plan, count })
    .catch((err) => logger.warn('plans.guests.notice_failed', { planId: plan.post_id, error: err.message }));
}

// ── A browser answer follows the person into the app (6.9 item 8) ──

/**
 * A guest's answer in a browser becomes the account's whose verified email gave it. The caller has checked that the
 * row's address is this account's verified email, and that the host has the switch.
 *  - In becomes an accepted ask (adults as party_size, kids as kids_count, so the seats don't change), in the chat;
 *    waiting for the host's yes becomes a pending ask with needs_host_ok; Maybe and Can't make it stay what they are.
 *  - host_ok_at stays as the host's yes: an ask the host let in by hand is decided by the host.
 *  - What they claimed on the bring list becomes the account's.
 *  - The guest's keys end, so their old links read what a signed-out stranger reads.
 * Nothing moves when the account already answered this plan in the app, holds another invitation to it, or the host
 * said no to or removed it: their own standing stays as it is. Answers whether it moved.
 */
async function adoptAnswer(plan, row, userId, { io = null } = {}) {
  if (!plan || !isGuest(row) || !['accepted', 'maybe', 'declined'].includes(row.status)) return false;
  if (String(plan.host_user_id) === String(userId)) return false;
  const [{ data: request, error: requestError }, { data: others, error: otherError }] = await Promise.all([
    supabaseAdmin.from('PlanRequest').select(planService.REQUEST_COLUMNS).eq('post_id', plan.post_id).eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('PlanInvite').select('id').eq('post_id', plan.post_id).eq('invitee_user_id', userId).limit(1),
  ]);
  if (requestError || otherError) throw new Error(`Failed to load the answer: ${(requestError || otherError).message}`);
  if (request && !['withdrawn', 'left', 'expired'].includes(request.status)) return false;
  if (others && others.length) return false;

  const stamp = nowIso();
  const waiting = row.status === 'accepted' && Boolean(row.needs_host_ok);
  // The row first, only while it is still the guest's: two reads at once move it once.
  const { data: moved, error } = await supabaseAdmin.from('PlanInvite').update({
    invitee_user_id: userId, guest_name: null, guest_adults: null, guest_kids: null, guest_key_hashes: [],
    needs_host_ok: waiting, claimed_at: stamp, opened_at: row.opened_at || stamp, updated_at: stamp,
  }).eq('id', row.id).is('invitee_user_id', null).eq('status', row.status).select(GUEST_COLUMNS);
  if (error) throw new Error(`Failed to move the answer: ${error.message}`);
  if (!moved || moved.length === 0) return false;

  if (row.status === 'accepted') {
    const adults = Math.min(Math.max(Number(row.guest_adults) || 1, 1), rules.PRIVATE_PARTY_MAX);
    const kids = plan.kids_welcome ? Math.min(Math.max(Number(row.guest_kids) || 0, 0), rules.PRIVATE_PARTY_MAX) : 0;
    const values = {
      status: waiting ? 'pending' : 'accepted',
      party_size: adults,
      kids_count: kids > 0 ? kids : null,
      decided_by: waiting ? null : (row.host_ok_at ? 'host' : 'rule'),
      decided_at: waiting ? null : (row.host_ok_at || stamp),
      note: null,
      distance_band: null,
      queued_at: row.answered_at || stamp,
      reconfirm_requested_at: null,
      reconfirmed: null,
      reconfirm_reason: null,
      on_my_way_at: null,
      updated_at: stamp,
    };
    const saved = request
      ? await supabaseAdmin.from('PlanRequest').update({ ...values, ask_count: Math.min(rules.LIMITS.asksPerPlan, (request.ask_count || 1) + 1) })
        .eq('id', request.id).in('status', ['withdrawn', 'left', 'expired']).select(planService.REQUEST_COLUMNS)
      : await supabaseAdmin.from('PlanRequest')
        .insert({ ...values, post_id: plan.post_id, user_id: userId, ask_count: 1, created_at: stamp }).select(planService.REQUEST_COLUMNS);
    const ask = !saved.error && saved.data && saved.data[0];
    if (!ask) {
      // The answer stays the guest's, as it was.
      const restore = {
        invitee_user_id: null, guest_name: row.guest_name, guest_adults: row.guest_adults, guest_kids: row.guest_kids,
        guest_key_hashes: row.guest_key_hashes || [], needs_host_ok: row.needs_host_ok, claimed_at: row.claimed_at || null,
        opened_at: row.opened_at || null, updated_at: nowIso(),
      };
      await supabaseAdmin.from('PlanInvite').update(restore).eq('id', row.id).eq('invitee_user_id', userId);
      logger.warn('plans.guests.adopt_failed', { inviteId: row.id, error: saved.error?.message || 'not saved' });
      return false;
    }
    if (!waiting) {
      try {
        const roomId = await require('./planChat').ensureRoom(plan, { io });
        await require('./planChat').addMember(roomId, userId, { io });
      } catch (err) {
        logger.warn('plans.guests.adopt_chat_failed', { planId: plan.post_id, error: err.message });
      }
    }
    await require('./planBring').moveClaims(plan.post_id, { kind: 'guest', id: row.id }, { kind: 'user', id: ask.id });
  } else {
    await require('./planBring').clearClaims(plan.post_id, 'guest', row.id);
    await require('./planGift').onLeave(plan.post_id, require('./planExtras').guestKey(row.id));
  }
  recordFunnelEvent('plan_guest_answered', { userId, meta: { plan_id: plan.post_id, kind: plan.kind, via: row.channel, answer: stateOf(row), into_app: true } });
  return true;
}

/**
 * Browser answers (rows of guests without an account) whose address is this account's verified email, from any
 * plans: each moves where its host has the switch. Answers how many moved.
 */
async function adoptAnswers(rows, userId, { io = null } = {}) {
  const guestsRows = (rows || []).filter(isGuest);
  if (guestsRows.length === 0) return 0;
  const plans = new Map((await planService.loadPlanRows(guestsRows.map((r) => r.post_id))).map((p) => [p.post_id, p]));
  const switches = await switchByHost([...plans.values()].map((p) => p.host_user_id));
  let moved = 0;
  for (const row of guestsRows) {
    const plan = plans.get(row.post_id);
    if (!plan || !switches.get(String(plan.host_user_id)) || !takesAnswers(plan)) continue;
    try {
      // The row as it is now, with every column the move keeps or restores.
      const { data: fresh } = await supabaseAdmin.from('PlanInvite').select(`${GUEST_COLUMNS}, claimed_at`).eq('id', row.id).maybeSingle();
      if (fresh && (await adoptAnswer(plan, fresh, userId, { io }))) moved += 1;
    } catch (err) {
      logger.warn('plans.guests.adopt_failed', { inviteId: row.id, error: err.message });
    }
  }
  return moved;
}

/**
 * The plan was cancelled: guests who are in get the one email about it, with the host's note, outside the plan's
 * three (a guest who already had all three still hears it). Not a guest still waiting for the host's yes; never an
 * address that opted out, and it counts against the address's day.
 */
async function planCancelled(plan, note) {
  if (!takesAnswers(plan)) return;
  for (const row of await guestsIn(plan.post_id)) {
    if (row.needs_host_ok) continue;
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
  GUEST_COLUMNS_TEXT: GUEST_COLUMNS,
  sendGiftEmail,
  answerDates,
  settlePicked,
  settleFull,
  sendDateEmail,
  guestRowsFull,
  guestSeatsOf: (postId) => guestSeats(postId),
  LIMITS,
  COOKIE_PREFIX,
  cookieName,
  cookieOptions,
  isKey,
  hashKey,
  takesAnswers,
  takesOpenLink,
  isOpenToken,
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
  movesToHome,
  holdForHome,
  holdAccountsForHome,
  movedToHome,
  adoptAnswer,
  adoptAnswers,
  planCancelled,
  sendReminders,
};
