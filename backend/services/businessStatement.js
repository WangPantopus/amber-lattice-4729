/**
 * A business's monthly statement (the business graph's shared contract 5.4; Plans for the holidays 11.3 and 11.5).
 * GET /api/businesses/:businessId/statement?month=YYYY-MM, behind `business_statement` (off), for staff with
 * finance.view. No screen reads it yet: the statement's screens are the business graph's phase D.
 *
 * Sales are Payment rows paid to the business (or, for an invoice, to its owner's wallet for it) and captured in the
 * month (UTC). Per payment: paid − refunded − Pantopus's fee − the business's card fee = its share, which is paid out
 * or still waiting, so the totals add up. A payment refunded in full counts nothing to anyone. Tips are on their own
 * line with their share of the card fee: round(card fee × tip ÷ total) inside a bill (11.3), the whole fee for a tip
 * after a plan. `deal_cents` is what the plans' deals took off.
 */
const supabaseAdmin = require('../config/supabaseAdmin');

const CAPTURED = ['captured_hold', 'transfer_scheduled', 'transfer_pending', 'transferred', 'refunded_partial', 'refunded_full'];
const PAYMENT_COLUMNS = 'id, payer_id, payee_id, amount_total, refunded_amount, amount_platform_fee, amount_to_payee, amount_processing_fee, '
  + 'tip_cents, payment_status, payment_type, sold_type, sold_id, fee_basis, fee_pct, captured_at, transfer_completed_at, metadata';

function monthRange(month) {
  const now = new Date();
  // No month: this one. A month that isn't YYYY-MM: refused.
  if (month !== undefined && month !== null && month !== '' && !/^\d{4}-\d{2}$/.test(String(month))) return null;
  const value = month ? String(month) : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [y, m] = value.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  return { month: value, from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 1)).toISOString() };
}

/** The card fee the business bears on a payment (0 where Pantopus pays it, and on a full refund). */
function businessCardFee(p) {
  if (p.payment_status === 'refunded_full') return 0;
  if (p.metadata?.business_card_fee_cents != null) return Number(p.metadata.business_card_fee_cents);
  return p.metadata?.card_fee_by === 'business' ? Number(p.metadata?.card_fee_cents ?? p.amount_processing_fee ?? 0) : 0;
}

async function statementFor(businessId, monthParam) {
  const range = monthRange(monthParam);
  if (!range) return null;
  const [{ data: toBusiness, error: e1 }, { data: forBusiness, error: e2 }] = await Promise.all([
    supabaseAdmin.from('Payment').select(PAYMENT_COLUMNS).eq('payee_id', businessId).in('payment_status', CAPTURED)
      .gte('captured_at', range.from).lt('captured_at', range.to).limit(5000),
    supabaseAdmin.from('Payment').select(PAYMENT_COLUMNS).eq('metadata->>business_user_id', businessId).in('payment_status', CAPTURED)
      .gte('captured_at', range.from).lt('captured_at', range.to).limit(5000),
  ]);
  if (e1 || e2) throw new Error(`Failed to read the month's sales: ${(e1 || e2).message}`);
  const byId = new Map([...(toBusiness || []), ...(forBusiness || [])].map((p) => [p.id, p]));
  const payments = [...byId.values()];

  // What deals took off: a check's discount, a spot's saving or money back.
  const billIds = payments.filter((p) => p.sold_type === 'plan_bill' && p.sold_id).map((p) => p.sold_id);
  const spotIds = payments.filter((p) => p.sold_type === 'plan_spot' && p.sold_id).map((p) => p.sold_id);
  const [{ data: checks }, { data: spots }] = await Promise.all([
    billIds.length ? supabaseAdmin.from('BusinessInvoice').select('id, discount_cents').in('id', billIds) : { data: [] },
    spotIds.length ? supabaseAdmin.from('PlanRequest').select('id, deal_cents').in('id', spotIds) : { data: [] },
  ]);
  const discountOf = new Map([...(checks || []).map((c) => [c.id, c.discount_cents || 0]), ...(spots || []).map((r) => [r.id, r.deal_cents || 0])]);

  const totals = { sales: 0, customers: 0, paid_cents: 0, refunded_cents: 0, pantopus_fee_cents: 0, card_fee_cents: 0, paid_out_cents: 0,
    waiting_cents: 0, tips_cents: 0, tip_card_fee_cents: 0, deal_cents: 0 };
  const features = new Map();
  const payers = new Set();
  for (const p of payments) {
    const full = p.payment_status === 'refunded_full';
    const fee = full ? 0 : (p.amount_platform_fee || 0);
    const card = businessCardFee(p);
    const share = full ? 0 : (p.amount_total - (p.refunded_amount || 0) - fee - card);
    totals.sales += 1;
    payers.add(p.payer_id);
    totals.paid_cents += p.amount_total;
    totals.refunded_cents += p.refunded_amount || 0;
    totals.pantopus_fee_cents += fee;
    totals.card_fee_cents += card;
    if (p.payment_status === 'transferred') totals.paid_out_cents += share; else totals.waiting_cents += share;
    if (!full) {
      const tip = p.sold_type === 'plan_tip' ? p.amount_total : (p.tip_cents || 0);
      totals.tips_cents += tip;
      const wholeFee = Number(p.metadata?.card_fee_cents ?? p.amount_processing_fee ?? 0);
      totals.tip_card_fee_cents += p.sold_type === 'plan_tip' ? card : (tip > 0 ? Math.round((wholeFee * tip) / p.amount_total) : 0);
      totals.deal_cents += discountOf.get(p.sold_id) || 0;
    }
    const key = p.sold_type || (p.metadata?.type === 'invoice_payment' ? 'invoice' : p.payment_type);
    const row = features.get(key) || { sold_type: key, sales: 0, paid_cents: 0, pantopus_fee_cents: 0 };
    row.sales += 1; row.paid_cents += p.amount_total; row.pantopus_fee_cents += fee;
    features.set(key, row);
  }
  totals.customers = payers.size;

  // Who brought each customer, from the customer record.
  const { data: customers } = payers.size
    ? await supabaseAdmin.from('BusinessCustomer').select('user_id, first_met_at, first_way_in, first_basis, first_feature')
      .eq('business_user_id', businessId).in('user_id', [...payers]) : { data: [] };
  const customerOf = new Map((customers || []).map((c) => [c.user_id, c]));
  const isNew = (c) => c && c.first_met_at >= range.from && c.first_met_at < range.to;
  const wayRows = new Map();
  for (const p of payments) {
    const c = customerOf.get(p.payer_id);
    const basis = p.fee_basis || c?.first_basis || 'pantopus';
    const wayIn = c?.first_way_in || (basis === 'own' ? 'business' : 'map_list');
    const key = `${wayIn}:${basis}`;
    const row = wayRows.get(key) || { way_in: wayIn, basis, rate_pct: Number(p.fee_pct || 0), customers: new Set(), new: new Set(), fee_cents: 0 };
    row.customers.add(p.payer_id);
    if (isNew(c)) row.new.add(p.payer_id);
    row.fee_cents += p.payment_status === 'refunded_full' ? 0 : (p.amount_platform_fee || 0);
    wayRows.set(key, row);
  }
  const pantopusPayers = new Set(payments.filter((p) => (p.fee_basis || customerOf.get(p.payer_id)?.first_basis) === 'pantopus').map((p) => p.payer_id));
  const newIds = [...pantopusPayers].filter((id) => isNew(customerOf.get(id)));
  const { data: users } = newIds.length ? await supabaseAdmin.from('User').select('id, first_name, name').in('id', newIds) : { data: [] };
  const firstName = new Map((users || []).map((u) => [u.id, (u.first_name || u.name || '').trim().split(/\s+/)[0] || 'Guest']));
  const planIds = [...new Set(payments.map((p) => p.metadata?.plan_id).filter(Boolean))];
  const { data: posts } = planIds.length ? await supabaseAdmin.from('Post').select('id, title').in('id', planIds) : { data: [] };
  const titleOf = new Map((posts || []).map((x) => [x.id, x.title]));
  const newFromPantopus = newIds.map((id) => {
    const first = payments.filter((p) => p.payer_id === id).sort((a, b) => String(a.captured_at).localeCompare(String(b.captured_at)))[0];
    const c = customerOf.get(id);
    return {
      first_name: firstName.get(id) || 'Guest',
      what: titleOf.get(first?.metadata?.plan_id) || (first?.metadata?.type === 'invoice_payment' ? 'An invoice' : 'A sale'),
      on: String(c.first_met_at).slice(0, 10), way_in: c.first_way_in || 'map_list',
      paid_cents: first?.amount_total || 0, fee_cents: first?.payment_status === 'refunded_full' ? 0 : (first?.amount_platform_fee || 0),
    };
  });

  const { data: sent } = await supabaseAdmin.from('WalletTransaction').select('amount, created_at, type')
    .eq('user_id', businessId).eq('direction', 'debit').eq('type', 'withdrawal').gte('created_at', range.from).lt('created_at', range.to);

  return {
    month: range.month,
    headline: {
      pantopus_customers: pantopusPayers.size,
      pantopus_new: newIds.length,
      pantopus_fee_cents: payments.filter((p) => pantopusPayers.has(p.payer_id) && p.payment_status !== 'refunded_full')
        .reduce((sum, p) => sum + (p.amount_platform_fee || 0), 0),
    },
    totals,
    by_feature: [...features.values()].sort((a, b) => b.paid_cents - a.paid_cents),
    by_way_in: [...wayRows.values()].map((r) => ({ way_in: r.way_in, basis: r.basis, rate_pct: r.rate_pct, customers: r.customers.size, new: r.new.size, fee_cents: r.fee_cents })),
    new_from_pantopus: newFromPantopus,
    payouts: (sent || []).map((t) => ({ sent_on: String(t.created_at).slice(0, 10), cents: Number(t.amount) })),
  };
}

module.exports = { statementFor, monthRange, businessCardFee };
