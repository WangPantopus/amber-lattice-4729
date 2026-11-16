'use strict';

/**
 * Plans for the holidays, the extras: the same people again (docs/product/plans-holidays/08-extras.md, section 6; the
 * founder's go on November 15 and 16, 2026). Behind `plans_same_people`, read for the host; with it off every route
 * answers "not found".
 *
 *  - GET /api/plans/past-people: the host's last ten ended plans that had anyone in.
 *  - GET /api/plans/past-people/:postId: who was in on one of them, a name each, before anything goes.
 *  - POST /api/plans/:id/invites/from-plan { from_post_id, skip }: invites each of them the way they were reached: a
 *    person on Pantopus by account, a guest who gave an email by email. A guest reached only by a text invitation
 *    can't be reached again. Every limit of invitations holds (planInvites.inviteAll).
 *  - The host never sees a guest's address: the lists name people, and an address invited this way keeps the guest's
 *    name on its row (`known_name`), which the host's list shows instead of the address.
 *  - A person's own plans only, never a playdate. The plan invited to is a private plan.
 *
 * A named group kept between plans would need a new table; it is not built.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const { isFeatureEnabled } = require('../featureFlagService');
const planService = require('./planService');
const rules = require('./planRules');
const { loadViewer } = require('./planViewer');

const actions = () => require('./planActions');
const invites = () => require('./planInvites');

const FLAG = 'plans_same_people';
const PAST_PLANS = 10;
// The newest plans read to find ten that ended with anyone in.
const PLANS_READ = 60;
const SKIP_MAX = 200;
const NOT_AVAILABLE = "This isn't available right now.";

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};

async function enabledFor(userId) {
  return Boolean(userId) && isFeatureEnabled(FLAG, String(userId));
}

/** A plan whose people can be invited again, or that can invite them: a person's plan, never a playdate. */
const personsPlan = (plan) => Boolean(plan) && !plan.business_user_id && plan.kind !== 'playdate';
/** A plan whose times all passed with no date picked had nobody in (find a date). */
const neverPicked = (plan) => Boolean(plan.date_options && !plan.date_options.picked);

function isOver(plan) {
  return rules.planState(plan, plan.post.event_date, plan.post.event_end_date) === 'ended';
}

/** "Nov 21", in the plan's own time zone. */
function shortDate(plan) {
  const start = new Date(plan.post.event_date);
  if (Number.isNaN(start.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: rules.timezoneForPlan(plan), month: 'short', day: 'numeric' }).format(start);
}

/**
 * Who was in on these plans when they ended: accounts whose ask was accepted, and guests without an account who were
 * in (not waiting for the host's yes). The host is never one of them.
 * @returns {Promise<Map<string, { accounts: string[], guestRows: object[] }>>}
 */
async function peopleIn(plans) {
  const ids = plans.map((p) => p.post_id);
  const out = new Map(plans.map((p) => [p.post_id, { accounts: [], guestRows: [] }]));
  if (ids.length === 0) return out;
  const [requests, rows] = await Promise.all([
    supabaseAdmin.from('PlanRequest').select('post_id, user_id, status, created_at').in('post_id', ids).eq('status', 'accepted')
      .order('created_at', { ascending: true }).limit(2000),
    supabaseAdmin.from('PlanInvite').select('id, post_id, channel, email, guest_name, invitee_user_id, status, needs_host_ok, created_at')
      .in('post_id', ids).eq('status', 'accepted').is('invitee_user_id', null).not('guest_name', 'is', null)
      .order('created_at', { ascending: true }).limit(2000),
  ]);
  const failed = requests.error || rows.error;
  if (failed) throw new Error(`Failed to load who came: ${failed.message}`);
  const hostOf = new Map(plans.map((p) => [p.post_id, String(p.host_user_id)]));
  for (const r of requests.data || []) {
    if (String(r.user_id) === hostOf.get(r.post_id)) continue;
    out.get(r.post_id).accounts.push(String(r.user_id));
  }
  for (const row of rows.data || []) {
    if (row.needs_host_ok) continue;
    out.get(row.post_id).guestRows.push(row);
  }
  return out;
}

/** People on the host's blocks either way are left out of every list here. */
function countOf(entry, viewer) {
  return entry.accounts.filter((id) => !viewer.blockedUserIds.has(id)).length + entry.guestRows.length;
}

/** GET /api/plans/past-people: { plans: [{ post_id, title, kind, date_text, count }] }, newest first. */
async function pastPlans(user) {
  const viewer = await loadViewer(user);
  if (!(await enabledFor(viewer.id)) || !viewer.invitesFlag) fail(404, 'not_found', NOT_AVAILABLE);
  const { data, error } = await supabaseAdmin.from('Plan').select(planService.PLAN_SELECT)
    .eq('host_user_id', viewer.id)
    .is('business_user_id', null)
    .in('status', ['open', 'ended'])
    .lt('post.event_end_date', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(PLANS_READ);
  if (error) throw new Error(`Failed to load your plans: ${error.message}`);
  const plans = (data || []).filter((p) => personsPlan(p) && isOver(p) && !neverPicked(p))
    .sort((a, b) => new Date(b.post.event_end_date) - new Date(a.post.event_end_date));
  const people = await peopleIn(plans);
  const out = [];
  for (const plan of plans) {
    const count = countOf(people.get(plan.post_id), viewer);
    if (count === 0) continue;
    out.push({ post_id: plan.post_id, title: plan.post.title, kind: plan.kind, date_text: shortDate(plan), count });
    if (out.length >= PAST_PLANS) break;
  }
  return { plans: out };
}

/** One of the host's own past plans that the same people can come from, or 404. */
async function pastPlanFor(viewer, postId) {
  if (!planService.isUuid(postId)) fail(404, 'not_found', "That plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || String(plan.host_user_id) !== viewer.id || !personsPlan(plan) || plan.status === 'cancelled' || !isOver(plan) || neverPicked(plan)) {
    fail(404, 'not_found', "That plan isn't available.");
  }
  return plan;
}

/**
 * The people of one past plan, as the host may see them: a key each (`p:<user id>` or `g:<invitation id>`), a name,
 * and how they would be invited: 'pantopus', 'email', or 'text' (can't be reached again). Never an address.
 */
async function peopleOf(viewer, plan) {
  const entry = (await peopleIn([plan])).get(plan.post_id);
  const accounts = entry.accounts.filter((id) => !viewer.blockedUserIds.has(id));
  const names = await invites().names(accounts);
  const people = [];
  for (const id of accounts) {
    const shown = invites().personFor(plan, names.get(id));
    people.push({
      key: `p:${id}`, name: shown?.display_name || planService.NO_NAME, avatar_url: shown?.avatar_url || null,
      via: 'pantopus', can_invite: true, user_id: id,
    });
  }
  const seenEmails = new Set();
  for (const row of entry.guestRows) {
    const email = row.email ? invites().normalizeEmail(row.email) : null;
    if (email && seenEmails.has(email)) continue;
    if (email) seenEmails.add(email);
    people.push({
      key: `g:${row.id}`, name: row.guest_name, avatar_url: null,
      via: email ? 'email' : 'text', can_invite: Boolean(email), email,
    });
  }
  return people;
}

/** What the host's screen may carry of a person: never their address or account id. */
const shownPerson = (p) => ({ key: p.key, name: p.name, avatar_url: p.avatar_url, via: p.via, can_invite: p.can_invite });

/** GET /api/plans/past-people/:postId: { post_id, title, kind, date_text, count, text_only, people }. */
async function pastPlanPeople(user, postId) {
  const viewer = await loadViewer(user);
  if (!(await enabledFor(viewer.id)) || !viewer.invitesFlag) fail(404, 'not_found', NOT_AVAILABLE);
  const plan = await pastPlanFor(viewer, postId);
  const people = await peopleOf(viewer, plan);
  return {
    post_id: plan.post_id,
    title: plan.post.title,
    kind: plan.kind,
    date_text: shortDate(plan),
    count: people.length,
    text_only: people.filter((p) => !p.can_invite).length,
    people: people.map(shownPerson),
  };
}

/** "Invited 11. 1 can only be reached by text." */
function doneText(invited, textOnly) {
  const first = `Invited ${invited}.`;
  if (!textOnly) return first;
  return `${first} ${textOnly} can only be reached by text.`;
}

/**
 * POST /api/plans/:id/invites/from-plan { from_post_id, skip?, confirm_shares_address? }: invites everyone who was in on
 * one of the host's past plans, but the keys in `skip`. Answers the host's list (as POST …/invites does, without its
 * `results`), and `results: [{ key, name, outcome }]`, `invited`, `text_only` and `text` ("Invited 11. 1 can only be
 * reached by text."). Outcomes: invited, already_invited, already_in, unavailable, text_only.
 */
async function inviteFromPlan(user, postId, body = {}) {
  const { viewer, plan } = await invites().hostPlan(user, postId);
  if (!(await enabledFor(viewer.id)) || !personsPlan(plan) || !rules.isPrivate(plan)) fail(404, 'not_found', NOT_AVAILABLE);
  invites().assertInvitable(plan, viewer);
  if (body.from_post_id === plan.post_id) fail(422, 'validation', 'Choose one of your past plans.');
  const from = await pastPlanFor(viewer, body.from_post_id);
  const rawSkip = Array.isArray(body.skip) ? body.skip : [];
  if (rawSkip.length > SKIP_MAX) fail(422, 'validation', 'Take out fewer people at a time.');
  const skip = new Set(rawSkip.filter((k) => typeof k === 'string').map((k) => k.trim().toLowerCase()));
  const people = (await peopleOf(viewer, from)).filter((p) => !skip.has(p.key.toLowerCase()));
  if (people.length === 0) fail(422, 'validation', 'Choose someone to invite.');

  const reachable = people.filter((p) => p.can_invite);
  const userIds = reachable.filter((p) => p.via === 'pantopus').map((p) => p.user_id);
  const emailPeople = reachable.filter((p) => p.via === 'email');
  const knownNames = new Map(emailPeople.map((p) => [p.email, p.name]));
  let view = null;
  let results = [];
  if (reachable.length > 0) {
    await invites().assertSharesAddressConfirmed(plan, body);
    ({ results, ...view } = await invites().inviteAll(user, viewer, plan, {
      userIds, emails: emailPeople.map((p) => p.email), knownNames,
    }));
  } else {
    const { results: _none, ...listed } = await invites().listForHost(user, postId);
    view = listed;
  }
  const byUser = new Map(results.filter((r) => r.user_id).map((r) => [r.user_id, r.outcome]));
  const byEmail = new Map(results.filter((r) => r.email).map((r) => [r.email, r.outcome]));
  const out = people.map((p) => ({
    key: p.key,
    name: p.name,
    outcome: !p.can_invite ? 'text_only'
      : (p.via === 'pantopus' ? byUser.get(p.user_id) : byEmail.get(p.email)) || 'unavailable',
  }));
  const invited = out.filter((r) => r.outcome === 'invited').length;
  const textOnly = out.filter((r) => r.outcome === 'text_only').length;
  require('../funnelEvents').recordFunnelEvent('plan_invited_same_people', {
    userId: viewer.id, meta: { plan_id: plan.post_id, from_plan_id: from.post_id, invited, text_only: textOnly },
  });
  return { ...view, results: out, invited, text_only: textOnly, text: doneText(invited, textOnly) };
}

module.exports = {
  FLAG,
  enabledFor,
  pastPlans,
  pastPlanPeople,
  inviteFromPlan,
};
