/**
 * Paying to join a business's plan (Plans for the holidays B2: contract 10.2; Plans with businesses 4.2 and 5.6;
 * 02-payments.md sections 3, 4 and 8). Behind the switch `plans_paid`, read for the plan's host (the business).
 *
 *   - Only a verified business whose own payout account takes charges and payouts may set a price (P8); an online
 *     plan never has one (P12). Prices include tax; the business is the seller.
 *   - Joining a paid plan holds the spot for 10 minutes (`paying`) while the guest pays with the shipped payment
 *     sheet. The payment is a 'plan_payment' with sold_type 'plan_spot', priced by priceSale at the basis of the way
 *     in (who brought the guest, saved when they join), and paid out no earlier than 48 hours after the plan ends.
 *   - The guest is in when the payment company says the charge succeeded (the app's confirm, or the webhook), never on
 *     the app's say-so.
 *   - Refunds (P10): full until 24 hours before the start; full when the business cancels, removes the guest, or moves
 *     the time or the place and the guest can't come; none for a no-show. Through paymentRefundService.
 */
const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { isFeatureEnabled } = require('../featureFlagService');
const { recordFunnelEvent } = require('../funnelEvents');
const rules = require('./planRules');

const FLAG = 'plans_paid';
const PRICE_MIN = 100;
const PRICE_MAX = 50000;
const HOLD_MS = 10 * 60 * 1000;
const WAITLIST_HOLD_MS = 30 * 60 * 1000;
const REFUND_BEFORE_MS = 24 * 60 * 60 * 1000;
const PAYOUT_AFTER_MS = 48 * 60 * 60 * 1000;
const VERIFIED = ['document_verified', 'government_verified'];
const CAPTURED = ['captured_hold', 'transfer_scheduled', 'transfer_pending', 'transferred'];

const fail = (status, code, message, extra = {}) => {
  const { PlanError } = require('./planActions');
  throw new PlanError(status, code, message, extra);
};
const stripeService = () => require('../../stripe/stripeService');

async function enabledFor(hostUserId) {
  return Boolean(hostUserId) && isFeatureEnabled(FLAG, String(hostUserId));
}

async function switchByHost(hostIds) {
  const ids = [...new Set((hostIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (ids.length === 0) return out;
  const flag = await require('../featureFlagService').getFlag(FLAG);
  if (!flag || (!flag.enabled_globally && !flag.enabled_for_internal_team && !(flag.beta_user_ids || []).length)) {
    for (const id of ids) out.set(id, false);
    return out;
  }
  await Promise.all(ids.map(async (id) => out.set(id, await isFeatureEnabled(FLAG, id))));
  return out;
}

// ── Words ────────────────────────────────────────────────────

/** "$18", "$18.50". */
function priceText(cents) {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
/** "$18.00": an amount paid or coming back. */
function moneyText(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function refundUntilOf(plan) {
  return new Date(new Date(plan.post.event_date).getTime() - REFUND_BEFORE_MS).toISOString();
}

function refundText(plan, now = Date.now()) {
  const until = refundUntilOf(plan);
  if (new Date(until).getTime() <= now) return 'No refund now; the plan starts in less than a day.';
  const when = require('./planNotifications').whenText(until, rules.timezoneForPlan(plan), { long: true, at: true });
  return `Full refund until ${when}.`;
}

// ── Who may charge, and the price ────────────────────────────

/** P8: a verified business whose own payout account takes charges and pays out. */
async function mayCharge(businessUserId) {
  const [{ data: profile }, account] = await Promise.all([
    supabaseAdmin.from('BusinessProfile').select('verification_status').eq('business_user_id', businessUserId).maybeSingle(),
    require('../../utils/businessPermissions').getBusinessPayoutAccount(businessUserId).catch(() => null),
  ]);
  return Boolean(profile && VERIFIED.includes(profile.verification_status) && account?.charges_enabled && account?.payouts_enabled);
}

async function assertMayCharge(businessUserId) {
  if (!(await mayCharge(businessUserId))) {
    fail(409, 'payout_account_needed', 'Set up payouts to charge for spots.', { field: 'price_cents' });
  }
}

function checkedPrice(value, { placeKind }) {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < PRICE_MIN || cents > PRICE_MAX) {
    fail(422, 'validation', 'A spot can be $1 to $500.', { field: 'price_cents' });
  }
  if (placeKind === 'online') fail(422, 'validation', "An online plan can't have a price.", { field: 'price_cents' });
  return cents;
}

/** A price posted with a business's plan (createPlan). Null when none was sent or the switch is off. */
async function priceForNewPlan(hostAs, input, place) {
  if (!hostAs || input.price_cents == null) return null;
  if (!(await enabledFor(hostAs.business.id))) return null;
  const cents = checkedPrice(input.price_cents, { placeKind: place.kind });
  await assertMayCharge(hostAs.business.id);
  return cents;
}

/** Someone paid or is paying: the price is fixed from then on. */
async function anyonePaid(postId) {
  const { count, error } = await supabaseAdmin.from('PlanRequest').select('id', { count: 'exact', head: true })
    .eq('post_id', postId).not('payment_id', 'is', null);
  if (error) throw new Error(`Failed to read payments: ${error.message}`);
  return (count || 0) > 0;
}

/** A change to a business's plan's price (editPlan): { price_cents } or null when nothing changes. */
async function priceChange(plan, patch, { placeKind }) {
  if (!plan.business_user_id || !(await enabledFor(plan.host_user_id))) return null;
  if (patch.price_cents === undefined) {
    if (plan.price_cents && placeKind === 'online') fail(422, 'validation', "An online plan can't have a price.", { field: 'place' });
    return null;
  }
  const next = patch.price_cents === null ? null : checkedPrice(patch.price_cents, { placeKind });
  if (next === (plan.price_cents ?? null)) return null;
  if (await anyonePaid(plan.post_id)) fail(409, 'price_locked', "The price can't change once someone has paid.", { field: 'price_cents' });
  if (next !== null) await assertMayCharge(plan.business_user_id);
  return { price_cents: next };
}

// ── The card ─────────────────────────────────────────────────

function priceView(plan) {
  if (!plan.price_cents) return null;
  return {
    cents: plan.price_cents, currency: plan.currency || 'USD', per: plan.kind === 'playdate' ? 'family' : 'person',
    text: priceText(plan.price_cents), refund_until: refundUntilOf(plan), refund_text: refundText(plan),
  };
}

/** What a guest who paid reads on the plan: "Paid $18.00", the receipt, and what leaving gives back. */
function paidView(plan, request, receiptUrl = null) {
  if (!request || !request.payment_id || !request.paid_cents) return null;
  const left = Math.max(0, request.paid_cents - (request.refunded_cents || 0));
  const refundable = request.refund_until && new Date(request.refund_until).getTime() > Date.now();
  return {
    cents: request.paid_cents,
    text: `Paid ${moneyText(request.paid_cents)}`,
    refunded_cents: request.refunded_cents || 0,
    refund_until: request.refund_until,
    receipt_url: receiptUrl,
    leave_text: left > 0 && refundable ? `You'll get ${moneyText(left)} back.` : 'There is no refund now.',
  };
}

// ── Joining ──────────────────────────────────────────────────

/** How the guest's fee is priced, from their way in (contract 6.2 there; ties go to the business). */
function basisOf(wayIn) {
  return rules.WAYS_IN.own.includes(wayIn) ? 'own' : 'pantopus';
}

/** The money fields a paying request is saved with (the fee is fixed when the guest pays: contract rule 7). */
async function payingFields(plan, viewerId, wayIn, { holdMs = HOLD_MS } = {}) {
  const businessCustomers = require('../businessCustomers');
  const basis = basisOf(wayIn);
  return {
    unit_price_cents: plan.price_cents,
    fee_basis: basis,
    fee_pct: (await stripeService().priceSale({ businessUserId: plan.business_user_id, soldType: 'plan_spot',
      amountCents: plan.price_cents, basis })).feePct,
    refund_until: refundUntilOf(plan),
    hold_expires_at: new Date(Date.now() + holdMs).toISOString(),
    new_to_business: await businessCustomers.isNewToBusiness(plan.business_user_id, viewerId),
  };
}

function uuidFrom(key) {
  const h = crypto.createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * The payment for a paying request, made once (a second call answers the same one while it can still be paid).
 * Answers what the shipped payment sheet needs.
 */
async function paymentFor(plan, request, payerId) {
  const svc = stripeService();
  const seats = rules.seatsFor(plan, request.party_size, request.kids_count);
  const amount = request.unit_price_cents * seats;
  let paymentId = request.payment_id;
  let clientSecret = null;
  if (paymentId) {
    const { data: existing } = await supabaseAdmin.from('Payment').select('id, stripe_payment_intent_id, amount_total, payment_status')
      .eq('id', paymentId).maybeSingle();
    if (existing && existing.amount_total === amount && ['authorize_pending', 'authorization_failed'].includes(existing.payment_status)) {
      clientSecret = await svc.getPaymentIntentClientSecret(existing.stripe_payment_intent_id).catch(() => null);
    }
    if (!clientSecret) paymentId = null;
  }
  if (!paymentId) {
    const attempt = request.payment_id ? 'again' : 'first';
    const end = new Date(plan.post.event_end_date || plan.post.event_date).getTime();
    const made = await svc.createPaymentIntentForGig({
      payerId, payeeId: plan.business_user_id, gigId: null, amount, feeRateSubjectId: plan.business_user_id,
      paymentType: 'plan_payment',
      metadata: { type: 'plan_payment', plan_id: plan.post_id, request_id: request.id, business_user_id: plan.business_user_id },
      description: `Pantopus plan spot - ${plan.post.title}`.slice(0, 200),
      idempotencyKey: `plan-spot:${request.id}:${request.payment_id || attempt}`,
      sale: { soldType: 'plan_spot', soldId: request.id, basis: request.fee_basis, payoutAfter: new Date(end + PAYOUT_AFTER_MS).toISOString() },
    });
    if (!made?.success) throw new Error('The payment could not be started');
    paymentId = made.paymentId;
    clientSecret = made.clientSecret;
    const { error } = await supabaseAdmin.from('PlanRequest').update({ payment_id: paymentId, updated_at: new Date().toISOString() })
      .eq('id', request.id);
    if (error) throw new Error(`Failed to save the payment: ${error.message}`);
  }
  const { data: payment } = await supabaseAdmin.from('Payment').select('stripe_customer_id').eq('id', paymentId).maybeSingle();
  const ephemeral = await svc.createEphemeralKey(payment.stripe_customer_id);
  return {
    payment_id: paymentId, amount_cents: amount, amount_text: moneyText(amount), client_secret: clientSecret,
    customer_id: payment.stripe_customer_id, ephemeral_key: ephemeral?.secret || null,
    publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || null,
  };
}

/** Only the payment company can say a payment went through: sync it, capture a hold, answer its status. */
async function captureNow(paymentId) {
  const svc = stripeService();
  const synced = await svc.syncPaymentAuthorizationStatus(paymentId);
  if (synced?.payment_status === 'authorized') await svc.capturePayment(paymentId);
  const { data } = await supabaseAdmin.from('Payment').select('payment_status').eq('id', paymentId).maybeSingle();
  return data?.payment_status || null;
}

/**
 * The guest paid: in, once. Called by the app's confirm and by the payment's webhook. A payment that arrives after
 * its hold ran out still lets the guest in while there is room; otherwise it goes straight back to their card.
 * Answers 'in', 'not_paid', 'refunded' (too late, no room) or 'gone' (nothing to do).
 */
async function finalize(postId, requestId, { io = null } = {}) {
  const planService = require('./planService');
  const actions = require('./planActions');
  const { data: request } = await supabaseAdmin.from('PlanRequest').select(`${planService.REQUEST_COLUMNS}, payment_id, unit_price_cents, fee_basis, fee_pct, refund_until, paid_cents, refunded_cents, hold_expires_at, way_in`)
    .eq('id', requestId).eq('post_id', postId).maybeSingle();
  if (!request || !request.payment_id) return 'gone';
  if (request.status === 'accepted') return 'in';
  let status = await captureNow(request.payment_id);
  for (let check = 0; check < 4 && ['authorize_pending', 'capture_pending'].includes(status); check++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    status = await captureNow(request.payment_id);
  }
  if (!CAPTURED.includes(status)) return 'not_paid';
  const plan = await planService.loadPlanRow(postId);
  const { data: payment } = await supabaseAdmin.from('Payment').select('id, amount_total').eq('id', request.payment_id).maybeSingle();
  if (request.status !== 'paying') {
    // The hold ran out before the payment arrived: in only if the spot is still free.
    const requests = (await actions._activeRequests(postId)).filter((r) => r.id !== request.id);
    const free = plan.spots - (await actions._seatsNow(plan, requests));
    if (plan.status !== 'open' || free < rules.seatsFor(plan, request.party_size, request.kids_count)) {
      await refund(plan, request, { reason: 'hold_ran_out', actorMode: 'policy' });
      return 'refunded';
    }
  }
  const stamp = new Date().toISOString();
  const { data: moved } = await supabaseAdmin.from('PlanRequest')
    .update({ status: 'accepted', decided_by: 'rule', decided_at: stamp, paid_cents: payment.amount_total, hold_expires_at: null, updated_at: stamp })
    .eq('id', request.id).in('status', ['paying', 'expired']).select(planService.REQUEST_COLUMNS);
  if (!moved || moved.length === 0) return 'in';
  await stripeService().settleCardFeeShare(request.payment_id).catch((err) => logger.warn('plans.paid.card_fee_later', { paymentId: request.payment_id, error: err.message }));
  await saveReceiptUrl(request.payment_id);
  await require('../businessCustomers').recordBusinessContact({ businessUserId: plan.business_user_id, userId: request.user_id,
    feature: 'plan', wayIn: request.way_in, basis: request.fee_basis, at: stamp });
  recordFunnelEvent('plan_paid', { userId: request.user_id, meta: { plan_id: postId, kind: plan.kind, cents: payment.amount_total, basis: request.fee_basis, way_in: request.way_in } });
  await actions._admit(plan, moved[0], { byRule: true, hostFirst: await actions._hostFirstOf(plan), io, rule: 'paid', paidCents: payment.amount_total });
  return 'in';
}

/** The payment company's receipt for the charge, kept on the payment so the plan can link to it. Never fails. */
async function saveReceiptUrl(paymentId) {
  try {
    const { data: payment } = await supabaseAdmin.from('Payment').select('id, stripe_charge_id, metadata').eq('id', paymentId).maybeSingle();
    if (!payment?.stripe_charge_id || payment.metadata?.receipt_url) return;
    const charge = await require('../../stripe/getStripeClient').getStripeClient().charges.retrieve(payment.stripe_charge_id);
    if (!charge?.receipt_url) return;
    const { data: fresh } = await supabaseAdmin.from('Payment').select('metadata').eq('id', paymentId).maybeSingle();
    await supabaseAdmin.from('Payment').update({ metadata: { ...(fresh?.metadata || {}), receipt_url: charge.receipt_url } }).eq('id', paymentId);
  } catch (err) {
    logger.warn('plans.paid.receipt_url_skipped', { paymentId, error: err.message });
  }
}

/** POST /api/plans/:id/requests/mine/confirm: the app's payment sheet closed. */
async function confirmMine(user, postId, { io = null } = {}) {
  const { loadViewer } = require('./planViewer');
  const planService = require('./planService');
  const viewer = await loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !plan.price_cents || !(await enabledFor(plan.host_user_id))) fail(404, 'not_found', "This plan isn't available.");
  const { data: mine } = await supabaseAdmin.from('PlanRequest').select('id, status, payment_id')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (!mine || !mine.payment_id) fail(409, 'no_payment', 'No payment was started for this plan.');
  let outcome;
  try {
    outcome = await finalize(postId, mine.id, { io });
  } catch (err) {
    logger.warn('plans.paid.confirm_failed', { planId: postId, error: err.message });
    fail(503, 'payment_check_failed', "We couldn't confirm this payment yet. Please try again in a moment.");
  }
  if (outcome === 'not_paid') fail(409, 'payment_not_complete', "This payment hasn't gone through yet.");
  if (outcome === 'refunded') fail(409, 'hold_ran_out', 'That took a while. Start again.');
  const { body } = await planService.getForViewer(postId, viewer);
  return body;
}

/** The webhook saw the card accepted: let the guest in (the same steps as confirm). */
async function onPaymentAuthorized(payment) {
  const requestId = payment?.metadata?.request_id;
  const postId = payment?.metadata?.plan_id;
  if (payment?.payment_type !== 'plan_payment' || !requestId || !postId) return;
  await finalize(postId, requestId).catch((err) => logger.warn('plans.paid.webhook_finalize_failed', { paymentId: payment.id, error: err.message }));
}

// ── Refunds ──────────────────────────────────────────────────

/**
 * Returns a paid request's money (all that is left of it), or releases the hold of one not captured yet. Never fails
 * the step that called it: a refund that can't complete now is logged and retried by the refund job.
 */
async function refund(plan, request, { reason, actorMode = 'policy', actorId = null }) {
  if (!request?.payment_id) return 0;
  const { data: payment } = await supabaseAdmin.from('Payment').select('id, payment_status, amount_total, refunded_amount, payer_id')
    .eq('id', request.payment_id).maybeSingle();
  if (!payment || ['refunded_full', 'canceled'].includes(payment.payment_status)) return 0;
  const left = payment.amount_total - (payment.refunded_amount || 0);
  try {
    const result = await require('../paymentRefundService').create({
      paymentId: payment.id, amount: null, reason: 'requested_by_customer', description: `Plans: ${reason}`,
      actorId: actorMode === 'payer' ? payment.payer_id : actorId, actorMode,
      requestId: uuidFrom(`plan-refund:${request.id}:${payment.id}:${reason}`),
    });
    const captured = CAPTURED.includes(payment.payment_status);
    if (captured && result?.success) {
      await supabaseAdmin.from('PlanRequest').update({ refunded_cents: (request.refunded_cents || 0) + left, updated_at: new Date().toISOString() })
        .eq('id', request.id);
      await require('../businessCustomers').recountBusinessCustomer(plan.business_user_id, request.user_id);
      await require('./planNotifications').notify({
        userId: request.user_id, type: 'plan_refunded', plan, title: `${moneyText(left)} is on its way back to your card`,
        body: `${plan.post.title}. A bank can take a few days.`, link: `/plans/${plan.post_id}`,
        metadata: { request_id: request.id, amount_cents: left }, idempotencyKey: `plan-refunded:${request.id}:${reason}`,
      });
      return left;
    }
    return 0;
  } catch (err) {
    logger.warn('plans.paid.refund_failed', { planId: plan.post_id, requestId: request.id, reason, error: err.message, code: err.code });
    return 0;
  }
}

const MONEY_COLUMNS = 'id, post_id, user_id, status, payment_id, paid_cents, refunded_cents, refund_until, reconfirm_requested_at';
async function moneyRows(requestIds) {
  const ids = (requestIds || []).filter(Boolean);
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin.from('PlanRequest').select(MONEY_COLUMNS).in('id', ids).not('payment_id', 'is', null);
  if (error) throw new Error(`Failed to read payments: ${error.message}`);
  return data || [];
}

/**
 * Leaving a paid plan (P10): everything back before refund_until, or when the business moved it and they can't come;
 * an unpaid hold is released. `wasStatus` is the request's status before it left.
 */
async function onLeave(plan, requestId, { reason, wasStatus }) {
  if (!plan.price_cents || !(await enabledFor(plan.host_user_id))) return 0;
  const [request] = await moneyRows([requestId]);
  if (!request) return 0;
  request.status = wasStatus || request.status;
  const inWindow = request.refund_until && new Date(request.refund_until).getTime() > Date.now();
  const moved = reason === 'not_coming' && Boolean(request.reconfirm_requested_at);
  if (!inWindow && !moved && request.status !== 'paying') return 0;
  return refund(plan, request, { reason: moved ? 'moved' : request.status === 'paying' ? 'abandoned' : 'left_in_time', actorMode: 'payer' });
}

/** The business cancelled the plan or removed the guest: everything back. */
async function onBusinessEnds(plan, requestIds, reason) {
  if (!plan.price_cents) return 0;
  let total = 0;
  for (const request of await moneyRows(requestIds)) total += await refund(plan, request, { reason, actorMode: 'policy' });
  return total;
}

// ── The Plans tick: holds that ran out ───────────────────────

async function releaseExpiredHolds({ now = new Date(), io = null } = {}) {
  const { data, error } = await supabaseAdmin.from('PlanRequest').select('id, post_id, user_id, payment_id, status')
    .eq('status', 'paying').lt('hold_expires_at', now.toISOString()).limit(200);
  if (error) throw new Error(`Failed to read held spots: ${error.message}`);
  let released = 0;
  const actions = require('./planActions');
  const planService = require('./planService');
  for (const request of data || []) {
    try {
      // Paid inside the hold but the app never confirmed: let them in.
      if (request.payment_id && (await finalize(request.post_id, request.id, { io })) === 'in') continue;
      const { data: moved } = await supabaseAdmin.from('PlanRequest').update({ status: 'expired', updated_at: now.toISOString() })
        .eq('id', request.id).eq('status', 'paying').select('id');
      if (!moved || moved.length === 0) continue;
      released += 1;
      if (request.payment_id) {
        await stripeService().cancelAuthorization(request.payment_id).catch((err) => logger.warn('plans.paid.release_failed', { requestId: request.id, error: err.message }));
      }
      const plan = await planService.loadPlanRow(request.post_id);
      if (plan) await actions._offerOpenSpots(plan, { io });
    } catch (err) {
      logger.warn('plans.tick.hold_failed', { requestId: request.id, error: err.message });
    }
  }
  return released;
}

module.exports = {
  FLAG, HOLD_MS, WAITLIST_HOLD_MS, enabledFor, switchByHost, priceText, moneyText, refundUntilOf, mayCharge, assertMayCharge,
  checkedPrice, priceForNewPlan, priceChange, priceView, paidView, basisOf, payingFields, paymentFor, finalize, confirmMine,
  onPaymentAuthorized, refund, onLeave, onBusinessEnds, releaseExpiredHolds, uuidFrom, CAPTURED,
};
