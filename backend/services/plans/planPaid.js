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

/** Someone is in or paying: the price is fixed from then on (contract 10.2). */
async function anyoneInOrPaying(postId) {
  const { count, error } = await supabaseAdmin.from('PlanRequest').select('id', { count: 'exact', head: true })
    .eq('post_id', postId).in('status', ['accepted', 'paying']);
  if (error) throw new Error(`Failed to read who is in: ${error.message}`);
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
  if (await anyoneInOrPaying(plan.post_id)) fail(409, 'price_locked', "The price can't change once someone is in.", { field: 'price_cents' });
  if (next !== null) await assertMayCharge(plan.business_user_id);
  return { price_cents: next };
}

// ── The card ─────────────────────────────────────────────────

function perOf(plan) {
  return plan.kind === 'playdate' ? 'family' : 'person';
}

/**
 * The card's price: "$18", "$18 a person", and the line under the join button with the refund rule. `unitCents` is
 * what one spot costs now (B4: a deal for everyone, or a group price that unlocked); below the price it adds
 * `was_cents`, the price struck through.
 */
function priceView(plan, unitCents = plan.price_cents) {
  if (!plan.price_cents) return null;
  const unit = unitCents || plan.price_cents;
  const line = `${priceText(unit)} a ${perOf(plan)}`;
  const refund = refundText(plan);
  return {
    cents: unit, currency: plan.currency || 'USD', per: perOf(plan),
    ...(unit < plan.price_cents ? { was_cents: plan.price_cents, was_text: priceText(plan.price_cents) } : {}),
    text: priceText(unit), line, join_text: `${line}. ${refund}`,
    refund_until: refundUntilOf(plan), refund_text: refund,
  };
}

/** What one spot costs now: the deal's price while the business has deals on (B4), otherwise the price. */
async function unitPriceNow(plan) {
  if (!plan.price_cents) return null;
  if (!plan.deal || !(await require('./planDeals').enabledFor(plan.host_user_id))) return plan.price_cents;
  return require('./planDeals').spotPriceNow(plan);
}

/** A group price that fell short (B4): anyone may leave with all of it back until the plan starts. */
function shortGroupPrice(plan, now = Date.now()) {
  const deal = plan?.deal;
  return Boolean(deal && deal.scope === 'group' && deal.state === 'short' && require('./planDeals').isSpotDeal(deal)
    && plan.post?.event_date && new Date(plan.post.event_date).getTime() > now);
}

/**
 * What leaving now gives back (P10): all that is left of the payment before refund_until, or while the business has
 * moved the plan and asked whether the guest still comes; otherwise nothing. The card's leave line and onLeave agree.
 */
function leaveBackCents(request, { reason = null, plan = null, now = Date.now(), keep = 0 } = {}) {
  // `keep`: what claimers' spots hold of a group buyer's payment (one person pays for the group); they stay in.
  const left = Math.max(0, (request.paid_cents || 0) - (request.refunded_cents || 0) - (keep || 0));
  if (left === 0) return 0;
  const inWindow = request.refund_until && new Date(request.refund_until).getTime() > now;
  const moved = Boolean(request.reconfirm_requested_at) && (request.reconfirmed == null || reason === 'not_coming');
  return inWindow || moved || shortGroupPrice(plan, now) ? left : 0;
}

/** The receipt in Mail, under Receipts: a link the apps already open (a Mail piece), or null when there is none. */
function receiptView(mailId) {
  return mailId ? { link: `/app/mailbox/${mailId}` } : null;
}

/**
 * What a guest who paid reads on the plan: "Paid $18.00" (once a part came back and they are still in, "Paid $18.00 ·
 * $4.00 back", contract 10.2), the receipt, and what leaving gives back.
 */
function paidView(plan, request, receiptMailId = null, { keep = 0 } = {}) {
  if (!request || !request.payment_id || !request.paid_cents) return null;
  const back = leaveBackCents(request, { plan, keep });
  const returned = request.status === 'accepted' && request.refunded_cents > 0 ? request.refunded_cents : 0;
  return {
    cents: request.paid_cents,
    text: returned ? `Paid ${moneyText(request.paid_cents)} · ${moneyText(returned)} back` : `Paid ${moneyText(request.paid_cents)}`,
    refunded_cents: request.refunded_cents || 0,
    refund_until: request.refund_until,
    leave_back_cents: back,
    leave_text: back > 0 ? `You'll get ${moneyText(back)} back.` : 'There is no refund now.',
    receipt: receiptView(receiptMailId),
  };
}

/**
 * What joining costs for this party (POST /api/plans/:id/requests/quote): the sheet's amounts, worked out here so an
 * app never multiplies a price. No side effect. `group` is a group price's sentence (B4); null without one.
 */
function quoteFor(plan, { party_size: partySize, kids_count: kidsCount }, { unitCents = plan.price_cents, dealsOn = false, going = 0 } = {}) {
  const spots = rules.seatsFor(plan, partySize, kidsCount);
  const each = unitCents || plan.price_cents;
  const total = each * spots;
  return {
    spots,
    spots_text: `${spots} ${spots === 1 ? 'spot' : 'spots'}`,
    each_cents: each,
    each_text: spots === 1 ? priceText(each) : `${priceText(each)} each`,
    total_cents: total,
    total_text: moneyText(total),
    group: dealsOn ? groupQuote(plan, spots, going) : null,
    refund_text: refundText(plan),
  };
}

/**
 * P1's group price card (B4): open, "If 10 are in by Thursday at 6:00 PM, everyone pays $14 and $4.00 comes back to
 * your card." (the amount for this party); unlocked, "Group price: $14". Null with no group price, or once it fell
 * short.
 */
function groupQuote(plan, spots, going) {
  const deals = require('./planDeals');
  const deal = plan.deal;
  if (!deal || deal.scope !== 'group' || !deals.isSpotDeal(deal) || !['open', 'unlocked'].includes(deal.state)) return null;
  const groupPrice = deals.groupPriceOf(deal, plan.price_cents);
  const base = { state: deal.state, in: going, size: deal.group_size, price_cents: groupPrice };
  if (deal.state === 'unlocked') return { ...base, text: `Group price: ${priceText(groupPrice)}` };
  const when = require('./planNotifications').whenText(deal.group_by, rules.timezoneForPlan(plan), { long: true, at: true });
  const back = (plan.price_cents - groupPrice) * spots;
  return { ...base, text: `If ${deal.group_size} are in by ${when}, everyone pays ${priceText(groupPrice)} and ${moneyText(back)} comes back to your card.` };
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
    // What one spot costs now (B4: the deal's price for everyone, or the group price once it unlocked).
    unit_price_cents: await unitPriceNow(plan),
    fee_basis: basis,
    fee_pct: (await stripeService().priceSale({ businessUserId: plan.business_user_id, soldType: 'plan_spot',
      amountCents: (await unitPriceNow(plan)) || plan.price_cents, basis })).feePct,
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
  // One person pays for the group: every spot bought, in one payment.
  const seats = request.spots_bought || rules.seatsFor(plan, request.party_size, request.kids_count);
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
      // One key a hold: a fresh hold after one ran out must not get back the first, cancelled payment.
      idempotencyKey: `plan-spot:${request.id}:${request.hold_expires_at ? new Date(request.hold_expires_at).getTime() : 'no-hold'}:${request.payment_id || attempt}`,
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
 * Answers 'in', 'not_paid', 'full' (too late, and the plan filled meanwhile: refunded), 'ended' (too late, and the
 * plan takes nobody now: refunded) or 'gone' (nothing to do).
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
    // The spots bought for a group are held with the buyer's own (planService.seatsTaken).
    const need = (request.spots_bought || rules.seatsFor(plan, request.party_size, request.kids_count));
    if (plan.status !== 'open' || free < need) {
      await refund(plan, request, { reason: 'hold_ran_out', actorMode: 'policy' });
      return plan.status !== 'open' ? 'ended' : 'full';
    }
  }
  const stamp = new Date().toISOString();
  const { data: moved } = await supabaseAdmin.from('PlanRequest')
    .update({ status: 'accepted', decided_by: 'rule', decided_at: stamp, paid_cents: payment.amount_total, hold_expires_at: null, updated_at: stamp })
    .eq('id', request.id).in('status', ['paying', 'expired']).select(planService.REQUEST_COLUMNS);
  if (!moved || moved.length === 0) return 'in';
  await stripeService().settleCardFeeShare(request.payment_id).catch((err) => logger.warn('plans.paid.card_fee_later', { paymentId: request.payment_id, error: err.message }));
  // Money off the spot (B4): a deal price paid is the deal used; a group price that unlocked while they paid comes back.
  const seats = rules.seatsFor(plan, request.party_size, request.kids_count);
  if (request.unit_price_cents && request.unit_price_cents < plan.price_cents) {
    await supabaseAdmin.from('PlanRequest').update({ deal_cents: (plan.price_cents - request.unit_price_cents) * seats, deal_used_at: stamp })
      .eq('id', request.id).is('deal_used_at', null);
  }
  else if (request.unit_price_cents && (await unitPriceNow(plan)) < request.unit_price_cents) {
    await groupRefund(plan, { ...moved[0], payment_id: request.payment_id, unit_price_cents: request.unit_price_cents,
      paid_cents: payment.amount_total, refunded_cents: request.refunded_cents || 0 });
  }
  await fileReceipt(plan, request, payment);
  await require('../businessCustomers').recordBusinessContact({ businessUserId: plan.business_user_id, userId: request.user_id,
    feature: 'plan', wayIn: request.way_in, basis: request.fee_basis, at: stamp });
  recordFunnelEvent('plan_paid', { userId: request.user_id, meta: { plan_id: postId, kind: plan.kind, cents: payment.amount_total, basis: request.fee_basis, way_in: request.way_in } });
  await actions._admit(plan, moved[0], { byRule: true, hostFirst: await actions._hostFirstOf(plan), io, rule: 'paid', paidCents: payment.amount_total });
  return 'in';
}

/**
 * The guest's receipt, filed in their Receipts in Mail (as a paid invoice's and a Support Train gift's are), made once
 * for the payment; its Mail id is kept on the payment so the plan links to it. Nothing while the mailbox is off.
 * Never fails.
 */
async function fileReceipt(plan, request, payment) {
  try {
    const { isLaunchFeatureEnabled } = require('../../utils/featureFlags');
    if (!isLaunchFeatureEnabled('mailbox')) return null;
    const pantopusLetters = require('../pantopusLetters');
    const mailDelivery = require('../mailDelivery');
    const { ensureSystemFolders } = require('../mailVault');
    const { getAccessibleHomeIds } = require('../../utils/homeMailAccess');
    const userId = request.user_id;
    await ensureSystemFolders(userId, await getAccessibleHomeIds(userId));
    const { data: receipts } = await supabaseAdmin.from('VaultFolder').select('id').eq('user_id', userId)
      .eq('drawer', 'personal').eq('label', 'Receipts').eq('system', true).order('created_at').limit(1);
    const { data: business } = await supabaseAdmin.from('User').select('name, username').eq('id', plan.business_user_id).maybeSingle();
    const seller = (business?.name || business?.username || 'the business').trim().slice(0, 120);
    const zone = (await mailDelivery.personTimeZone(userId)) || mailDelivery.FALLBACK_TIME_ZONE;
    const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: zone });
    const spots = request.spots_bought || rules.seatsFor(plan, request.party_size, request.kids_count);
    const amount = moneyText(payment.amount_total);
    const spotsText = `${spots} ${spots === 1 ? 'spot' : 'spots'}`;
    const title = String(plan.post?.title || 'the plan').slice(0, 120);
    const made = await pantopusLetters.sendSafe(`plan-spot:${request.id}:${payment.id}`, {
      recipient_user_id: userId,
      subject: `Your receipt from ${seller}`,
      content: [
        `You paid ${amount} for ${spotsText} at ${title}, hosted by ${seller}, on ${day}.`,
        '',
        `${seller} is the seller, and the price includes tax. Pantopus took the payment for ${seller}.`,
        '',
        'This is your receipt. Pantopus keeps it in your Vault, under Receipts.',
        '',
        'Your Pantopus carrier',
      ].join('\n'),
      summary: `You paid ${amount} for ${spotsText} at ${title} on ${day}.`,
      key_facts: [{ label: 'Amount', value: amount }, { label: 'Date', value: day }, { label: 'For', value: `${title} · ${spotsText}` },
        { label: 'Seller', value: seller }],
      category: 'receipt',
      filed_folder_id: receipts?.[0]?.id || null,
      immediate: true,
    });
    if (!made?.id) return null;
    const { data: fresh } = await supabaseAdmin.from('Payment').select('metadata').eq('id', payment.id).maybeSingle();
    if (fresh?.metadata?.receipt_mail_id !== made.id) {
      await supabaseAdmin.from('Payment').update({ metadata: { ...(fresh?.metadata || {}), receipt_mail_id: made.id } }).eq('id', payment.id);
    }
    return made.id;
  } catch (err) {
    logger.warn('plans.paid.receipt_skipped', { paymentId: payment?.id, error: err.message });
    return null;
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
  if (outcome === 'full' || outcome === 'ended') {
    const { data: payment } = await supabaseAdmin.from('Payment').select('amount_total').eq('id', mine.payment_id).maybeSingle();
    const back = moneyText(payment?.amount_total || 0);
    if (outcome === 'full') fail(409, 'full', `This filled while you were paying. Your ${back} is on its way back.`);
    fail(409, 'ended', `This plan isn't taking anyone now. Your ${back} is on its way back.`);
  }
  const { body } = await planService.getForViewer(postId, viewer);
  return body;
}

/** The webhook saw the card accepted: let the guest in (the same steps as confirm). */
async function onPaymentAuthorized(payment) {
  // A check at the place (B5) is its own payment: its steps are the check's.
  if (['plan_check', 'plan_tip'].includes(payment?.metadata?.type)) return require('./planChecks').onPaymentAuthorized(payment);
  const requestId = payment?.metadata?.request_id;
  const postId = payment?.metadata?.plan_id;
  if (payment?.payment_type !== 'plan_payment' || !requestId || !postId) return;
  await finalize(postId, requestId).catch((err) => logger.warn('plans.paid.webhook_finalize_failed', { paymentId: payment.id, error: err.message }));
}

// ── Refunds ──────────────────────────────────────────────────

/**
 * Returns a paid request's money (all that is left of it), or releases the hold of one not captured yet. Never fails
 * the step that called it. A refund that is owed and can't complete now (contract 10.4, "an owed refund is never
 * dropped") is kept on the payment as owed (`metadata.plan_refunds_owed`, one entry a request key) and tried again by
 * the Plans tick (retryOwedRefunds) with the same key until the payment company confirms it. Answers the cents returned
 * now.
 */
async function refund(plan, request, { reason, actorMode = 'policy', actorId = null, amount: part = null }) {
  if (!request?.payment_id) return 0;
  const { data: payment } = await supabaseAdmin.from('Payment').select('id, payment_status, amount_total, refunded_amount, payer_id, metadata')
    .eq('id', request.payment_id).maybeSingle();
  if (!payment) return 0;
  const key = uuidFrom(`plan-refund:${request.id}:${payment.id}:${reason}`);
  const owedEntry = owedFor(payment.metadata, key);
  const owed = Boolean(owedEntry);
  if (['refunded_full', 'canceled'].includes(payment.payment_status) && !owed) return 0;
  const left = payment.amount_total - (payment.refunded_amount || 0);
  // A part (one person pays for the group: the spots nobody took, or the buyer's leave while claimers stay) is asked
  // for as such; all that is left otherwise. The owed mark keeps the part for the retry.
  const owedPart = owed ? owedEntry.amount ?? null : null;
  const wanted = part ?? owedPart;
  const amount = wanted !== null && wanted !== undefined && wanted < left ? wanted : null;
  if (wanted !== null && wanted !== undefined && wanted <= 0) return 0;
  const actor = actorMode === 'payer' ? payment.payer_id : actorId;
  try {
    const result = await require('../paymentRefundService').create({
      paymentId: payment.id, amount, reason: 'requested_by_customer', description: `Plans: ${reason}`,
      actorId: actor, actorMode, requestId: key,
    });
    if (!result?.success) {
      await markOwed(payment.id, { key, request_id: request.id, post_id: plan.post_id, reason, actor_mode: actorMode, actor_id: actorId, amount });
      return 0;
    }
    const operation = result.refundRequest?.operation;
    const back = operation === 'refund' ? (Number(result.refundRequest.amountCents) || left) : 0;
    if (back > 0) {
      // One payment a request: what came back of it is the payment's refunded amount (so a retry never counts twice).
      const refundedNow = Number(result.payment?.refunded_amount) || ((request.refunded_cents || 0) + back);
      await supabaseAdmin.from('PlanRequest').update({ refunded_cents: refundedNow, updated_at: new Date().toISOString() })
        .eq('id', request.id);
      // Part of the payment came back: the business's share is re-priced on what was paid in the end (contract 10.4).
      if (result.payment?.payment_status === 'refunded_partial') {
        await repriceAfterPartialRefund(payment.id).catch((err) => logger.warn('plans.paid.reprice_failed', { paymentId: payment.id, error: err.message }));
      }
      await require('../businessCustomers').recountBusinessCustomer(plan.business_user_id, request.user_id);
      await require('./planNotifications').notify({
        userId: request.user_id, type: 'plan_refunded', plan, title: `${moneyText(back)} is on its way back to your card`,
        body: `${plan.post.title}. A bank can take a few days.`, link: `/plans/${plan.post_id}`,
        metadata: { request_id: request.id, amount_cents: back }, idempotencyKey: `plan-refunded:${request.id}:${reason}`,
      });
    }
    if (owed) await clearOwed(payment.id, key);
    return back;
  } catch (err) {
    logger.warn('plans.paid.refund_failed', { planId: plan.post_id, requestId: request.id, reason, error: err.message, code: err.code });
    await markOwed(payment.id, { key, request_id: request.id, post_id: plan.post_id, reason, actor_mode: actorMode, actor_id: actorId, amount })
      .catch((markErr) => logger.error('plans.paid.refund_owed_unsaved', { paymentId: payment.id, requestId: request.id, error: markErr.message }));
    return 0;
  }
}

/**
 * The refunds owed on a payment, one entry a request key: `metadata.plan_refunds_owed` ({ key: entry }), and the
 * single mark the first build kept (`metadata.plan_refund_owed`), read so nothing it held is lost.
 */
function owedEntries(metadata) {
  const out = Object.values(metadata?.plan_refunds_owed || {}).filter((e) => e && e.key);
  const legacy = metadata?.plan_refund_owed;
  if (legacy?.key && !out.some((e) => e.key === legacy.key)) out.push(legacy);
  return out;
}
const owedFor = (metadata, key) => owedEntries(metadata).find((e) => e.key === key) || null;

/** Keeps a refund that is owed on its payment until the payment company confirms it (one entry a request key). */
async function markOwed(paymentId, owed) {
  const { data: now } = await supabaseAdmin.from('Payment').select('metadata').eq('id', paymentId).maybeSingle();
  if (owedFor(now?.metadata, owed.key)) return;
  const metadata = now?.metadata || {};
  const { error } = await supabaseAdmin.from('Payment').update({ metadata: { ...metadata,
    plan_refunds_owed: { ...(metadata.plan_refunds_owed || {}), [owed.key]: { ...owed, since: new Date().toISOString() } } } }).eq('id', paymentId);
  if (error) throw new Error(`Failed to keep the owed refund: ${error.message}`);
  logger.error('plans.paid.refund_owed', { paymentId, requestId: owed.request_id, reason: owed.reason, amount: owed.amount ?? null });
}

/** One owed refund confirmed: its entry goes (the others stay), and the last one confirmed is kept for the record. */
async function clearOwed(paymentId, key) {
  const { data: now } = await supabaseAdmin.from('Payment').select('metadata').eq('id', paymentId).maybeSingle();
  const entry = owedFor(now?.metadata, key);
  if (!entry) return;
  const { plan_refunds_owed: map = {}, plan_refund_owed: legacy, ...rest } = now.metadata;
  const { [key]: _done, ...others } = map;
  const metadata = { ...rest, plan_refund_last_owed: { ...entry, confirmed_at: new Date().toISOString() } };
  if (Object.keys(others).length) metadata.plan_refunds_owed = others;
  if (legacy?.key && legacy.key !== key) metadata.plan_refund_owed = legacy;
  await supabaseAdmin.from('Payment').update({ metadata }).eq('id', paymentId);
}

/**
 * The Plans tick: every plan refund that is owed and couldn't complete is asked again, each with its own request key,
 * until the payment company confirms it. Runs whatever the switches say: money owed is always sent. Answers how many
 * were confirmed now.
 */
async function retryOwedRefunds() {
  const [byMap, byLegacy] = await Promise.all([
    supabaseAdmin.from('Payment').select('id, metadata').eq('payment_type', 'plan_payment').not('metadata->plan_refunds_owed', 'is', null).limit(100),
    supabaseAdmin.from('Payment').select('id, metadata').eq('payment_type', 'plan_payment').not('metadata->plan_refund_owed', 'is', null).limit(100),
  ]);
  if (byMap.error || byLegacy.error) throw new Error(`Failed to read owed refunds: ${(byMap.error || byLegacy.error).message}`);
  const payments = new Map([...(byMap.data || []), ...(byLegacy.data || [])].map((p) => [p.id, p]));
  const planService = require('./planService');
  let done = 0;
  for (const payment of payments.values()) {
    for (const owed of owedEntries(payment.metadata)) {
      try {
        const plan = await planService.loadPlanRow(owed.post_id);
        const [request] = await supabaseAdmin.from('PlanRequest').select(MONEY_COLUMNS).eq('id', owed.request_id).then(({ data: rows }) => rows || []);
        if (!plan || !request) continue;
        await refund(plan, request, { reason: owed.reason, actorMode: owed.actor_mode, actorId: owed.actor_id || null });
        const { data: after } = await supabaseAdmin.from('Payment').select('metadata').eq('id', payment.id).maybeSingle();
        if (!owedFor(after?.metadata, owed.key)) done += 1;
        else stuck(payment.id, owed);
      } catch (err) {
        logger.warn('plans.paid.owed_retry_failed', { paymentId: payment.id, requestId: owed.request_id, error: err.message });
        stuck(payment.id, owed);
      }
    }
  }
  return done;
}

/** Money owed that hasn't moved for an hour is loud: an error line on every tick it stays so (the alarms watch them). */
function stuck(paymentId, owed) {
  const since = owed?.since ? new Date(owed.since).getTime() : NaN;
  const minutes = Math.round((Date.now() - since) / 60000);
  if (Number.isFinite(minutes) && minutes >= 60) {
    logger.error('plans.paid.refund_owed_stuck', { paymentId, requestId: owed.request_id, reason: owed.reason, minutes });
  }
}

/**
 * A group price that unlocked (B4, contract 10.4): the difference between what this guest paid a spot and the price
 * now goes back to their card, once (the request key `plan-group:<request id>`), through paymentRefundService. The
 * business's share is re-priced on what the guest paid in the end. Answers the cents returned (0 when nothing was
 * owed or it couldn't complete now; it is tried again on the next tick).
 */
async function groupRefund(plan, request, { notify = true } = {}) {
  if (!request?.payment_id || !request.unit_price_cents || request.deal_used_at) return 0;
  const now = require('./planDeals').spotPriceNow(plan);
  const left = Math.max(0, (request.paid_cents || 0) - (request.refunded_cents || 0));
  // A group buyer's spots still paid for (some may have come back already): what is left at the price paid a spot.
  const seats = request.spots_bought ? Math.round(left / request.unit_price_cents) : rules.seatsFor(plan, request.party_size, request.kids_count);
  const back = Math.min(left, Math.max(0, (request.unit_price_cents - now) * seats));
  if (back <= 0) return 0;
  try {
    const result = await require('../paymentRefundService').create({
      paymentId: request.payment_id, amount: back, reason: 'requested_by_customer', description: 'Plans: group_price',
      actorId: null, actorMode: 'policy', requestId: uuidFrom(`plan-group:${request.id}`),
    });
    if (!result?.success) return 0;
    const stamp = new Date().toISOString();
    const { data: marked } = await supabaseAdmin.from('PlanRequest')
      .update({ refunded_cents: (request.refunded_cents || 0) + back, deal_cents: back, deal_used_at: stamp, updated_at: stamp })
      .eq('id', request.id).is('deal_used_at', null).select('id');
    if (!marked || marked.length === 0) return 0;
    await repriceAfterPartialRefund(request.payment_id);
    if (notify) {
      await require('./planNotifications').notify({
        userId: request.user_id, type: 'plan_refunded', plan, recipientIsIn: true,
        title: `${moneyText(back)} is on its way back to your card`,
        body: `${plan.post.title} reached its group price. A bank can take a few days.`,
        link: `/plans/${plan.post_id}`, metadata: { request_id: request.id, amount_cents: back, reason: 'group_price' },
        idempotencyKey: `plan-group-price:${request.id}`,
      });
    }
    return back;
  } catch (err) {
    logger.warn('plans.paid.group_refund_failed', { planId: plan.post_id, requestId: request.id, error: err.message, code: err.code });
    return 0;
  }
}

/**
 * Every paid guest of a plan whose group price unlocked (or whose smaller deal off the spot is given after it fell
 * short) and who is still owed the difference: each gets it back once. Run by the Plans tick at the settle and again
 * on later ticks for any that couldn't complete. Answers [{ request, back }] for those returned now.
 */
async function groupRefunds(plan, { notify = true } = {}) {
  if (!plan.price_cents || !(await enabledFor(plan.host_user_id))) return [];
  const { data, error } = await supabaseAdmin.from('PlanRequest').select(MONEY_COLUMNS)
    .eq('post_id', plan.post_id).eq('status', 'accepted').not('payment_id', 'is', null).is('deal_used_at', null)
    .gt('unit_price_cents', require('./planDeals').spotPriceNow(plan) || 0);
  if (error) throw new Error(`Failed to read who paid: ${error.message}`);
  const out = [];
  for (const request of data || []) {
    const back = await groupRefund(plan, request, { notify });
    if (back > 0) out.push({ request, back });
  }
  return out;
}

/**
 * After part of a plan payment came back (a group price, B4; a staff refund of part of a bill, B5), the business's
 * share is re-priced on what the guest paid in the end (contract 10.4): Pantopus's percent on the sale paid, and where
 * the business bears the card fee, its share in proportion to what was paid (round(fee × paid ÷ charged)); Pantopus
 * absorbs the rest. A tip stays whole (a partial refund leaves it alone). Only plan_spot and plan_bill payments are
 * touched; the payout of such a payment goes through plan_payment_release_after_partial_refund. Answers the payment.
 */
async function repriceAfterPartialRefund(paymentId) {
  const svc = stripeService();
  let { data: payment } = await supabaseAdmin.from('Payment').select('*').eq('id', paymentId).maybeSingle();
  if (!payment || payment.payment_type !== 'plan_payment' || !['plan_spot', 'plan_bill'].includes(payment.sold_type)) return payment;
  if (payment.payment_status !== 'refunded_partial' || !(payment.refunded_amount > 0)) return payment;
  if (payment.metadata?.card_fee_by === 'business' && !payment.metadata?.card_fee_reported_at) {
    payment = (await svc.settleCardFeeShare(paymentId)) || payment;
    if (!payment.metadata?.card_fee_reported_at) throw new Error('The card fee is not reported yet');
  }
  const priced = repricedShare(payment);
  const { data, error } = await supabaseAdmin.from('Payment').update({
    amount_platform_fee: priced.platformFeeCents,
    amount_to_payee: priced.toPayeeCents,
    metadata: { ...(payment.metadata || {}), repriced_refunded_amount: payment.refunded_amount,
      business_card_fee_cents: priced.businessCardFeeCents, original_platform_fee_cents: payment.metadata?.original_platform_fee_cents ?? payment.amount_platform_fee,
      original_to_payee_cents: payment.metadata?.original_to_payee_cents ?? payment.amount_to_payee },
  }).eq('id', paymentId).eq('refunded_amount', payment.refunded_amount).select().maybeSingle();
  if (error) throw new Error(`Failed to re-price the payment: ${error.message}`);
  return data || payment;
}

/** The re-priced share of a plan payment refunded in part (see repriceAfterPartialRefund). Pure. */
function repricedShare(payment) {
  const charged = payment.amount_total;
  const paidEnd = charged - (payment.refunded_amount || 0);
  const tip = Math.min(payment.tip_cents || 0, paidEnd);
  const saleEnd = paidEnd - tip;
  const platformFeeCents = Math.floor((saleEnd * Number(payment.fee_pct || 0)) / 100);
  const cardFee = Number(payment.metadata?.card_fee_cents ?? payment.amount_processing_fee ?? 0);
  const businessCardFeeCents = payment.metadata?.card_fee_by === 'business' ? Math.round((cardFee * paidEnd) / charged) : 0;
  const toPayeeCents = paidEnd - platformFeeCents - businessCardFeeCents;
  if (toPayeeCents < 0) throw new Error('The re-priced share is below zero');
  return { paidEndCents: paidEnd, platformFeeCents, businessCardFeeCents, toPayeeCents };
}

const MONEY_COLUMNS = 'id, post_id, user_id, status, payment_id, paid_cents, refunded_cents, refund_until, reconfirm_requested_at, reconfirmed, party_size, kids_count, unit_price_cents, deal_used_at, spots_bought, spots_token, paid_by_request_id';
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
  // A spot someone else paid for (one person pays for the group): it may go back to the buyer.
  if (!request) return require('./planGroupPay').onClaimerGone(plan, requestId);
  request.status = wasStatus || request.status;
  if (request.status === 'paying') return refund(plan, request, { reason: 'abandoned', actorMode: 'payer' });
  // A group buyer (one person pays for the group): the link stops; the spots claimers hold stay paid and they stay in.
  let keep = 0;
  if (request.spots_bought) {
    const groupPay = require('./planGroupPay');
    keep = groupPay.keptCents(plan, request, await require('./planActions')._activeRequests(plan.post_id));
    await supabaseAdmin.from('PlanRequest').update({ spots_token: null }).eq('id', request.id).not('spots_token', 'is', null);
  }
  const back = leaveBackCents(request, { reason, plan, keep });
  if (back === 0) return 0;
  const inWindow = request.refund_until && new Date(request.refund_until).getTime() > Date.now();
  const reasonNow = inWindow ? 'left_in_time' : shortGroupPrice(plan) ? 'group_short' : 'moved';
  return refund(plan, request, { reason: reasonNow, actorMode: 'payer', amount: keep > 0 ? back : null });
}

/**
 * The business cancelled the plan or removed the guest: everything back, at any time. One person pays for the group
 * (08-extras section 7): a removed buyer gets back their own spot and the ones nobody took, the link stops, and the
 * claimers stay in, paid for; a removed claimer's spot goes back to the link while it is live, and once it has
 * stopped its price goes back to the buyer. A cancelled plan returns everything to whoever paid.
 */
async function onBusinessEnds(plan, requestIds, reason) {
  if (!plan.price_cents) return 0;
  let total = 0;
  const rows = await moneyRows(requestIds);
  const groupPay = require('./planGroupPay');
  for (const request of rows) {
    if (reason === 'removed' && request.spots_bought) {
      const keep = groupPay.keptCents(plan, request, await require('./planActions')._activeRequests(plan.post_id));
      await supabaseAdmin.from('PlanRequest').update({ spots_token: null }).eq('id', request.id).not('spots_token', 'is', null);
      const left = Math.max(0, (request.paid_cents || 0) - (request.refunded_cents || 0));
      if (left - keep > 0) total += await refund(plan, request, { reason, actorMode: 'policy', amount: keep > 0 ? left - keep : null });
      continue;
    }
    total += await refund(plan, request, { reason, actorMode: 'policy' });
  }
  if (reason === 'removed') {
    const paidIds = new Set(rows.map((r) => r.id));
    for (const id of (requestIds || []).filter((x) => x && !paidIds.has(x))) total += await groupPay.onClaimerGone(plan, id, { removed: true });
  }
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
  FLAG, HOLD_MS, WAITLIST_HOLD_MS, enabledFor, switchByHost, priceText, moneyText, refundText, refundUntilOf, mayCharge, assertMayCharge,
  checkedPrice, priceForNewPlan, priceChange, priceView, paidView, leaveBackCents, quoteFor, groupQuote, unitPriceNow, shortGroupPrice,
  groupRefund, groupRefunds, retryOwedRefunds, repriceAfterPartialRefund, repricedShare, basisOf, payingFields, paymentFor,
  finalize, confirmMine, onPaymentAuthorized, refund, onLeave, onBusinessEnds, releaseExpiredHolds, uuidFrom, CAPTURED, captureNow,
};
