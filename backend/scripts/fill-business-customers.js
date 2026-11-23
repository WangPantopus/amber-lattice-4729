#!/usr/bin/env node

/**
 * The customer record's first fill (the business graph's shared piece 3, docs/product/business-graph/
 * 02-shared-pieces-contract.md section 4.4): every business and person who have already dealt with each other get
 * their "BusinessCustomer" row, oldest dealing first, through the same function the server calls
 * (record_business_contact), so the first meeting is the real first one and the paid counts come from Payment.
 *
 * Read, oldest first:
 *   - paid invoices                      'invoice', own (a business invoices people it already knows)
 *   - bookings with a business           'booking', own (a booking does not record a Pantopus list yet)
 *   - tasks a business was chosen for    'task', pantopus (the task board brought them together)
 *   - business plans joined              'plan', by the request's way in (planRules.WAYS_IN)
 *
 * Usage:
 *   node backend/scripts/fill-business-customers.js            dry run: prints what it would write, writes nothing
 *   node backend/scripts/fill-business-customers.js --apply    writes
 *
 * Safe to run more than once: the function never rewrites a first meeting and counts payments again each time.
 * Prints counts and ids, never names, emails or addresses. On production this is the founder's step.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const supabaseAdmin = require('../config/supabaseAdmin');
const { WAYS_IN } = require('../services/plans/planRules');

const APPLY = process.argv.includes('--apply');
const PAGE = 1000;

async function readAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function businessIds() {
  const rows = await readAll(() => supabaseAdmin.from('User').select('id').eq('account_type', 'business').order('id'));
  return new Set(rows.map((r) => r.id));
}

async function contacts() {
  const businesses = await businessIds();
  const out = [];
  const invoices = await readAll(() => supabaseAdmin.from('BusinessInvoice')
    .select('id, business_user_id, recipient_user_id, paid_at, created_at').eq('status', 'paid').order('created_at'));
  for (const i of invoices) {
    out.push({ businessUserId: i.business_user_id, userId: i.recipient_user_id, feature: 'invoice', basis: 'own',
      at: i.paid_at || i.created_at, source: `invoice ${i.id}` });
  }
  const bookings = await readAll(() => supabaseAdmin.from('Booking')
    .select('id, owner_id, invitee_user_id, created_at, status').eq('owner_type', 'business')
    .not('invitee_user_id', 'is', null).order('created_at'));
  for (const b of bookings) {
    out.push({ businessUserId: b.owner_id, userId: b.invitee_user_id, feature: 'booking', basis: 'own', at: b.created_at,
      source: `booking ${b.id}` });
  }
  const tasks = await readAll(() => supabaseAdmin.from('Gig')
    .select('id, user_id, accepted_by, accepted_at, created_at').not('accepted_by', 'is', null).order('created_at'));
  for (const g of tasks) {
    if (!businesses.has(g.accepted_by)) continue;
    out.push({ businessUserId: g.accepted_by, userId: g.user_id, feature: 'task', basis: 'pantopus',
      at: g.accepted_at || g.created_at, source: `task ${g.id}` });
  }
  const plans = await readAll(() => supabaseAdmin.from('Plan').select('post_id, business_user_id')
    .not('business_user_id', 'is', null).order('post_id'));
  const planBusiness = new Map(plans.map((p) => [p.post_id, p.business_user_id]));
  if (planBusiness.size) {
    const ids = [...planBusiness.keys()];
    for (let i = 0; i < ids.length; i += 200) {
      const requests = await readAll(() => supabaseAdmin.from('PlanRequest')
        .select('id, post_id, user_id, way_in, created_at, decided_at').in('post_id', ids.slice(i, i + 200))
        .eq('status', 'accepted').order('created_at'));
      for (const r of requests) {
        out.push({ businessUserId: planBusiness.get(r.post_id), userId: r.user_id, feature: 'plan', wayIn: r.way_in || null,
          basis: WAYS_IN.own.includes(r.way_in) ? 'own' : 'pantopus', at: r.decided_at || r.created_at, source: `plan request ${r.id}` });
      }
    }
  }
  return out.filter((c) => c.businessUserId && c.userId && c.businessUserId !== c.userId && c.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

(async () => {
  const list = await contacts();
  const pairs = new Map();
  for (const c of list) {
    const key = `${c.businessUserId}:${c.userId}`;
    if (!pairs.has(key)) pairs.set(key, c);
  }
  const byFeature = {};
  for (const c of pairs.values()) byFeature[`${c.feature}/${c.basis}`] = (byFeature[`${c.feature}/${c.basis}`] || 0) + 1;
  console.log(`${list.length} dealings, ${pairs.size} business-person pairs. First meetings by feature/basis:`, byFeature);
  for (const c of pairs.values()) console.log(`  first: ${c.businessUserId} <- ${c.userId}  ${c.feature} ${c.basis} ${c.at} (${c.source})`);
  if (!APPLY) {
    console.log('\nDry run: nothing written. Run with --apply to write.');
    process.exit(0);
  }
  let written = 0; let skipped = 0;
  for (const c of list) {
    const { data, error } = await supabaseAdmin.rpc('record_business_contact', {
      p_business_user_id: c.businessUserId, p_user_id: c.userId, p_feature: c.feature, p_way_in: c.wayIn || null,
      p_basis: c.basis, p_brought_by_user_id: null, p_at: new Date(c.at).toISOString(),
    });
    if (error) throw error;
    if (data?.business_user_id) written += 1; else skipped += 1;
  }
  console.log(`\nWritten: ${written} calls; skipped (a block between them): ${skipped}.`);
  process.exit(0);
})().catch((err) => { console.error('fill-business-customers failed:', err.message); process.exit(1); });
