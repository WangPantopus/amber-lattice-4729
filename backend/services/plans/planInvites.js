'use strict';

/**
 * Plans invitations (founder decision, October 31): the host invites people on Pantopus, by email, or with a
 * one-person link they text themselves.
 *
 *  - An invitation is the host's yes. The person says "I'm in" with the ordinary ask (POST /api/plans/:id/requests)
 *    and is in: no distance, location or approval step (planService.askEligibility, planActions.askToJoin). A full
 *    plan still puts them on the waitlist. Playdates need no verified address either (founder decision, November 7).
 *  - Each email or link invite is for one person: the first account that opens it takes it. An email invite opened
 *    by an account whose verified email isn't the invited address waits for the host's yes (needs_host_ok), so a
 *    forwarded email never shows a stranger a home address. An email invite also finds its person without the link:
 *    signing in with the invited, verified address claims it (attachEmailInvites).
 *  - Emails carry the plan's card only (what, when, the area), never an address: one per invite, no reminders, and
 *    an unsubscribe link. The host never learns whether an address has an account: email invites show the address
 *    until the person says they're in.
 *  - Account invites go only to people the host knows (connections, people who came to their plans), and people on
 *    either side of a block, or who muted the host, never hear about them.
 *  - Plans for the holidays (H1, planGuests.js): an email or text invitation can be answered in a browser with no
 *    account, and a private plan can have one open link for everyone. A guest's answer lives on the row. With
 *    `guests=1` the host's list names them, says Maybe and who waits for a yes; an older app reads such a row as `in`
 *    and leaves the open link's rows out.
 */

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { recordFunnelEvent } = require('../funnelEvents');
const { getMuteAndHideFilters } = require('../feedService');
const { localDisplayNames } = require('../../utils/identityProfiles');
const { loadChatPeople } = require('../chatPeople');
const rules = require('./planRules');
const planService = require('./planService');
const planNotify = require('./planNotifications');
const { loadViewer } = require('./planViewer');

// planActions requires this module; its helpers are read when called, not at load.
const actions = () => require('./planActions');

const LIMITS = Object.freeze({
  // Founder, October 31: "start at 20 email invites per plan".
  emailsPerPlan: 20,
  invitesPerPlan: 60,
  // Text invites nobody has opened yet.
  openLinksPerPlan: 30,
  emailsPerHostPerDay: 40,
  // From every host together: one address can't be flooded.
  emailsPerAddressPerDay: 5,
  accountsPerCall: 30,
  emailsPerCall: 20,
  people: 60,
  // A private plan with room over 30 (H1).
  invitesPerBigPlan: 160,
});

const OPEN_STATUSES = ['pending', 'accepted', 'declined', 'maybe'];
const INVITE_COLUMNS = [
  'id', 'post_id', 'host_user_id', 'channel', 'invitee_user_id', 'email', 'status', 'needs_host_ok',
  'email_status', 'claimed_at', 'opened_at', 'answered_at', 'created_at', 'updated_at',
  // A guest without an account (planGuests.js), and the host's own yes (6.8, 6.9).
  'guest_name', 'guest_adults', 'guest_kids', 'reminded_at', 'host_ok_at',
  // The same people again: the name the host knew this address by on an earlier plan (the address stays hidden).
  'known_name',
].join(', ');
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();

// ── Small parts ──────────────────────────────────────────────

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length >= 3 && email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

/** "al•••@gmail.com": enough for the person to recognize their own address, not enough to read someone else's. */
function emailHint(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return null;
  return `${local.slice(0, Math.min(2, local.length))}•••@${domain}`;
}

/** The plan's share page with the invite: the apps open it as a plan link, the web shows "Sam invited you". */
function inviteUrl(postId, token) {
  return `${planService.shareUrl(postId)}?invite=${encodeURIComponent(token)}`;
}

function unsubscribeUrl(token) {
  const base = planService.shareUrl('x').replace(/\/plans\/x$/, '');
  return `${base}/plans/unsubscribe?invite=${encodeURIComponent(token)}`;
}

/** The one-click unsubscribe a mail app sends (RFC 8058), through the web's /api proxy. */
function oneClickUnsubscribeUrl(token) {
  const base = planService.shareUrl('x').replace(/\/plans\/x$/, '');
  return `${base}/api/public/plans/invites/unsubscribe/${encodeURIComponent(token)}`;
}

/** Invitations a plan may have: 60, or 160 for a private plan with room over 30 (H1). */
function invitesLimit(plan) {
  return rules.isPrivate(plan) && !plan.business_user_id && plan.spots > rules.SPOTS_MAX
    ? LIMITS.invitesPerBigPlan : LIMITS.invitesPerPlan;
}

function isOpenForAnswers(plan) {
  if (!plan || plan.status !== 'open') return false;
  return rules.isAskingOpen(plan, planService.startsAt(plan), planService.endsAt(plan));
}

/** Is the signed-in person's own address `email`, verified? Sign-in refuses unconfirmed addresses; a token without
 *  the confirmation claim is checked against Auth. */
async function hasVerifiedEmail(user, email) {
  const mine = normalizeEmail(user?.email);
  if (!mine || !email || mine !== email) return false;
  if (user.emailConfirmed === true) return true;
  if (user.emailConfirmed === false) return false;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (error || !data?.user) return false;
    return normalizeEmail(data.user.email) === email && Boolean(data.user.email_confirmed_at);
  } catch (err) {
    logger.warn('plans.invites.email_check_unavailable', { userId: user.id, error: err.message });
    return false;
  }
}

async function names(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (ids.length === 0) return out;
  const [local, people, users] = await Promise.all([
    localDisplayNames(ids),
    loadChatPeople(ids),
    supabaseAdmin.from('User').select('id, name, first_name, last_name, profile_picture_url').in('id', ids),
  ]);
  if (users.error) throw new Error(`Failed to load people: ${users.error.message}`);
  const rows = new Map((users.data || []).map((u) => [String(u.id), u]));
  for (const id of ids) {
    const user = { ...(rows.get(id) || { id }), local_display_name: local.get(id) || null };
    const shown = planService.withLocalAvatar(user, people);
    out.set(id, {
      user_id: id,
      display_name: planService.displayName(shown),
      avatar_url: planService.avatarUrl(shown),
      search_name: [user.local_display_name, user.name, user.first_name, user.last_name].filter(Boolean).join(' ').toLowerCase(),
    });
  }
  return out;
}

function person(entry) {
  return entry ? { user_id: entry.user_id, display_name: entry.display_name, avatar_url: entry.avatar_url } : null;
}

/**
 * A person as the plan's host sees them in the invitation lists. A business's team sees a first name only
 * (planService.buildDetail gives the same for the people who are in).
 */
function personFor(plan, entry) {
  const shown = person(entry);
  return shown && plan.business_user_id ? { ...shown, display_name: actions().firstOf(shown.display_name) } : shown;
}

/**
 * Whose invitation it is: the plan's host. For a neighbor's plan that is the person inviting; for a business's
 * plan it is the business, whoever on its team sent it, so an invitation never names a staff member.
 */
function inviterId(plan, viewer) {
  return plan.business_user_id ? String(plan.host_user_id) : viewer.id;
}

async function loadInvites(postId) {
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(INVITE_COLUMNS)
    .eq('post_id', postId).neq('status', 'cancelled').order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(`Failed to load invites: ${error.message}`);
  return data || [];
}

async function hostPlan(user, postId) {
  const viewer = await loadViewer(user);
  return { viewer, plan: await hostedPlanRow(postId, viewer) };
}

/** The plan, for its host only (as planActions reads a hosted plan). */
async function hostedPlanRow(postId, viewer) {
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (!require('./planBusiness').runsPlan(plan, viewer)) fail(403, 'not_host', 'Only the host can do that.');
  return plan;
}

/** A business that may no longer host invites nobody: the invitation would open a plan that isn't there. */
function hostMayInvite(plan) {
  return !plan.business_user_id || require('./planBusiness').hostsNow(plan);
}

function assertInvitable(plan, viewer) {
  if (!viewer.invitesFlag) fail(404, 'not_found', "Invitations aren't available right now.");
  if (!hostMayInvite(plan)) fail(409, 'ended', "This plan isn't open to new people right now.");
  if (plan.status === 'cancelled') fail(409, 'ended', 'This plan was cancelled.');
  if (!isOpenForAnswers(plan)) fail(409, 'ended', 'This plan has started, so invitations are closed.');
}

/**
 * At a home: the first invitation (or yes) shares the address with whoever says they're in, so the host confirms it
 * once, as accepting the first ask does (planActions.decide).
 */
async function assertSharesAddressConfirmed(plan, body) {
  // The open link (H1) was made with this same confirmation.
  if (plan.place_kind !== 'home' || body?.confirm_shares_address === true || plan.open_invite_token) return;
  const [accepted, invited] = await Promise.all([
    supabaseAdmin.from('PlanRequest').select('id', { count: 'exact', head: true })
      .eq('post_id', plan.post_id).eq('decided_by', 'host').in('status', ['accepted', 'left', 'removed']),
    supabaseAdmin.from('PlanInvite').select('id', { count: 'exact', head: true }).eq('post_id', plan.post_id),
  ]);
  if (accepted.error || invited.error) throw new Error(`Failed to check the plan: ${(accepted.error || invited.error).message}`);
  if (!accepted.count && !invited.count) {
    fail(409, 'confirm_shares_address', 'People you invite see your address once they say they’re in.');
  }
}

// ── The host's list ──────────────────────────────────────────

/**
 * What the host sees of one invitation:
 *  invited (not answered), opened (a text invite someone opened), in, waitlisted, asked (opened by an account the
 *  email wasn't for, waiting for the host's yes), cant_make_it, left.
 */
function stateOf(row, request, { guests = false } = {}) {
  if (row.status === 'declined') return 'cant_make_it';
  // Maybe (H1), which an older app reads as invited.
  if (row.status === 'maybe') return guests ? 'maybe' : 'invited';
  // A guest without an account: in, or waiting for the host's yes from the open link.
  if (row.guest_name && !row.invitee_user_id && row.status === 'accepted') {
    return guests && row.needs_host_ok ? 'waiting_ok' : 'in';
  }
  if (row.status === 'accepted') {
    if (!request) return 'left';
    if (request.status === 'accepted') return 'in';
    if (request.status === 'waitlisted') return 'waitlisted';
    if (request.status === 'pending') return 'asked';
    return 'left';
  }
  // A text invite someone opened, or (6.9) a person with an account who opened the plan's open link.
  return (row.channel === 'link' || row.channel === 'open') && row.invitee_user_id ? 'opened' : 'invited';
}

const STATE_ORDER = { waiting_ok: -1, asked: 0, in: 1, waitlisted: 2, maybe: 3, opened: 4, invited: 5, cant_make_it: 6, left: 7 };

/**
 * @param {{ guests?: boolean }} [opts]  guests: the app sent `guests=1` and the host has the switch (H1): guests
 *   without an account are named with their numbers, Maybe and waiting_ok are states, and the list adds the headcount,
 *   the open link and who can be reminded. Without it, the open link's rows are left out and counted in `in`.
 */
async function hostView(plan, rows, { guests = false, chipIn = null } = {}) {
  const userIds = [...new Set(rows.map((r) => r.invitee_user_id).filter(Boolean).map(String))];
  const [people, requests] = await Promise.all([
    names(userIds),
    userIds.length
      ? supabaseAdmin.from('PlanRequest').select('id, user_id, status, party_size, kids_count').eq('post_id', plan.post_id).in('user_id', userIds)
      : { data: [] },
  ]);
  if (requests.error) throw new Error(`Failed to load requests: ${requests.error.message}`);
  const requestByUser = new Map((requests.data || []).map((r) => [String(r.user_id), r]));

  let unopenedLinks = 0;
  let openLinkIn = 0;
  const byKey = new Map();
  const planGuests = require('./planGuests');
  for (const row of rows) {
    const guestRow = planGuests.isGuest(row);
    if (row.channel === 'link' && !row.invitee_user_id && !guestRow) {
      if (row.status === 'pending') unopenedLinks += 1;
      continue;
    }
    const userId = row.invitee_user_id ? String(row.invitee_user_id) : null;
    const request = userId ? requestByUser.get(userId) || null : null;
    // An older app never sees the open link's rows; the ones in are counted in `in` (a person with an account only
    // once their ask is in: one who waits shows in that app's requests).
    if (row.channel === 'open' && !guests) {
      if (userId ? stateOf(row, request) === 'in' : row.status === 'accepted') openLinkIn += 1;
      continue;
    }
    const state = stateOf(row, request, { guests });
    // An email invite names its person only once they've said they're in: until then the host sees the address
    // they typed, and never learns whether it has an account.
    const named = row.channel !== 'email' || (row.status === 'accepted' && ['in', 'waitlisted', 'asked'].includes(state));
    const view = {
      id: row.id,
      channel: row.channel,
      state,
      person: named && userId ? personFor(plan, people.get(userId)) : null,
      // An address invited from an earlier plan's guest (the same people again) never reaches the host: the name does.
      email: row.channel === 'email' && !row.known_name ? row.email : null,
      ...(row.known_name ? { name: row.known_name } : {}),
      email_failed: row.channel === 'email' && ['failed', 'skipped'].includes(row.email_status),
      // The ask waiting for the host's yes (state asked): the ordinary accept or decline.
      request_id: state === 'asked' && request ? request.id : null,
      // DELETE …/invites/:id: take back an invitation nobody said yes to, or (H1) remove a guest without an account.
      can_cancel: row.status === 'pending' || row.status === 'declined' || (guests && (row.status === 'maybe' || guestRow)),
      invited_at: planService.iso(row.created_at),
      answered_at: planService.iso(row.answered_at),
    };
    if (guests) {
      Object.assign(view, planGuests.hostRowParts(row));
      // How the invitation came: 'account', 'email', 'link' or 'open' (the plan's open link, a guest or, 6.9, a person
      // with an account, whose ask waiting for the host's yes is `asked` with its request_id).
      view.via = row.channel;
      // A person with an account who asked: their adults and kids, as a guest's row has them.
      if (userId && request && ['pending', 'waitlisted', 'accepted'].includes(request.status)) {
        view.party = { adults: Number(request.party_size) || 1, kids: plan.kids_welcome ? Number(request.kids_count) || 0 : 0 };
      }
      // A guest from the open link waiting for the host's yes: POST …/invites/:id/ok.
      view.can_ok = state === 'waiting_ok';
    }
    // Chip in (the extras, `extras=1`): whether each person in said they paid, and whom "Mark paid" names.
    if (chipIn && state === 'in') {
      const extras = require('./planExtras');
      const who = userId ? extras.personKey(userId) : extras.guestKey(row.id);
      view.chip_in = { paid: chipIn.has(who), who };
    }
    // One row a person: an account invite and an email the same person opened show once, at the furthest state.
    const key = view.person ? `user:${view.person.user_id}` : `invite:${row.id}`;
    const seen = byKey.get(key);
    if (!seen || STATE_ORDER[view.state] < STATE_ORDER[seen.state]) byKey.set(key, view);
  }
  const invites = [...byKey.values()].sort((a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state])
    || (new Date(b.invited_at) - new Date(a.invited_at)));
  const emailsUsed = rows.filter((r) => r.channel === 'email').length;
  const out = {
    invites,
    unopened_links: unopenedLinks,
    counts: {
      invited: invites.filter((i) => ['invited', 'opened'].includes(i.state)).length + unopenedLinks,
      in: invites.filter((i) => i.state === 'in').length + openLinkIn,
      waitlisted: invites.filter((i) => i.state === 'waitlisted').length,
      cant_make_it: invites.filter((i) => i.state === 'cant_make_it').length,
    },
    emails_left: Math.max(0, LIMITS.emailsPerPlan - emailsUsed),
  };
  if (guests) await addGuestParts(out, plan, rows, requests.data || []);
  return out;
}

/**
 * What `guests=1` adds to the host's list (6.4): counts of maybe, waiting_ok and no_answer, the headcount of people
 * in, the open link, and who a reminder would reach (`remind`: how many, and whether the plan was reminded today).
 */
async function addGuestParts(out, plan, rows, requestRows) {
  const planGuests = require('./planGuests');
  out.counts.maybe = out.invites.filter((i) => i.state === 'maybe').length;
  out.counts.waiting_ok = out.invites.filter((i) => i.state === 'waiting_ok').length;
  out.counts.no_answer = out.counts.invited;
  // Find a date: whoever saved their times has answered (none of these included).
  if (require('./planDates').isPicking(plan)) {
    const extras = require('./planExtras');
    const answered = new Set(Object.keys(plan.date_options.answered || {}));
    const tickedRows = rows.filter((r) => r.status === 'pending'
      && answered.has(r.invitee_user_id ? extras.personKey(r.invitee_user_id) : extras.guestKey(r.id))).length;
    out.counts.no_answer = Math.max(0, out.counts.no_answer - tickedRows);
  }
  const requests = await actions().activeRequests(plan.post_id);
  const guestRowsIn = rows.filter((r) => planGuests.isGuest(r) && ['accepted', 'maybe'].includes(r.status));
  let adults = 0;
  let kids = 0;
  for (const r of requests) {
    if (r.status !== 'accepted') continue;
    adults += Number(r.party_size) || 1;
    kids += plan.kids_welcome ? Number(r.kids_count) || 0 : 0;
  }
  for (const r of guestRowsIn) {
    if (r.status !== 'accepted' || r.needs_host_ok) continue;
    adults += Number(r.guest_adults) || 1;
    kids += Number(r.guest_kids) || 0;
  }
  out.headcount = { adults, kids };
  out.open_link = planGuests.openLinkView(plan);
  const asked = new Set(requestRows.filter((r) => ['pending', 'waitlisted', 'accepted'].includes(r.status)).map((r) => String(r.user_id)));
  const dayAgo = Date.now() - DAY_MS;
  // Find a date: whoever ticked times has answered.
  const extras = require('./planExtras');
  const ticked = require('./planDates').isPicking(plan) ? new Set(Object.keys(plan.date_options.answered || {})) : null;
  const remindable = rows.filter((r) => r.status === 'pending' && !r.reminded_at
    && !(ticked && ticked.has(r.invitee_user_id ? extras.personKey(r.invitee_user_id) : extras.guestKey(r.id)))
    && (r.channel === 'email' || (r.invitee_user_id && !asked.has(String(r.invitee_user_id)))));
  const remindedToday = rows.some((r) => r.reminded_at && new Date(r.reminded_at).getTime() > dayAgo
    && (r.status === 'pending' || (r.answered_at && new Date(r.answered_at) > new Date(r.reminded_at))));
  out.remind = { count: remindable.length, unopened_links: out.unopened_links, reminded_today: remindedToday };
}

/** H1's parts of the host's list: an app that sent `guests=1`, for a host with the switch. */
const guestsOn = (viewer) => Boolean(viewer.guests && viewer.guestAnswersFlag);

async function listForHost(user, postId) {
  const { viewer, plan } = await hostPlan(user, postId);
  const view = await hostView(plan, await loadInvites(postId), { guests: guestsOn(viewer), chipIn: await chipInFor(plan, viewer) });
  return { ...view, can_invite: Boolean(viewer.invitesFlag) && isOpenForAnswers(plan) && hostMayInvite(plan) };
}

/** Who said they paid (chip in, the extras), for an app that sent `extras=1` while the host has the switch; else null. */
async function chipInFor(plan, viewer) {
  if (!viewer.extras || !plan.chip_in || !require('./planExtras').takesExtras(plan)) return null;
  const planChipIn = require('./planChipIn');
  return (await planChipIn.enabledFor(plan.host_user_id)) ? planChipIn.paidSet(plan.chip_in) : null;
}

// ── People the host can invite ───────────────────────────────

/** Connections and people who came to the host's plans: the only accounts a host can invite. */
async function knownPeople(hostId) {
  const [connections, guests] = await Promise.all([
    planService.connectionIdsByUser([hostId]),
    supabaseAdmin.from('PlanRequest')
      .select('user_id, plan:Plan!inner(host_user_id)')
      .eq('plan.host_user_id', hostId)
      .in('status', ['accepted', 'left'])
      .limit(500),
  ]);
  if (guests.error) throw new Error(`Failed to load your guests: ${guests.error.message}`);
  const reasons = new Map();
  for (const id of connections.get(String(hostId)) || []) reasons.set(String(id), 'connection');
  for (const row of guests.data || []) {
    const id = String(row.user_id);
    reasons.set(id, reasons.get(id) === 'connection' ? 'both' : (reasons.get(id) || 'came_before'));
  }
  reasons.delete(String(hostId));
  return reasons;
}

async function peopleToInvite(user, postId, q) {
  const { viewer, plan } = await hostPlan(user, postId);
  if (!viewer.invitesFlag) fail(404, 'not_found', "Invitations aren't available right now.");
  // A business invites the people who came to its plans before; a staff member's own connections aren't its.
  const reasons = await knownPeople(inviterId(plan, viewer));
  for (const id of viewer.blockedUserIds) reasons.delete(String(id));
  const ids = [...reasons.keys()];
  const [people, rows, requests] = await Promise.all([
    names(ids),
    loadInvites(postId),
    ids.length
      ? supabaseAdmin.from('PlanRequest').select('user_id, status').eq('post_id', postId).in('user_id', ids)
      : { data: [] },
  ]);
  if (requests.error) throw new Error(`Failed to load requests: ${requests.error.message}`);
  const invitedIds = new Set(rows.filter((r) => r.invitee_user_id && (r.channel !== 'email' || r.status === 'accepted'))
    .map((r) => String(r.invitee_user_id)));
  const requestByUser = new Map((requests.data || []).map((r) => [String(r.user_id), r.status]));
  const query = typeof q === 'string' ? q.trim().toLowerCase().slice(0, 60) : '';
  const out = [];
  for (const id of ids) {
    const entry = people.get(id);
    if (!entry) continue;
    // A business's team sees first names, so it searches first names: a last name must not be found by trying.
    const matches = plan.business_user_id
      ? actions().firstOf(entry.display_name).toLowerCase().includes(query)
      : entry.search_name.includes(query) || entry.display_name.toLowerCase().includes(query);
    if (query && !matches) continue;
    const requestStatus = requestByUser.get(id);
    let state = null;
    if (requestStatus === 'accepted') state = 'in';
    else if (requestStatus === 'pending' || requestStatus === 'waitlisted') state = 'asked';
    else if (invitedIds.has(id)) state = 'invited';
    out.push({ ...personFor(plan, entry), reason: reasons.get(id), state });
  }
  const reasonOrder = { both: 0, came_before: 1, connection: 2 };
  out.sort((a, b) => ((a.state ? 1 : 0) - (b.state ? 1 : 0))
    || (reasonOrder[a.reason] - reasonOrder[b.reason])
    || a.display_name.localeCompare(b.display_name));
  return { people: out.slice(0, LIMITS.people), plan_id: plan.post_id };
}

/**
 * GET /api/plans/invites/people[?q=]: the people this person can invite, before the plan exists (a private plan's
 * preview picks its first guests). The same people, names and order as peopleToInvite, without a plan's state.
 */
async function peopleBeforePosting(user, q) {
  const viewer = await loadViewer(user);
  if (!viewer.invitesFlag) fail(404, 'not_found', "Invitations aren't available right now.");
  const reasons = await knownPeople(viewer.id);
  for (const id of viewer.blockedUserIds) reasons.delete(String(id));
  const people = await names([...reasons.keys()]);
  const query = typeof q === 'string' ? q.trim().toLowerCase().slice(0, 60) : '';
  const out = [];
  for (const [id, reason] of reasons) {
    const entry = people.get(id);
    if (!entry) continue;
    if (query && !entry.search_name.includes(query) && !entry.display_name.toLowerCase().includes(query)) continue;
    out.push({ ...person(entry), reason });
  }
  const reasonOrder = { both: 0, came_before: 1, connection: 2 };
  out.sort((a, b) => (reasonOrder[a.reason] - reasonOrder[b.reason]) || a.display_name.localeCompare(b.display_name));
  return { people: out.slice(0, LIMITS.people) };
}

// ── Sending ──────────────────────────────────────────────────

/**
 * "Sunday, November 1 at 1:25 PM" (a playdate: "Saturday morning, November 7"). Emails and texts are read later, so
 * they never say "today" or "tomorrow".
 */
function dateText(plan) {
  const tz = rules.timezoneForPlan(plan);
  const start = new Date(plan.post.event_date);
  if (Number.isNaN(start.getTime())) return '';
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(start);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long', day: 'numeric' }).format(start);
  if (plan.kind === 'playdate') return `${weekday} ${rules.dayPart(plan.post.event_date, tz) || ''}, ${date}`.replace(' ,', ',');
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(start);
  return `${weekday}, ${date} at ${time}`;
}

/**
 * The invitation email's words. While the host picks a date (08-extras section 2) they name no date: "Picking a date"
 * where the date shows, and the sentence ends "Tick the times that work for you." (`picking`).
 */
async function emailWords(plan, hostFirst) {
  const hideTime = plan.kind === 'playdate';
  const planDates = require('./planDates');
  const picking = await planDates.invitesWhilePicking(plan);
  const when = picking ? planDates.PICKING_TEXT : dateText(plan);
  const area = planNotify.areaPhrase(plan);
  // "Near Prune Hill, Camas", but "In Camas" when the area is the city.
  const city = plan.city && !String(area || '').toLowerCase().endsWith(plan.city.toLowerCase()) ? plan.city : null;
  return {
    hostFirst,
    noun: planNotify.noun(plan),
    icon: planNotify.ICON_BY_KIND[plan.kind] || '📅',
    playdate: hideTime,
    // A playdate's title stays in the app, as on its share page.
    title: hideTime ? null : plan.post.title,
    when,
    ...(picking ? { picking: true, ask: planDates.PICKING_ASK } : {}),
    // An online plan's email says "Online", never the link (it is in the app, for the people in).
    where: plan.place_kind === 'online' ? 'Online'
      : [area ? area[0].toUpperCase() + area.slice(1) : null, city].filter(Boolean).join(', '),
  };
}

async function sendInviteEmail(plan, row, token, hostFirst) {
  const { sendPlanInviteEmail } = require('../emailService');
  let emailStatus = 'sent';
  try {
    const sent = await sendPlanInviteEmail({
      toEmail: row.email,
      words: await emailWords(plan, hostFirst),
      link: inviteUrl(plan.post_id, token),
      unsubscribeLink: unsubscribeUrl(token),
      oneClickUnsubscribeLink: oneClickUnsubscribeUrl(token),
    });
    if (!sent?.success) emailStatus = 'failed';
  } catch (err) {
    logger.warn('plans.invites.email_failed', { inviteId: row.id, error: err.message });
    emailStatus = 'failed';
  }
  const { error } = await supabaseAdmin.from('PlanInvite').update({ email_status: emailStatus, updated_at: nowIso() }).eq('id', row.id);
  if (error) logger.warn('plans.invites.email_status_unsaved', { inviteId: row.id, error: error.message });
}

/**
 * Why this address gets no email now: 'opted_out' after "don't send me invitations", 'too_many' after a few today
 * (from every host together), else null.
 */
async function emailHeld(email) {
  const dayAgo = new Date(Date.now() - DAY_MS);
  const [optedOut, today, later] = await Promise.all([
    supabaseAdmin.from('PlanInvite').select('id', { count: 'exact', head: true })
      .eq('email', email).not('email_opted_out_at', 'is', null),
    supabaseAdmin.from('PlanInvite').select('id', { count: 'exact', head: true })
      .eq('email', email).eq('email_status', 'sent').gt('created_at', dayAgo.toISOString()),
    // Every email after an invitation's first (a guest's emails, Remind's invitation again), by its own time.
    supabaseAdmin.from('PlanInvite').select('email_sent_times').eq('email', email).neq('email_sent_times', '{}').limit(200),
  ]);
  const failed = optedOut.error || today.error || later.error;
  if (failed) throw new Error(`Failed to check the address: ${failed.message}`);
  if (optedOut.count) return 'opted_out';
  const laterToday = (later.data || [])
    .reduce((sum, row) => sum + (row.email_sent_times || []).filter((t) => new Date(t) > dayAgo).length, 0);
  return (today.count || 0) + laterToday >= LIMITS.emailsPerAddressPerDay ? 'too_many' : null;
}

/** Did this address say "don't send me invitations" (on any invitation, from any host)? */
async function addressOptedOut(email) {
  const { count, error } = await supabaseAdmin.from('PlanInvite').select('id', { count: 'exact', head: true })
    .eq('email', email).not('email_opted_out_at', 'is', null);
  if (error) throw new Error(`Failed to check the address: ${error.message}`);
  return Boolean(count);
}

/** An email after the invitation's first went to this row's address: its time joins the row's (at most 20). */
function withEmailSent(row) {
  return [...(row?.email_sent_times || []), nowIso()].slice(-20);
}

/** A member whose verified address is `email`, or null. */
async function memberWithEmail(email) {
  const escaped = email.replace(/([\\%_])/g, '\\$1');
  const { data, error } = await supabaseAdmin.from('User').select('id, email').ilike('email', escaped).limit(2);
  if (error || !data || data.length !== 1) return null;
  const id = String(data[0].id);
  return (await hasVerifiedEmail({ id, email: data[0].email, emailConfirmed: null }, email)) ? id : null;
}

/**
 * One email invitation: the email (unless the address opted out or had enough today), and, when the address is a
 * member's verified email, the invitation becomes theirs with a notice. A member who blocked the host (or whom the
 * host blocked), muted them or hid the plan gets neither; the host sees "didn't send", as for an opted-out address.
 */
async function deliverEmailInvite(plan, viewer, row, token, hostFirst) {
  const found = await memberWithEmail(row.email);
  const memberId = found && found !== viewer.id ? found : null;
  const hears = !memberId || (await reachable(plan, viewer, [memberId])).has(memberId);
  const held = hears ? await emailHeld(row.email) : 'unreachable';
  if (held) {
    // An opt-out rides along on every later invitation to the address, so it outlives older plans.
    const patch = { email_status: 'skipped', updated_at: nowIso(), ...(held === 'opted_out' ? { email_opted_out_at: nowIso() } : {}) };
    const { error } = await supabaseAdmin.from('PlanInvite').update(patch).eq('id', row.id);
    if (error) logger.warn('plans.invites.email_status_unsaved', { inviteId: row.id, error: error.message });
  } else {
    await sendInviteEmail(plan, row, token, hostFirst);
  }
  if (!memberId || !hears) return;
  const { data: claimed } = await supabaseAdmin.from('PlanInvite')
    .update({ invitee_user_id: memberId, claimed_at: nowIso(), updated_at: nowIso() })
    .eq('id', row.id).is('invitee_user_id', null).select(INVITE_COLUMNS);
  // The address got its email either way. The notice in the app is only for someone the plan exists for.
  if (claimed && claimed.length && (await require('./planBusiness').peopleShown(plan, [memberId])).has(memberId)) {
    await planNotify.invited({ plan, invite: claimed[0], userId: memberId, hostFirst });
  }
}

/**
 * Remind (H1): the invitation email again to an address that hasn't answered, with the same words. The server keeps
 * no token, so the email carries a new one, which replaces the old once the email went. Answers whether it went.
 */
async function resendInviteEmail(plan, row, hostFirst) {
  if (await emailHeld(row.email)) return false;
  const token = newToken();
  const { sendPlanInviteEmail } = require('../emailService');
  try {
    const sent = await sendPlanInviteEmail({
      toEmail: row.email,
      words: await emailWords(plan, hostFirst),
      link: inviteUrl(plan.post_id, token),
      unsubscribeLink: unsubscribeUrl(token),
      oneClickUnsubscribeLink: oneClickUnsubscribeUrl(token),
    });
    if (!sent?.success) return false;
  } catch (err) {
    logger.warn('plans.invites.remind_email_failed', { inviteId: row.id, error: err.message });
    return false;
  }
  const { error } = await supabaseAdmin.from('PlanInvite')
    .update({ token_hash: hashToken(token), email_status: 'sent', email_sent_times: withEmailSent(row), updated_at: nowIso() })
    .eq('id', row.id);
  if (error) logger.warn('plans.invites.remind_unsaved', { inviteId: row.id, error: error.message });
  return true;
}

/** Account invitees who'd hear about it: not blocked either way, not muting the host, not hiding the plan. */
async function reachable(plan, viewer, userIds) {
  const out = new Set();
  for (const id of userIds) {
    if (viewer.blockedUserIds.has(String(id))) continue;
    try {
      const filters = await getMuteAndHideFilters(String(id));
      if (filters.blockedUserIds?.has(String(plan.host_user_id))) continue;
      if (filters.mutedUserIds?.has(String(plan.host_user_id))) continue;
      if (filters.hiddenPostIds?.has(plan.post_id)) continue;
      out.add(String(id));
    } catch (err) {
      logger.warn('plans.invites.filters_unavailable', { userId: id, error: err.message });
    }
  }
  return out;
}

/**
 * POST /api/plans/:id/invites { user_ids?, emails?, confirm_shares_address? }: invite people the host knows and
 * people by email. Answers the host's list and a result for each person or address.
 */
async function createInvites(user, postId, body = {}) {
  const { viewer, plan } = await hostPlan(user, postId);
  assertInvitable(plan, viewer);

  const rawIds = Array.isArray(body.user_ids) ? body.user_ids : [];
  const rawEmails = Array.isArray(body.emails) ? body.emails : [];
  if (rawIds.length > LIMITS.accountsPerCall || rawEmails.length > LIMITS.emailsPerCall) {
    fail(422, 'validation', 'Invite up to 20 addresses and 30 people at a time.');
  }
  const userIds = [...new Set(rawIds.filter(planService.isUuid).map((id) => id.toLowerCase()))];
  const emails = [];
  const invalid = [];
  for (const raw of rawEmails) {
    const email = normalizeEmail(raw);
    if (!email) invalid.push(String(raw || '').slice(0, 80));
    else if (!emails.includes(email)) emails.push(email);
  }
  if (invalid.length > 0) fail(422, 'invalid_email', `Check this email address: ${invalid[0]}`, { invalid_emails: invalid });
  if (userIds.length === 0 && emails.length === 0) fail(422, 'validation', 'Choose someone to invite.');
  await assertSharesAddressConfirmed(plan, body);
  return inviteAll(user, viewer, plan, { userIds, emails });
}

/**
 * Invite these accounts and addresses to the host's plan, with every limit of invitations (the plan's invitations and
 * emails, the host's emails a day, an address's five a day and its "don't send me invitations", blocks), and answer
 * the host's list with a result for each. `knownNames` (the same people again, 08-extras section 6): an address the
 * host knows only by a guest's name on an earlier plan. Its row keeps that name, and the host's list shows the name,
 * never the address.
 */
async function inviteAll(user, viewer, plan, { userIds, emails, knownNames = null }) {
  const postId = plan.post_id;
  const existing = await loadInvites(postId);
  const newEmails = emails.filter((e) => !existing.some((r) => r.email === e));
  // Someone who opened the plan's open link in the app (6.9) is invited already.
  const newAccounts = userIds.filter((id) => !existing.some((r) => ['account', 'open'].includes(r.channel) && String(r.invitee_user_id) === id));
  if (existing.length + newEmails.length + newAccounts.length > invitesLimit(plan)) {
    fail(429, 'too_many_invites', `A plan can have up to ${invitesLimit(plan)} invitations.`);
  }
  const emailsUsed = existing.filter((r) => r.channel === 'email').length;
  if (emailsUsed + newEmails.length > LIMITS.emailsPerPlan) {
    fail(429, 'too_many_invites', `You can invite ${LIMITS.emailsPerPlan} people by email to a plan. ${Math.max(0, LIMITS.emailsPerPlan - emailsUsed)} left.`,
      { emails_left: Math.max(0, LIMITS.emailsPerPlan - emailsUsed) });
  }
  if (newEmails.length > 0) {
    const { count, error } = await supabaseAdmin.from('PlanInvite').select('id', { count: 'exact', head: true })
      .eq('host_user_id', inviterId(plan, viewer)).eq('channel', 'email').gt('created_at', new Date(Date.now() - DAY_MS).toISOString());
    if (error) throw new Error(`Failed to count invitations: ${error.message}`);
    if ((count || 0) + newEmails.length > LIMITS.emailsPerHostPerDay) {
      fail(429, 'too_many_invites', `You can invite ${LIMITS.emailsPerHostPerDay} people by email a day. Try again tomorrow.`);
    }
  }

  const results = [];
  const hostEmail = normalizeEmail(user.email);
  const known = newAccounts.length ? await knownPeople(inviterId(plan, viewer)) : new Map();
  const shown = await require('./planBusiness').peopleShown(plan, newAccounts);
  const { data: requestRows, error: requestError } = await supabaseAdmin.from('PlanRequest')
    .select('user_id, status').eq('post_id', postId);
  if (requestError) throw new Error(`Failed to load requests: ${requestError.message}`);
  const inPlan = new Set((requestRows || []).filter((r) => r.status === 'accepted').map((r) => String(r.user_id)));

  // People on Pantopus.
  const invitedAccounts = [];
  for (const id of userIds) {
    if (id === viewer.id) { results.push({ user_id: id, outcome: 'host' }); continue; }
    if (!newAccounts.includes(id)) { results.push({ user_id: id, outcome: 'already_invited' }); continue; }
    if (inPlan.has(id)) { results.push({ user_id: id, outcome: 'already_in' }); continue; }
    // For a business's plan, only someone the plan exists for (their own switch) can be invited by account.
    if (!known.has(id) || viewer.blockedUserIds.has(id) || !shown.has(id)) { results.push({ user_id: id, outcome: 'unavailable' }); continue; }
    const { data, error } = await supabaseAdmin.from('PlanInvite')
      .insert({ post_id: postId, host_user_id: inviterId(plan, viewer), channel: 'account', invitee_user_id: id })
      .select(INVITE_COLUMNS).single();
    if (error) {
      if (error.code === '23505') { results.push({ user_id: id, outcome: 'already_invited' }); continue; }
      throw new Error(`Failed to save the invitation: ${error.message}`);
    }
    invitedAccounts.push(data);
    results.push({ user_id: id, outcome: 'invited' });
    recordFunnelEvent('plan_invited', { userId: viewer.id, meta: { plan_id: postId, kind: plan.kind, channel: 'account' } });
  }

  // People by email.
  const hostFirst = await actions().hostFirstOf(plan);
  const emailed = [];
  for (const email of emails) {
    if (email === hostEmail) { results.push({ email, outcome: 'host' }); continue; }
    if (!newEmails.includes(email)) { results.push({ email, outcome: 'already_invited' }); continue; }
    const token = newToken();
    const knownName = knownNames ? knownNames.get(email) || null : null;
    const { data, error } = await supabaseAdmin.from('PlanInvite')
      .insert({
        post_id: postId, host_user_id: inviterId(plan, viewer), channel: 'email', email, token_hash: hashToken(token),
        ...(knownName ? { known_name: knownName } : {}),
      })
      .select(INVITE_COLUMNS).single();
    if (error) {
      if (error.code === '23505') { results.push({ email, outcome: 'already_invited' }); continue; }
      throw new Error(`Failed to save the invitation: ${error.message}`);
    }
    emailed.push({ row: data, token });
    results.push({ email, outcome: 'invited' });
    recordFunnelEvent('plan_invited', { userId: viewer.id, meta: { plan_id: postId, kind: plan.kind, channel: 'email' } });
  }

  // Tell them: pushes and notices for accounts, an email for each address (in the background: the host's answer
  // shouldn't wait on the mail server), and a notice too for a member whose verified address it is.
  const hear = await reachable(plan, viewer, invitedAccounts.map((r) => r.invitee_user_id));
  for (const row of invitedAccounts) {
    if (hear.has(String(row.invitee_user_id))) {
      await planNotify.invited({ plan, invite: row, userId: row.invitee_user_id, hostFirst });
    }
  }
  if (emailed.length > 0) {
    (async () => {
      for (const { row, token } of emailed) {
        try {
          await deliverEmailInvite(plan, viewer, row, token, hostFirst);
        } catch (err) {
          logger.warn('plans.invites.email_step_failed', { inviteId: row.id, error: err.message });
        }
      }
    })();
  }

  const view = await hostView(plan, await loadInvites(postId), { guests: guestsOn(viewer) });
  return { ...view, can_invite: true, results };
}

/**
 * POST /api/plans/:id/invites/link { confirm_shares_address? }: a one-person link the host sends from their phone
 * ("Text an invite"). Answers the link and the words to send with it, in the host's voice.
 */
async function createLinkInvite(user, postId, body = {}) {
  const viewer = await loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const found = await planService.loadPlanRow(postId);
  if (!found || !planService.isVisibleTo(found, viewer, { involved: await planService.isInvolved(found, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  // A guest on a private plan whose host allowed it brings one friend; everything else is the host's.
  if (!require('./planBusiness').runsPlan(found, viewer)) return createFriendLink(viewer, found);
  const plan = found;
  assertInvitable(plan, viewer);
  await assertSharesAddressConfirmed(plan, body);
  const existing = await loadInvites(postId);
  if (existing.length >= invitesLimit(plan)) fail(429, 'too_many_invites', `A plan can have up to ${invitesLimit(plan)} invitations.`);
  const openLinks = existing.filter((r) => r.channel === 'link' && !r.invitee_user_id && r.status === 'pending').length;
  if (openLinks >= LIMITS.openLinksPerPlan) {
    fail(429, 'too_many_invites', 'Lots of your text invites haven’t been opened yet. Try again once some have.');
  }
  const token = newToken();
  const { data, error } = await supabaseAdmin.from('PlanInvite')
    .insert({ post_id: postId, host_user_id: inviterId(plan, viewer), channel: 'link', token_hash: hashToken(token) })
    .select('id').single();
  if (error) throw new Error(`Failed to make the invitation: ${error.message}`);
  recordFunnelEvent('plan_invited', { userId: viewer.id, meta: { plan_id: postId, kind: plan.kind, channel: 'link' } });
  return {
    invite_id: data.id,
    url: inviteUrl(postId, token),
    message: inviteMessage(plan, plan.business_user_id ? 'our' : 'my', { picking: await require('./planDates').invitesWhilePicking(plan) }),
  };
}

/**
 * The words a host sends with a link, from their own phone, so in their voice: "Want to come to my dinner on …?"
 * While the host picks a date (08-extras section 2) they name none: "Want to come to my dinner? “…”. Tick the times
 * that work for you:".
 */
function inviteMessage(plan, whose = 'my', { picking = false } = {}) {
  const ask = planNotify.noun(plan) === 'coffee' ? 'Want to get coffee' : `Want to come to ${whose} ${planNotify.noun(plan)}`;
  if (picking) return `${ask}? “${plan.post.title}”. Tick the times that work for you:`;
  return `${ask} on ${dateText(plan)}? “${plan.post.title}”. Tap to say you’re in:`;
}

/**
 * "Bring a friend" on a private plan (Plan.guests_can_invite): a guest the host invited, who is in, makes one
 * one-person link. The friend who opens it is in as the host's own guests are; they can't bring anyone in turn
 * (their invitation isn't the host's). The host sees the link and the friend in their list, and can take it back.
 */
async function createFriendLink(viewer, plan) {
  const notYours = () => fail(403, 'not_host', 'Only the host can do that.');
  if (!rules.isPrivate(plan) || !plan.guests_can_invite) notYours();
  const [{ data: mine, error }, myInvites] = await Promise.all([
    supabaseAdmin.from('PlanRequest').select('status').eq('post_id', plan.post_id).eq('user_id', viewer.id).maybeSingle(),
    viewerInvites(viewer.id, [plan.post_id]),
  ]);
  if (error) throw new Error(`Failed to load your request: ${error.message}`);
  const invite = myInvites.get(plan.post_id);
  if (!mine || mine.status !== 'accepted' || !invite || String(invite.host_user_id) !== String(plan.host_user_id)) notYours();
  assertInvitable(plan, viewer);
  if ((await friendLinkPlanIds(viewer.id, [plan.post_id])).has(plan.post_id)) {
    fail(409, 'friend_invite_used', 'You’ve already invited a friend to this plan.');
  }
  const existing = await loadInvites(plan.post_id);
  if (existing.length >= invitesLimit(plan)) fail(429, 'too_many_invites', `A plan can have up to ${invitesLimit(plan)} invitations.`);
  const token = newToken();
  const { data, error: insertError } = await supabaseAdmin.from('PlanInvite')
    .insert({ post_id: plan.post_id, host_user_id: viewer.id, channel: 'link', token_hash: hashToken(token) })
    .select('id').single();
  if (insertError) throw new Error(`Failed to make the invitation: ${insertError.message}`);
  recordFunnelEvent('plan_invited', { userId: viewer.id, meta: { plan_id: plan.post_id, kind: plan.kind, channel: 'link', by: 'guest' } });
  const hostFirst = await actions().hostFirstOf(plan);
  const noun = planNotify.noun(plan);
  const ask = noun === 'coffee' ? `Want to get coffee with ${hostFirst} and me` : `Want to come to ${hostFirst}’s ${noun} with me`;
  return {
    invite_id: data.id,
    url: inviteUrl(plan.post_id, token),
    message: `${ask} on ${dateText(plan)}? “${plan.post.title}”. Tap to say you’re in:`,
  };
}

/** Of these plans, the ones where this person, as a guest, already made their "Bring a friend" link. */
async function friendLinkPlanIds(userId, postIds) {
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (!userId || ids.length === 0) return new Set();
  const { data, error } = await supabaseAdmin.from('PlanInvite').select('post_id')
    .in('post_id', ids).eq('host_user_id', userId).eq('channel', 'link').neq('status', 'cancelled');
  if (error) {
    logger.warn('plans.invites.friend_links_unavailable', { error: error.message });
    // Unknown counts as used: the card never offers a second link by mistake, and the route checks again.
    return new Set(ids);
  }
  return new Set((data || []).map((row) => row.post_id));
}

/** DELETE /api/plans/:id/invites/:inviteId: take back an invitation nobody has said yes to. */
async function cancelInvite(user, postId, inviteId) {
  const { viewer, plan } = await hostPlan(user, postId);
  if (!planService.isUuid(inviteId)) fail(404, 'not_found', "That invitation isn't here.");
  const { data: row, error } = await supabaseAdmin.from('PlanInvite').select(INVITE_COLUMNS)
    .eq('id', inviteId).eq('post_id', postId).maybeSingle();
  if (error) throw new Error(`Failed to load the invitation: ${error.message}`);
  if (!row || row.status === 'cancelled') fail(404, 'not_found', "That invitation isn't here.");
  const waitingAsk = row.channel === 'open' && row.invitee_user_id && row.status === 'accepted'
    ? (await supabaseAdmin.from('PlanRequest').select('id').eq('post_id', postId).eq('user_id', row.invitee_user_id)
      .in('status', ['pending', 'waitlisted']).maybeSingle()).data
    : null;
  if (require('./planGuests').isGuest(row)) {
    // A guest without an account (H1): removed whatever they answered; their key stops showing anything.
    await require('./planGuests').removeGuest(plan, row);
  } else if (waitingAsk) {
    // A person from the open link whose ask waits for the host's yes (6.9; a guest who took a waiting answer into the
    // app keeps the notice that named their row): "Not this time" is the ordinary decline of the ask.
    await actions().decide(user, postId, waitingAsk.id, 'decline');
  } else {
    if (row.status === 'accepted') fail(409, 'already_in', 'They said they’re in. To take them out, remove them from the people going.');
    const { error: updateError } = await supabaseAdmin.from('PlanInvite')
      .update({ status: 'cancelled', updated_at: nowIso() }).eq('id', row.id).in('status', ['pending', 'declined', 'maybe']);
    if (updateError) throw new Error(`Failed to cancel the invitation: ${updateError.message}`);
  }
  return {
    ...(await hostView(plan, await loadInvites(postId), { guests: guestsOn(viewer) })),
    can_invite: isOpenForAnswers(plan) && hostMayInvite(plan),
  };
}

// ── The person invited ───────────────────────────────────────

/** The viewer's open invitations on these plans, the best one a plan (one that needs no host yes, then answered). */
async function viewerInvites(viewerId, postIds) {
  const out = new Map();
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (!viewerId || ids.length === 0) return out;
  const { data, error } = await supabaseAdmin.from('PlanInvite').select(INVITE_COLUMNS)
    .in('post_id', ids).eq('invitee_user_id', viewerId).in('status', OPEN_STATUSES);
  if (error) {
    logger.warn('plans.invites.viewer_unavailable', { error: error.message });
    return out;
  }
  const rank = (r) => (r.needs_host_ok ? 10 : 0) + ({ accepted: 0, pending: 1, maybe: 1.5, declined: 2 }[r.status] ?? 3);
  for (const found of data || []) {
    // From the open link (6.9), someone the host let in by hand once doesn't wait for the yes again, as a guest
    // doesn't (planGuests.answer).
    const row = found.channel === 'open' && found.host_ok_at ? { ...found, needs_host_ok: false } : found;
    const seen = out.get(row.post_id);
    if (!seen || rank(row) < rank(seen)) out.set(row.post_id, row);
  }
  return out;
}

/**
 * For hosted plans: how many people are waiting, said yes, and can't make it (the plan screen's Invite row). One
 * count a person, as the host's list shows them (hostView): an account invite and a text link the same person opened
 * count once, at the furthest answer; an email invitation names its person only once they've said yes.
 */
async function hostInviteCounts(postIds) {
  const out = new Map();
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (ids.length === 0) return out;
  const { data, error } = await supabaseAdmin.from('PlanInvite').select('id, post_id, status, channel, invitee_user_id')
    .in('post_id', ids).neq('status', 'cancelled');
  if (error) {
    logger.warn('plans.invites.counts_unavailable', { error: error.message });
    return out;
  }
  const rank = { accepted: 0, pending: 1, maybe: 1.5, declined: 2 };
  const byPlan = new Map();
  for (const row of data || []) {
    const named = row.invitee_user_id && (row.channel !== 'email' || row.status === 'accepted');
    const key = named ? `user:${row.invitee_user_id}` : `invite:${row.id}`;
    const people = byPlan.get(row.post_id) || new Map();
    const seen = people.get(key);
    if (!seen || rank[row.status] < rank[seen]) people.set(key, row.status);
    byPlan.set(row.post_id, people);
  }
  for (const [postId, people] of byPlan) {
    // maybe (H1); maybe_accounts: the people on Pantopus who said maybe (a guest's maybe counts its own people).
    const counts = { pending: 0, accepted: 0, declined: 0, maybe: 0, maybe_accounts: 0 };
    for (const [key, status] of people) {
      counts[status] += 1;
      if (status === 'maybe' && key.startsWith('user:')) counts.maybe_accounts += 1;
    }
    out.set(postId, counts);
  }
  return out;
}

/**
 * The card's my_invite: what the app shows the person invited.
 * @param {{ maybe?: boolean, via?: boolean }} [opts]  maybe: the app sent `guests=1`; via: that, while the host has
 *   the switch (H1): `via` says how the invitation came, 'open' for the plan's open link (6.9), so the app can say why
 *   the host says yes first.
 */
function myInviteView(row, { maybe = false, via = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    // Maybe (H1) reads as pending for an app that didn't send `guests=1`.
    status: row.status === 'maybe' && !maybe ? 'pending' : row.status,
    channel: row.channel,
    needs_host_ok: Boolean(row.needs_host_ok),
    invited_at: planService.iso(row.created_at),
    ...(via ? { via: row.channel } : {}),
  };
}

/**
 * Email invites waiting for this person's verified address become theirs (no link needed): someone invited by email
 * who installs the app and signs up with that address finds the plan. A plan answered in a browser with that address
 * (H1) becomes theirs with the answer (6.9 item 8), where its host has the switch. Answers how many it took.
 * @param {{ postId?: string|null }} [opts]  only this plan's
 */
async function attachEmailInvites(user, { postId = null } = {}) {
  const email = normalizeEmail(user?.email);
  if (!email) return 0;
  try {
    // Not opened yet, or opened by an account the address isn't verified for (a forwarded email): it's this
    // person's invitation, so it becomes theirs. Answered in a browser: no account yet.
    let query = supabaseAdmin.from('PlanInvite').select(INVITE_COLUMNS)
      .eq('email', email).neq('status', 'cancelled')
      .or(`invitee_user_id.is.null,needs_host_ok.eq.true`);
    if (postId) query = query.eq('post_id', postId);
    const { data, error } = await query.limit(20);
    if (error || !data || data.length === 0) return 0;
    const others = data.filter((row) => String(row.host_user_id) !== String(user.id)
      && String(row.invitee_user_id || '') !== String(user.id));
    const mine = others.filter((row) => (row.invitee_user_id ? row.channel === 'email' : row.status === 'pending' && !row.guest_name));
    const answered = others.filter((row) => !row.invitee_user_id && row.guest_name && ['accepted', 'maybe', 'declined'].includes(row.status));
    if (mine.length === 0 && answered.length === 0) return 0;
    const blockService = require('../blockService');
    const minePostIds = [...new Set(mine.map((r) => r.post_id))];
    const [verified, blocked, planRowsResult] = await Promise.all([
      hasVerifiedEmail(user, email),
      blockService.blockedUserIds(user.id),
      minePostIds.length > 0
        ? supabaseAdmin.from('Plan').select('post_id, business_user_id').in('post_id', minePostIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (!verified) return 0;
    if (planRowsResult.error) throw planRowsResult.error;
    const businessByPost = new Map((planRowsResult.data || []).map((p) => [String(p.post_id), p.business_user_id]));
    let taken = 0;
    for (const row of mine) {
      const businessUserId = businessByPost.get(String(row.post_id)) || null;
      if (await takeInvite(row, user.id, { blocked, businessUserId })) taken += 1;
    }
    if (answered.length > 0) taken += await require('./planGuests').adoptAnswers(answered, user.id, { blocked });
    return taken;
  } catch (err) {
    logger.warn('plans.invites.attach_failed', { userId: user?.id, error: err.message });
    return 0;
  }
}

/**
 * The invited address's verified owner takes an email invitation: from nobody, or from an account that opened a
 * forwarded copy (which keeps only an ordinary ask the host answers). Their own answer starts fresh.
 */
async function takeInvite(row, userId, { blocked = null, businessUserId = null } = {}) {
  const blockService = require('../blockService');
  const isHostBlocked = blocked
    ? blocked.has(String(row.host_user_id)) || (businessUserId && blocked.has(String(businessUserId)))
    : (await blockService.isBlocked(row.host_user_id, userId))
      || (businessUserId ? await blockService.isBlocked(businessUserId, userId) : false);
  if (isHostBlocked) return false;
  const patch = { invitee_user_id: userId, needs_host_ok: false, claimed_at: nowIso(), updated_at: nowIso() };
  let query = supabaseAdmin.from('PlanInvite');
  if (row.invitee_user_id) {
    query = query.update({ ...patch, status: 'pending', opened_at: null, answered_at: null })
      .eq('id', row.id).eq('invitee_user_id', row.invitee_user_id).eq('needs_host_ok', true);
  } else {
    query = query.update(patch).eq('id', row.id).is('invitee_user_id', null);
  }
  const { data, error } = await query.select('id');
  if (error) {
    logger.warn('plans.invites.take_failed', { inviteId: row.id, error: error.message });
    return false;
  }
  return Boolean(data && data.length);
}

/**
 * POST /api/plans/:id/invites/claim { token }: the person opened an email or text invite. It becomes theirs (the
 * first account to open it); an email invite opened by an account the address isn't verified for waits for the
 * host's yes. Answers the plan as they now see it.
 */
async function claimInvite(user, postId, token, { open = null } = {}) {
  // The plan's open link (6.9), from an app that knows it.
  if (!isToken(token) && open != null) return claimOpenLink(user, postId, open);
  if (!isToken(token)) fail(404, 'invite_unavailable', 'This invitation isn’t available anymore.');
  const viewer = await loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  const { data: row, error } = await supabaseAdmin.from('PlanInvite').select(INVITE_COLUMNS)
    .eq('token_hash', hashToken(token)).eq('post_id', postId).maybeSingle();
  if (error) throw new Error(`Failed to load the invitation: ${error.message}`);
  const live = Boolean(row && row.status !== 'cancelled');
  // (A guest's answer on the row is handled below, once the plan is known to be theirs to read.)
  // A private plan exists for whoever holds a live invitation to it, and for nobody else who has its link.
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: rules.isPrivate(plan) && live })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (!live) fail(404, 'invite_unavailable', 'This invitation isn’t available anymore.');
  if (require('./planBusiness').runsPlan(plan, viewer)) return { plan: await planBody(postId, viewer) };
  // Answered in a browser without an account (H1): the address's verified owner takes it into the app with the answer
  // (6.9 item 8: the answer, the numbers, the host's yes and the bring-list claims); anyone else finds it used.
  if (!row.invitee_user_id && row.guest_name) {
    const planGuests = require('./planGuests');
    const guestAnswers = await planGuests.switchFor(plan.host_user_id);
    const owner = (row.channel === 'email' || (guestAnswers && row.channel === 'link'))
      && Boolean(row.email) && (await hasVerifiedEmail(user, row.email));
    if (!owner) {
      fail(409, 'invite_used', rules.isPrivate(plan)
        ? 'Someone else already used this invitation. Ask the host for a new one.'
        : 'Someone else already used this invitation. You can still ask to join.');
    }
    if (guestAnswers) {
      await planGuests.adoptAnswers([row], viewer.id, { io: null });
      const body = await planBody(postId, viewer);
      // Their own answer in the app, or the host's no, stays; someone the plan isn't there for finds the link gone.
      if (!body) fail(404, 'invite_unavailable', 'This invitation isn’t available anymore.');
      return { plan: body };
    }
    const { data: taken, error: takeError } = await supabaseAdmin.from('PlanInvite').update({
      invitee_user_id: viewer.id, needs_host_ok: false, status: 'pending', guest_name: null, guest_adults: null,
      guest_kids: null, guest_key_hashes: [], claimed_at: nowIso(), opened_at: nowIso(), answered_at: null, updated_at: nowIso(),
    }).eq('id', row.id).is('invitee_user_id', null).select('id');
    if (takeError) throw new Error(`Failed to open the invitation: ${takeError.message}`);
    if (taken && taken.length && row.status === 'accepted') {
      const fresh = await planService.loadPlanRow(postId);
      if (fresh) await actions().offerOpenSpots(fresh).catch(() => {});
    }
    return { plan: await planBody(postId, viewer) };
  }
  if (row.invitee_user_id && String(row.invitee_user_id) !== viewer.id) {
    // The address's verified owner takes their invitation back from whoever opened a forwarded copy.
    const owner = row.channel === 'email' && row.needs_host_ok && (await hasVerifiedEmail(user, row.email));
    if (!owner || !(await takeInvite(row, viewer.id))) {
      fail(409, 'invite_used', rules.isPrivate(plan)
        ? 'Someone else already used this invitation. Ask the host for a new one.'
        : 'Someone else already used this invitation. You can still ask to join.');
    }
    await supabaseAdmin.from('PlanInvite').update({ opened_at: nowIso(), updated_at: nowIso() }).eq('id', row.id);
    return { plan: await planBody(postId, viewer) };
  }
  if (!row.invitee_user_id) {
    const needsHostOk = row.channel === 'email' && !(await hasVerifiedEmail(user, row.email));
    const { error: claimError } = await supabaseAdmin.from('PlanInvite')
      .update({ invitee_user_id: viewer.id, needs_host_ok: needsHostOk, claimed_at: nowIso(), opened_at: nowIso(), updated_at: nowIso() })
      .eq('id', row.id).is('invitee_user_id', null);
    if (claimError) throw new Error(`Failed to open the invitation: ${claimError.message}`);
  } else if (!row.opened_at) {
    await supabaseAdmin.from('PlanInvite').update({ opened_at: nowIso(), updated_at: nowIso() }).eq('id', row.id);
  }
  return { plan: await planBody(postId, viewer) };
}

async function planBody(postId, viewer) {
  const { body } = await planService.getForViewer(postId, viewer);
  return body;
}

/**
 * POST /api/plans/:id/invites/claim { open } (contract 6.9): a person who has the app opened the plan's open link.
 * Only while the host has `plans_guest_answers` and the plan's live open link has this token; otherwise, and for
 * everyone the link can't invite, `404 invite_unavailable`, the answer an unknown link gets today.
 *  - The host, and someone already invited (any way, "can't make it" included) or asking: nothing is made.
 *  - Someone the host said no to or removed on this plan, someone on either side of a block with the host (or who
 *    muted the host or hid the plan), a plan that is over or cancelled, a link at its rows' limit: invite_unavailable.
 *  - Their verified email answered this plan in a browser: that answer becomes theirs (item 8). An email invitation to
 *    that address becomes theirs as signing in makes it.
 *  - Anyone else: an invitation row, `channel = 'open'`, naming them, pending, waiting for the host's yes when "I say
 *    yes first" is on. From there it is an invitation like any other: "I'm in" is the ordinary ask.
 * Answers the plan as they now see it.
 */
async function claimOpenLink(user, postId, open) {
  const gone = () => fail(404, 'invite_unavailable', 'This invitation isn’t available anymore.');
  const planGuests = require('./planGuests');
  if (!planGuests.isKey(open) || !planService.isUuid(postId)) gone();
  const viewer = await loadViewer(user);
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planGuests.isOpenToken(plan, open) || !(await planGuests.switchFor(plan.host_user_id))) gone();
  if (require('./planBusiness').runsPlan(plan, viewer)) return { plan: await planBody(postId, viewer) };
  // A block either way, a muted host or a hidden plan: the plan isn't there for them, link or not.
  if (!planService.isVisibleTo(plan, viewer, { involved: true })) gone();

  const [invitesNow, { data: request, error: requestError }] = await Promise.all([
    viewerInvites(viewer.id, [postId]),
    supabaseAdmin.from('PlanRequest').select('id, status').eq('post_id', postId).eq('user_id', viewer.id).maybeSingle(),
  ]);
  if (requestError) throw new Error(`Failed to load your request: ${requestError.message}`);
  if (invitesNow.has(postId) || (request && planService.ACTIVE_REQUEST_STATUSES.includes(request.status))) {
    return { plan: await planBody(postId, viewer) };
  }
  // The host's no, or a removal, on this plan: their request says so, or an invitation of theirs the host ended.
  if (request && ['declined', 'removed'].includes(request.status)) gone();
  const { data: ended, error: endedError } = await supabaseAdmin.from('PlanInvite').select('id')
    .eq('post_id', postId).eq('invitee_user_id', viewer.id).eq('status', 'cancelled').limit(1);
  if (endedError) throw new Error(`Failed to load your invitation: ${endedError.message}`);
  if (ended && ended.length) gone();

  // Their verified address on this plan: a browser answer, or an email invitation, becomes theirs.
  const email = normalizeEmail(user.email);
  const verified = Boolean(email) && (await hasVerifiedEmail(user, email));
  if (verified) {
    const { data: byEmail, error: emailError } = await supabaseAdmin.from('PlanInvite').select('id, status, guest_name, invitee_user_id')
      .eq('post_id', postId).eq('email', email);
    if (emailError) throw new Error(`Failed to load the invitation: ${emailError.message}`);
    const rows = byEmail || [];
    const live = rows.find((r) => r.status !== 'cancelled');
    if (live) {
      if ((await attachEmailInvites(user, { postId })) > 0) return { plan: await planBody(postId, viewer) };
    } else if (rows.some((r) => r.guest_name || r.invitee_user_id)) {
      // A guest with this address the host removed.
      gone();
    }
  }

  if (!isOpenForAnswers(plan) || !hostMayInvite(plan)) gone();
  const existing = await loadInvites(postId);
  const openRows = existing.filter((r) => r.channel === 'open').length;
  if (openRows >= plan.spots + planGuests.LIMITS.openRowsOverRoom || existing.length >= invitesLimit(plan)) gone();
  const stamp = nowIso();
  const values = {
    post_id: postId,
    host_user_id: plan.host_user_id,
    channel: 'open',
    invitee_user_id: viewer.id,
    status: 'pending',
    needs_host_ok: Boolean(plan.open_invite_ok_first),
    claimed_at: stamp,
    opened_at: stamp,
  };
  // Their verified address rides on the row (never shown to the host), so the same person answering in a browser
  // finds their invitation in the app, and one the host removes doesn't come back through the browser with it.
  let { error } = await supabaseAdmin.from('PlanInvite').insert({ ...values, email: verified ? email : null });
  if (error && error.code === '23505' && verified) {
    // A browser answer with the address came in at the same moment, or the account's own claim did.
    ({ error } = await supabaseAdmin.from('PlanInvite').insert(values));
  }
  // A claim at the same moment made it already.
  if (error && error.code !== '23505') throw new Error(`Failed to open the invitation: ${error.message}`);
  return { plan: await planBody(postId, viewer) };
}

/**
 * The host accepted the ask of someone whose invitation came by the open link (6.9): that is the host's own yes
 * (host_ok_at), so a move to a home doesn't make them wait and a Maybe and back doesn't either.
 */
async function recordHostYes(postId, userId) {
  const { error } = await supabaseAdmin.from('PlanInvite').update({ host_ok_at: nowIso(), updated_at: nowIso() })
    .eq('post_id', postId).eq('invitee_user_id', userId).eq('channel', 'open').neq('status', 'cancelled').is('host_ok_at', null);
  if (error) logger.warn('plans.invites.host_yes_unsaved', { postId, error: error.message });
}

/** The plan screen was opened: an invitation the person hadn't seen counts as seen (the sign-in jump happens once). */
async function markOpened(viewerId, postId) {
  const { error } = await supabaseAdmin.from('PlanInvite').update({ opened_at: nowIso(), updated_at: nowIso() })
    .eq('post_id', postId).eq('invitee_user_id', viewerId).is('opened_at', null).neq('status', 'cancelled');
  if (error) logger.warn('plans.invites.open_unsaved', { postId, error: error.message });
}

/**
 * After the person's ask (planActions.askToJoin) as an invitee: their invitations count as answered yes.
 */
async function markAccepted(plan, viewerId, request) {
  const { data, error } = await supabaseAdmin.from('PlanInvite')
    .update({ status: 'accepted', answered_at: nowIso(), updated_at: nowIso() })
    .eq('post_id', plan.post_id).eq('invitee_user_id', viewerId).in('status', ['pending', 'declined', 'maybe'])
    .select('id, channel, claimed_at, created_at');
  if (error) {
    logger.warn('plans.invites.accept_unsaved', { postId: plan.post_id, error: error.message });
    return;
  }
  for (const row of data || []) {
    recordFunnelEvent('plan_invite_joined', {
      userId: viewerId,
      meta: { plan_id: plan.post_id, kind: plan.kind, channel: row.channel, status: request?.status || null },
    });
  }
}

/** POST /api/plans/:id/invites/decline: "Can't make it". Someone already in or waiting is taken out first. */
async function declineInvite(user, postId, { io = null } = {}) {
  const viewer = await loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  const invites = await viewerInvites(viewer.id, [postId]);
  const invite = invites.get(postId);
  if (!invite) fail(404, 'not_found', 'You don’t have an invitation to this plan.');
  const { data: mine } = await supabaseAdmin.from('PlanRequest').select('status')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  const wasIn = mine && ['pending', 'waitlisted', 'accepted'].includes(mine.status);
  if (wasIn) await actions().withdrawMine(user, postId, { io });
  const { data: changed, error } = await supabaseAdmin.from('PlanInvite')
    .update({ status: 'declined', answered_at: nowIso(), updated_at: nowIso() })
    .eq('post_id', postId).eq('invitee_user_id', viewer.id).in('status', ['pending', 'accepted', 'maybe'])
    .select('id');
  if (error) throw new Error(`Failed to save your answer: ${error.message}`);
  // Someone who was in already told the host by leaving (guestLeft).
  if (changed && changed.length && !(mine && mine.status === 'accepted')) {
    const who = actions().firstOf((await actions().userNames([viewer.id])).get(viewer.id));
    const goingCount = planService.seatsTaken(plan, await actions().activeRequests(postId), await require('./planGuests').guestSeats(postId));
    await planNotify.inviteDeclined({ plan, userId: viewer.id, guestName: who, goingCount });
  }
  return { plan: await planBody(postId, viewer) };
}

/**
 * GET /api/plans/invites/next: right after signing in, the newest invitation this person hasn't opened (an email
 * invite reaches them by their verified address), so the app can open it. { plan_id } or { plan_id: null }.
 */
async function nextInvite(user) {
  await attachEmailInvites(user);
  const { data, error } = await supabaseAdmin.from('PlanInvite').select('post_id, created_at')
    .eq('invitee_user_id', user.id).eq('status', 'pending').is('opened_at', null)
    .gt('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString())
    .order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  if (!data || data.length === 0) return { plan_id: null };
  const viewer = await loadViewer(user);
  const plans = new Map((await planService.loadPlanRows(data.map((r) => r.post_id))).map((p) => [p.post_id, p]));
  for (const row of data) {
    const plan = plans.get(row.post_id);
    // These are this person's own invitations, which is what a private plan asks for.
    if (plan && planService.isVisibleTo(plan, viewer, { involved: rules.isPrivate(plan) }) && isOpenForAnswers(plan)) {
      return { plan_id: plan.post_id };
    }
  }
  return { plan_id: null };
}

/** Plans the viewer is invited to and hasn't answered: GET /api/plans/mine's `invited`. */
async function invitedPlanIds(viewerId) {
  const { data, error } = await supabaseAdmin.from('PlanInvite').select('post_id')
    .eq('invitee_user_id', viewerId).in('status', ['pending', 'maybe']).limit(50);
  if (error) {
    logger.warn('plans.invites.mine_unavailable', { error: error.message });
    return [];
  }
  return [...new Set((data || []).map((r) => r.post_id))];
}

// ── The host's other actions ─────────────────────────────────

/** The host said no to, or removed, someone: their invitations to the plan end with it. */
async function cancelForPerson(postId, userId) {
  const { error } = await supabaseAdmin.from('PlanInvite').update({ status: 'cancelled', updated_at: nowIso() })
    .eq('post_id', postId).eq('invitee_user_id', userId).neq('status', 'cancelled');
  if (error) logger.warn('plans.invites.cancel_unsaved', { postId, error: error.message });
}

/** The plan was cancelled: people on Pantopus who were invited and hadn't answered hear it (no email). */
async function notifyCancelled(plan, hostFirst, note) {
  const { data, error } = await supabaseAdmin.from('PlanInvite').select('invitee_user_id')
    .eq('post_id', plan.post_id).in('status', ['pending', 'maybe']).not('invitee_user_id', 'is', null);
  if (error || !data) return;
  const { data: requests } = await supabaseAdmin.from('PlanRequest').select('user_id').eq('post_id', plan.post_id);
  const asked = new Set((requests || []).map((r) => String(r.user_id)));
  const invitees = [...new Set(data.map((r) => String(r.invitee_user_id)))];
  const shown = await require('./planBusiness').peopleShown(plan, invitees);
  for (const id of invitees) {
    if (asked.has(id) || !shown.has(id)) continue;
    await planNotify.cancelled({ plan, request: { id: null, user_id: id }, hostFirst, note, wasIn: false });
  }
}

// ── Signed out ───────────────────────────────────────────────

/**
 * For the share page with ?invite=: whose invitation it is and, for an email invite, a hint of the address to sign
 * up with. Never the address itself or who opened it.
 */
async function publicInvite(postId, token) {
  if (!isToken(token) || !planService.isUuid(postId)) return null;
  const { data: row, error } = await supabaseAdmin.from('PlanInvite')
    .select('id, host_user_id, channel, email, status, invitee_user_id')
    .eq('token_hash', hashToken(token)).eq('post_id', postId).maybeSingle();
  if (error || !row) return null;
  // A business's invitation is from the business, by its own name; a neighbor's is from the person who sent it.
  const plan = await planService.loadPlanRow(postId);
  const hostName = plan && plan.business_user_id
    ? await actions().hostFirstOf(plan)
    : actions().firstOf((await actions().userNames([row.host_user_id])).get(String(row.host_user_id)));
  return {
    host_first_name: hostName,
    available: row.status !== 'cancelled',
    channel: row.channel,
    email_hint: row.channel === 'email' ? emailHint(row.email) : null,
  };
}

/** Is `token` a live invitation to this plan? (The signed-out page of a private plan shows its card only then.) */
async function isLiveToken(postId, token) {
  if (!isToken(token) || !planService.isUuid(postId)) return false;
  const { data: row, error } = await supabaseAdmin.from('PlanInvite').select('status')
    .eq('token_hash', hashToken(token)).eq('post_id', postId).maybeSingle();
  return !error && Boolean(row) && row.status !== 'cancelled';
}

/** "Don't send me invitations": every invitation row for the address stops emails to it. */
async function unsubscribe(token) {
  if (!isToken(token)) return null;
  // An invitation's token, or (H1) the key in an email to a guest without an account.
  const { data: rows, error } = await supabaseAdmin.from('PlanInvite').select('email')
    .or(`and(token_hash.eq.${hashToken(token)},channel.eq.email),guest_key_hashes.cs.{${hashToken(token)}}`).limit(1);
  const row = rows && rows[0];
  if (error || !row?.email) return null;
  const { error: updateError } = await supabaseAdmin.from('PlanInvite')
    .update({ email_opted_out_at: nowIso(), updated_at: nowIso() })
    .eq('email', row.email).is('email_opted_out_at', null);
  if (updateError) throw new Error(`Failed to save the unsubscribe: ${updateError.message}`);
  logger.info('plans.invites.unsubscribed');
  return { email_hint: emailHint(row.email) };
}

module.exports = {
  LIMITS,
  normalizeEmail,
  emailHint,
  hashToken,
  inviteUrl,
  unsubscribeUrl,
  oneClickUnsubscribeUrl,
  inviteMessage,
  invitesLimit,
  isOpenForAnswers,
  dateText,
  emailWords,
  emailHeld,
  addressOptedOut,
  withEmailSent,
  hostPlan,
  assertInvitable,
  assertSharesAddressConfirmed,
  loadInvites,
  hostView,
  resendInviteEmail,
  listForHost,
  peopleToInvite,
  peopleBeforePosting,
  friendLinkPlanIds,
  isLiveToken,
  createInvites,
  inviteAll,
  names,
  personFor,
  createLinkInvite,
  cancelInvite,
  claimInvite,
  recordHostYes,
  declineInvite,
  nextInvite,
  attachEmailInvites,
  viewerInvites,
  hostInviteCounts,
  myInviteView,
  invitedPlanIds,
  markOpened,
  markAccepted,
  cancelForPerson,
  notifyCancelled,
  publicInvite,
  unsubscribe,
};
