'use strict';

/**
 * Plans for the holidays, the extras: one person pays for the group (docs/product/plans-holidays/08-extras.md,
 * section 7; contract 10.2 and 10.4; the founder's go on November 15 and 16, 2026). Behind `plans_group_pay`, read for
 * the plan's host (the business), and `plans_paid`. Only on a business's paid plan, never a playdate.
 *
 *  - The buyer picks "I'll send a link" on the payment sheet and pays for all the spots in one payment (the paid
 *    plan's own path: planPaid.paymentFor / finalize), taking one: PlanRequest.spots_bought, spots_token (the link's
 *    secret, kept as given) on the buyer's request.
 *  - POST /api/plans/:id/requests/claim-spot { token }: a signed-in person is in, free to them, while bought spots are
 *    left (PlanRequest.paid_by_request_id on theirs). Refused as any join is for someone already in, or on either side
 *    of a block with the business.
 *  - A claimer who leaves gives the spot back to the link (the spot is held again while the link is open).
 *  - At refund_until the spots nobody took are refunded to the buyer in one refund and the link stops; the buyer may
 *    give them back earlier. The business's share is re-priced on what was paid in the end (planPaid.refund →
 *    repriceAfterPartialRefund), and the payout follows it.
 *  - While the link is open, its spots nobody took hold room (planService.seatsTaken), so nobody else takes them.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const rules = require('./planRules');
const extras = require('./planExtras');

const actions = () => require('./planActions');
const planService = () => require('./planService');
const planPaid = () => require('./planPaid');

const FLAG = 'plans_group_pay';
const MAX_SPOTS = 100;

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();

/** The switch, read for the host (the business), with paid spots on. */
async function enabledFor(hostId) {
  if (!(await extras.enabledFor(FLAG, hostId))) return false;
  return planPaid().enabledFor(hostId);
}
async function switchByHost(hostIds) {
  return extras.switchByHost(FLAG, hostIds);
}

/** A business's paid plan, never a playdate (a price a family). */
const takes = (plan) => Boolean(plan && plan.business_user_id && plan.price_cents && plan.kind !== 'playdate');

/** The link: like the open link, on /plan-link/ (never under /plans/, which store iPhone builds open in the app). */
function linkUrl(postId, token) {
  const base = planService().shareUrl('x').replace(/\/plans\/x$/, '');
  return `${base}/plan-link/${postId}?spot=${encodeURIComponent(token)}`;
}

const ownSeats = (plan, request) => rules.seatsFor(plan, request.party_size, request.kids_count);
const claimersOf = (buyer, requests) => (requests || []).filter((r) => r.status === 'accepted' && r.paid_by_request_id === buyer.id);
const startsAtMs = (plan) => new Date(plan.post.event_date).getTime();

/** Takes people while the plan is open, the buyer is in, before refund_until and the start. */
function linkOpen(plan, buyer, now = Date.now()) {
  return Boolean(buyer && buyer.spots_token && buyer.status === 'accepted' && plan.status === 'open'
    && buyer.refund_until && new Date(buyer.refund_until).getTime() > now && startsAtMs(plan) > now);
}

/** Spots on the link nobody has taken (the buyer's own excluded). */
function spotsLeft(plan, buyer, requests) {
  if (!buyer?.spots_bought) return 0;
  return Math.max(0, buyer.spots_bought - ownSeats(plan, buyer) - claimersOf(buyer, requests).length);
}

/**
 * What one of the buyer's spots cost in the end: the price paid a spot, less a group price that came back (B4: the
 * difference was refunded on every spot still paid for). A deal for everyone was charged as such (unit price).
 */
function perSpot(plan, buyer) {
  const unit = buyer.unit_price_cents || plan.price_cents;
  if (buyer.deal_used_at && unit >= plan.price_cents && plan.deal?.scope === 'group' && plan.deal.state === 'unlocked') {
    return Math.min(unit, require('./planDeals').spotPriceNow(plan) || unit);
  }
  return unit;
}

/** The sheet's note for `spots` bought: "After you pay you get one link. The first 11 people …". */
function noteText(spots) {
  const n = spots - 1;
  return `After you pay you get one link. The first ${n} ${n === 1 ? 'person who opens' : 'people who open'} it ${n === 1 ? 'is' : 'are'} in, paid by you. Spots nobody takes come back to your card a day before.`;
}

/** The most spots one person may buy now: the plan's room left, up to 100. */
const maxSpotsFor = (free) => Math.max(0, Math.min(MAX_SPOTS, free));

/**
 * The quote for "I'll send a link" (POST …/requests/quote with { for: "link", spots }): "12 × $18.00" / "$216.00",
 * with no side effect. An app never multiplies a price.
 */
function quoteView(plan, spots, unitCents, free) {
  const each = unitCents || plan.price_cents;
  const { moneyText, refundText } = planPaid();
  return {
    for: 'link',
    spots,
    spots_text: `${spots} spots`,
    each_cents: each,
    each_text: `${spots} × ${moneyText(each)}`,
    total_cents: each * spots,
    total_text: moneyText(each * spots),
    link_spots: spots - 1,
    note: noteText(spots),
    max_spots: maxSpotsFor(free),
    refund_text: refundText(plan),
  };
}

/** The choices the payment sheet offers with more than one spot (on a quote, with `extras=1` and the switch on). */
function choicesView(free) {
  return {
    for: [{ id: 'party', label: 'People with me' }, { id: 'link', label: "I'll send a link" }],
    title: 'Who are they for?',
    max_spots: maxSpotsFor(free),
  };
}

/** A buy's spots, checked: 2 to the room left (and 100). Answers the number. */
function checkedSpots(value, free) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2) fail(422, 'validation', 'Choose at least 2 spots.', { field: 'spots' });
  if (n > maxSpotsFor(free)) {
    fail(409, 'full', free <= 1 ? 'There aren’t enough spots left to buy for a group.' : `Only ${maxSpotsFor(free)} spots are left.`, { field: 'spots', max_spots: maxSpotsFor(free) });
  }
  return n;
}

// ── The cards ────────────────────────────────────────────────

/**
 * The buyer's card (`extras=1`): "Your 11 spots" / "4 taken", the link while it takes people, and giving the rest back
 * early. `requests` are the plan's active requests.
 */
function buyerView(plan, buyer, requests, now = Date.now()) {
  if (!buyer?.spots_bought || buyer.status !== 'accepted') return null;
  const linkSpots = buyer.spots_bought - ownSeats(plan, buyer);
  const taken = claimersOf(buyer, requests).length;
  const open = linkOpen(plan, buyer, now);
  const left = open ? spotsLeft(plan, buyer, requests) : 0;
  const { moneyText } = planPaid();
  const back = left * perSpot(plan, buyer);
  return {
    role: 'buyer',
    spots: linkSpots,
    taken,
    left,
    text: `Your ${linkSpots} spots`,
    taken_text: `${taken} taken`,
    url: open ? linkUrl(plan.post_id, buyer.spots_token) : null,
    open,
    refund_until: buyer.refund_until || null,
    note: open
      ? (left > 0 ? `Spots nobody takes come back to your card a day before.` : 'Every spot is taken.')
      : (buyer.spots_token ? 'The link has stopped.' : 'The link has stopped. Spots nobody took went back to your card.'),
    give_back: open && left > 0 ? {
      left, back_cents: back,
      label: `Give back ${left} ${left === 1 ? 'spot' : 'spots'}`,
      text: `${moneyText(back)} goes back to your card and the link stops.`,
    } : null,
  };
}

/** A claimer's card (`extras=1`): "{Chris} got you a spot". */
function claimerView(buyerFirst) {
  const who = buyerFirst || 'Someone';
  return { role: 'claimer', from: buyerFirst || null, text: `${who} got you a spot` };
}

// ── The link ─────────────────────────────────────────────────

async function buyerByToken(postId, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const { data, error } = await supabaseAdmin.from('PlanRequest')
    .select(`${planService().REQUEST_COLUMNS}, refund_until, unit_price_cents, payment_id, paid_cents, refunded_cents, deal_used_at`)
    .eq('post_id', postId).eq('spots_token', token).maybeSingle();
  if (error) throw new Error(`Failed to read the link: ${error.message}`);
  return data || null;
}

async function linkPlan(postId) {
  if (!planService().isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService().loadPlanRow(postId);
  if (!plan || !takes(plan) || !(await enabledFor(plan.host_user_id))) fail(404, 'not_found', "This plan isn't available.");
  return plan;
}

/** What the link's page shows: "{Chris} got you a spot", how many are left, and whether it still takes people. */
async function linkView(plan, buyer) {
  const requests = await actions()._activeRequests(plan.post_id);
  const open = linkOpen(plan, buyer);
  const left = open ? spotsLeft(plan, buyer, requests) : 0;
  const names = await actions().userNames([buyer.user_id]);
  const first = actions().firstOf(names.get(String(buyer.user_id)));
  return {
    from: first || null,
    text: `${first || 'Someone'} got you a spot`,
    left,
    open: open && left > 0,
    button: "I'm in",
    closed_text: !open ? 'This link isn’t taking anyone now.' : left === 0 ? 'All the spots on this link are taken.' : null,
  };
}

/** GET /api/plans/:id/spot?token= and the public GET /api/public/plans/:id/spot?token= (no account needed to look). */
async function readLink(postId, token) {
  const plan = await linkPlan(postId);
  const buyer = await buyerByToken(postId, token);
  if (!buyer) return { spot: { from: null, text: null, left: 0, open: false, button: "I'm in", closed_text: 'This link isn’t taking anyone now.' } };
  return { spot: await linkView(plan, buyer) };
}

/**
 * POST /api/plans/:id/requests/claim-spot { token }: a signed-in person is in, free to them, while the link takes
 * people and spots are left. Refused as any join is: the business's own team, someone already in or waiting, someone
 * removed, on either side of a block with the business, or a plan that has stopped taking people.
 */
async function claim(user, postId, body = {}, { io = null } = {}) {
  const viewer = await require('./planViewer').loadViewer(user);
  const plan = await linkPlan(postId);
  const buyer = await buyerByToken(postId, body.token);
  if (!buyer || !linkOpen(plan, buyer)) fail(409, 'link_stopped', 'This link isn’t taking anyone now.');
  if (require('./planBusiness').runsPlan(plan, viewer)) fail(409, 'host', "You're hosting this plan.");
  if (plan.business_user_id && !require('./planBusiness').hostsNow(plan)) fail(409, 'ended', 'Asking has closed for this plan.');
  if (viewer.blockedUserIds.has(String(plan.business_user_id)) || viewer.blockedUserIds.has(String(plan.host_user_id))) {
    fail(404, 'blocked', "This plan isn't available.");
  }
  // As any join: only someone the plan exists for (a business's plan needs its switch and an app that draws it).
  if (!planService().isVisibleTo(plan, viewer, { involved: false })) fail(404, 'not_found', "This plan isn't available.");
  if (!rules.isAskingOpen(plan, plan.post.event_date, plan.post.event_end_date)) fail(409, 'ended', 'Asking has closed for this plan.');
  const room = Math.max(0, (buyer.spots_bought || 0) - ownSeats(plan, buyer));
  if (room <= 0) fail(409, 'spots_taken', 'All the spots on this link are taken.');
  const wayIn = await require('./planBusiness').wayInFor(plan, viewer.id, null, {});
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_plan_group_spot', {
    p_post_id: postId,
    p_buyer_request_id: buyer.id,
    p_token: body.token,
    p_user_id: viewer.id,
    p_way_in: wayIn,
    p_room: room,
  });
  if (claimError) throw new Error(`Failed to take the spot: ${claimError.message}`);
  if (claimed?.error === 'link_stopped') fail(409, 'link_stopped', 'This link isn’t taking anyone now.');
  if (claimed?.error === 'already_in') fail(409, 'already_in', "You're already on this plan.");
  if (claimed?.error === 'removed') fail(403, 'removed', "You can't join this plan again.");
  if (claimed?.error === 'spots_taken') fail(409, 'spots_taken', 'All the spots on this link are taken.');
  const request = claimed?.request;
  if (!request) throw new Error('Failed to take the spot: missing request row');
  const stamp = request.decided_at || nowIso();
  await require('../businessCustomers').recordBusinessContact({ businessUserId: plan.business_user_id, userId: viewer.id,
    feature: 'plan', wayIn, basis: planPaid().basisOf(wayIn), at: stamp }).catch(() => null);
  await actions()._admit(plan, request, { byRule: true, hostFirst: await actions()._hostFirstOf(plan), io, rule: 'invite' });
  const { body: planBody } = await planService().getForViewer(postId, viewer);
  return planBody;
}

// ── Giving the rest back ─────────────────────────────────────

/**
 * The spots nobody took go back to the buyer's card in one refund and the link stops: at refund_until (the tick), or
 * earlier when the buyer gives them back. The token is cleared and active claimers are counted atomically under a row
 * lock on the buyer's request (settle_plan_group_spots), so a concurrent claim_plan_group_spot can never claim a spot
 * that is being refunded. A refund that can't complete now is kept as owed and sent by a later tick (planPaid.refund).
 */
async function settle(plan, buyer, { reason }) {
  const { data: settled, error } = await supabaseAdmin.rpc('settle_plan_group_spots', {
    p_post_id: plan.post_id,
    p_buyer_request_id: buyer.id,
  });
  if (error) throw new Error(`Failed to stop the link: ${error.message}`);
  if (!settled?.stopped) return 0;
  const left = Math.max(0, (buyer.spots_bought || 0) - ownSeats(plan, buyer) - Number(settled.claimed || 0));
  if (left <= 0) return 0;
  const amount = left * perSpot(plan, buyer);
  const back = await planPaid().refund(plan, buyer, { reason, actorMode: 'policy', amount, spots: left });
  logger.info('plans.group_pay.spots_returned', { planId: plan.post_id, requestId: buyer.id, spots: left, cents: amount, reason, back });
  // Freed seats are offered to whoever waits.
  await actions()._offerOpenSpots(plan).catch((err) => logger.warn('plans.group_pay.offer_failed', { planId: plan.post_id, error: err.message }));
  return back;
}

/**
 * POST /api/plans/:id/requests/mine/give-back-spots: the buyer gives back the spots nobody took, now. It settles a
 * purchase already made, so it works whatever the switch says (08-extras section 7, "When the switch goes off"); paid
 * spots must still be on for the business.
 */
async function giveBack(user, postId) {
  const viewer = await require('./planViewer').loadViewer(user);
  if (!planService().isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService().loadPlanRow(postId);
  if (!plan || !takes(plan) || !(await planPaid().enabledFor(plan.host_user_id))) fail(404, 'not_found', "This plan isn't available.");
  const { data: buyer, error } = await supabaseAdmin.from('PlanRequest')
    .select(`${planService().REQUEST_COLUMNS}, refund_until, unit_price_cents, payment_id, paid_cents, refunded_cents, deal_used_at`)
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (error) throw new Error(`Failed to read your spots: ${error.message}`);
  if (!buyer?.spots_bought || buyer.status !== 'accepted') fail(404, 'not_found', 'You have no spots to give back.');
  if (!linkOpen(plan, buyer)) fail(409, 'link_stopped', 'The link has already stopped.');
  if (spotsLeft(plan, buyer, await actions()._activeRequests(postId)) <= 0) fail(409, 'all_taken', 'Every spot is taken.');
  await settle(plan, buyer, { reason: 'spots_given_back' });
  const { body } = await planService().getForViewer(postId, viewer);
  return body;
}

/** The Plans tick: links whose refund_until has come; their spots nobody took go back. Answers how many settled. */
async function runDue({ now = new Date() } = {}) {
  const { data, error } = await supabaseAdmin.from('PlanRequest')
    .select(`${planService().REQUEST_COLUMNS}, refund_until, unit_price_cents, payment_id, paid_cents, refunded_cents, deal_used_at`)
    .not('spots_token', 'is', null).eq('status', 'accepted').lte('refund_until', now.toISOString()).limit(100);
  if (error) throw new Error(`Failed to read links that are due: ${error.message}`);
  let settled = 0;
  for (const buyer of data || []) {
    try {
      const plan = await planService().loadPlanRow(buyer.post_id);
      if (!plan) continue;
      await settle(plan, buyer, { reason: 'spots_not_taken' });
      settled += 1;
    } catch (err) {
      logger.warn('plans.group_pay.settle_failed', { requestId: buyer.id, error: err.message });
    }
  }
  return settled;
}

/**
 * Leaving as the buyer (before refund_until): their own spot and the ones nobody took come back; the spots claimers
 * hold stay paid and they stay in. Answers the cents that leaving gives back now (before the refund window's rule).
 */
function buyerLeaveCents(plan, buyer, requests) {
  const left = Math.max(0, (buyer.paid_cents || 0) - (buyer.refunded_cents || 0));
  return Math.max(0, left - claimersOf(buyer, requests).length * perSpot(plan, buyer));
}

/**
 * The buyer's leave line while claimers are in (08-extras section 7, settled November 16), in the request's own numbers:
 * "You'll get $162.00 back: your spot and the 8 nobody took. The 3 people you paid for stay in.", or with every spot
 * taken "You'll get $18.00 back for your spot. The 11 people you paid for stay in." Null without claimers (the paid
 * plan's own "You'll get $216.00 back.").
 */
function leaveText(plan, buyer, requests, backCents) {
  const claimed = claimersOf(buyer, requests).length;
  if (!claimed || !(backCents > 0)) return null;
  const per = perSpot(plan, buyer);
  const nobody = Math.max(0, Math.round(backCents / per) - 1);
  const money = planPaid().moneyText(backCents);
  const stay = `The ${claimed} ${claimed === 1 ? 'person' : 'people'} you paid for ${claimed === 1 ? 'stays' : 'stay'} in.`;
  return nobody > 0 ? `You'll get ${money} back: your spot and the ${nobody} nobody took. ${stay}` : `You'll get ${money} back for your spot. ${stay}`;
}

/**
 * A claimer left or was removed (08-extras section 7, settled November 16: before refund_until every bought spot that
 * ends up empty goes back to the buyer; after it, none, except a removal, which always refunds). While the link takes people the spot goes back to the link
 * (nothing to do here). Once it has stopped and refund_until hasn't come, that spot's price goes back to the buyer at
 * once, one more refund in part; the spot is an ordinary open spot. Answers the cents returned.
 */
async function onClaimerGone(plan, claimerId, { removed = false, now = Date.now() } = {}) {
  if (!takes(plan)) return 0;
  const { data: claimer, error } = await supabaseAdmin.from('PlanRequest').select('id, paid_by_request_id').eq('id', claimerId).maybeSingle();
  if (error) throw new Error(`Failed to read the spot: ${error.message}`);
  if (!claimer?.paid_by_request_id) return 0;
  const { data: buyer, error: buyerError } = await supabaseAdmin.from('PlanRequest')
    .select(`${planService().REQUEST_COLUMNS}, refund_until, unit_price_cents, payment_id, paid_cents, refunded_cents, deal_used_at`)
    .eq('id', claimer.paid_by_request_id).maybeSingle();
  if (buyerError) throw new Error(`Failed to read the buyer's spots: ${buyerError.message}`);
  if (!buyer?.payment_id || buyer.spots_token) return 0;
  // Leaving: only before refund_until. Removed by the business: always (a removal always refunds).
  if (!removed && (!buyer.refund_until || new Date(buyer.refund_until).getTime() <= now)) return 0;
  const back = await planPaid().refund(plan, buyer, { reason: `claimer_gone:${claimer.id}`, actorMode: 'policy', amount: perSpot(plan, buyer) });
  logger.info('plans.group_pay.claimer_spot_returned', { planId: plan.post_id, buyerRequestId: buyer.id, claimerRequestId: claimer.id, back });
  return back;
}

/** What the claimers' spots keep of a buyer's payment (for the card's leave line). */
function keptCents(plan, buyer, requests) {
  return claimersOf(buyer, requests).length * perSpot(plan, buyer);
}

module.exports = {
  FLAG,
  MAX_SPOTS,
  enabledFor,
  switchByHost,
  takes,
  linkUrl,
  linkOpen,
  spotsLeft,
  perSpot,
  quoteView,
  choicesView,
  checkedSpots,
  buyerView,
  claimerView,
  readLink,
  claim,
  settle,
  giveBack,
  runDue,
  buyerLeaveCents,
  keptCents,
  leaveText,
  onClaimerGone,
  claimersOf,
};
