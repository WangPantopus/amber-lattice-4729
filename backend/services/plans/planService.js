'use strict';

/**
 * Nearby Plans: reading plans and shaping them for one viewer.
 *
 * Privacy (build brief §6) is enforced here and only here:
 *  - PlanCard carries the area only: the public area point stored on the Post,
 *    the area label, a distance band, never the exact point, venue, address,
 *    host's note or the people going.
 *  - PlanDetail adds those, only for the host and people who are in.
 *  - Playdates don't exist for viewers with plans_playdates off, and hide their
 *    time behind day_part until the viewer is in.
 *  - Blocks hide plans and requests both ways; mutes and hidden posts hide plans.
 *  - A private plan (Plan.audience 'invited') exists only for its host, the people invited and the people in or
 *    waiting: isVisibleTo refuses it unless the caller has checked that (`involved`), and the nearby query
 *    never reads one.
 *  - An online plan, or one of the newer kinds, exists only for an app that said it can draw one (viewer.more):
 *    isVisibleTo refuses it to everyone else, its host included, and the nearby queries leave it out. An online
 *    plan's link reaches only the host and people who are in.
 *  - Guests without an account (Plans for the holidays, H1) are invitation rows (planGuests.js). Their seats count in
 *    every card. Their names, numbers, Maybe and room over 30 reach only an app that sent `guests=1`
 *    (viewer.guests), while the plan's host has the switch; an older app reads the plan as it did.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { verifiedUserIds } = require('./planViewer');
const { localDisplayNames } = require('../../utils/identityProfiles');
const { loadChatPeople } = require('../chatPeople');
const rules = require('./planRules');
const planBusiness = require('./planBusiness');
const { canReadPostModeration, postScopeAccess } = require('../pulse/readAccess');

// planInvites and planGuests require this module; they are read when called.
const invites = () => require('./planInvites');
const guests = () => require('./planGuests');

const POST_COLUMNS = 'id, user_id, title, content, event_date, event_end_date, latitude, longitude, location_precision, archived_at, archive_reason, moderation_state, created_at, read_scope, area_id, pulse_post_town_id, allow_external_share';
const PLAN_COLUMNS = [
  'post_id', 'host_user_id', 'kind', 'spots', 'auto_rules', 'join_requirement', 'place_kind',
  'area_label', 'city', 'details', 'guest_note', 'place_name', 'place_address', 'place_latitude',
  'place_longitude', 'place_home_id', 'place_ref', 'timezone', 'status', 'cancel_note', 'chat_room_id',
  'chat_closed_at', 'host_summary_sent_at', 'created_at', 'updated_at', 'cancelled_at', 'ended_at',
  // Plans with businesses: empty on a neighbor's plan.
  'business_user_id', 'posted_by_user_id', 'business_location_id', 'label', 'guests_can_invite',
  // 'nearby', or 'invited' for a private plan (planRules.isPrivate).
  'audience',
  // A repeating plan (planSeries.js): its pattern, its series and which date of it this is.
  'repeat', 'series_id', 'series_index', 'series_next_at',
  // An online plan's link (place_kind 'online'): only the host and people in read it (buildDetail).
  'online_link',
  // Plans for the holidays, H1: kids welcome, and the open link (its token reaches the host alone, in open_link).
  'kids_welcome', 'open_invite_token', 'open_invite_ok_first',
  // H2: the bring list (planBring.js), read by the host and the people in only.
  'bring_list',
  // H3: the occasion that started it (planOccasions.js).
  'occasion',
  // B1: a business's plan's deal (planDeals.js), on its card only while the business has the switch.
  'deal',
  // B2: the price of a spot (planPaid.js); null is free.
  'price_cents', 'currency',
  // B5: guests pay their bill here, and the check asks for a tip (planChecks.js).
  'pay_here', 'tips_on',
  // The extras (08-extras.md): chip in (planChipIn.js), read by the host and the people in only, with `extras=1`.
  'chip_in',
  // Find a date (planDates.js): the times offered, the ticks and the pick. A plan still picking reaches only an app
  // that sends `extras=1` (isVisibleTo).
  'date_options',
  // The gift exchange (planGift.js). Its pairs (gift_pairs) are never read here: only plan_gift_mine touches them.
  'gift',
  // Photos afterwards (planPhotos.js): the pictures' private keys; the apps get links signed for minutes.
  'photos',
].join(', ');
const PLAN_SELECT = `${PLAN_COLUMNS}, post:Post!inner(${POST_COLUMNS})`;
const REQUEST_COLUMNS = [
  'id', 'post_id', 'user_id', 'status', 'party_size', 'note', 'kids_count', 'kids_age_bands',
  'stays_with_kids', 'decided_by', 'reconfirm_requested_at', 'reconfirmed', 'reconfirm_reason', 'on_my_way_at',
  'ask_count', 'distance_band', 'queued_at', 'reminded_at', 'feedback', 'feedback_note', 'feedback_at',
  'created_at', 'decided_at', 'updated_at',
].join(', ');
const USER_COLUMNS = 'id, name, first_name, last_name, profile_picture_url, created_at';

// 'paying' (B2): a spot held for 10 minutes while the guest pays; it counts as a taken seat. Only a paid plan has one.
const ACTIVE_REQUEST_STATUSES = ['pending', 'waitlisted', 'accepted', 'paying'];
const OPEN_REQUEST_STATUSES = ['pending', 'waitlisted'];
const NEW_ACCOUNT_DAYS = 30;
// What someone with no name is called, everywhere in Plans.
const NO_NAME = 'Someone';
const PAGE_SIZE = 30;

function webBaseUrl() {
  return (process.env.PUBLIC_WEB_URL || process.env.APP_URL || 'https://pantopus.com').trim().replace(/\/+$/, '');
}

function shareUrl(postId) {
  return `${webBaseUrl()}/plans/${postId}`;
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * "Sam R.": the name someone already shows neighbors (identityProfiles.localDisplayNames),
 * shortened to a first name and a last initial, the way people meet on Plans.
 */
function displayName(user) {
  const full = cleanText(user?.local_display_name) || cleanText(user?.name)
    || [cleanText(user?.first_name), cleanText(user?.last_name)].filter(Boolean).join(' ');
  if (!full) return NO_NAME;
  const words = full.split(' ');
  if (words.length === 1) return words[0];
  const last = words[words.length - 1].replace(/[^\p{L}\p{N}]/gu, '');
  return last ? `${words[0]} ${last[0].toUpperCase()}.` : words[0];
}

/** The name a plan's host goes by: a business's own name whole, a person's as "Sam R.". */
function hostName(plan, host) {
  return plan.business_user_id ? (plan.business?.name || 'A business') : displayName(host);
}

/** The host's picture: a business's own for a business's plan, else the photo the person shows neighbors. */
function hostAvatar(plan, host) {
  return plan.business_user_id ? (plan.business?.avatar_url || null) : avatarUrl(host);
}

function firstName(user) {
  const name = displayName(user);
  // "Someone" stays whole ("Someone's place", not "S's place").
  return name === NO_NAME ? name : name.split(' ')[0];
}

/**
 * The photo someone shows neighbors (services/chatPeople.js): their Local Profile's, or none when they removed it; the
 * account's for anyone without one. Only someone the lookup missed (`withLocalAvatar` left them as they were) falls back
 * to the account's photo.
 */
function avatarUrl(user) {
  if (user && user.local_avatar_url !== undefined) return user.local_avatar_url || null;
  return user?.profile_picture_url || null;
}

/** `user` (an account row with `id`) with the photo loadChatPeople found for them. */
function withLocalAvatar(user, people) {
  const person = user?.id ? people.get(String(user.id)) : null;
  return person ? { ...user, local_avatar_url: person.avatarUrl || null } : user;
}

/** Every time in a Plans response: ISO 8601 in UTC with milliseconds, e.g. 2026-10-18T20:25:00.000Z. */
function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function startsAt(plan) {
  return iso(plan.post?.event_date);
}

function endsAt(plan) {
  return iso(plan.post?.event_end_date);
}

function areaPoint(plan) {
  // An online plan posted with no area has no point to show or measure from.
  if (rules.hasNoArea(plan)) return null;
  const lat = Number(plan.post?.latitude);
  const lng = Number(plan.post?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

function exactPoint(plan) {
  return { latitude: Number(plan.place_latitude), longitude: Number(plan.place_longitude) };
}

// ── Visibility ───────────────────────────────────────────────

/**
 * May this viewer know the plan exists? (PlanCard at least.)
 * The host always may. Cancelled and ended plans stay visible by id so
 * people can see what happened; the lists and the map leave them out.
 *
 * `involved`: the caller knows this viewer is part of the plan (isInvolved: invited, in or waiting). A private
 * plan is shown to nobody else, so a caller that doesn't say hides it: a new read path fails closed.
 *
 * An online plan or one of the newer kinds exists only for a viewer whose app said it can draw one (`more=1`):
 * an older app would fail to decode it. Nobody else reads it, not even its host, and no job or nudge does.
 */
function isVisibleTo(plan, viewer, { involved = false } = {}) {
  if (!plan || !plan.post) return false;
  if (rules.needsMore(plan) && viewer.more !== true) return false;
  // A plan still picking its date (the extras' find a date) doesn't exist for an app without `extras=1`, the host's
  // own included: it would read the first time offered as the plan's time.
  if (plan.date_options && !plan.date_options.picked && viewer.extras !== true) return false;
  // A business's plan exists only for a viewer with the switch, in an app that can draw it, while the business
  // may still host (planBusiness.shownTo). That goes for the business's own team too. Once the business may no
  // longer host, only the people already involved keep reading it, so a guest can leave and the team can cancel:
  // whoever runs it, and anyone `involved` (the caller knows they are in or waiting).
  const runsIt = planBusiness.runsPlan(plan, viewer);
  if (rules.isPrivate(plan) && !runsIt && !involved) return false;
  if (plan.business_user_id && !planBusiness.shownTo(plan, viewer, { involved: runsIt || involved })) return false;
  // A held or removed plan is read by its author; for a business's plan that is whoever runs it.
  if (!canReadPostModeration(plan.post, runsIt ? String(plan.post.user_id) : viewer.id, viewer.role === 'admin')) return false;
  const reviewingHeld = plan.post.moderation_state === 'held' && viewer.role === 'admin';
  if (!reviewingHeld && plan.post.read_scope != null && !viewer.scopeAccess?.allows(plan.post)) return false;
  const hostId = String(plan.host_user_id);
  if (runsIt) return true;
  // A neighbor's playdate needs the playdates switch. A business's session for kids has its own (shownTo).
  if (plan.kind === 'playdate' && !plan.business_user_id && !viewer.seesPlaydates) return false;
  if (viewer.blockedUserIds.has(hostId)) return false;
  if (viewer.mutedUserIds.has(hostId)) return false;
  if (viewer.hiddenPostIds.has(plan.post_id)) return false;
  return true;
}

// ── Loading ──────────────────────────────────────────────────

async function loadPlanRows(postIds) {
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin.from('Plan').select(PLAN_SELECT).in('post_id', ids);
  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  return planBusiness.attachBusinessHosts(data || []);
}

async function loadPlanRow(postId) {
  const rows = await loadPlanRows([postId]);
  return rows[0] || null;
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Everything the cards need besides the plan rows, read in a few batched queries. */
async function loadCardContext(plans, viewer, { withPeople = false } = {}) {
  const planIds = plans.map((p) => p.post_id);
  const hostIds = [...new Set(plans.map((p) => String(p.host_user_id)))];
  const ctx = {
    requestsByPlan: new Map(),
    myRequestByPlan: new Map(),
    users: new Map(),
    verified: new Set(),
    hostedCount: new Map(),
    hostedKindCount: new Map(),
    hostedByHost: new Set(),
    mutualByHost: new Map(),
    answerMinutesByHost: new Map(),
    peopleStats: new Map(),
    viewerOpenRequestCount: 0,
    // The viewer's own open invitation to each plan, and for plans they host, how their invitations stand.
    myInviteByPlan: new Map(),
    inviteCountsByPlan: new Map(),
    // A venue's later plans, folded under its soonest one (listNearby): the lead plan's id → the others.
    moreTimesByPlan: new Map(),
    // Private plans where the viewer, a guest, has already made their one "Bring a friend" link.
    friendLinkPlans: new Set(),
    // Guests without an account who are in or said maybe (planGuests.js), and whether each plan's host has the switch.
    guestRowsByPlan: new Map(),
    guestAnswersByHost: new Map(),
    // Whether each plan's host has the bring list (H2), and occasions (H3).
    bringByHost: new Map(),
    occasionByHost: new Map(),
    // Whether each business hosting a plan with a deal has the switch (B1), and when each guest's free thing was used.
    dealsByHost: new Map(),
    dealUsedByRequest: new Map(),
    // Paid spots (B2): whether each business with a priced plan has the switch, and each request's money.
    paidByHost: new Map(),
    moneyByRequest: new Map(),
    // The bill at the place (B5): whether each business with pay_here on has the switch.
    payHereByHost: new Map(),
    // A tip after a paid plan (B6): the paid requests that already tipped, and each tips_on business's switch.
    tippedRequests: new Set(),
    tipsByHost: new Map(),
    // The extras (`extras=1`): whether each plan's host has chip in.
    chipInByHost: new Map(),
    // Find a date: whether each picking plan's host has the switch, and (read per plan) who was invited.
    datesByHost: new Map(),
    datesPartsByPlan: new Map(),
    // The gift exchange: whether each plan's host has the switch, and the viewer's own receiver (theirs only).
    giftByHost: new Map(),
    giftGivingByPlan: new Map(),
    // Photos afterwards: whether each ended plan's host has the switch (and a private bucket is set).
    photosByHost: new Map(),
  };
  if (planIds.length === 0) return ctx;

  const hostedIds = plans.filter((p) => planBusiness.runsPlan(p, viewer)).map((p) => p.post_id);
  const friendPlanIds = plans.filter((p) => rules.isPrivate(p) && p.guests_can_invite && !hostedIds.includes(p.post_id)).map((p) => p.post_id);
  const [activeRequests, myRequests, openCount, hostedRows, myHistory, myInvites, inviteCounts, friendLinks, guestRows, guestFlags, bringFlags, occasionFlags] = await Promise.all([
    supabaseAdmin.from('PlanRequest').select(REQUEST_COLUMNS).in('post_id', planIds).in('status', ACTIVE_REQUEST_STATUSES),
    supabaseAdmin.from('PlanRequest').select(REQUEST_COLUMNS).in('post_id', planIds).eq('user_id', viewer.id),
    supabaseAdmin.from('PlanRequest').select('id', { count: 'exact', head: true }).eq('user_id', viewer.id).in('status', OPEN_REQUEST_STATUSES),
    supabaseAdmin.from('Plan').select('host_user_id, kind').in('host_user_id', hostIds).eq('status', 'ended'),
    // People this viewer has been hosted by before (accepted at a plan that ended).
    supabaseAdmin.from('PlanRequest')
      .select('post_id, plan:Plan!inner(host_user_id, status)')
      .eq('user_id', viewer.id)
      .eq('status', 'accepted')
      .eq('plan.status', 'ended'),
    invites().viewerInvites(viewer.id, planIds.filter((id) => !hostedIds.includes(id))),
    invites().hostInviteCounts(hostedIds),
    invites().friendLinkPlanIds(viewer.id, friendPlanIds),
    guests().guestRows(planIds),
    guests().switchByHost(hostIds),
    require('./planBring').switchByHost(plans.filter((p) => p.bring_list).map((p) => p.host_user_id)),
    require('./planOccasions').switchByHost(plans.filter((p) => p.occasion).map((p) => p.host_user_id)),
  ]);
  for (const result of [activeRequests, myRequests, openCount, hostedRows, myHistory]) {
    if (result.error) throw new Error(`Failed to load plan details: ${result.error.message}`);
  }
  ctx.myInviteByPlan = myInvites;
  ctx.inviteCountsByPlan = inviteCounts;
  ctx.friendLinkPlans = friendLinks;
  ctx.guestRowsByPlan = guestRows;
  ctx.guestAnswersByHost = guestFlags;
  ctx.bringByHost = bringFlags;
  ctx.occasionByHost = occasionFlags;
  // The extras, for an app that sent `extras=1`: read only for plans that carry one.
  if (viewer.extras) {
    const chipInPlans = plans.filter((p) => p.chip_in);
    if (chipInPlans.length) ctx.chipInByHost = await require('./planChipIn').switchByHost(chipInPlans.map((p) => p.host_user_id));
    const overPlans = plans.filter((p) => require('./planExtras').takesExtras(p) && require('./planPhotos').isOver(p));
    if (overPlans.length) ctx.photosByHost = await require('./planPhotos').switchByHost(overPlans.map((p) => p.host_user_id));
    const giftPlans = plans.filter((p) => p.gift);
    if (giftPlans.length) {
      const planGift = require('./planGift');
      ctx.giftByHost = await planGift.switchByHost(giftPlans.map((p) => p.host_user_id));
      await Promise.all(giftPlans.filter((p) => p.gift.state === 'drawn' && ctx.giftByHost.get(String(p.host_user_id))).map(async (p) => {
        const mineKey = String(p.host_user_id) === viewer.id ? planGift.hostKey(p) : require('./planExtras').personKey(viewer.id);
        if (!(p.gift.people || []).some((x) => x.who === mineKey)) return;
        ctx.giftGivingByPlan.set(p.post_id, await planGift.givingTo(p, mineKey));
      }));
    }
    const planDates = require('./planDates');
    const picking = plans.filter((p) => planDates.isPicking(p));
    if (picking.length) {
      ctx.datesByHost = await planDates.switchByHost(picking.map((p) => p.host_user_id));
      await Promise.all(picking.filter((p) => ctx.datesByHost.get(String(p.host_user_id))).map(async (p) => {
        ctx.datesPartsByPlan.set(p.post_id, await planDates.cardParts(p, { host: planBusiness.runsPlan(p, viewer) }));
      }));
    }
  }
  // Paid spots (B2): read only for priced plans, from businesses that have the switch.
  const pricedPlans = plans.filter((p) => p.price_cents && p.business_user_id);
  if (pricedPlans.length > 0) {
    ctx.paidByHost = await require('./planPaid').switchByHost(pricedPlans.map((p) => p.host_user_id));
    const onIds = pricedPlans.filter((p) => ctx.paidByHost.get(String(p.host_user_id))).map((p) => p.post_id);
    if (onIds.length > 0) {
      const { data: money, error: moneyError } = await supabaseAdmin.from('PlanRequest')
        .select('id, payment_id, unit_price_cents, paid_cents, refunded_cents, refund_until, hold_expires_at, fee_basis, payment:Payment(metadata)')
        .in('post_id', onIds).not('unit_price_cents', 'is', null);
      if (moneyError) throw new Error(`Failed to load plan details: ${moneyError.message}`);
      for (const row of money || []) ctx.moneyByRequest.set(row.id, row);
    }
  }
  // A tip after a paid plan (B6): read only for priced plans with tips on, from businesses with the switch.
  const tipPlans = plans.filter((p) => p.tips_on && p.price_cents && p.business_user_id);
  if (tipPlans.length > 0 && ctx.moneyByRequest.size > 0) {
    ctx.tipsByHost = await require('./planChecks').switchByHost(tipPlans.map((p) => p.host_user_id));
    const { data: tips } = await supabaseAdmin.from('Payment').select('sold_id').eq('sold_type', 'plan_tip')
      .in('sold_id', [...ctx.moneyByRequest.keys()]).in('payment_status', ['captured_hold', 'transfer_scheduled', 'transfer_pending', 'transferred', 'refunded_partial']);
    for (const row of tips || []) ctx.tippedRequests.add(row.sold_id);
  }
  // The bill at the place (B5): read only for plans with pay_here on.
  const payHerePlans = plans.filter((p) => p.pay_here && p.business_user_id);
  if (payHerePlans.length > 0) ctx.payHereByHost = await require('./planChecks').switchByHost(payHerePlans.map((p) => p.host_user_id));
  // Deals (B1): read only for plans that carry one, from businesses that have the switch.
  const dealPlans = plans.filter((p) => p.deal && p.business_user_id);
  if (dealPlans.length > 0) {
    ctx.dealsByHost = await require('./planDeals').switchByHost(dealPlans.map((p) => p.host_user_id));
    const onIds = dealPlans.filter((p) => ctx.dealsByHost.get(String(p.host_user_id))).map((p) => p.post_id);
    if (onIds.length > 0) {
      const { data: used, error: usedError } = await supabaseAdmin.from('PlanRequest').select('id, deal_used_at')
        .in('post_id', onIds).not('deal_used_at', 'is', null);
      if (usedError) throw new Error(`Failed to load plan details: ${usedError.message}`);
      for (const row of used || []) ctx.dealUsedByRequest.set(row.id, row.deal_used_at);
    }
  }

  for (const request of activeRequests.data || []) {
    if (!ctx.requestsByPlan.has(request.post_id)) ctx.requestsByPlan.set(request.post_id, []);
    ctx.requestsByPlan.get(request.post_id).push(request);
  }
  for (const request of myRequests.data || []) ctx.myRequestByPlan.set(request.post_id, request);
  ctx.viewerOpenRequestCount = openCount.count || 0;
  for (const row of hostedRows.data || []) {
    const host = String(row.host_user_id);
    ctx.hostedCount.set(host, (ctx.hostedCount.get(host) || 0) + 1);
    const key = `${host}:${row.kind}`;
    ctx.hostedKindCount.set(key, (ctx.hostedKindCount.get(key) || 0) + 1);
  }
  for (const row of myHistory.data || []) {
    if (row.plan?.host_user_id) ctx.hostedByHost.add(String(row.plan.host_user_id));
  }

  // People: hosts always; guests only where the viewer will see the people list.
  const userIds = new Set(hostIds);
  if (withPeople) {
    for (const plan of plans) {
      for (const request of ctx.requestsByPlan.get(plan.post_id) || []) {
        if (request.status === 'accepted') userIds.add(String(request.user_id));
      }
    }
  }
  // The host sees, for each person in, whether they've hosted them before and how many plans they've joined.
  const hostedPlans = withPeople ? plans.filter((plan) => planBusiness.runsPlan(plan, viewer)) : [];
  const hostedPeople = hostedPlans
    .flatMap((plan) => (ctx.requestsByPlan.get(plan.post_id) || []).filter((r) => r.status === 'accepted').map((r) => String(r.user_id)));
  // "Hosted before" is about the plan's host: the business, for a plan the viewer runs for one.
  const statsHostId = hostedPlans[0] ? String(hostedPlans[0].host_user_id) : viewer.id;
  const [users, names, people, verified, mutual, answerMinutes, peopleStats] = await Promise.all([
    supabaseAdmin.from('User').select(USER_COLUMNS).in('id', [...userIds]),
    localDisplayNames([...userIds]),
    loadChatPeople([...userIds]),
    verifiedUserIds([...userIds]),
    mutualConnectionCounts(viewer.id, hostIds),
    typicalAnswerMinutes(hostIds),
    requesterStats(statsHostId, hostedPeople),
  ]);
  if (users.error) throw new Error(`Failed to load people: ${users.error.message}`);
  for (const user of users.data || []) {
    const id = String(user.id);
    ctx.users.set(id, withLocalAvatar({ ...user, local_display_name: names.get(id) || null }, people));
  }
  ctx.verified = verified;
  ctx.mutualByHost = mutual;
  ctx.answerMinutesByHost = answerMinutes;
  ctx.peopleStats = peopleStats;
  return ctx;
}

/**
 * How quickly each host usually answers asks: the median minutes from an ask to
 * the host's own yes or no, over their last 20 answers; null with fewer than 3.
 */
async function typicalAnswerMinutes(hostIds) {
  const result = new Map();
  if (hostIds.length === 0) return result;
  const { data, error } = await supabaseAdmin
    .from('PlanRequest')
    .select('created_at, queued_at, decided_at, plan:Plan!inner(host_user_id)')
    .in('plan.host_user_id', hostIds)
    .eq('decided_by', 'host')
    .not('decided_at', 'is', null)
    .order('decided_at', { ascending: false })
    .limit(400);
  if (error) {
    logger.warn('plans.answer_minutes.unavailable', { error: error.message });
    return result;
  }
  const byHost = new Map();
  for (const row of data || []) {
    const host = String(row.plan?.host_user_id);
    const asked = new Date(row.queued_at || row.created_at).getTime();
    const answered = new Date(row.decided_at).getTime();
    if (!Number.isFinite(asked) || !Number.isFinite(answered) || answered < asked) continue;
    const list = byHost.get(host) || [];
    if (list.length < 20) list.push((answered - asked) / 60000);
    byHost.set(host, list);
  }
  for (const [host, minutes] of byHost) {
    if (minutes.length < 3) continue;
    const sorted = [...minutes].sort((a, b) => a - b);
    result.set(host, Math.max(1, Math.round(sorted[Math.floor(sorted.length / 2)])));
  }
  return result;
}

/**
 * For the host's view of people (requests and the people going): how many plans
 * each person has joined (accepted at a plan that ended) and whether this host
 * hosted them before.
 */
async function requesterStats(hostId, userIds) {
  const ids = [...new Set((userIds || []).map(String))];
  const stats = new Map(ids.map((id) => [id, { plans_joined: 0, hosted_before: false }]));
  if (ids.length === 0) return stats;
  const { data, error } = await supabaseAdmin
    .from('PlanRequest')
    .select('user_id, plan:Plan!inner(host_user_id, status)')
    .in('user_id', ids)
    .eq('status', 'accepted')
    .eq('plan.status', 'ended');
  if (error) throw new Error(`Failed to load people's plans: ${error.message}`);
  for (const row of data || []) {
    const entry = stats.get(String(row.user_id));
    if (!entry) continue;
    entry.plans_joined += 1;
    if (String(row.plan?.host_user_id) === String(hostId)) entry.hosted_before = true;
  }
  return stats;
}

async function connectionIdsByUser(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  const result = new Map(ids.map((id) => [id, new Set()]));
  if (ids.length === 0) return result;
  const list = ids.join(',');
  const { data, error } = await supabaseAdmin
    .from('Relationship')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.in.(${list}),addressee_id.in.(${list})`);
  if (error) throw new Error(`Failed to load connections: ${error.message}`);
  for (const row of data || []) {
    const a = String(row.requester_id);
    const b = String(row.addressee_id);
    if (result.has(a)) result.get(a).add(b);
    if (result.has(b)) result.get(b).add(a);
  }
  return result;
}

/** How many connections the viewer shares with each of the other people. */
async function mutualConnectionCounts(viewerId, otherIds) {
  const others = [...new Set(otherIds.map(String))].filter((id) => id !== String(viewerId));
  const counts = new Map();
  if (others.length === 0) return counts;
  const graph = await connectionIdsByUser([viewerId, ...others]);
  const mine = graph.get(String(viewerId)) || new Set();
  for (const other of others) {
    let shared = 0;
    for (const id of graph.get(other) || []) {
      if (id !== String(viewerId) && id !== other && mine.has(id)) shared += 1;
    }
    counts.set(other, shared);
  }
  return counts;
}

// ── Shaping ──────────────────────────────────────────────────

/**
 * Seats taken: accepted requests (their party, and their kids where kids are welcome; one a family at a playdate),
 * plus `guestSeats`, the adults and kids of guests without an account who said they're in (planGuests.seatsOf),
 * counted from the moment they answer, also while they wait for the host's yes (K5).
 */
function seatsTaken(plan, requests, guestSeats = 0) {
  return (requests || [])
    .filter((r) => r.status === 'accepted' || r.status === 'paying')
    .reduce((sum, r) => sum + rules.seatsFor(plan, r.party_size, r.kids_count), 0) + (Number(guestSeats) || 0);
}

function waitlistOrder(requests) {
  return (requests || [])
    .filter((r) => r.status === 'waitlisted')
    .sort((a, b) => (new Date(a.queued_at) - new Date(b.queued_at)) || String(a.id).localeCompare(String(b.id)));
}

function viewerRole(plan, viewer, myRequest) {
  if (planBusiness.runsPlan(plan, viewer)) return 'host';
  if (myRequest?.status === 'accepted') return 'guest';
  return 'none';
}

/** The viewer's nearest location to the plan's public area point, in meters. */
function nearestLocationMeters(plan, viewer) {
  const area = areaPoint(plan);
  if (!area) return null;
  let best = null;
  for (const location of viewer.locations) {
    const d = rules.distanceMeters(location, area);
    if (d != null && (best == null || d < best)) best = d;
  }
  return best;
}

/** Which automatic rule would let this viewer in right now, if any. */
function matchingAutoRule(plan, viewer, ctx) {
  const autoRules = Array.isArray(plan.auto_rules) ? plan.auto_rules : [];
  // A business's plan has one rule: "right away, anyone" (for kids' sessions too), or the business approves each.
  if (plan.business_user_id) return autoRules.includes('open') ? 'open' : null;
  if (autoRules.length === 0 || plan.kind === 'playdate') return null;
  if (autoRules.includes('hosted_before') && ctx.hostedByHost.has(String(plan.host_user_id))) return 'hosted_before';
  if (plan.place_kind === 'home') return null;
  if (autoRules.includes('verified') && viewer.verified) return 'verified';
  if (autoRules.includes('anyone_nearby') && ['pickup_game', 'walk_coffee'].includes(plan.kind)) return 'anyone_nearby';
  return null;
}

/**
 * Can this viewer send an ask now, and why not.
 * Reasons: too_far, needs_location, full_use_waitlist, declined, removed,
 * blocked, too_many_requests, ended.
 * When the plan is full, `can_ask` is false with full_use_waitlist, and
 * POST /requests still works: it puts the viewer on the waitlist.
 */
function askEligibility(plan, viewer, ctx, { myRequest, spotsLeft, state }) {
  const no = (reason) => ({ can_ask: false, cannot_ask_reason: reason });
  if (planBusiness.runsPlan(plan, viewer)) return no(null);
  if (myRequest && ACTIVE_REQUEST_STATUSES.includes(myRequest.status)) return no(null);
  if (state === 'cancelled' || state === 'ended') return no('ended');
  if (!rules.isAskingOpen(plan, startsAt(plan), endsAt(plan))) return no('ended');
  // The host's invitation: no location, distance, ask-limit or "who can ask" rule. Saying no to someone, or removing
  // them, ends their invitations (planInvites.cancelForPerson).
  if (ctx.myInviteByPlan?.has(plan.post_id)) {
    if (viewer.blockedUserIds.has(String(plan.host_user_id))) return no('blocked');
    if (spotsLeft <= 0) return no('full_use_waitlist');
    return { can_ask: true, cannot_ask_reason: null };
  }
  if (myRequest?.status === 'declined') return no('declined');
  if (myRequest?.status === 'removed') return no('removed');
  if (viewer.blockedUserIds.has(String(plan.host_user_id))) return no('blocked');
  if (myRequest && myRequest.ask_count >= rules.LIMITS.asksPerPlan) return no('too_many_requests');
  if (ctx.viewerOpenRequestCount >= rules.LIMITS.openRequestsPerPerson) return no('too_many_requests');
  // Anyone on Pantopus nearby may ask, playdates included: a verified address is no longer a Plans rule (founder
  // decision, November 7), so join_requirement 'verified' (every playdate's, some older plans') asks for nothing more.
  if (viewer.locations.length === 0) return no('needs_location');
  const radius = plan.kind === 'playdate' ? rules.PLAYDATE_ASK_RADIUS_METERS : rules.ASK_RADIUS_METERS;
  const nearest = nearestLocationMeters(plan, viewer);
  if (nearest == null || nearest > radius) return no('too_far');
  if (spotsLeft <= 0) return no('full_use_waitlist');
  return { can_ask: true, cannot_ask_reason: null };
}

function myRequestView(plan, request, { waitlistPosition = null, guestOn = false } = {}) {
  if (!request) return null;
  const reconfirmNeeded = Boolean(request.reconfirm_requested_at) && request.reconfirmed == null && request.status === 'accepted';
  return {
    id: request.id,
    status: request.status,
    party_size: request.party_size,
    note: request.note || null,
    // A playdate's kids, or with kids welcome (H1, `guests=1`) how many kids come with this party.
    kids_count: plan.kind === 'playdate' || (guestOn && plan.kids_welcome) ? request.kids_count ?? null : null,
    kids_age_bands: plan.kind === 'playdate' ? request.kids_age_bands || [] : null,
    reconfirm_needed: reconfirmNeeded,
    // What the host's change asked about ('time', 'place' or 'both'), so the card says what the push said.
    reconfirm_reason: reconfirmNeeded ? request.reconfirm_reason || null : null,
    on_my_way: Boolean(request.on_my_way_at),
    waitlist_position: waitlistPosition,
    decided_by: request.decided_by || null,
    decided_at: iso(request.decided_at),
    // When they last asked (an ask after withdrawing, leaving or expiring counts; changing who's coming doesn't),
    // the same time the host's RequestView shows.
    created_at: iso(request.queued_at || request.created_at),
    asks_left: Math.max(0, rules.LIMITS.asksPerPlan - (request.ask_count || 1)),
    feedback: request.feedback || null,
  };
}

function publicDetails(plan) {
  const details = plan.details && typeof plan.details === 'object' ? plan.details : {};
  const out = {};
  for (const key of ['game', 'sport', 'level', 'extra_gear', 'kids_age_bands', 'walk_kind', 'pace', 'dogs_welcome',
    'subject', 'study_style', 'food_kind', 'game_kind', 'outdoor_kind']) {
    if (details[key] !== undefined && details[key] !== null) out[key] = details[key];
  }
  // Schedule facts are public; the host can choose a different party time.
  if (out.game && typeof out.game === 'object') {
    const game = out.game;
    out.game = { label: game.label || null, starts_at: iso(game.starts_at) };
    for (const [key, limit] of [['id', 80], ['team', 40], ['opponent', 60]]) {
      if (typeof game[key] === 'string') out.game[key] = game[key].slice(0, limit);
    }
    if (typeof game.home === 'boolean') out.game.home = game.home;
    if (game.ends_at) out.game.ends_at = iso(game.ends_at);
  }
  return out;
}

/** PlanCard: what anyone allowed to see the plan gets. */
function buildCard(plan, viewer, ctx) {
  const now = Date.now();
  const hostId = String(plan.host_user_id);
  const host = ctx.users.get(hostId);
  const requests = ctx.requestsByPlan.get(plan.post_id) || [];
  const myRequest = ctx.myRequestByPlan.get(plan.post_id) || null;
  const role = viewerRole(plan, viewer, myRequest);
  const isIn = role === 'host' || role === 'guest';
  const guestRows = ctx.guestRowsByPlan?.get(plan.post_id) || [];
  const going = seatsTaken(plan, requests, guests().seatsOf(guestRows));
  // H1's parts reach an app that sent `guests=1`, while the plan's host has the switch. An older app reads room over
  // 30 as 30 (K10).
  const guestOn = Boolean(viewer.guests) && Boolean(ctx.guestAnswersByHost?.get(hostId));
  const spotsShown = viewer.guests ? plan.spots : Math.min(plan.spots, rules.SPOTS_MAX);
  const spotsLeft = Math.max(0, spotsShown - going);
  const waitlist = waitlistOrder(requests);
  const state = rules.planState(plan, startsAt(plan), endsAt(plan), now);
  // A neighbor's playdate keeps its time until the family is in. A business's session for kids is a public class.
  const hideTime = plan.kind === 'playdate' && !isIn && !plan.business_user_id;
  const area = areaPoint(plan);
  const local = rules.localParts(startsAt(plan), rules.timezoneForPlan(plan));
  const myWaitIndex = myRequest?.status === 'waitlisted'
    ? waitlist.findIndex((r) => r.id === myRequest.id)
    : -1;
  const waitlistPosition = myWaitIndex >= 0 ? myWaitIndex + 1 : null;
  const myInvite = role === 'host' ? null : ctx.myInviteByPlan?.get(plan.post_id) || null;
  const autoRule = role === 'none' && !myInvite ? matchingAutoRule(plan, viewer, ctx) : null;
  const eligibility = askEligibility(plan, viewer, ctx, { myRequest, spotsLeft, state });
  const distanceFrom = viewer.origin;
  // Saying you're in to an invitation lets you in at once, unless the host must say yes first (needs_host_ok).
  const joinsAtOnce = Boolean(autoRule) || Boolean(myInvite && !myInvite.needs_host_ok);

  const card = {
    id: plan.post_id,
    kind: plan.kind,
    title: plan.post.title,
    about: plan.post.content || '',
    starts_at: hideTime ? null : startsAt(plan),
    ends_at: hideTime ? null : endsAt(plan),
    starts_on: local ? local.date : null,
    day_part: rules.dayPart(startsAt(plan), rules.timezoneForPlan(plan)),
    timezone: rules.timezoneForPlan(plan),
    area: {
      label: plan.area_label,
      city: plan.city || null,
      latitude: area ? area.latitude : null,
      longitude: area ? area.longitude : null,
      precision: plan.kind === 'playdate' && !plan.business_user_id ? 'neighborhood' : 'area',
    },
    // None for an online plan: nobody travels to it.
    distance_band: distanceFrom && area && !rules.isOnline(plan)
      ? rules.distanceBandFromMeters(rules.distanceMeters(distanceFrom, area)) : null,
    place_kind: plan.place_kind,
    // 'invited': a private plan. The app says "Private" and offers Invite where a public plan offers Share.
    audience: rules.isPrivate(plan) ? 'invited' : 'nearby',
    guests_can_invite: Boolean(plan.guests_can_invite),
    // A repeating plan: how often, which date of the series this is and when it ends. Null when it doesn't repeat.
    repeat: require('./planSeries').view(plan),
    host: {
      user_id: hostId,
      display_name: hostName(plan, host),
      avatar_url: hostAvatar(plan, host),
      verified_address: ctx.verified.has(hostId),
      plans_hosted: ctx.hostedCount.get(hostId) || 0,
      kind_hosted: ctx.hostedKindCount.get(`${hostId}:${plan.kind}`) || 0,
      mutual_connections: hostId === viewer.id ? 0 : ctx.mutualByHost.get(hostId) || 0,
      typical_answer_minutes: ctx.answerMinutesByHost.get(hostId) ?? null,
    },
    spots: spotsShown,
    going_count: going,
    spots_left: spotsLeft,
    is_full: spotsLeft <= 0,
    waitlist_count: waitlist.length,
    details: publicDetails(plan),
    how_people_get_in: joinsAtOnce ? 'automatic' : 'host_approves',
    join_requirement: plan.join_requirement,
    state,
    asking_closes_at: hideTime ? null : rules.askingClosesAt(plan.kind, startsAt(plan), endsAt(plan)).toISOString(),
    viewer: {
      role,
      request_status: myRequest ? myRequest.status : null,
      waitlist_position: waitlistPosition,
      can_ask: eligibility.can_ask,
      cannot_ask_reason: eligibility.cannot_ask_reason,
      auto_rule: autoRule,
      feedback_given: Boolean(myRequest?.feedback),
    },
    my_request: myRequestView(plan, myRequest, { waitlistPosition, guestOn }),
    // The viewer's invitation (planInvites.js), or null: the app says "Sam invited you" and offers I'm in.
    my_invite: invites().myInviteView(myInvite, { maybe: Boolean(viewer.guests), via: guestOn }),
    share_url: shareUrl(plan.post_id),
  };

  if (role === 'host') {
    card.requests_count = requests.filter((r) => r.status === 'pending').length;
    card.auto_rules = Array.isArray(plan.auto_rules) ? plan.auto_rules : [];
    const counts = ctx.inviteCountsByPlan?.get(plan.post_id) || { pending: 0, accepted: 0, declined: 0 };
    card.invites = {
      can_invite: Boolean(viewer.invitesFlag) && plan.status === 'open'
        && rules.isAskingOpen(plan, startsAt(plan), endsAt(plan), now)
        // A business that may no longer host invites nobody (planInvites.assertInvitable).
        && (!plan.business_user_id || planBusiness.hostsNow(plan)),
      invited: counts.pending || 0,
      said_yes: counts.accepted || 0,
      cant_make_it: counts.declined || 0,
    };
  }
  if (plan.business_user_id) addBusinessFields(card, plan, viewer, ctx);
  if (rules.isPrivate(plan)) addPrivateFields(card, plan, viewer, ctx, { role, myInvite });
  if (guestOn) guests().addCardFields(card, plan, { role, requests, guestRows, counts: ctx.inviteCountsByPlan?.get(plan.post_id) });
  // The occasion that started the plan (H3), while its host has the switch: the tag reads its name in place of the
  // kind's. An added field older apps ignore; the kind, its color and its pin don't change.
  if (plan.occasion && ctx.occasionByHost?.get(hostId)) {
    const occasion = require('./planOccasions').view(plan.occasion);
    if (occasion) card.occasion = occasion;
  }
  // A business's plan's deal (B1, contract 9.2), with `biz=1` (a business's plan reaches no other app) while the
  // business has the switch. An added field.
  if (plan.business_user_id && plan.deal && ctx.dealsByHost?.get(hostId)) {
    const deal = require('./planDeals').cardView(plan.deal, {
      role, going, plan, paid: Boolean(card.price),
      request: myRequest ? { ...myRequest, deal_used_at: ctx.dealUsedByRequest?.get(myRequest.id) || null,
        unit_price_cents: ctx.moneyByRequest?.get(myRequest.id)?.unit_price_cents ?? null } : null,
      firstName: role === 'guest' && ctx.users.get(viewer.id) ? firstName(ctx.users.get(viewer.id)) : null,
    });
    if (deal) card.deal = deal;
  }
  // The bring list (H2), for the host and the people in, while the host has the switch. An added field older apps
  // ignore, so it needs no marker.
  if (isIn && plan.bring_list && ctx.bringByHost?.get(hostId)) {
    const planBring = require('./planBring');
    const bring = planBring.view(plan.bring_list, planBring.mineFor({ role, requestId: myRequest?.status === 'accepted' ? myRequest.id : null }));
    if (bring) card.bring = bring;
  }
  // Find a date (the extras, 08-extras section 2), with `extras=1` (no other app gets a plan that is picking): the
  // times, how many can make each and the reader's own ticks; for the host, who and the favorite. Lists say "Picking
  // a date" where the time shows.
  if (viewer.extras && ctx.datesPartsByPlan?.has(plan.post_id)) {
    const parts = ctx.datesPartsByPlan.get(plan.post_id);
    const dates = require('./planDates').view(plan, {
      mineKey: role === 'host' ? null : require('./planExtras').personKey(viewer.id),
      host: role === 'host', names: parts.names, invited: parts.invited,
    });
    if (dates) {
      card.dates = dates;
      card.time_text = 'Picking a date';
      // Whoever saved their times has answered: not "no answer" on the host's card.
      if (card.answers) card.answers.no_answer = Math.max(0, card.answers.no_answer - dates.answered);
    }
  }
  // The gift exchange (the extras, 08-extras section 4), with `extras=1`, for the host and the people in. Whom someone
  // drew is in their own card only (giftGivingByPlan holds the viewer's own, read for them alone).
  if (isIn && viewer.extras && plan.gift && ctx.giftByHost?.get(hostId) && require('./planExtras').takesExtras(plan)) {
    const planGift = require('./planGift');
    const gift = planGift.view(plan, {
      mineKey: role === 'host' ? planGift.hostKey(plan) : require('./planExtras').personKey(viewer.id),
      isIn, giving: ctx.giftGivingByPlan?.get(plan.post_id) || null,
    });
    if (gift) card.gift = gift;
  }
  // Photos afterwards (the extras, 08-extras section 5), with `extras=1`, on a plan that is over, for the host and the
  // people who were in at the end. The pictures come from GET …/photos as links that last minutes.
  if (isIn && viewer.extras && ctx.photosByHost?.get(hostId) && require('./planExtras').takesExtras(plan)) {
    const photos = require('./planPhotos').cardView(plan, { mineKey: require('./planExtras').personKey(viewer.id), comeCount: going + 1 });
    if (photos) card.photos = photos;
  }
  // Chip in (the extras, 08-extras section 3), with `extras=1`, for the host and the people in, while the host has
  // the switch. The payment link reaches nobody else.
  if (isIn && viewer.extras && plan.chip_in && ctx.chipInByHost?.get(hostId) && require('./planExtras').takesExtras(plan)) {
    const chipIn = require('./planChipIn').view(plan.chip_in, {
      keys: extrasKeysIn(plan, requests, guestRows),
      mineKey: role === 'guest' ? require('./planExtras').personKey(viewer.id) : null,
      hostFirst: firstName(host),
    });
    if (chipIn) card.chip_in = chipIn;
  }
  return card;
}

/** The people in, as the extras count them (planExtras.keysIn), from what the card already read. */
function extrasKeysIn(plan, requests, guestRows) {
  const extras = require('./planExtras');
  const accounts = requests.filter((r) => r.status === 'accepted' && String(r.user_id) !== String(plan.host_user_id))
    .map((r) => extras.personKey(r.user_id));
  const rows = (guestRows || []).filter((r) => r.status === 'accepted' && !r.needs_host_ok).map((r) => extras.guestKey(r.id));
  return [...accounts, ...rows];
}

/**
 * What a private plan adds to its card. The person invited reads where it is before they answer, when it is a
 * public place and the invitation is the host's yes (not an email opened by another account, which waits for the
 * host); a home's address still arrives only once they are in (buildDetail). A guest the host invited may bring
 * one friend when the host allowed it.
 */
function addPrivateFields(card, plan, viewer, ctx, { role, myInvite }) {
  if (role === 'none' && myInvite && !myInvite.needs_host_ok && plan.place_kind === 'public') {
    const exact = exactPoint(plan);
    card.place = {
      name: plan.place_name || plan.area_label,
      address: plan.place_address || null,
      latitude: exact.latitude,
      longitude: exact.longitude,
    };
    if (viewer.origin) card.distance_band = rules.distanceBandFromMeters(rules.distanceMeters(viewer.origin, exact));
  }
  card.viewer.friend_invite = null;
  if (role === 'guest' && plan.guests_can_invite && myInvite && String(myInvite.host_user_id) === String(plan.host_user_id)) {
    const used = ctx.friendLinkPlans?.has(plan.post_id) || false;
    const open = plan.status === 'open' && rules.isAskingOpen(plan, startsAt(plan), endsAt(plan));
    card.viewer.friend_invite = { can_invite: Boolean(viewer.invitesFlag) && open && !used, used };
  }
}

/**
 * What a business's plan adds to its card (the build contract's section 5.4). Only ever sent to a viewer the
 * plan is shown to (isVisibleTo), so only to an app that asked for it; a neighbor's plan gets none of these keys.
 * The place is public for a business's plan: it is the business's own address.
 */
function addBusinessFields(card, plan, viewer, ctx) {
  const exact = exactPoint(plan);
  card.business = planBusiness.publicBusiness(plan, { plansHosted: ctx.hostedCount.get(String(plan.host_user_id)) || 0 });
  const label = planBusiness.labelView(plan);
  card.label = label ? label.key : null;
  card.label_text = label ? label.text : null;
  card.place = {
    name: plan.place_name || plan.area_label,
    address: plan.place_address || null,
    latitude: exact.latitude,
    longitude: exact.longitude,
  };
  if (viewer.origin) card.distance_band = rules.distanceBandFromMeters(rules.distanceMeters(viewer.origin, exact));
  // Null is "Free". A price (B2) while the business has the switch.
  const paidOn = Boolean(plan.price_cents && ctx.paidByHost?.get(String(plan.host_user_id)));
  // What one spot costs now: with deals on, a deal for everyone or a group price that unlocked (B4).
  const unitNow = paidOn && plan.deal && ctx.dealsByHost?.get(String(plan.host_user_id)) ? require('./planDeals').spotPriceNow(plan) : plan.price_cents;
  card.price = paidOn ? require('./planPaid').priceView(plan, unitNow) : null;
  if (paidOn) {
    const myRequest = ctx.myRequestByPlan.get(plan.post_id) || null;
    const money = myRequest ? ctx.moneyByRequest?.get(myRequest.id) : null;
    if (money && myRequest.status === 'paying' && card.my_request) card.my_request.hold_expires_at = iso(money.hold_expires_at);
    const paid = money ? require('./planPaid').paidView(plan, { ...money, status: myRequest.status,
      reconfirm_requested_at: myRequest.reconfirm_requested_at, reconfirmed: myRequest.reconfirmed }, money.payment?.metadata?.receipt_mail_id || null) : null;
    if (paid && myRequest.status === 'accepted') card.paid = paid;
    // "Leave a tip for {business}?" (C4, B6): once, for 7 days after the plan ends.
    if (paid && myRequest.status === 'accepted' && ctx.tipsByHost?.get(String(plan.host_user_id))) {
      const tipLater = require('./planChecks').tipLaterView(plan, paid.cents - (paid.refunded_cents || 0), ctx.tippedRequests.has(myRequest.id));
      if (tipLater) card.tip_later = tipLater;
    }
  }
  // "Pay at {business}" (D2, B5) for the business's staff and the guests who are in, while it has the switch.
  if (plan.pay_here && ctx.payHereByHost?.get(String(plan.host_user_id))) {
    const role = card.viewer?.role;
    const isIn = card.viewer?.request_status === 'accepted';
    if (role === 'host' || isIn) card.pay_here = require('./planChecks').cardView(plan, card.business?.name);
  }
  card.guests_can_invite = Boolean(plan.guests_can_invite);
  card.more_times = moreTimesView(ctx.moreTimesByPlan?.get(plan.post_id));
}

const MORE_TIMES_SHOWN = 6;

/** A venue's later plans folded under its soonest: how many, and the first few as short lines. */
function moreTimesView(others) {
  if (!others || others.length === 0) return null;
  return {
    count: others.length,
    items: others.slice(0, MORE_TIMES_SHOWN).map((plan) => {
      const label = planBusiness.labelView(plan);
      return {
        id: plan.post_id,
        title: plan.post.title,
        label: label ? label.key : null,
        label_text: label ? label.text : null,
        starts_at: startsAt(plan),
        timezone: rules.timezoneForPlan(plan),
      };
    }),
  };
}

/**
 * One row and one pin for a venue: of a business's plans at one of its locations, the soonest leads and the
 * later ones fold under it. `plans` is soonest first; neighbors' plans pass through untouched.
 * @returns {{ plans: object[], more: Map<string, object[]> }} the list without the folded plans, and each
 *   lead plan's id → the plans folded under it
 */
function foldVenues(plans) {
  const leads = new Map();
  const more = new Map();
  const kept = [];
  for (const plan of plans) {
    if (!plan.business_user_id) { kept.push(plan); continue; }
    const venue = `${plan.business_user_id}:${plan.business_location_id}`;
    const lead = leads.get(venue);
    if (!lead) {
      leads.set(venue, plan);
      kept.push(plan);
    } else {
      if (!more.has(lead.post_id)) more.set(lead.post_id, []);
      more.get(lead.post_id).push(plan);
    }
  }
  return { plans: kept, more };
}

/** PlanDetail: the card plus the private parts, only for the host and people who are in. */
function buildDetail(plan, viewer, ctx) {
  const card = buildCard(plan, viewer, ctx);
  if (card.viewer.role !== 'host' && card.viewer.role !== 'guest') return card;

  const hostId = String(plan.host_user_id);
  const host = ctx.users.get(hostId);
  const exact = exactPoint(plan);
  const viewerIsHost = card.viewer.role === 'host';
  const requests = ctx.requestsByPlan.get(plan.post_id) || [];

  if (rules.isOnline(plan)) {
    // No point, no address and no distance: the link, and the name of the site it opens ("meet.google.com").
    const parsed = require('./planPlace').parseOnlineLink(plan.online_link, rules.ONLINE_LINK_MAX);
    card.place = {
      name: plan.place_name || 'Online',
      address: null,
      latitude: null,
      longitude: null,
      note: plan.guest_note || null,
      link: plan.online_link || null,
      link_host: parsed ? parsed.host : null,
    };
  } else {
    card.place = {
      name: plan.place_kind === 'home' ? `${firstName(host)}'s place` : (plan.place_name || plan.area_label),
      address: plan.place_address || null,
      latitude: exact.latitude,
      longitude: exact.longitude,
      note: plan.guest_note || null,
    };
    if (viewer.origin) {
      card.distance_band = rules.distanceBandFromMeters(rules.distanceMeters(viewer.origin, exact));
    }
  }

  const people = [{
    user_id: hostId,
    display_name: hostName(plan, host),
    avatar_url: hostAvatar(plan, host),
    party_size: 1,
    verified_address: ctx.verified.has(hostId),
    is_host: true,
    on_my_way: false,
  }];
  const accepted = requests
    .filter((r) => r.status === 'accepted')
    .sort((a, b) => new Date(a.decided_at || a.created_at) - new Date(b.decided_at || b.created_at));
  for (const request of accepted) {
    const userId = String(request.user_id);
    if (userId !== viewer.id && viewer.blockedUserIds.has(userId)) continue;
    const person = ctx.users.get(userId);
    const entry = {
      user_id: userId,
      display_name: displayName(person),
      avatar_url: avatarUrl(person),
      party_size: request.party_size,
      verified_address: ctx.verified.has(userId),
      is_host: false,
      on_my_way: Boolean(request.on_my_way_at),
    };
    // With kids welcome (H1, `guests=1`): how many kids come with each party, for the people line.
    if (card.kids_welcome !== undefined && plan.kids_welcome) entry.kids_count = request.kids_count ?? 0;
    if (viewerIsHost) {
      entry.request_id = request.id;
      entry.distance_band = request.distance_band || null;
      entry.kids_count = plan.kind === 'playdate' ? request.kids_count ?? null : entry.kids_count;
      entry.kids_age_bands = plan.kind === 'playdate' ? request.kids_age_bands || [] : undefined;
      entry.reconfirm_needed = Boolean(request.reconfirm_requested_at) && request.reconfirmed == null;
      const stats = ctx.peopleStats.get(userId) || { plans_joined: 0, hosted_before: false };
      entry.hosted_before = stats.hosted_before;
      entry.plans_joined = stats.plans_joined;
      entry.new_to_pantopus = isNewAccount(person);
      if (plan.business_user_id) {
        // A business's team sees less than a neighbor host: a first name, who is coming, and whether they have
        // been before. Never a last initial, how far away they live, their address standing or what else they
        // have joined.
        entry.display_name = firstName(person);
        entry.verified_address = false;
        entry.distance_band = null;
        entry.plans_joined = 0;
        entry.new_to_pantopus = false;
        // Who paid, and who brought them (B2), on a priced plan while the business has the switch.
        const money = card.price ? ctx.moneyByRequest?.get(request.id) : null;
        if (money?.paid_cents) {
          entry.paid = { cents: money.paid_cents, text: require('./planPaid').moneyText(money.paid_cents),
            refunded_cents: money.refunded_cents || 0, brought_by: money.fee_basis === 'own' ? 'own' : 'pantopus' };
        }
        // "Mark used" on the roster (B1): the guest's free thing, ready or used, while the deal gives one.
        if (card.deal) {
          const given = require('./planDeals').givenNow(plan.deal);
          const usedAt = ctx.dealUsedByRequest?.get(request.id) || null;
          if (given?.kind === 'free_item' || usedAt) entry.deal = { state: usedAt ? 'used' : 'ready', used_at: usedAt };
        }
      }
    }
    people.push(entry);
  }
  // Guests without an account who are in (H1, `guests=1` only): a name and their numbers, no account.
  if (card.kids_welcome !== undefined) people.push(...guests().peopleEntries(plan, ctx.guestRowsByPlan?.get(plan.post_id) || [], { viewerIsHost }));
  // Chip in: who said they paid, on each row the host sees ("paid", and "Mark paid" with POST …/chip-in/paid).
  if (viewerIsHost && card.chip_in) {
    const extras = require('./planExtras');
    const paid = require('./planChipIn').paidSet(plan.chip_in);
    for (const entry of people) {
      if (entry.is_host) continue;
      const key = entry.user_id ? extras.personKey(entry.user_id) : entry.guest_id ? extras.guestKey(entry.guest_id) : null;
      if (key) entry.chip_in = { paid: paid.has(key), who: key };
    }
  }
  card.people = people;
  // A business's team is not in its plan's chat yet (planChat.ensureRoom): the room is the guests'.
  const hasChat = Boolean(plan.chat_room_id) && !(plan.business_user_id && viewerIsHost);
  card.chat_room_id = hasChat ? plan.chat_room_id : null;
  card.chat_open = hasChat && !plan.chat_closed_at && plan.status !== 'cancelled';
  if (plan.status === 'cancelled') card.cancel_note = plan.cancel_note || null;
  return card;
}

function isNewAccount(user) {
  if (!user?.created_at) return false;
  return Date.now() - new Date(user.created_at).getTime() < NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

// ── Queries ──────────────────────────────────────────────────

function windowMatches(plan, window, now = Date.now()) {
  const start = new Date(startsAt(plan)).getTime();
  const end = new Date(endsAt(plan)).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now) return false;
  const tz = rules.timezoneForPlan(plan);
  const live = start <= now;
  switch (window) {
    case 'now':
      return live || start - now <= 60 * 60 * 1000;
    case 'today': {
      const today = rules.localParts(new Date(now), tz).date;
      return live || rules.localParts(new Date(start), tz).date === today;
    }
    case 'weekend': {
      const todayParts = rules.localParts(new Date(now), tz);
      const startParts = rules.localParts(new Date(start), tz);
      const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const todayIdx = dayIndex[todayParts.weekday];
      // This weekend: the coming Saturday and Sunday (today included when it is one).
      const daysToSat = todayIdx === 0 ? -1 : 6 - todayIdx;
      const sat = new Date(now + daysToSat * 24 * 60 * 60 * 1000);
      const sun = new Date(sat.getTime() + 24 * 60 * 60 * 1000);
      const satDate = rules.localParts(sat, tz).date;
      const sunDate = rules.localParts(sun, tz).date;
      return startParts.date === satDate || startParts.date === sunDate || (live && [satDate, sunDate].includes(todayParts.date));
    }
    case 'week':
    default:
      return start - now <= 7 * 24 * 60 * 60 * 1000;
  }
}

function boundingBox(point, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.01));
  return {
    south: point.latitude - latDelta,
    north: point.latitude + latDelta,
    west: point.longitude - lngDelta,
    east: point.longitude + lngDelta,
  };
}

/**
 * Only the plans an app without `more=1` can draw: the five kinds, never online. Applied to a Plan query, for a
 * viewer without `more` (isVisibleTo would drop the rest anyway; leaving them out keeps them from using the limit).
 */
function drawableBy(query, viewer, kinds) {
  if (viewer?.more) return kinds && kinds.length > 0 ? query.in('kind', kinds) : query;
  // Asked only for kinds this app can't draw: nothing (an empty `in`), never every kind.
  const known = kinds && kinds.length > 0 ? kinds.filter((kind) => rules.KINDS.includes(kind)) : rules.KINDS;
  return query.in('kind', known).neq('place_kind', 'online');
}

/**
 * Open plans whose public area point is inside the box. Businesses' plans are read only with `biz` (a viewer
 * they exist for: `viewer.biz`), and come back with their business attached. Online plans and the newer kinds
 * only with `more` (viewer.more), and online plans not at all with `online: false` (the map: they have no pin).
 */
async function queryOpenPlansInBox(box, { kinds, scopeAccess, biz = false, more = false, online = true } = {}) {
  let query = supabaseAdmin
    .from('Plan')
    .select(PLAN_SELECT)
    // Never a private plan: those reach their own people through ownPrivatePlans, once.
    .eq('audience', 'nearby')
    .eq('status', 'open')
    .is('post.archived_at', null)
    .eq('post.moderation_state', 'live')
    .gt('post.event_end_date', new Date().toISOString())
    .gte('post.latitude', box.south)
    .lte('post.latitude', box.north)
    .gte('post.longitude', box.west)
    .lte('post.longitude', box.east)
    .limit(500);
  query = drawableBy(query, { more }, kinds);
  if (more && !online) query = query.neq('place_kind', 'online');
  if (!biz) query = query.is('business_user_id', null);
  query = (scopeAccess || await postScopeAccess(null)).query(query, 'post');
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load nearby plans: ${error.message}`);
  return biz ? planBusiness.attachBusinessHosts(data || []) : data || [];
}

/**
 * The viewer's own private plans that are still open: the ones they host, are invited to (not taken back, not
 * answered "can't make it") or are in or waiting on. These join the nearby list and the map for this viewer
 * only; queryOpenPlansInBox never reads a private plan.
 */
async function ownPrivatePlans(viewer, { kinds, online = true } = {}) {
  const [requests, invited] = await Promise.all([
    supabaseAdmin.from('PlanRequest').select('post_id').eq('user_id', viewer.id).in('status', ACTIVE_REQUEST_STATUSES).limit(200),
    supabaseAdmin.from('PlanInvite').select('post_id').eq('invitee_user_id', viewer.id).in('status', ['pending', 'accepted', 'maybe']).limit(200),
  ]);
  if (requests.error || invited.error) throw new Error(`Failed to load your plans: ${(requests.error || invited.error).message}`);
  const ids = [...new Set([...(requests.data || []), ...(invited.data || [])].map((row) => row.post_id))];
  const open = (query) => {
    let q = query.eq('audience', 'invited').eq('status', 'open')
      .is('post.archived_at', null).eq('post.moderation_state', 'live')
      .gt('post.event_end_date', new Date().toISOString());
    q = drawableBy(q, viewer, kinds);
    if (viewer.more && !online) q = q.neq('place_kind', 'online');
    return q.limit(200);
  };
  const [hosted, others] = await Promise.all([
    open(supabaseAdmin.from('Plan').select(PLAN_SELECT).eq('host_user_id', viewer.id)),
    ids.length ? open(supabaseAdmin.from('Plan').select(PLAN_SELECT).in('post_id', ids)) : { data: [] },
  ]);
  if (hosted.error || others.error) throw new Error(`Failed to load your plans: ${(hosted.error || others.error).message}`);
  const byId = new Map();
  for (const plan of [...(hosted.data || []), ...(others.data || [])]) byId.set(plan.post_id, plan);
  return [...byId.values()].filter((plan) => isVisibleTo(plan, viewer, { involved: true }));
}

function encodeCursor(plan) {
  return Buffer.from(`${startsAt(plan)}|${plan.post_id}`).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const time = new Date(at).getTime();
    if (!Number.isFinite(time) || !isUuid(id)) return null;
    return { time, id };
  } catch (_) {
    return null;
  }
}

function soonestFirst(a, b) {
  return (new Date(startsAt(a)) - new Date(startsAt(b))) || String(a.post_id).localeCompare(String(b.post_id));
}

/** Who hosts: `all`, `neighbors` or `businesses` (the list's filter). Anything else is `all`. */
function hostFilter(value) {
  return value === 'neighbors' || value === 'businesses' ? value : 'all';
}

function hostedBy(plan, host) {
  if (host === 'neighbors') return !plan.business_user_id;
  if (host === 'businesses') return Boolean(plan.business_user_id);
  return true;
}

/**
 * GET /api/plans: the list under the map, soonest first, within 5 miles of the point. Neighbors' and
 * businesses' plans share the one order; nothing moves a plan up. For a viewer businesses' plans exist for,
 * `host` filters by who hosts, and a venue's later plans fold under its soonest.
 */
async function listNearby(viewer, { point, window = 'week', kinds = [], cursor = null, host = 'all' }) {
  const box = boundingBox(point, rules.LIST_RADIUS_METERS);
  const [publicRows, ownPrivate] = await Promise.all([
    queryOpenPlansInBox(box, { kinds, scopeAccess: viewer.scopeAccess, biz: viewer.biz, more: viewer.more }),
    ownPrivatePlans(viewer, { kinds }),
  ]);
  const after = decodeCursor(cursor);
  const inWindow = [...publicRows.filter((plan) => isVisibleTo(plan, viewer)), ...ownPrivate]
    .filter((plan) => {
      const area = areaPoint(plan);
      const d = area ? rules.distanceMeters(point, area) : null;
      return d != null && d <= rules.LIST_RADIUS_METERS;
    })
    .filter((plan) => windowMatches(plan, window))
    .sort(soonestFirst);
  const wanted = viewer.biz ? hostFilter(host) : 'all';
  const folded = foldVenues(inWindow.filter((plan) => hostedBy(plan, wanted)));
  const matching = folded.plans
    .filter((plan) => {
      if (!after) return true;
      const t = new Date(startsAt(plan)).getTime();
      return t > after.time || (t === after.time && String(plan.post_id) > after.id);
    });

  const page = matching.slice(0, PAGE_SIZE);
  const ctx = await loadCardContext(page, viewer);
  ctx.moreTimesByPlan = folded.more;
  const items = page.map((plan) => buildCard(plan, viewer, ctx));
  const nextCursor = matching.length > PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null;

  let nearestElsewhere = null;
  if (items.length === 0 && !after) {
    nearestElsewhere = await findNearestElsewhere(viewer, point, { window, kinds });
  }
  const result = { items, next_cursor: nextCursor, nearest_elsewhere: nearestElsewhere };
  // The app shows the All / Neighbors / Businesses filter only once a business has a plan here.
  if (viewer.biz) result.has_business_plans = inWindow.some((plan) => plan.business_user_id);
  return result;
}

/** For the empty list (F4): the closest town with plans within 15 miles, as a count and a band. */
async function findNearestElsewhere(viewer, point, { window, kinds }) {
  try {
    const rows = await queryOpenPlansInBox(boundingBox(point, 15 * rules.MILE_METERS), {
      kinds, scopeAccess: viewer.scopeAccess, biz: viewer.biz, more: viewer.more,
    });
    const byCity = new Map();
    for (const plan of rows) {
      if (!isVisibleTo(plan, viewer) || !windowMatches(plan, window)) continue;
      const area = areaPoint(plan);
      const d = area ? rules.distanceMeters(point, area) : null;
      if (d == null || d <= rules.LIST_RADIUS_METERS || d > 15 * rules.MILE_METERS) continue;
      const key = plan.city || plan.area_label;
      const entry = byCity.get(key) || { city: key, count: 0, meters: d };
      entry.count += 1;
      entry.meters = Math.min(entry.meters, d);
      byCity.set(key, entry);
    }
    const closest = [...byCity.values()].sort((a, b) => a.meters - b.meters)[0];
    if (!closest) return null;
    return {
      city: closest.city,
      count: closest.count,
      miles: Math.max(1, Math.round(closest.meters / rules.MILE_METERS)),
    };
  } catch (err) {
    logger.warn('plans.nearby_elsewhere.failed', { error: err.message });
    return null;
  }
}

/** GET /api/plans/mine: Your plans and Today. */
async function listMine(viewer) {
  const nowIso = new Date().toISOString();
  const recentIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  // The plans of the businesses the viewer posts or runs plans for, read apart from their own so that neither
  // crowds the other out of its limit (buildCard gives the host's card only for the ones they run).
  const businessIds = [...new Set([...(viewer.businessPost || []), ...(viewer.businessManage || [])])];
  const [hosting, requests, invitedIds, businessHosting] = await Promise.all([
    supabaseAdmin.from('Plan').select(PLAN_SELECT)
      .eq('host_user_id', viewer.id)
      .in('status', ['open', 'ended'])
      .gt('post.event_end_date', recentIso)
      .limit(50),
    supabaseAdmin.from('PlanRequest')
      .select('post_id, status')
      .eq('user_id', viewer.id)
      .in('status', ACTIVE_REQUEST_STATUSES)
      .limit(200),
    invites().invitedPlanIds(viewer.id),
    businessIds.length === 0 ? { data: [] } : supabaseAdmin.from('Plan').select(PLAN_SELECT)
      .in('business_user_id', businessIds)
      .in('status', ['open', 'ended'])
      .gt('post.event_end_date', recentIso)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (hosting.error) throw new Error(`Failed to load your plans: ${hosting.error.message}`);
  if (requests.error) throw new Error(`Failed to load your requests: ${requests.error.message}`);
  if (businessHosting.error) throw new Error(`Failed to load your business's plans: ${businessHosting.error.message}`);

  // The plans the viewer is in or waiting on: they keep reading those even when a business may no longer host.
  const involvedIds = new Set((requests.data || []).map((r) => r.post_id));
  // A private plan is read by the people invited to it too.
  const invitedSet = new Set(invitedIds);
  const requestedRows = await loadPlanRows([...involvedIds, ...invitedIds]);
  const all = new Map();
  for (const plan of [...(hosting.data || []), ...await planBusiness.attachBusinessHosts(businessHosting.data || []), ...requestedRows]) {
    all.set(plan.post_id, plan);
  }
  const visible = [...all.values()]
    .filter((plan) => isVisibleTo(plan, viewer, {
      involved: involvedIds.has(plan.post_id) || (rules.isPrivate(plan) && invitedSet.has(plan.post_id)),
    }) && plan.status !== 'cancelled');
  const ctx = await loadCardContext(visible, viewer);

  const out = {
    // invited: plans someone invited the viewer to that they haven't answered (planInvites.js).
    hosting: [], going: [], asked: [], waitlisted: [], invited: [], recent: [],
    // The viewer's own standing: the host's own "Verified" in the composer's preview, and whether playdates show.
    // Apps before November 7 also sent people without a verified address from the playdate card to "Verify your
    // address"; since then anyone on Pantopus may host one, so both fields stay for those apps.
    viewer: { verified_address: Boolean(viewer.verified), sees_playdates: Boolean(viewer.seesPlaydates) },
  };
  for (const plan of visible.sort(soonestFirst)) {
    const ended = new Date(endsAt(plan)).getTime() <= Date.now() || plan.status === 'ended';
    const card = buildCard(plan, viewer, ctx);
    const status = card.viewer.request_status;
    if (ended) {
      // A5: how was it (guests who were in) and host again (hosts), for two days.
      if (new Date(endsAt(plan)).toISOString() >= recentIso && (card.viewer.role === 'host' || status === 'accepted')) {
        out.recent.push(card);
      }
      continue;
    }
    if (endsAt(plan) <= nowIso) continue;
    if (card.viewer.role === 'host') out.hosting.push(card);
    else if (status === 'accepted') out.going.push(card);
    else if (status === 'pending') out.asked.push(card);
    else if (status === 'waitlisted') out.waitlisted.push(card);
    else if (['pending', 'maybe'].includes(card.my_invite?.status) && rules.isAskingOpen(plan, startsAt(plan), endsAt(plan))) out.invited.push(card);
  }
  return out;
}

/**
 * Is this viewer in, or waiting on, this business's plan? Asked only in the rare state where it matters: the
 * plan's business may no longer host, and the viewer would otherwise lose a plan they still have to leave.
 * No read for a neighbor's plan, a business in good standing, or a viewer businesses' plans don't exist for.
 */
async function isInvolved(plan, viewer) {
  if (rules.isPrivate(plan)) return isPartOfPrivatePlan(plan, viewer);
  if (!plan || !plan.business_user_id || !viewer.biz || planBusiness.shownTo(plan, viewer)) return false;
  // Nothing to look up where the answer can't change: the viewer's own side doesn't hold, or they run the plan.
  if (!planBusiness.shownTo(plan, viewer, { involved: true }) || planBusiness.runsPlan(plan, viewer)) return false;
  // Once the plan is cancelled, the people who were still waiting may read what happened too.
  const statuses = plan.status === 'cancelled' ? [...ACTIVE_REQUEST_STATUSES, 'expired'] : ACTIVE_REQUEST_STATUSES;
  const { data, error } = await supabaseAdmin.from('PlanRequest').select('id')
    .eq('post_id', plan.post_id).eq('user_id', viewer.id).in('status', statuses).limit(1);
  if (error) throw new Error(`Failed to load your request: ${error.message}`);
  return Boolean(data && data.length);
}

/**
 * Is this viewer part of this private plan: its host, someone invited (an invitation not taken back; one answered
 * "can't make it" still counts, so they can change their mind), or someone in or waiting? Someone the host said no
 * to or removed is not: their invitations ended with it (planInvites.cancelForPerson).
 */
async function isPartOfPrivatePlan(plan, viewer) {
  if (String(plan.host_user_id) === String(viewer.id)) return true;
  const [invite, request] = await Promise.all([
    supabaseAdmin.from('PlanInvite').select('id').eq('post_id', plan.post_id).eq('invitee_user_id', viewer.id)
      .in('status', ['pending', 'accepted', 'declined', 'maybe']).limit(1),
    supabaseAdmin.from('PlanRequest').select('id').eq('post_id', plan.post_id).eq('user_id', viewer.id)
      .in('status', ACTIVE_REQUEST_STATUSES).limit(1),
  ]);
  if (invite.error || request.error) throw new Error(`Failed to check the plan: ${(invite.error || request.error).message}`);
  return Boolean((invite.data && invite.data.length) || (request.data && request.data.length));
}

const BUSINESS_PAGE_PLANS = 20;

/**
 * GET /api/businesses/:id/plans: a business's upcoming plans for its page (board B6), soonest first, as cards.
 * Only what this viewer may see: nothing without the switch, from an app that can't draw them, or once the
 * business may no longer host. `plans_hosted` counts the plans it has finished.
 */
async function listForBusiness(viewer, businessUserId) {
  const empty = { items: [], plans_hosted: 0 };
  if (!viewer.biz || !isUuid(businessUserId)) return empty;
  const { data, error } = await supabaseAdmin.from('Plan').select(PLAN_SELECT)
    .eq('business_user_id', businessUserId)
    .eq('status', 'open')
    .is('post.archived_at', null)
    .eq('post.moderation_state', 'live')
    .gt('post.event_end_date', new Date().toISOString())
    .limit(100);
  if (error) throw new Error(`Failed to load the business's plans: ${error.message}`);
  const visible = (await planBusiness.attachBusinessHosts(data || []))
    .filter((plan) => isVisibleTo(plan, viewer))
    .sort(soonestFirst)
    .slice(0, BUSINESS_PAGE_PLANS);
  if (visible.length === 0) return empty;
  const ctx = await loadCardContext(visible, viewer);
  return {
    items: visible.map((plan) => buildCard(plan, viewer, ctx)),
    plans_hosted: ctx.hostedCount.get(String(businessUserId)) || 0,
  };
}

/**
 * GET /api/plans/:id: PlanDetail for the host and people who are in, PlanCard
 * for everyone else who may see it, null (404) otherwise.
 */
async function getForViewer(postId, viewer) {
  if (!isUuid(postId)) return { plan: null, body: null };
  const plan = await loadPlanRow(postId);
  if (!plan) return { plan: null, body: null };
  if (!isVisibleTo(plan, viewer, { involved: await isInvolved(plan, viewer) })) return { plan, body: null };
  const ctx = await loadCardContext([plan], viewer, { withPeople: true });
  return { plan, body: buildDetail(plan, viewer, ctx) };
}

module.exports = {
  PLAN_SELECT,
  REQUEST_COLUMNS,
  USER_COLUMNS,
  ACTIVE_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  NO_NAME,
  displayName,
  hostName,
  hostAvatar,
  firstName,
  avatarUrl,
  withLocalAvatar,
  shareUrl,
  startsAt,
  endsAt,
  areaPoint,
  exactPoint,
  iso,
  isUuid,
  isVisibleTo,
  isInvolved,
  loadPlanRow,
  loadPlanRows,
  loadCardContext,
  buildCard,
  buildDetail,
  seatsTaken,
  waitlistOrder,
  matchingAutoRule,
  askEligibility,
  nearestLocationMeters,
  mutualConnectionCounts,
  connectionIdsByUser,
  requesterStats,
  typicalAnswerMinutes,
  listNearby,
  listMine,
  getForViewer,
  queryOpenPlansInBox,
  ownPrivatePlans,
  windowMatches,
  boundingBox,
  soonestFirst,
  listForBusiness,
  foldVenues,
  hostFilter,
  hostedBy,
};
