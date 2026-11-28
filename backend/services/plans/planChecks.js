/**
 * The bill at the place (Plans for the holidays B5: contract 11.1 to 11.4; 02-payments sections 5, 6, 7 and 9;
 * 07-screens C1 to C3). Behind the switch `plans_pay_here`, read for the plan's host (the business).
 *
 *   - A check is a BusinessInvoice tied to the plan and a guest's place in it. Staff with plans.manage send one ("Send
 *     a check"), or, on a plan with no deal on the bill (K7), a guest types their own total. It sends no bill to Mail,
 *     never lists as an ordinary invoice, and is paid only through these routes.
 *   - Every amount is the server's: the deal comes off (once a guest, on the part it covers), the tip choices are 18,
 *     20 and 25 percent of the amount before the deal, and the total is worked out here. The app never sends a
 *     discount or a total.
 *   - The payment is a 'plan_payment' with sold_type 'plan_bill': Pantopus's percent on the bill after the deal (5% for
 *     a guest Pantopus brought, 1% for the business's own), nothing on the tip, the card fee the business's (K9), paid
 *     out 48 hours after the plan ends. It is captured at once, as a paid spot is (open question 3).
 *   - Staff refund all or part until 48 hours after the plan ends; a full refund returns the tip, a part leaves it.
 */
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { isFeatureEnabled } = require('../featureFlagService');
const { recordFunnelEvent } = require('../funnelEvents');
const rules = require('./planRules');

const FLAG = 'plans_pay_here';
const TIP_PERCENTS = [18, 20, 25];
const CHECK_MIN = 100;
const CHECK_MAX = 200000;
const AFTER_END_MS = 48 * 60 * 60 * 1000;
const CAPTURED = ['captured_hold', 'transfer_scheduled', 'transfer_pending', 'transferred', 'refunded_partial'];
// The kinds whose plans start with tips on once guests can pay here (02-payments 6: on for food and drink, off for
// classes and tickets). A business's plan has no food-and-drink kind: watch parties (trivia, game night) and meetups
// and tastings are where a bar or a cafe hosts; sports, study and kids' sessions are classes.
const TIPS_ON_KINDS = ['watch_party', 'walk_coffee'];

const fail = (status, code, message, extra = {}) => {
  const { PlanError } = require('./planActions');
  throw new PlanError(status, code, message, extra);
};
const planPaid = () => require('./planPaid');
const planDeals = () => require('./planDeals');
const money = (cents) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;

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

// ── The plan form: pay_here and tips_on ──────────────────────

/** pay_here / tips_on posted with a business's plan: an object to save, or null (nothing sent, or the switch is off). */
async function payHereForNewPlan(hostAs, input, kind) {
  if (!hostAs || (input.pay_here === undefined && input.tips_on === undefined)) return null;
  if (!(await enabledFor(hostAs.business.id))) return null;
  const payHere = input.pay_here === true;
  if (payHere) await planPaid().assertMayCharge(hostAs.business.id);
  const tipsOn = payHere && (input.tips_on === undefined ? TIPS_ON_KINDS.includes(kind) : input.tips_on === true);
  return { pay_here: payHere, tips_on: tipsOn };
}

/** A change to pay_here / tips_on (editPlan), allowed at any time (contract 10.2). Null when nothing changes. */
async function payHereChange(plan, patch) {
  if (!plan.business_user_id || (patch.pay_here === undefined && patch.tips_on === undefined)) return null;
  if (!(await enabledFor(plan.host_user_id))) return null;
  const payHere = patch.pay_here === undefined ? Boolean(plan.pay_here) : patch.pay_here === true;
  if (payHere && !plan.pay_here) await planPaid().assertMayCharge(plan.business_user_id);
  let tipsOn = patch.tips_on === undefined ? Boolean(plan.tips_on) : patch.tips_on === true;
  if (payHere && !plan.pay_here && patch.tips_on === undefined) tipsOn = TIPS_ON_KINDS.includes(plan.kind);
  if (!payHere) tipsOn = false;
  if (payHere === Boolean(plan.pay_here) && tipsOn === Boolean(plan.tips_on)) return null;
  return { pay_here: payHere, tips_on: tipsOn };
}

/** The card's pay_here (D2 "Pay at {business}"), for staff and guests who are in, while the business has the switch. */
function cardView(plan, businessName) {
  if (!plan.pay_here) return null;
  return { tips_on: Boolean(plan.tips_on), text: `Pay at ${businessName || 'the business'}` };
}

// ── Who is asking ────────────────────────────────────────────

async function loadFor(user, postId, { staff = false } = {}) {
  const { loadViewer } = require('./planViewer');
  const planService = require('./planService');
  const viewer = await loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !plan.business_user_id || !plan.pay_here || !viewer.biz || !(await enabledFor(plan.host_user_id))) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (staff) {
    if (!viewer.businessManage?.has(String(plan.business_user_id))) fail(403, 'not_allowed', "Only the business's staff can do that.");
    return { viewer, plan };
  }
  const { data: request } = await supabaseAdmin.from('PlanRequest')
    .select('id, user_id, status, way_in, fee_basis, deal_used_at, deal_cents, deal_check_id, party_size, kids_count')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (!request || request.status !== 'accepted') fail(403, 'not_in', 'Only people who are in can pay here.');
  return { viewer, plan, request };
}

async function businessNameOf(plan) {
  const { data } = await supabaseAdmin.from('User').select('name, username').eq('id', plan.business_user_id).maybeSingle();
  return (data?.name || data?.username || 'The business').trim();
}

/** The deal that comes off a bill now (on or unlocked, or the smaller one after a short), while deals are on. */
async function billDealOf(plan) {
  if (!plan.deal || !(await planDeals().enabledFor(plan.host_user_id))) return null;
  const given = planDeals().givenNow(plan.deal);
  return planDeals().isBillDeal(given) ? given : null;
}

/** K7: with a deal on the bill (given now, or a group deal still open), only staff start a check. */
async function dealOnTheBill(plan) {
  if (!plan.deal || !(await planDeals().enabledFor(plan.host_user_id))) return false;
  return planDeals().isBillDeal(plan.deal) || planDeals().isBillDeal(plan.deal.if_short);
}

const CHECK_COLUMNS = 'id, business_user_id, recipient_user_id, plan_post_id, plan_request_id, subtotal_cents, total_cents, fee_cents, '
  + 'no_deal_cents, discount_cents, tip_cents, started_by, status, payment_id, stripe_payment_intent_id, created_at, paid_at';

function checkedAmount(value, field = 'amount_cents') {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < CHECK_MIN || cents > CHECK_MAX) fail(422, 'validation', 'A check can be $1 to $2,000.', { field });
  return cents;
}

// ── The lines, the deal and the tip (every amount the server's) ──

/**
 * What a check comes to with a tip: { discountCents, tipCents, totalCents, lines, tip_choices, no_tip }. The deal comes
 * off once a guest: a check paid with it, or any check after the guest used it, carries no discount. A check whose
 * payment is being confirmed holds the deal itself (deal_check_id, see finalize), so it keeps its price until then.
 */
async function pricedCheck(plan, check, request, { tipCents = 0, tipLabel = null } = {}) {
  const deal = await billDealOf(plan);
  const heldHere = Boolean(request?.deal_check_id) && String(request.deal_check_id) === String(check.id);
  const usedElsewhere = Boolean(request?.deal_used_at) && !heldHere && !(check.status === 'paid' && check.discount_cents > 0);
  const discount = check.status === 'paid' ? check.discount_cents
    : (deal && !usedElsewhere ? planDeals().billOffCents(deal, check.subtotal_cents, check.no_deal_cents) : 0);
  const amount = check.subtotal_cents;
  const tip = check.status === 'paid' ? check.tip_cents : tipCents;
  const total = amount - discount + tip;
  const lines = [{ key: 'amount', label: 'Food and drinks', cents: amount, text: money(amount) }];
  if (discount > 0) {
    lines.push({ key: 'deal', label: deal ? planDeals().shortOf(deal) : 'Deal', cents: -discount, text: `−${money(discount)}`, tone: 'ok' });
  }
  if (tip > 0) lines.push({ key: 'tip', label: tipLabel ? `Tip, ${tipLabel}` : 'Tip', cents: tip, text: money(tip) });
  lines.push({ key: 'total', label: 'You pay', cents: total, text: money(total) });
  const out = { discountCents: discount, tipCents: tip, totalCents: total, lines };
  if (plan.tips_on && check.status !== 'paid') {
    out.tip_choices = TIP_PERCENTS.map((pct) => {
      const t = Math.round((amount * pct) / 100);
      return { label: `${pct}%`, tip_cents: t, tip_text: money(t), total_cents: amount - discount + t, total_text: money(amount - discount + t) };
    });
    out.no_tip = { total_cents: amount - discount, total_text: money(amount - discount) };
  }
  return out;
}

async function checkView(plan, check, request, { tipCents = 0, tipLabel = null } = {}) {
  const businessName = await businessNameOf(plan);
  const priced = await pricedCheck(plan, check, request, { tipCents, tipLabel });
  const state = await checkState(check);
  const view = {
    id: check.id,
    state,
    started_by: check.started_by,
    heading: check.started_by === 'business' ? `Your check, sent by ${businessName}` : 'Your check',
    amount_cents: check.subtotal_cents,
    amount_text: money(check.subtotal_cents),
    no_deal_cents: check.no_deal_cents,
    lines: priced.lines,
    total_cents: priced.totalCents,
    total_text: money(priced.totalCents),
    tips_on: Boolean(plan.tips_on),
    // "…, before the deal" only when a deal comes off this check (contract 11.2).
    ...(priced.tip_choices ? { tip_choices: priced.tip_choices, no_tip: priced.no_tip,
      tip_base_text: `Percent of ${money(check.subtotal_cents)}${priced.discountCents > 0 ? ', before the deal' : ''}` } : {}),
    note_text: priced.discountCents > 0
      ? `The deal came off because you're paying here. The tip goes to ${businessName}; Pantopus takes none of it.`
      : `The tip goes to ${businessName}; Pantopus takes none of it.`,
  };
  if (state !== 'open') Object.assign(view, await paidFields(plan, check, businessName));
  return view;
}

async function checkState(check) {
  if (check.status !== 'paid' || !check.payment_id) return 'open';
  const { data: payment } = await supabaseAdmin.from('Payment').select('payment_status').eq('id', check.payment_id).maybeSingle();
  return payment?.payment_status === 'refunded_full' ? 'refunded' : 'paid';
}

/** C2's paid lines: when, by whom ("Dana L."), with what, and the receipt in Mail. */
async function paidFields(plan, check, businessName) {
  const { data: payment } = await supabaseAdmin.from('Payment').select('id, amount_total, refunded_amount, metadata, captured_at')
    .eq('id', check.payment_id).maybeSingle();
  const { data: payer } = await supabaseAdmin.from('User').select('first_name, last_name, name').eq('id', check.recipient_user_id).maybeSingle();
  const first = (payer?.first_name || payer?.name || '').trim().split(/\s+/)[0] || 'Guest';
  const initial = (payer?.last_name || '').trim().charAt(0);
  const when = new Date(check.paid_at || payment?.captured_at || Date.now());
  const zone = rules.timezoneForPlan(plan);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(when);
  const time = require('./planNotifications').timeText(when, zone);
  return {
    paid_text: `${day} · ${time}`,
    payer: initial ? `${first} ${initial}.` : first,
    method_text: payment?.metadata?.method_text || 'Card',
    paid_total_text: `Paid ${money(payment?.amount_total || check.total_cents)}`,
    refunded_cents: payment?.refunded_amount || 0,
    ...(payment?.refunded_amount ? { refunded_text: `${businessName} refunded ${money(payment.refunded_amount)}` } : {}),
    receipt: payment?.metadata?.receipt_mail_id ? { link: `/app/mailbox/${payment.metadata.receipt_mail_id}` } : null,
  };
}

// ── Making a check ───────────────────────────────────────────

async function insertCheck(plan, request, { amount, noDeal, startedBy }) {
  const { data, error } = await supabaseAdmin.from('BusinessInvoice').insert({
    business_user_id: plan.business_user_id, recipient_user_id: request.user_id,
    line_items: [{ description: 'Food and drinks', amount_cents: amount, quantity: 1 }],
    subtotal_cents: amount, fee_cents: 0, total_cents: amount, currency: 'usd', status: 'sent',
    memo: `Check for ${String(plan.post?.title || 'a plan').slice(0, 120)}`,
    plan_post_id: plan.post_id, plan_request_id: request.id, no_deal_cents: noDeal, started_by: startedBy,
  }).select(CHECK_COLUMNS).single();
  if (error) throw new Error(`Failed to make the check: ${error.message}`);
  return data;
}

/** POST /api/plans/:id/checks (staff): { request_id, amount_cents, no_deal_cents }. Makes the check and tells the guest. */
async function sendCheck(user, postId, body = {}) {
  const { plan } = await loadFor(user, postId, { staff: true });
  const planService = require('./planService');
  if (!planService.isUuid(body.request_id)) fail(422, 'validation', 'Choose a guest.', { field: 'request_id' });
  const { data: request } = await supabaseAdmin.from('PlanRequest').select('id, user_id, status, deal_used_at')
    .eq('id', body.request_id).eq('post_id', postId).maybeSingle();
  if (!request || request.status !== 'accepted') fail(404, 'not_found', 'This guest is not in.');
  const amount = checkedAmount(body.amount_cents);
  const noDeal = body.no_deal_cents === undefined || body.no_deal_cents === null ? 0 : Number(body.no_deal_cents);
  if (!Number.isInteger(noDeal) || noDeal < 0 || noDeal > amount) fail(422, 'validation', 'The part the deal doesn\'t cover can be $0 up to the amount.', { field: 'no_deal_cents' });
  const check = await insertCheck(plan, request, { amount, noDeal, startedBy: 'business' });
  const businessName = await businessNameOf(plan);
  await require('./planNotifications').notify({
    userId: request.user_id, type: 'plan_check', plan, recipientIsIn: true,
    title: `Your check from ${businessName}: ${money(amount)}`,
    body: (await billDealOf(plan)) ? `${plan.post.title}. Pay it here and the deal comes off.` : `${plan.post.title}. Pay it here.`,
    link: `/plans/${plan.post_id}`, metadata: { opens: 'check', check_id: check.id, request_id: request.id },
    idempotencyKey: `plan-check:${check.id}`,
  });
  recordFunnelEvent('plan_check_sent', { userId: plan.business_user_id, meta: { plan_id: plan.post_id, started_by: 'business', cents: amount } });
  return { check: await checkView(plan, check, request) };
}

/** POST /api/plans/:id/checks/mine (a guest who is in): { amount_cents }. Only on a plan with no deal on the bill (K7). */
async function startMine(user, postId, body = {}) {
  const { plan, request } = await loadFor(user, postId);
  if (await dealOnTheBill(plan)) fail(409, 'staff_send_checks', 'Ask your server for the check: the deal comes off when they send it.');
  const amount = checkedAmount(body.amount_cents);
  const { data: open } = await supabaseAdmin.from('BusinessInvoice').select(CHECK_COLUMNS)
    .eq('plan_request_id', request.id).eq('status', 'sent').order('created_at', { ascending: false }).limit(1);
  let check = open?.[0] || null;
  if (check && check.started_by === 'guest' && !check.payment_id) {
    const { data, error } = await supabaseAdmin.from('BusinessInvoice').update({
      subtotal_cents: amount, total_cents: amount, line_items: [{ description: 'Food and drinks', amount_cents: amount, quantity: 1 }],
    }).eq('id', check.id).is('payment_id', null).select(CHECK_COLUMNS).single();
    if (error) throw new Error(`Failed to change the check: ${error.message}`);
    check = data;
  } else if (!check) {
    check = await insertCheck(plan, request, { amount, noDeal: 0, startedBy: 'guest' });
    recordFunnelEvent('plan_check_sent', { userId: request.user_id, meta: { plan_id: plan.post_id, started_by: 'guest', cents: amount } });
  }
  return { check: await checkView(plan, check, request) };
}

/** GET /api/plans/:id/checks/mine: the guest's open check (or the last one paid), as C1 / C2 draw it. */
async function mine(user, postId) {
  const { plan, request } = await loadFor(user, postId);
  const { data } = await supabaseAdmin.from('BusinessInvoice').select(CHECK_COLUMNS)
    .eq('plan_request_id', request.id).in('status', ['sent', 'viewed', 'paid']).order('created_at', { ascending: false }).limit(5);
  const checks = data || [];
  const check = checks.find((c) => c.status !== 'paid') || checks[0] || null;
  return { check: check ? await checkView(plan, check, request) : null, can_start: !(await dealOnTheBill(plan)) };
}

async function guestCheck(user, postId, checkId) {
  const { plan, request, viewer } = await loadFor(user, postId);
  if (!require('./planService').isUuid(checkId)) fail(404, 'not_found', 'This check isn\'t available.');
  const { data: check } = await supabaseAdmin.from('BusinessInvoice').select(CHECK_COLUMNS)
    .eq('id', checkId).eq('plan_post_id', postId).eq('recipient_user_id', viewer.id).maybeSingle();
  if (!check) fail(404, 'not_found', 'This check isn\'t available.');
  return { plan, request, check, viewer };
}

function checkedTip(plan, value, amount) {
  if (value === undefined || value === null || Number(value) === 0) return 0;
  const tip = Number(value);
  if (!plan.tips_on) fail(422, 'validation', 'This check takes no tip.', { field: 'tip_cents' });
  if (!Number.isInteger(tip) || tip < 0 || tip > amount) fail(422, 'validation', 'A tip can be up to the amount of the check.', { field: 'tip_cents' });
  return tip;
}

function tipLabelOf(amount, tip) {
  const match = TIP_PERCENTS.find((pct) => Math.round((amount * pct) / 100) === tip);
  return match ? `${match}%` : null;
}

/** POST /api/plans/:id/checks/:checkId/quote { tip_cents }: the lines and the total for another tip; nothing saved. */
async function quote(user, postId, checkId, body = {}) {
  const { plan, request, check } = await guestCheck(user, postId, checkId);
  const tip = checkedTip(plan, body.tip_cents, check.subtotal_cents);
  return { check: await checkView(plan, check, request, { tipCents: tip, tipLabel: tipLabelOf(check.subtotal_cents, tip) }) };
}

// ── Paying ───────────────────────────────────────────────────

/** POST /api/plans/:id/checks/:checkId/pay { tip_cents }: the payment sheet's values for the server's total. */
async function pay(user, postId, checkId, body = {}) {
  const { plan, request, check, viewer } = await guestCheck(user, postId, checkId);
  if (check.status === 'paid') fail(409, 'already_paid', 'This check is already paid.');
  const tip = checkedTip(plan, body.tip_cents, check.subtotal_cents);
  const priced = await pricedCheck(plan, check, request, { tipCents: tip });
  if (priced.totalCents < 50) fail(422, 'validation', 'This check comes to less than a card can pay.', { field: 'amount_cents' });
  const svc = require('../../stripe/stripeService');
  let paymentId = check.payment_id;
  let clientSecret = null;
  if (paymentId) {
    const { data: existing } = await supabaseAdmin.from('Payment').select('id, stripe_payment_intent_id, amount_total, tip_cents, payment_status')
      .eq('id', paymentId).maybeSingle();
    if (existing && existing.amount_total === priced.totalCents && (existing.tip_cents || 0) === tip
      && ['authorize_pending', 'authorization_failed'].includes(existing.payment_status)) {
      clientSecret = await svc.getPaymentIntentClientSecret(existing.stripe_payment_intent_id).catch(() => null);
    } else if (existing && ['authorize_pending', 'authorization_failed', 'authorized'].includes(existing.payment_status)) {
      await svc.cancelAuthorization(existing.id).catch(() => null);
    }
    if (!clientSecret) paymentId = null;
  }
  if (!paymentId) {
    const end = new Date(plan.post.event_end_date || plan.post.event_date).getTime();
    const basis = request.fee_basis || planPaid().basisOf(request.way_in);
    const made = await svc.createPaymentIntentForGig({
      payerId: viewer.id, payeeId: plan.business_user_id, gigId: null, amount: priced.totalCents, feeRateSubjectId: plan.business_user_id,
      paymentType: 'plan_payment',
      metadata: { type: 'plan_check', plan_id: plan.post_id, request_id: request.id, check_id: check.id, business_user_id: plan.business_user_id },
      description: `Pantopus plan check - ${plan.post.title}`.slice(0, 200),
      idempotencyKey: `plan-check:${check.id}:${priced.totalCents}:${tip}:${check.payment_id || 'first'}`,
      sale: { soldType: 'plan_bill', soldId: check.id, basis, tipCents: tip, payoutAfter: new Date(end + AFTER_END_MS).toISOString() },
    });
    if (!made?.success) throw new Error('The payment could not be started');
    paymentId = made.paymentId;
    clientSecret = made.clientSecret;
    const { error } = await supabaseAdmin.from('BusinessInvoice').update({
      payment_id: paymentId, stripe_payment_intent_id: made.paymentIntentId, discount_cents: priced.discountCents, tip_cents: tip,
      total_cents: priced.totalCents, fee_cents: made.payment?.amount_platform_fee ?? 0,
    }).eq('id', check.id).neq('status', 'paid');
    if (error) throw new Error(`Failed to save the payment: ${error.message}`);
  }
  return {
    payment: await planPaid().paymentSheet(paymentId, priced.totalCents, clientSecret),
    check: await checkView(plan, { ...check, payment_id: paymentId }, request, { tipCents: tip, tipLabel: tipLabelOf(check.subtotal_cents, tip) }),
  };
}

/**
 * The payment went through: the check is paid, the deal used, the receipt filed. Safe to call twice: the app's confirm
 * and the payment's webhook both come here for the same check, often at the same moment.
 */
async function finalize(checkId) {
  const { data: check } = await supabaseAdmin.from('BusinessInvoice').select(CHECK_COLUMNS).eq('id', checkId).maybeSingle();
  if (!check?.payment_id) return 'gone';
  if (check.status === 'paid') return 'paid';
  const stamp = new Date().toISOString();
  // The deal comes off once a guest, so a check priced with it takes the guest's deal once its card hold is there and
  // before the money moves: of two such checks paid at once, only one is captured. deal_check_id names the check that
  // has it, so a second call for the same check (or a retry after a failed capture) takes it again instead of being
  // turned away. It is never handed back: a check that took the deal keeps its price until it is paid.
  let deal = null;
  const takeDeal = async () => {
    const { data: taken, error } = await supabaseAdmin.from('PlanRequest')
      .update({ deal_used_at: stamp, deal_cents: check.discount_cents, deal_check_id: check.id, updated_at: stamp })
      .eq('id', check.plan_request_id).or(`deal_used_at.is.null,deal_check_id.eq.${check.id}`).select('id');
    if (error) throw new Error(`Failed to take the deal: ${error.message}`);
    deal = taken && taken.length > 0 ? 'taken' : 'gone';
    return deal === 'taken';
  };
  const withDeal = check.discount_cents > 0 && Boolean(check.plan_request_id);
  const status = await planPaid().captureNow(check.payment_id, withDeal ? { beforeCapture: takeDeal } : {});
  if (deal === 'gone') {
    // Another check used the guest's deal. This hold is for the price with the deal off, so it is let go and the
    // guest pays the check again at its price now. The check forgets the payment only once the payment company
    // confirms the hold is gone: a throw here (it can't be let go yet) leaves everything as it was for the retry.
    await require('../../stripe/stripeService').cancelAuthorization(check.payment_id);
    await supabaseAdmin.from('BusinessInvoice').update({ payment_id: null, stripe_payment_intent_id: null, discount_cents: 0 })
      .eq('id', check.id).eq('payment_id', check.payment_id).neq('status', 'paid');
    return 'deal_already_used';
  }
  if (!CAPTURED.includes(status)) return 'not_paid';
  const { data: moved } = await supabaseAdmin.from('BusinessInvoice').update({ status: 'paid', paid_at: stamp })
    .eq('id', check.id).neq('status', 'paid').select(CHECK_COLUMNS);
  if (!moved || moved.length === 0) return 'paid';
  const paid = moved[0];
  const plan = await require('./planService').loadPlanRow(check.plan_post_id);
  if (paid.discount_cents > 0 && deal !== 'taken') {
    // The hold was captured by a call that never got this far: the deal is used all the same.
    await supabaseAdmin.from('PlanRequest').update({ deal_used_at: stamp, deal_cents: paid.discount_cents, deal_check_id: paid.id, updated_at: stamp })
      .eq('id', paid.plan_request_id).is('deal_used_at', null);
  }
  const svc = require('../../stripe/stripeService');
  await svc.settleCardFeeShare(paid.payment_id).catch((err) => logger.warn('plans.check.card_fee_later', { paymentId: paid.payment_id, error: err.message }));
  await saveMethod(paid.payment_id);
  await fileReceipt(plan, paid);
  const { data: request } = await supabaseAdmin.from('PlanRequest').select('user_id, way_in, fee_basis').eq('id', paid.plan_request_id).maybeSingle();
  await require('../businessCustomers').recordBusinessContact({ businessUserId: plan.business_user_id, userId: paid.recipient_user_id,
    feature: 'plan', wayIn: request?.way_in || null, basis: request?.fee_basis || planPaid().basisOf(request?.way_in), at: stamp }).catch(() => null);
  recordFunnelEvent('plan_check_paid', { userId: paid.recipient_user_id, meta: { plan_id: plan.post_id, cents: paid.total_cents, tip: paid.tip_cents, discount: paid.discount_cents } });
  return 'paid';
}

/** "Apple Pay", "Google Pay" or "Card", from the charge, kept on the payment for C2. Never fails. */
async function saveMethod(paymentId) {
  try {
    const { data: payment } = await supabaseAdmin.from('Payment').select('stripe_charge_id, metadata').eq('id', paymentId).maybeSingle();
    if (!payment?.stripe_charge_id || payment.metadata?.method_text) return;
    const charge = await require('../../stripe/getStripeClient').getStripeClient().charges.retrieve(payment.stripe_charge_id);
    const wallet = charge?.payment_method_details?.card?.wallet?.type;
    const method = wallet === 'apple_pay' ? 'Apple Pay' : wallet === 'google_pay' ? 'Google Pay' : 'Card';
    const { data: fresh } = await supabaseAdmin.from('Payment').select('metadata').eq('id', paymentId).maybeSingle();
    await supabaseAdmin.from('Payment').update({ metadata: { ...(fresh?.metadata || {}), method_text: method } }).eq('id', paymentId);
  } catch (err) {
    logger.warn('plans.check.method_skipped', { paymentId, error: err.message });
  }
}

/** The receipt, filed in the guest's Mail under Receipts (as a paid spot's is). Nothing while the mailbox is off. */
async function fileReceipt(plan, check) {
  try {
    const { isLaunchFeatureEnabled } = require('../../utils/featureFlags');
    if (!isLaunchFeatureEnabled('mailbox')) return null;
    const { ensureSystemFolders } = require('../mailVault');
    const { getAccessibleHomeIds } = require('../../utils/homeMailAccess');
    const mailDelivery = require('../mailDelivery');
    const userId = check.recipient_user_id;
    await ensureSystemFolders(userId, await getAccessibleHomeIds(userId));
    const { data: receipts } = await supabaseAdmin.from('VaultFolder').select('id').eq('user_id', userId)
      .eq('drawer', 'personal').eq('label', 'Receipts').eq('system', true).order('created_at').limit(1);
    const seller = await businessNameOf(plan);
    const zone = (await mailDelivery.personTimeZone(userId)) || mailDelivery.FALLBACK_TIME_ZONE;
    const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: zone });
    const title = String(plan.post?.title || 'the plan').slice(0, 120);
    const priced = await pricedCheck(plan, check, null);
    const made = await require('../pantopusLetters').sendSafe(`plan-check:${check.id}:${check.payment_id}`, {
      recipient_user_id: userId,
      subject: `Your receipt from ${seller}`,
      content: [
        `You paid ${money(check.total_cents)} at ${seller} for ${title}, on ${day}.`, '',
        ...priced.lines.map((line) => `${line.label}: ${line.text}`), '',
        `${seller} is the seller, and the prices include tax. Pantopus took the payment for ${seller}; the tip goes to ${seller}.`, '',
        'This is your receipt. Pantopus keeps it in your Vault, under Receipts.', '', 'Your Pantopus carrier',
      ].join('\n'),
      summary: `You paid ${money(check.total_cents)} at ${seller} on ${day}.`,
      key_facts: [{ label: 'Amount', value: money(check.total_cents) }, { label: 'Date', value: day }, { label: 'For', value: title }, { label: 'Seller', value: seller }],
      category: 'receipt', filed_folder_id: receipts?.[0]?.id || null, immediate: true,
    });
    if (!made?.id) return null;
    const { data: fresh } = await supabaseAdmin.from('Payment').select('metadata').eq('id', check.payment_id).maybeSingle();
    await supabaseAdmin.from('Payment').update({ metadata: { ...(fresh?.metadata || {}), receipt_mail_id: made.id } }).eq('id', check.payment_id);
    return made.id;
  } catch (err) {
    logger.warn('plans.check.receipt_skipped', { checkId: check?.id, error: err.message });
    return null;
  }
}

/** POST /api/plans/:id/checks/:checkId/confirm: the payment sheet closed. Answers the paid check (C2). */
async function confirm(user, postId, checkId) {
  const { plan, request, check } = await guestCheck(user, postId, checkId);
  if (!check.payment_id) fail(409, 'no_payment', 'No payment was started for this check.');
  let outcome;
  try {
    outcome = await finalize(check.id);
  } catch (err) {
    logger.warn('plans.check.confirm_failed', { checkId, error: err.message });
    fail(503, 'payment_check_failed', "We couldn't confirm this payment yet. Please try again in a moment.");
  }
  if (outcome === 'deal_already_used') {
    fail(409, 'deal_already_used', 'Your deal was already used on another check. Open this check again for the updated total.');
  }
  if (outcome === 'not_paid') fail(409, 'payment_not_complete', "This payment hasn't gone through yet.");
  const { data: fresh } = await supabaseAdmin.from('BusinessInvoice').select(CHECK_COLUMNS).eq('id', check.id).maybeSingle();
  const { data: req } = await supabaseAdmin.from('PlanRequest').select('id, deal_used_at').eq('id', request.id).maybeSingle();
  return { check: await checkView(plan, fresh, req) };
}


// ── A tip after a paid plan (B6, contract 11.5; 07-screens C4) ──

const TIP_LATER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The card's tip_later for a guest who paid for a spot, on a plan with tips on, from its end for 7 days, once: the three
 * choices as percents of what they paid. Null otherwise.
 */
function tipLaterView(plan, paidCents, tipped, now = Date.now()) {
  if (!plan.tips_on || !paidCents || tipped) return null;
  const end = new Date(plan.post?.event_end_date || plan.post?.event_date).getTime();
  if (!(end <= now && now < end + TIP_LATER_MS)) return null;
  return {
    until: new Date(end + TIP_LATER_MS).toISOString(),
    choices: TIP_PERCENTS.map((pct) => {
      const t = Math.max(100, Math.round((paidCents * pct) / 100));
      return { label: `${pct}%`, tip_cents: t, tip_text: money(t) };
    }),
  };
}

async function tipFor(user, postId) {
  const { loadViewer } = require('./planViewer');
  const planService = require('./planService');
  const viewer = await loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !plan.business_user_id || !plan.tips_on || !viewer.biz || !(await enabledFor(plan.host_user_id))) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  const { data: request } = await supabaseAdmin.from('PlanRequest').select('id, user_id, status, paid_cents, refunded_cents, fee_basis, way_in')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  const paid = request ? (request.paid_cents || 0) - (request.refunded_cents || 0) : 0;
  if (!request || !request.paid_cents || paid <= 0) fail(403, 'not_paid', 'Only people who paid for a spot can tip here.');
  const { data: tips } = await supabaseAdmin.from('Payment').select('id, payment_status, amount_total, stripe_payment_intent_id, stripe_customer_id')
    .eq('sold_type', 'plan_tip').eq('sold_id', request.id).order('created_at', { ascending: false });
  return { viewer, plan, request, paid, tips: tips || [] };
}

const TIPPED = ['captured_hold', 'transfer_scheduled', 'transfer_pending', 'transferred', 'refunded_partial'];

/** POST /api/plans/:id/tip { amount_cents }: the payment sheet's values for a tip after a paid plan, once, for 7 days. */
async function tipLater(user, postId, body = {}) {
  const { viewer, plan, request, paid, tips } = await tipFor(user, postId);
  if (tips.some((t) => TIPPED.includes(t.payment_status))) fail(409, 'already_tipped', 'You already left a tip for this plan.');
  if (!tipLaterView(plan, paid, false)) fail(409, 'tip_closed', 'Tips here open when the plan ends and close 7 days later.');
  const amount = Number(body.amount_cents);
  const most = Math.max(2000, paid);
  if (!Number.isInteger(amount) || amount < 100 || amount > most) fail(422, 'validation', `A tip can be $1 to ${money(most)}.`, { field: 'amount_cents' });
  const svc = require('../../stripe/stripeService');
  const open = tips.find((t) => t.amount_total === amount && ['authorize_pending', 'authorization_failed'].includes(t.payment_status));
  let paymentId = open?.id || null;
  let clientSecret = open ? await svc.getPaymentIntentClientSecret(open.stripe_payment_intent_id).catch(() => null) : null;
  if (!clientSecret) {
    for (const t of tips.filter((x) => ['authorize_pending', 'authorization_failed', 'authorized'].includes(x.payment_status))) {
      await svc.cancelAuthorization(t.id).catch(() => null);
    }
    const made = await svc.createPaymentIntentForGig({
      payerId: viewer.id, payeeId: plan.business_user_id, gigId: null, amount, feeRateSubjectId: plan.business_user_id,
      paymentType: 'plan_payment',
      metadata: { type: 'plan_tip', plan_id: plan.post_id, request_id: request.id, business_user_id: plan.business_user_id },
      description: `Pantopus plan tip - ${plan.post.title}`.slice(0, 200),
      idempotencyKey: `plan-tip:${request.id}:${amount}:${tips.length}`,
      // Nothing to Pantopus; the card fee is the business's (priceSale's plan_tip). Paid out with the next run.
      sale: { soldType: 'plan_tip', soldId: request.id, basis: request.fee_basis || planPaid().basisOf(request.way_in), payoutAfter: new Date().toISOString() },
    });
    if (!made?.success) throw new Error('The payment could not be started');
    paymentId = made.paymentId;
    clientSecret = made.clientSecret;
  }
  return { payment: await planPaid().paymentSheet(paymentId, amount, clientSecret) };
}

/** The tip's card was accepted: captured, its card fee fixed. Answers 'paid' or 'not_paid'. */
async function finalizeTip(paymentId) {
  const status = await planPaid().captureNow(paymentId);
  if (!TIPPED.includes(status)) return 'not_paid';
  await require('../../stripe/stripeService').settleCardFeeShare(paymentId).catch((err) => logger.warn('plans.tip.card_fee_later', { paymentId, error: err.message }));
  return 'paid';
}

/** POST /api/plans/:id/tip/confirm: answers { state: 'paid', text: "You tipped $5.00" }. Safe to call twice. */
async function tipConfirm(user, postId) {
  const { viewer, plan, tips } = await tipFor(user, postId);
  const done = tips.find((t) => TIPPED.includes(t.payment_status));
  if (done) return { state: 'paid', text: `You tipped ${money(done.amount_total)}` };
  const open = tips.find((t) => ['authorize_pending', 'authorized', 'capture_pending'].includes(t.payment_status));
  if (!open) fail(409, 'no_payment', 'No tip was started for this plan.');
  let outcome;
  try {
    outcome = await finalizeTip(open.id);
  } catch (err) {
    logger.warn('plans.tip.confirm_failed', { planId: postId, error: err.message });
    fail(503, 'payment_check_failed', "We couldn't confirm this payment yet. Please try again in a moment.");
  }
  if (outcome !== 'paid') fail(409, 'payment_not_complete', "This payment hasn't gone through yet.");
  recordFunnelEvent('plan_tip_paid', { userId: viewer.id, meta: { plan_id: plan.post_id, cents: open.amount_total } });
  return { state: 'paid', text: `You tipped ${money(open.amount_total)}` };
}

/** The webhook saw a check's (or a tip's, B6) card accepted: the same steps as confirm. */
async function onPaymentAuthorized(payment) {
  if (payment?.metadata?.type === 'plan_tip') {
    await finalizeTip(payment.id).catch((err) => logger.warn('plans.tip.webhook_finalize_failed', { paymentId: payment.id, error: err.message }));
    return;
  }
  const checkId = payment?.metadata?.check_id;
  if (payment?.metadata?.type !== 'plan_check' || !checkId) return;
  await finalize(checkId).catch((err) => logger.warn('plans.check.webhook_finalize_failed', { paymentId: payment.id, error: err.message }));
}

// ── The staff's guest list and refunds ───────────────────────

/** GET /api/plans/:id/checks (staff): board 14's list, its three totals and its note. */
async function staffList(user, postId) {
  const { plan } = await loadFor(user, postId, { staff: true });
  const { data: requests } = await supabaseAdmin.from('PlanRequest').select('id, user_id, status, way_in, fee_basis')
    .eq('post_id', postId).eq('status', 'accepted');
  const { data: checks } = await supabaseAdmin.from('BusinessInvoice').select(CHECK_COLUMNS).eq('plan_post_id', postId).order('created_at');
  const paymentIds = (checks || []).map((c) => c.payment_id).filter(Boolean);
  const { data: payments } = paymentIds.length
    ? await supabaseAdmin.from('Payment').select('id, payment_status, amount_total, refunded_amount, tip_cents').in('id', paymentIds) : { data: [] };
  const byPayment = new Map((payments || []).map((p) => [p.id, p]));
  const userIds = [...new Set((requests || []).map((r) => r.user_id))];
  const { data: users } = userIds.length ? await supabaseAdmin.from('User').select('id, first_name, last_name, name').in('id', userIds) : { data: [] };
  const names = new Map((users || []).map((u) => {
    const first = (u.first_name || u.name || '').trim().split(/\s+/)[0] || 'Guest';
    const initial = (u.last_name || '').trim().charAt(0);
    return [u.id, initial ? `${first} ${initial}.` : first];
  }));
  let paidCents = 0; let tipsCents = 0;
  const rows = (requests || []).map((r) => {
    const mineChecks = (checks || []).filter((c) => c.plan_request_id === r.id);
    const last = mineChecks[mineChecks.length - 1] || null;
    const lastPayment = last?.payment_id ? byPayment.get(last.payment_id) : null;
    for (const c of mineChecks.filter((x) => x.status === 'paid')) {
      const p = byPayment.get(c.payment_id);
      if (p && p.payment_status !== 'refunded_full') {
        paidCents += (p.amount_total - (p.refunded_amount || 0));
        tipsCents += c.tip_cents || 0;
      }
    }
    const state = !last ? 'none' : last.status === 'paid' ? (lastPayment?.payment_status === 'refunded_full' ? 'refunded' : 'paid') : 'sent';
    const basis = r.fee_basis || planPaid().basisOf(r.way_in);
    return {
      request_id: r.id, name: names.get(r.user_id) || 'Guest', brought_by: basis === 'own' ? 'own' : 'pantopus',
      brought_by_text: basis === 'own' ? 'Yours' : 'Pantopus',
      state,
      check: last ? {
        id: last.id, amount_cents: last.subtotal_cents, tip_cents: last.tip_cents, total_cents: last.total_cents,
        text: state === 'sent' ? `Check sent · ${money(last.subtotal_cents)}` : state === 'none' ? null
          : `${money(last.subtotal_cents - last.discount_cents)}${last.tip_cents ? ` · tip ${money(last.tip_cents)}` : ''}`,
        state_text: state === 'sent' ? 'Waiting' : state === 'paid' ? 'Paid' : 'Refunded',
        refunded_cents: lastPayment?.refunded_amount || 0,
      } : null,
    };
  });
  const deal = await billDealOf(plan);
  const end = new Date(plan.post.event_end_date || plan.post.event_date);
  return {
    totals: {
      in: rows.length, in_text: `${rows.length} ${rows.length === 1 ? 'guest' : 'guests'} in`,
      paid_cents: paidCents, paid_text: `${money(paidCents)} paid so far`, tips_cents: tipsCents, tips_text: `${money(tipsCents)} tips`,
    },
    rows,
    note_text: `"Pantopus" marks a guest Pantopus brought; "Yours" is your own.${deal ? ` Type the full amount on a check and the ${planDeals().offText(deal).replace(/ off$/, '')} deal comes off for the guest.` : ''} You're paid 48 hours after ${plan.post.title} ends.`,
    refund_until: new Date(end.getTime() + AFTER_END_MS).toISOString(),
    deal_on_bill: Boolean(deal),
  };
}

/** POST /api/plans/:id/checks/:checkId/refund (staff): all, or { amount_cents }, until 48 hours after the plan ends. */
async function refund(user, postId, checkId, body = {}) {
  const { plan, viewer } = await loadFor(user, postId, { staff: true });
  if (!require('./planService').isUuid(checkId)) fail(404, 'not_found', 'This check isn\'t available.');
  const { data: check } = await supabaseAdmin.from('BusinessInvoice').select(CHECK_COLUMNS).eq('id', checkId).eq('plan_post_id', postId).maybeSingle();
  if (!check || check.status !== 'paid' || !check.payment_id) fail(404, 'not_found', 'This check isn\'t paid.');
  const end = new Date(plan.post.event_end_date || plan.post.event_date).getTime();
  if (Date.now() > end + AFTER_END_MS) fail(409, 'refund_closed', 'Refunds here close 48 hours after the plan ends. Pantopus support can still help.');
  const { data: payment } = await supabaseAdmin.from('Payment').select('id, amount_total, refunded_amount, tip_cents, payment_status').eq('id', check.payment_id).maybeSingle();
  const left = payment.amount_total - (payment.refunded_amount || 0);
  if (left <= 0 || payment.payment_status === 'refunded_full') fail(409, 'already_refunded', 'This check is already refunded.');
  let amount = null;
  if (body.amount_cents !== undefined && body.amount_cents !== null) {
    amount = Number(body.amount_cents);
    // A part leaves the tip alone (02-payments 6); all of it returns the tip too.
    const most = left - (payment.tip_cents || 0);
    if (!Number.isInteger(amount) || amount < 50 || amount > left) fail(422, 'validation', `Refund $0.50 up to ${money(left)}.`, { field: 'amount_cents' });
    if (amount < left && amount > most) fail(422, 'validation', `A part can be up to ${money(most)}; the tip stays with the business unless you refund all of it.`, { field: 'amount_cents' });
    if (amount === left) amount = null;
  }
  const back = amount ?? left;
  const result = await require('../paymentRefundService').create({
    paymentId: payment.id, amount, reason: 'requested_by_customer', description: 'Plans: check_refund',
    actorId: viewer.id, actorMode: 'policy', requestId: planPaid().uuidFrom(`plan-check-refund:${check.id}:${payment.refunded_amount || 0}:${back}`),
  });
  if (!result?.success) fail(503, 'refund_pending', "The refund hasn't gone through yet. Try again in a moment.");
  if (amount !== null) await planPaid().repriceAfterPartialRefund(payment.id);
  const businessName = await businessNameOf(plan);
  await require('./planNotifications').notify({
    userId: check.recipient_user_id, type: 'plan_refunded', plan, recipientIsIn: true,
    title: `${businessName} refunded ${money(back)}`, body: `${plan.post.title}. A bank can take a few days.`,
    link: `/plans/${plan.post_id}`, metadata: { opens: 'check', check_id: check.id, amount_cents: back },
    idempotencyKey: `plan-check-refund:${check.id}:${payment.refunded_amount || 0}:${back}`,
  });
  return staffList(user, postId);
}

module.exports = {
  FLAG, TIP_PERCENTS, TIPS_ON_KINDS, enabledFor, switchByHost, payHereForNewPlan, payHereChange, cardView,
  sendCheck, startMine, mine, quote, pay, confirm, finalize, onPaymentAuthorized, staffList, refund, pricedCheck,
  tipLaterView, tipLater, tipConfirm,
};
