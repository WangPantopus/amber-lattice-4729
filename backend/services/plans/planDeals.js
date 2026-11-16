/**
 * Deals on a business's plan (Plans for the holidays, the business track: B1 in contract section 9, the money kinds in
 * 10.4 and 11). One deal a plan, from fixed kinds, saved as Plan.deal:
 *
 *   { scope: 'everyone'|'group', kind: 'free_item', item, group_size, group_by, if_short, state, settled_at }
 *
 * `state` is 'on' (a deal for everyone), 'open' (a group deal before its deadline), 'unlocked' or 'short' (written
 * once, by the Plans tick, at group_by). Every sentence a guest or a business reads about a deal is written here: an
 * app never composes one (screens rule 2). No deal on alcohol (P14): the choice does not exist and an item naming a
 * drink is refused. Behind the switch `plans_deals`, read for the plan's host (the business) as `plans` is.
 */
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { isFeatureEnabled } = require('../featureFlagService');
const { recordFunnelEvent } = require('../funnelEvents');

const FLAG = 'plans_deals';
// The kinds a deal may be in this build. The money kinds (percent, amount, two_for_one) arrive with paying (10.4, 11).
const KINDS = ['free_item'];
const ITEM_MAX = 40;
// Drinks a "something free" may not be. Word-bounded, so "ginger ale" is refused but "gingerbread" is not.
const ALCOHOL = /\b(beers?|wines?|cocktails?|shots?|pints?|ales?|lagers?|ipas?|stouts?|hard cider|meads?|margaritas?|mimosas?|sangrias?|champagne|prosecco|whiske?y|bourbon|scotch|vodka|gin|rum|tequila|mezcal|sake|soju|liquor|booze|spirits|alcohol|alcoholic|hard seltzers?|bloody marys?|mojitos?|martinis?|bellinis?)\b/i;

const fail = (status, code, message, field) => {
  const { PlanError } = require('./planActions');
  throw new PlanError(status, code, message, field ? { field } : {});
};

async function enabledFor(hostUserId) {
  return Boolean(hostUserId) && isFeatureEnabled(FLAG, String(hostUserId));
}

/** Each host's switch, for the cards (one read a host; none while it's off for everyone). */
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

// ── Checking what a business asks for ────────────────────────

function checkedItem(value, errors, field) {
  const item = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!item) { errors[field] = 'Say what they get.'; return null; }
  if (item.length > ITEM_MAX) { errors[field] = `Keep it to ${ITEM_MAX} characters.`; return null; }
  if (ALCOHOL.test(item)) { errors[field] = "A deal can't include alcohol."; return null; }
  // "A free appetizer" and "free appetizer" read the same: the sentence adds its own words.
  return item.replace(/^(an?\s+)?free\s+/i, '').replace(/^an?\s+/i, '') || null;
}

/**
 * Checks a deal against the plan it sits on. Answers { deal, errors }: `deal` is the value to save (null when any
 * field is wrong), `errors` each wrong field's own sentence, as the form shows it under that field.
 * @param {object} input  what the business's form sent
 * @param {{ spots: number, startsAt: string|Date, now?: Date }} plan
 */
function checkDeal(input, { spots, startsAt, now = new Date() }) {
  const errors = {};
  if (!input || typeof input !== 'object') return { deal: null, errors: { deal: 'Choose a deal.' } };
  const scope = ['everyone', 'group'].includes(input.scope) ? input.scope : null;
  if (!scope) errors.scope = 'Choose who gets it.';
  const kind = KINDS.includes(input.kind) ? input.kind : null;
  if (!kind) errors.kind = 'Choose what they get.';
  const item = kind === 'free_item' ? checkedItem(input.item, errors, 'item') : null;

  const deal = { scope, kind, item, state: scope === 'group' ? 'open' : 'on', settled_at: null };
  if (scope === 'group') {
    const size = Number(input.group_size);
    const most = Number(spots) || 0;
    if (!Number.isInteger(size) || size < 2 || size > most) {
      errors.group_size = most >= 2 ? `Choose 2 to ${most} people.` : 'A group deal needs room for at least 2.';
    }
    const by = input.group_by ? new Date(input.group_by) : null;
    const start = new Date(startsAt);
    if (!by || Number.isNaN(by.getTime())) errors.group_by = 'Choose when it closes.';
    else if (by <= now) errors.group_by = 'Choose a time that is still ahead.';
    else if (by > start) errors.group_by = 'Choose a time before the plan starts.';
    deal.group_size = size;
    deal.group_by = by && !Number.isNaN(by.getTime()) ? by.toISOString() : null;
    // If it doesn't unlock: nothing (null), or a smaller deal of the same shape that everyone gets.
    if (input.if_short && typeof input.if_short === 'object') {
      const smallerKind = KINDS.includes(input.if_short.kind) ? input.if_short.kind : null;
      if (!smallerKind) errors.if_short = 'Choose the smaller deal.';
      const smallerItem = smallerKind === 'free_item' ? checkedItem(input.if_short.item, errors, 'if_short') : null;
      deal.if_short = { scope: 'everyone', kind: smallerKind, item: smallerItem };
    } else {
      deal.if_short = null;
    }
  }
  return Object.keys(errors).length ? { deal: null, errors } : { deal, errors: {} };
}

/** checkDeal, failing on the first wrong field (posting and changing a plan). */
function checkedDeal(input, plan) {
  const { deal, errors } = checkDeal(input, plan);
  if (!deal) {
    const [field, message] = Object.entries(errors)[0];
    fail(422, 'validation', message, field);
  }
  return deal;
}

// ── The server's sentences ───────────────────────────────────

/** "A free appetizer for the table". */
function textOf(deal) {
  if (!deal) return null;
  if (deal.kind === 'free_item') return `A free ${deal.item}`;
  return null;
}
const lowerFirst = (text) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/** The one tag a row in the list may carry: "Deal", or "20% off" for a percent (later steps). */
function tagOf(deal) {
  if (!deal) return null;
  return 'Deal';
}

/** The deal in a few words, for "Your deal": "A free appetizer for the table", "20% off food" (later steps). */
function shortOf(deal) {
  return textOf(deal);
}

function zoneOf(plan) {
  return plan ? require('./planRules').timezoneForPlan(plan) : 'America/Los_Angeles';
}

/** "if 12 people are in by Friday at 5:00 PM", under the sentence of a group deal. */
function conditionText(deal, plan) {
  if (deal?.scope !== 'group' || !deal.group_by) return null;
  const when = require('./planNotifications').whenText(deal.group_by, zoneOf(plan), { long: true, at: true });
  return `if ${deal.group_size} people are in by ${when}`;
}

/** The time left on an open group deal: "2 days left", "1 day left", "Closes at 5:00 PM" (its last day), "3 hours left". */
function leftText(deal, plan, now = Date.now()) {
  if (deal?.scope !== 'group' || deal.state !== 'open' || !deal.group_by) return null;
  const by = new Date(deal.group_by).getTime();
  const ms = by - now;
  if (ms <= 0) return null;
  const DAY = 24 * 60 * 60 * 1000;
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days left`;
  if (ms >= DAY) return '1 day left';
  const rules = require('./planRules');
  const tz = zoneOf(plan);
  if (rules.localParts(new Date(by), tz).date === rules.localParts(new Date(now), tz).date) {
    return `Closes at ${require('./planNotifications').timeText(new Date(by), tz)}`;
  }
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
}

/** How a guest claims it, for the business's form (D3 item 8). */
function claimLineOf(deal) {
  if (deal?.kind === 'free_item') return 'Your staff mark it used on the guest list. Once a guest.';
  return null;
}

/** What a group deal does if it falls short, in one line. */
function ifShortText(deal) {
  if (deal?.scope !== 'group') return null;
  const smaller = deal.if_short && typeof deal.if_short === 'object' ? textOf(deal.if_short) : null;
  return smaller
    ? `If it doesn't get to ${deal.group_size}, everyone still gets ${lowerFirst(smaller)}.`
    : `If it doesn't get to ${deal.group_size}, the night still happens, without the deal.`;
}

function shortText(deal) {
  const smaller = deal.if_short && typeof deal.if_short === 'object' ? textOf(deal.if_short) : null;
  return smaller ? `It didn't get to ${deal.group_size}. Everyone still gets ${lowerFirst(smaller)}.`
    : `It didn't get to ${deal.group_size}. The night still happens.`;
}

/** What the business's form shows for a deal it is choosing (POST /api/plans/deal-preview). */
function preview(input, plan) {
  const { deal, errors } = checkDeal(input, plan);
  if (!deal) return { ok: false, text: null, tag: null, condition_text: null, if_short_text: null, claim_text: null, errors };
  // The plan isn't saved yet: its times are read in the business's own zone (the location's, as posting does).
  const zonePlan = plan.timezone ? { timezone: plan.timezone } : null;
  return { ok: true, text: textOf(deal), tag: tagOf(deal), condition_text: conditionText(deal, zonePlan),
    if_short_text: ifShortText(deal), claim_text: claimLineOf(deal), errors: {} };
}

// ── The card ─────────────────────────────────────────────────

/** What a deal gives the guest now: the deal, the smaller one after it fell short, or nothing. */
function givenNow(deal) {
  if (deal.state === 'on' || deal.state === 'unlocked') return deal;
  if (deal.state === 'short' && deal.if_short && typeof deal.if_short === 'object') return deal.if_short;
  return null;
}

/**
 * The card's `deal` (contract 9.2), for an app that sent `biz=1`, while the plan's host has the switch.
 * @param {{ role: string, request: object|null, going: number, isPaid?: boolean }} opts
 */
function cardView(deal, { role, request = null, going = 0, plan = null, firstName = null }) {
  if (!deal || !deal.kind) return null;
  const out = {
    scope: deal.scope,
    kind: deal.kind,
    text: textOf(deal),
    tag: tagOf(deal),
    short: shortOf(deal),
    state: deal.state,
    condition_text: conditionText(deal, plan),
    group: deal.scope === 'group' ? {
      size: deal.group_size, in: going, left: Math.max(0, deal.group_size - going), by: deal.group_by,
      left_text: leftText(deal, plan),
    } : null,
    // Under the count while a group deal is open.
    if_short_text: deal.scope === 'group' && deal.state === 'open' ? ifShortText(deal) : null,
    // The banner or the card once a group deal settled.
    state_text: deal.state === 'unlocked' ? `Unlocked: ${going} are in` : deal.state === 'short' ? shortText(deal) : null,
    // The line under "I'm in" on a free plan (D1 item 5).
    join_text: deal.kind === 'free_item' ? 'Free to join. Show your deal there.' : null,
  };
  if (role === 'guest' && request?.status === 'accepted') {
    const given = givenNow(deal);
    out.mine = {
      state: request.deal_used_at ? 'used' : deal.state === 'open' ? 'waiting' : given ? 'ready' : 'none',
      // What they get now (the smaller deal after one fell short), and how it's claimed.
      short: given ? shortOf(given) : null,
      text: given?.kind === 'free_item' ? 'Show this to your server.' : null,
      // For something free, staff match the guest by first name (K8: no code).
      name: given?.kind === 'free_item' ? firstName : null,
      used_at: request.deal_used_at || null,
    };
  }
  if (role === 'host') {
    // What the business's form fills in for "Change", and whether it still may (nobody in yet).
    out.form = {
      scope: deal.scope, kind: deal.kind, item: deal.item || null,
      group_size: deal.group_size ?? null, group_by: deal.group_by ?? null, if_short: deal.if_short ?? null,
    };
    out.can_change = going === 0;
  }
  return out;
}

// ── Saving with a plan ───────────────────────────────────────

/** A deal posted with a business's plan (createPlan). Null when none was sent or the switch is off. */
async function dealForNewPlan(hostAs, input, { spots, startsAt }) {
  if (!hostAs || input.deal == null) return null;
  if (!(await enabledFor(hostAs.business.id))) return null;
  return checkedDeal(input.deal, { spots, startsAt });
}

/**
 * A change to a business's plan's deal (editPlan). Answers { update, removed } or null when nothing changes.
 * Once anyone is in, the deal can only be removed (and everyone in is told, by the caller).
 */
async function dealChange(plan, patch, { going, spots, startsAt }) {
  if (!plan.business_user_id || !(await enabledFor(plan.host_user_id))) return null;
  if (patch.deal === undefined) {
    // The plan's own room or start moved under an existing group deal: it must still fit.
    if (plan.deal?.scope === 'group' && plan.deal.state === 'open') {
      if (spots < plan.deal.group_size) fail(422, 'validation', `The group deal needs ${plan.deal.group_size}. Change the deal first.`, 'spots');
      if (new Date(startsAt) < new Date(plan.deal.group_by)) {
        fail(422, 'validation', 'The plan would start before its group deal closes. Change the deal first.', 'starts_at');
      }
    }
    return null;
  }
  if (patch.deal === null) return plan.deal ? { update: null, removed: true } : null;
  if (going > 0) fail(409, 'deal_locked', "The deal can't change once someone is in. You can remove it.", 'deal');
  return { update: checkedDeal(patch.deal, { spots, startsAt }), removed: false };
}

// ── Marking a free thing used (staff) ────────────────────────

async function markUsed(plan, requestId) {
  const deal = plan.deal;
  const { data: request, error } = await supabaseAdmin.from('PlanRequest')
    .select('id, post_id, user_id, status, deal_used_at').eq('id', requestId).eq('post_id', plan.post_id).maybeSingle();
  if (error) throw new Error(`Failed to read the guest: ${error.message}`);
  if (!request || request.status !== 'accepted') fail(404, 'not_found', 'This guest is not in.');
  const given = deal ? givenNow(deal) : null;
  if (!given || given.kind !== 'free_item') fail(409, 'no_deal', 'There is nothing to mark used for this guest.');
  if (request.deal_used_at) return request;
  const { data: marked, error: markError } = await supabaseAdmin.from('PlanRequest')
    .update({ deal_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', request.id).is('deal_used_at', null).select('id, post_id, user_id, status, deal_used_at').maybeSingle();
  if (markError) throw new Error(`Failed to mark it used: ${markError.message}`);
  if (marked) return marked;
  const { data: again } = await supabaseAdmin.from('PlanRequest').select('id, post_id, user_id, status, deal_used_at').eq('id', request.id).maybeSingle();
  return again;
}

// ── The Plans tick: settling a group deal, and the close notice ──

const DAY_MS = 24 * 60 * 60 * 1000;

async function acceptedOf(postId) {
  const { data, error } = await supabaseAdmin.from('PlanRequest').select('id, user_id, party_size, kids_count, status')
    .eq('post_id', postId).eq('status', 'accepted');
  if (error) throw new Error(`Failed to read who is in: ${error.message}`);
  return data || [];
}

/** People who opened the plan and did not join, who may be told about it (B10: they have the business switch). */
async function lookedButDidNotJoin(plan, inIds) {
  const { data } = await supabaseAdmin.from('FunnelEvent').select('user_id')
    .eq('event_type', 'plan_viewed').eq('meta->>plan_id', plan.post_id).not('user_id', 'is', null).limit(500);
  const staff = new Set(await require('./planBusiness').staffToNotify(plan));
  const ids = [...new Set((data || []).map((r) => String(r.user_id)))]
    .filter((id) => !inIds.has(id) && !staff.has(id) && id !== String(plan.business_user_id));
  const allowed = [];
  for (const id of ids) {
    if (await isFeatureEnabled('plans_business', id).catch(() => false)) allowed.push(id);
  }
  return allowed;
}

async function runDealTick({ now = new Date() } = {}) {
  const { data: plans, error } = await supabaseAdmin.from('Plan')
    .select('post_id, host_user_id, business_user_id, kind, spots, status, timezone, place_latitude, place_longitude, deal, post:Post!inner(title, event_date, event_end_date)')
    .eq('status', 'open').eq('deal->>scope', 'group').eq('deal->>state', 'open').limit(200);
  if (error) throw new Error(`Failed to read group deals: ${error.message}`);
  let settled = 0; let closeSent = 0;
  const planNotify = require('./planNotifications');
  const rules = require('./planRules');
  for (const plan of plans || []) {
    try {
      if (!(await enabledFor(plan.host_user_id))) continue;
      const deal = plan.deal;
      const by = new Date(deal.group_by);
      const accepted = await acceptedOf(plan.post_id);
      const going = require('./planService').seatsTaken(plan, accepted);
      const business = (await require('./planBusiness').attachBusinessHosts([plan]))[0]?.business;
      const businessName = business?.name || 'The host';
      if (by <= now) {
        const state = going >= deal.group_size ? 'unlocked' : 'short';
        const next = { ...deal, state, settled_at: now.toISOString() };
        const { data: written, error: writeError } = await supabaseAdmin.from('Plan').update({ deal: next, updated_at: now.toISOString() })
          .eq('post_id', plan.post_id).eq('deal->>state', 'open').select('post_id').maybeSingle();
        if (writeError) throw writeError;
        if (!written) continue;
        settled += 1;
        recordFunnelEvent(state === 'unlocked' ? 'plan_deal_unlocked' : 'plan_deal_short', {
          userId: plan.business_user_id, meta: { plan_id: plan.post_id, kind: plan.kind, in: going, size: deal.group_size },
        });
        const settledPlan = { ...plan, deal: next };
        for (const request of accepted) {
          if (state === 'unlocked') {
            await planNotify.notify({
              userId: request.user_id, type: 'plan_deal_unlocked', plan: settledPlan, recipientIsIn: true,
              title: `Unlocked: ${lowerFirst(textOf(deal))}`,
              body: `${going} are in. Show your deal there.`,
              link: `/plans/${plan.post_id}`, metadata: { request_id: request.id },
              idempotencyKey: `plan-deal-unlocked:${plan.post_id}:${request.user_id}`,
            });
          } else {
            const smaller = deal.if_short && typeof deal.if_short === 'object' ? textOf(deal.if_short) : null;
            await planNotify.notify({
              userId: request.user_id, type: 'plan_deal_short', plan: settledPlan, recipientIsIn: true,
              title: `${plan.post.title} didn't get to ${deal.group_size}`,
              body: smaller ? `Everyone still gets ${lowerFirst(smaller)}.` : 'It still happens, without the deal.',
              link: `/plans/${plan.post_id}`, metadata: { request_id: request.id },
              idempotencyKey: `plan-deal-short:${plan.post_id}:${request.user_id}`,
            });
          }
        }
        continue;
      }
      // In the deal's last day, while it is short: once, to the people in and the people who looked.
      if (by.getTime() - now.getTime() <= DAY_MS && going < deal.group_size && !deal.close_sent_at) {
        const marked = { ...deal, close_sent_at: now.toISOString() };
        const { data: written, error: writeError } = await supabaseAdmin.from('Plan').update({ deal: marked })
          .eq('post_id', plan.post_id).eq('deal->>state', 'open').is('deal->>close_sent_at', null).select('post_id').maybeSingle();
        if (writeError) throw writeError;
        if (!written) continue;
        closeSent += 1;
        const left = deal.group_size - going;
        const closes = planNotify.timeText(by, rules.timezoneForPlan(plan));
        const inIds = new Set(accepted.map((r) => String(r.user_id)));
        const recipients = [...inIds, ...(await lookedButDidNotJoin(plan, inIds))];
        for (const userId of recipients) {
          await planNotify.notify({
            userId, type: 'plan_deal_close', plan, recipientIsIn: inIds.has(userId),
            title: `${left} more and ${plan.post.title} gets ${lowerFirst(textOf(deal))}`,
            body: `${going} ${going === 1 ? 'is' : 'are'} in at ${businessName}. It closes at ${closes}. Bring a friend?`,
            link: `/plans/${plan.post_id}`,
            idempotencyKey: `plan-deal-close:${plan.post_id}:${userId}`,
          });
        }
      }
    } catch (err) {
      logger.warn('plans.tick.deal_failed', { planId: plan.post_id, error: err.message });
    }
  }
  return { settled, closeSent };
}

/** The business took its deal off: everyone in is told (contract 9.2). */
async function notifyRemoved(plan, accepted, businessName) {
  const planNotify = require('./planNotifications');
  for (const request of accepted) {
    await planNotify.notify({
      userId: request.user_id, type: 'plan_deal_removed', plan, recipientIsIn: true,
      title: `${businessName} took the deal off ${plan.post.title}`,
      body: 'The plan is still on.',
      link: `/plans/${plan.post_id}`, metadata: { request_id: request.id },
      idempotencyKey: `plan-deal-removed:${plan.post_id}:${request.user_id}:${Date.now()}`,
    });
  }
}

// ── The two routes ───────────────────────────────────────────

/**
 * POST /api/plans/deal-preview { business_user_id, deal, spots, starts_at }: the sentence a guest will read, how it
 * is claimed, and each wrong field's error, for staff with plans.manage. Nothing is saved. 404 while the business
 * doesn't have the switch (or the app can't draw a business's plan).
 */
async function previewFor(user, body = {}) {
  const { loadViewer } = require('./planViewer');
  const viewer = await loadViewer(user);
  const businessUserId = String(body.business_user_id || body.host_as?.business_user_id || '');
  if (!viewer.biz || !businessUserId || !(await enabledFor(businessUserId))) fail(404, 'not_found', "Deals aren't available yet.");
  if (!viewer.businessManage?.has(businessUserId)) fail(403, 'not_allowed', "You can't add deals for this business.");
  return preview(body.deal, { spots: body.spots, startsAt: body.starts_at });
}

/**
 * POST /api/plans/:id/requests/:requestId/deal-used: staff with plans.manage mark a guest's "something free" used.
 * Staff can't undo it. Answers { request_id, deal: { state: 'used', used_at } }.
 */
async function markUsedFor(user, postId, requestId) {
  const { loadViewer } = require('./planViewer');
  const planService = require('./planService');
  const viewer = await loadViewer(user);
  if (!planService.isUuid(postId) || !planService.isUuid(requestId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !plan.business_user_id || !viewer.biz || !(await enabledFor(plan.host_user_id))) fail(404, 'not_found', "This plan isn't available.");
  if (!viewer.businessManage?.has(String(plan.business_user_id))) fail(403, 'not_allowed', 'Only the business\'s staff can do that.');
  const marked = await markUsed(plan, requestId);
  return { request_id: marked.id, deal: { state: 'used', used_at: marked.deal_used_at } };
}

module.exports = {
  previewFor, markUsedFor,
  FLAG, KINDS, ALCOHOL, enabledFor, switchByHost, checkDeal, checkedDeal, textOf, tagOf, shortOf, conditionText, leftText, claimLineOf, ifShortText,
  preview, cardView, givenNow, dealForNewPlan, dealChange, markUsed, runDealTick, notifyRemoved, acceptedOf,
};
