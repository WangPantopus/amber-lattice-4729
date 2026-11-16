'use strict';

/**
 * Nearby Plans: the every-5-minutes tick (build brief §7).
 *
 *  1. Held pushes go out: quiet hours ended, or a 10-minute ask bundle closed
 *     (one push for the bundle, without buttons). A push whose moment has
 *     passed (the request was answered, the plan was cancelled) is dropped.
 *  2. Asking closes: requests still waiting expire, with a kind note.
 *  3. Plans end at their end time; their chat goes read-only 24 hours later.
 *  4. "Still coming?" asked once more of a guest who hasn't answered: 6 hours
 *     after it was asked, or 2 hours before the start if that is sooner.
 *  5. Reminders for people who are in: 2 hours before, or 7 PM the evening
 *     before a plan that starts before 10 AM. Guests without an account who
 *     are in get their one reminder email then (planGuests.sendReminders).
 *     Two days before, people in who claimed nothing on the bring list hear
 *     what is still open (planBring.sendStillOpen).
 *  6. The host's summary at 8 AM on the day, with how many requests are waiting.
 *  7. The assistant's nudges for hosts (services/ai/nudges/plans.js): weather
 *     and air, requests waiting as asking closes, and after the plan.
 *  8. Standing rules (services/ai/rules.js): next week's plan for hosts who
 *     turned on a weekly plan, once this week's has ended.
 *
 * Every send is claimed first with a conditional update (or a notice's
 * idempotency key), so two runners (or a retry) never send the same notice twice.
 */

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const rules = require('../services/plans/planRules');
const planService = require('../services/plans/planService');
const planChat = require('../services/plans/planChat');
const planNotify = require('../services/plans/planNotifications');
const planBusiness = require('../services/plans/planBusiness');
const { isLaunchFeatureEnabled } = require('../utils/featureFlags');
const { activeRequests, waitingRequests, userNames, firstOf, cancelForGoneBusiness, seatsNow } = require('../services/plans/planActions');
const planGuests = require('../services/plans/planGuests');

const PLAN_NOTICE_TYPES = [
  'plan_request', 'plan_accepted', 'plan_declined', 'plan_reminder', 'plan_changed',
  'plan_cancelled', 'plan_spot_opened', 'plan_host_summary',
  'plan_guest_left', 'plan_guest_auto_joined', 'plan_still_coming_reminder',
  'plan_invite', 'plan_invite_declined', 'plan_series',
  // Guests without an account (Plans for the holidays, H1), and the bring list (H2).
  'plan_guest_answered', 'plan_guest_waiting', 'plan_bring_claimed', 'plan_bring_open',
  // The host moved a plan to their home and guests from the open link wait (6.8), people with an account too (6.9).
  'plan_moved_home', 'plan_moved_home_wait',
  // The business track: deals (B1), money back on a paid spot or a group price (B2, B4), a check at the place (B5).
  'plan_deal_close', 'plan_deal_unlocked', 'plan_deal_short', 'plan_deal_removed', 'plan_refunded', 'plan_check',
  // The extras: find a date's pick.
  'plan_date_picked',
];
const CHAT_OPEN_AFTER_END_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// "Still coming?" again: 6 hours after it was asked, or 2 hours before the start if
// sooner, never within an hour of the first ask.
const STILL_COMING_AGAIN_MS = 6 * HOUR_MS;
const STILL_COMING_BEFORE_START_MS = 2 * HOUR_MS;
const STILL_COMING_MIN_GAP_MS = HOUR_MS;

const iso = (d) => new Date(d).toISOString();

/** What each plan's host is called in a notice: a person's first name, a business's own name. */
async function hostFirstNames(plans) {
  await planBusiness.attachBusinessHosts(plans);
  const names = await userNames(plans.filter((p) => !p.business_user_id).map((p) => p.host_user_id));
  return (plan) => (plan.business_user_id
    ? plan.business?.name || 'The host'
    : firstOf(names.get(String(plan.host_user_id))));
}

// ── 1. Held pushes ───────────────────────────────────────────

async function claimNotice(row, patch) {
  const metadata = { ...(row.metadata || {}), ...patch };
  const { data, error } = await supabaseAdmin.from('Notification')
    .update({ metadata })
    .eq('id', row.id)
    .is('metadata->>push_sent_at', null)
    .select('id');
  if (error) {
    logger.warn('plans.jobs.claim_failed', { id: row.id, error: error.message });
    return false;
  }
  row.metadata = metadata;
  return Boolean(data && data.length);
}

/** Has this notice's moment passed? */
/** A plan still picking its date (planDates): nothing runs on its time. */
const picking = (plan) => require('../services/plans/planDates').isPicking(plan);
const allTimesPast = (plan, now) => (plan.date_options.options || []).every((o) => new Date(o.ends_at).getTime() <= now);

function isStale(row, plan, request, invite = null) {
  if (!plan) return true;
  // Money coming back is news whatever happened to the plan (a cancellation refunds everyone).
  if (plan.status === 'cancelled' && !['plan_cancelled', 'plan_refunded'].includes(row.type)) return true;
  const ended = new Date(plan.post.event_end_date).getTime() <= Date.now();
  switch (row.type) {
    // Answered or taken back in the meantime, or asking closed.
    case 'plan_invite': return !invite || invite.status !== 'pending'
      || !rules.isAskingOpen(plan, plan.post.event_date, plan.post.event_end_date);
    case 'plan_invite_declined': return ended;
    // A guest without an account: removed since, or (waiting) let in or answered otherwise since.
    case 'plan_guest_answered': return !invite || invite.status !== 'accepted' || ended;
    case 'plan_guest_waiting': return !invite || invite.status !== 'accepted' || !invite.needs_host_ok || ended;
    case 'plan_moved_home': return ended;
    // Let in, or out of the plan, since.
    case 'plan_moved_home_wait': return !request || request.status !== 'pending' || ended;
    // About the series, not this date: it is still news after the date has ended.
    case 'plan_series': return false;
    case 'plan_request': return !request || request.status !== 'pending' || ended;
    case 'plan_accepted': return !request || request.status !== 'accepted' || ended;
    case 'plan_changed': return !request || request.status !== 'accepted' || request.reconfirmed != null || ended;
    case 'plan_reminder': return !request || request.status !== 'accepted' || ended;
    case 'plan_host_summary': return new Date(plan.post.event_date).getTime() <= Date.now();
    case 'plan_guest_auto_joined': return !request || request.status !== 'accepted' || ended;
    case 'plan_guest_left': return ended;
    // "You're in" or "Sam will let you know soon": out of date once the request moved on (declined, left, answered).
    case 'plan_spot_opened': return !request || ended || (row.metadata?.now_in === true
      ? request.status !== 'accepted'
      : row.metadata?.now_in === false ? request.status !== 'pending' : !['accepted', 'pending'].includes(request.status));
    // Answered, left, or asked about a later change since.
    case 'plan_still_coming_reminder': return !request || request.status !== 'accepted' || request.reconfirmed != null
      || ended || new Date(request.reconfirm_requested_at).toISOString() !== row.metadata?.asked_at;
    case 'plan_deal_close':
    case 'plan_deal_unlocked':
    case 'plan_deal_short':
    case 'plan_deal_removed':
    case 'plan_check': return ended;
    case 'plan_refunded': return false;
    default: return false;
  }
}

async function releaseHeldPushes() {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('Notification')
    .select('id, user_id, type, title, body, link, metadata, created_at')
    .in('type', PLAN_NOTICE_TYPES)
    .lte('metadata->>push_deferred_until', now)
    .is('metadata->>push_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw new Error(`Failed to read held pushes: ${error.message}`);
  if (!rows || rows.length === 0) return 0;

  const plans = new Map((await planService.loadPlanRows(rows.map((r) => r.metadata?.plan_id).filter(planService.isUuid)))
    .map((p) => [p.post_id, p]));
  const requestIds = rows.map((r) => r.metadata?.request_id).filter(planService.isUuid);
  const requests = new Map();
  if (requestIds.length) {
    const { data } = await supabaseAdmin.from('PlanRequest').select('id, status, reconfirmed, reconfirm_requested_at').in('id', requestIds);
    for (const r of data || []) requests.set(r.id, r);
  }
  const inviteIds = rows.map((r) => r.metadata?.invite_id).filter(planService.isUuid);
  const invites = new Map();
  if (inviteIds.length) {
    const { data } = await supabaseAdmin.from('PlanInvite').select('id, status, needs_host_ok').in('id', inviteIds);
    for (const i of data || []) invites.set(i.id, i);
  }

  let sent = 0;
  const bundles = new Map();
  for (const row of rows) {
    const plan = plans.get(row.metadata?.plan_id);
    const request = requests.get(row.metadata?.request_id);
    if ((row.type === 'plan_request' || row.type === 'plan_guest_answered') && row.metadata?.bundled) {
      const key = `${row.type}:${row.user_id}:${row.metadata.plan_id}`;
      if (!bundles.has(key)) bundles.set(key, { plan, type: row.type, rows: [] });
      bundles.get(key).rows.push({ row, request, invite: invites.get(row.metadata?.invite_id) });
      continue;
    }
    const stale = isStale(row, plan, request, invites.get(row.metadata?.invite_id));
    if (!(await claimNotice(row, { push_sent_at: now, ...(stale ? { push_skipped: true } : {}) }))) continue;
    if (!stale) {
      // Held overnight, "tomorrow" is today: the push and its row say the day as of now.
      const text = planNotify.heldPushText(row, plan);
      if (text.title !== row.title || text.body !== row.body) {
        const { error: textError } = await supabaseAdmin.from('Notification')
          .update({ title: text.title, body: text.body }).eq('id', row.id);
        if (textError) logger.warn('plans.jobs.held_text_update_failed', { id: row.id, error: textError.message });
      }
      await planNotify.sendPush({ ...row, ...text });
      sent += 1;
    }
  }

  // One push for each closed ask bundle, without buttons: it opens the requests. Guests who said they're in within an
  // hour (H1) go as one push too, which opens the plan's "Who's coming".
  for (const { plan, type, rows: members } of bundles.values()) {
    const live = members.filter(({ row, request, invite }) => !isStale(row, plan, request, invite));
    const claimed = [];
    for (const { row } of members) {
      if (await claimNotice(row, { push_sent_at: now, ...(live.some((m) => m.row.id === row.id) ? {} : { push_skipped: true }) })) {
        claimed.push(row);
      }
    }
    const toSend = claimed.filter((row) => live.some((m) => m.row.id === row.id));
    if (!plan || toSend.length === 0) continue;
    const first = toSend[0];
    if (type === 'plan_guest_answered') {
      await planNotify.sendPush({
        id: first.id,
        user_id: first.user_id,
        type,
        title: toSend.length === 1 ? first.title : `${first.metadata?.guest_name || 'Someone'} and ${toSend.length - 1} more are in`,
        body: first.body,
        link: `/plans/${plan.post_id}`,
        metadata: { plan_id: plan.post_id, kind: plan.kind, recipient_user_id: first.user_id, bundled: true, count: toSend.length, opens: 'whos_coming' },
      });
      sent += 1;
      continue;
    }
    // The asker's first name as the notice stored it ("A neighbor" stays whole), else the title's first word.
    const firstName = first.metadata?.requester_name || String(first.title).split(' ')[0];
    const title = toSend.length === 1
      ? first.title
      : `${firstName} and ${toSend.length - 1} more asked to join your ${planNotify.noun(plan)}`;
    await planNotify.sendPush({
      id: first.id,
      user_id: first.user_id,
      type: 'plan_request',
      title,
      body: 'Open your plan to answer.',
      link: `/plans/${plan.post_id}/requests`,
      metadata: { plan_id: plan.post_id, kind: plan.kind, recipient_user_id: first.user_id, bundled: true, count: toSend.length },
    });
    sent += 1;
  }
  return sent;
}

// ── 2 and 3. Asking closes, plans end, chats close ───────────

async function closeAskingAndEnd() {
  const now = Date.now();
  // Asking closes at the start, or 30 minutes before the end for pickup games and
  // walks (which can be before the start of a very short plan): every candidate
  // starts within the next 31 minutes or already has.
  const { data: open, error } = await supabaseAdmin
    .from('Plan')
    .select(planService.PLAN_SELECT)
    .eq('status', 'open')
    .lte('post.event_date', new Date(now + 31 * 60 * 1000).toISOString())
    .limit(300);
  if (error) throw new Error(`Failed to read plans: ${error.message}`);
  // A plan still picking its date (the extras' find a date) runs on no time until it is picked, unless every time it
  // offered has gone by.
  const plans = (open || []).filter((p) => (!picking(p) || allTimesPast(p, now))
    && rules.askingClosesAt(p.kind, p.post.event_date, p.post.event_end_date).getTime() <= now);
  const hostFirst = await hostFirstNames(plans);
  let expiredCount = 0;
  let endedCount = 0;

  for (const plan of plans) {
    const waiting = (await activeRequests(plan.post_id)).filter((r) => r.status === 'pending' || r.status === 'waitlisted');
    for (const request of waiting) {
      const { data: expired } = await supabaseAdmin.from('PlanRequest')
        .update({ status: 'expired', updated_at: iso(now) })
        .eq('id', request.id).eq('status', request.status).select('id');
      if (!expired || expired.length === 0) continue;
      await planNotify.expired({ plan, request, hostFirst: hostFirst(plan) });
      expiredCount += 1;
    }
    if (new Date(plan.post.event_end_date).getTime() <= now) {
      const { data: ended } = await supabaseAdmin.from('Plan')
        .update({ status: 'ended', ended_at: plan.post.event_end_date, updated_at: iso(now) })
        .eq('post_id', plan.post_id).eq('status', 'open').select('post_id');
      if (ended && ended.length) endedCount += 1;
    }
  }

  // Chats go read-only 24 hours after the end.
  const { data: toClose } = await supabaseAdmin
    .from('Plan')
    .select(planService.PLAN_SELECT)
    .eq('status', 'ended')
    .is('chat_closed_at', null)
    .lte('ended_at', new Date(now - CHAT_OPEN_AFTER_END_MS).toISOString())
    .limit(300);
  let closedCount = 0;
  for (const plan of toClose || []) {
    if (plan.chat_room_id) await planChat.systemLine(plan.chat_room_id, plan.host_user_id, 'This chat is closed now');
    await planChat.closeRoom(plan);
    closedCount += 1;
  }
  return { expiredCount, endedCount, closedCount };
}

// ── 4. "Still coming?" asked again ──────────────────────────

/** When to ask once more, or null when that would be at or after the start. */
function stillComingAgainAt(askedAt, startsAt) {
  const asked = new Date(askedAt).getTime();
  const start = new Date(startsAt).getTime();
  const at = Math.max(asked + STILL_COMING_MIN_GAP_MS, Math.min(asked + STILL_COMING_AGAIN_MS, start - STILL_COMING_BEFORE_START_MS));
  return Number.isFinite(at) && at < start ? new Date(at) : null;
}

async function sendStillComingReminders() {
  const now = Date.now();
  // A plan starts at most 14 days ahead, so an unanswered ask is never older than that.
  const { data: unanswered, error } = await supabaseAdmin
    .from('PlanRequest')
    .select(planService.REQUEST_COLUMNS)
    .eq('status', 'accepted')
    .is('reconfirmed', null)
    .lte('reconfirm_requested_at', new Date(now - STILL_COMING_MIN_GAP_MS).toISOString())
    .gte('reconfirm_requested_at', new Date(now - (rules.LIMITS.maxDaysAhead + 1) * 24 * HOUR_MS).toISOString())
    .limit(300);
  if (error) throw new Error(`Failed to read unanswered "Still coming?": ${error.message}`);
  if (!unanswered || unanswered.length === 0) return 0;
  const plans = new Map((await planService.loadPlanRows([...new Set(unanswered.map((r) => r.post_id))]))
    .map((p) => [p.post_id, p]));
  const hostFirst = await hostFirstNames([...plans.values()]);
  let sent = 0;
  for (const request of unanswered) {
    const plan = plans.get(request.post_id);
    if (!plan || plan.status !== 'open' || new Date(plan.post.event_date).getTime() <= now) continue;
    const again = stillComingAgainAt(request.reconfirm_requested_at, plan.post.event_date);
    if (!again || again.getTime() > now) continue;
    // Null when this change was already asked about again (the notice's key).
    if (!(await planNotify.stillComingReminder({ plan, request, hostFirst: hostFirst(plan) }))) continue;
    sent += 1;
    // Asked again at the plan's own reminder time: that one push stands for both.
    if (!request.reminded_at && rules.reminderAt(plan.post.event_date, rules.timezoneForPlan(plan)).getTime() <= now) {
      await supabaseAdmin.from('PlanRequest').update({ reminded_at: iso(now) }).eq('id', request.id).is('reminded_at', null);
    }
  }
  return sent;
}

// ── 5. Reminders ─────────────────────────────────────────────

async function sendReminders() {
  const now = Date.now();
  // A plan starting within 16 hours (including a fall-back DST night) may already be in its reminder window (7 PM the evening before).
  const { data: upcoming, error } = await supabaseAdmin
    .from('Plan')
    .select(planService.PLAN_SELECT)
    .eq('status', 'open')
    .gt('post.event_date', new Date(now).toISOString())
    .lte('post.event_date', new Date(now + 16 * 60 * 60 * 1000).toISOString())
    .limit(300);
  if (error) throw new Error(`Failed to read upcoming plans: ${error.message}`);
  let sent = 0;
  for (const plan of (upcoming || []).filter((p) => !picking(p))) {
    const remindAt = rules.reminderAt(plan.post.event_date, rules.timezoneForPlan(plan));
    if (remindAt.getTime() > now) continue;
    const requests = await activeRequests(plan.post_id);
    const accepted = requests.filter((r) => r.status === 'accepted' && !r.reminded_at);
    const going = await seatsNow(plan, requests);
    for (const request of accepted) {
      // Someone let in after the reminder time just heard "You're in"; no second notice.
      const recent = request.decided_at && new Date(request.decided_at).getTime() > remindAt.getTime();
      const { data: claimed } = await supabaseAdmin.from('PlanRequest')
        .update({ reminded_at: iso(now) }).eq('id', request.id).is('reminded_at', null).select('id');
      if (!claimed || claimed.length === 0 || recent) continue;
      await planNotify.reminder({ plan, request, goingCount: going, band: planNotify.bandText(request.distance_band) });
      sent += 1;
    }
  }
  sent += await planGuests.sendReminders(upcoming || []).catch((err) => {
    logger.warn('plans.jobs.guest_reminders_failed', { error: err.message });
    return 0;
  });
  return sent;
}

/** The bring list (H2): two days before, people in who claimed nothing hear once what is still open. */
async function sendBringStillOpen() {
  const now = Date.now();
  const { data, error } = await supabaseAdmin
    .from('Plan')
    .select(planService.PLAN_SELECT)
    .eq('status', 'open')
    .not('bring_list', 'is', null)
    .gt('post.event_date', new Date(now).toISOString())
    .lte('post.event_date', new Date(now + 2 * 24 * HOUR_MS).toISOString())
    .limit(300);
  if (error) throw new Error(`Failed to read plans with a bring list: ${error.message}`);
  return require('../services/plans/planBring').sendStillOpen((data || []).filter((p) => !picking(p)));
}

// ── 6. The host's morning summary ────────────────────────────

async function sendHostSummaries() {
  const now = Date.now();
  // With the mailbox on, the summary is a letter in the 7 a.m. round of the plan's day (Mail tab, SRV-9); with it
  // off, the push at 8 as before.
  const asLetter = isLaunchFeatureEnabled('mailbox');
  const fromHour = asLetter ? 7 : 8;
  const { data: today, error } = await supabaseAdmin
    .from('Plan')
    .select(planService.PLAN_SELECT)
    .eq('status', 'open')
    .is('host_summary_sent_at', null)
    .gt('post.event_date', new Date(now).toISOString())
    .lte('post.event_date', new Date(now + 24 * 60 * 60 * 1000).toISOString())
    .limit(300);
  if (error) throw new Error(`Failed to read today's plans: ${error.message}`);
  let sent = 0;
  for (const plan of (today || []).filter((p) => !picking(p))) {
    const tz = rules.timezoneForPlan(plan);
    const local = rules.localParts(new Date(now), tz);
    if (rules.localParts(new Date(plan.post.event_date), tz).date !== local.date || local.hour < fromHour) continue;
    // A plan posted after that hour on its day gets no summary: the host just made it.
    const cutoff = rules.zonedInstant(local.year, local.month, local.day, fromHour, 0, tz);
    if (new Date(plan.created_at).getTime() >= cutoff.getTime()) continue;
    const { data: claimed } = await supabaseAdmin.from('Plan')
      .update({ host_summary_sent_at: iso(now) }).eq('post_id', plan.post_id).is('host_summary_sent_at', null).select('post_id');
    if (!claimed || claimed.length === 0) continue;
    const requests = await activeRequests(plan.post_id);
    const going = await seatsNow(plan, requests);
    const summary = {
      plan,
      comingCount: going,
      spotsLeft: Math.max(0, plan.spots - going),
      requestsCount: (await waitingRequests(plan, requests)).length,
    };
    // The letter takes the push's place; one that can't be written leaves the push to go as before. A business's
    // account has no mailbox anyone opens: its team gets the notice.
    const letter = asLetter && !plan.business_user_id ? await planNotify.hostSummaryLetter({ ...summary, roundAt: cutoff }) : null;
    if (!letter) await planNotify.hostSummary(summary);
    sent += 1;
  }
  return sent;
}

/**
 * Plans with businesses: a business that has left Pantopus has nobody to run its plans. Its open ones are
 * cancelled and the people in, waiting or invited are told. Costs one small read a tick, and finds nothing while
 * no business hosts a plan.
 */
async function cancelGoneBusinessPlans() {
  const PAGE = 300;
  const upcoming = new Date().toISOString();
  let cancelled = 0;
  // Every open business plan, a page at a time in a fixed order, so none is skipped however many there are.
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('Plan')
      .select(planService.PLAN_SELECT)
      .eq('status', 'open')
      .not('business_user_id', 'is', null)
      .gt('post.event_end_date', upcoming)
      .order('post_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read businesses' plans: ${error.message}`);
    for (const plan of await planBusiness.attachBusinessHosts(data || [])) {
      if (plan.business !== null) continue;
      try {
        if (await cancelForGoneBusiness(plan)) cancelled += 1;
      } catch (err) {
        logger.warn('plans.tick.gone_business_cancel_failed', { planId: plan.post_id, error: err.message });
      }
    }
    if (!data || data.length < PAGE) break;
  }
  return cancelled;
}

async function runPlansTick() {
  const released = await releaseHeldPushes();
  // Before the reminders: nobody is reminded of a plan whose business has left.
  let goneCancelled = 0;
  try {
    goneCancelled = await cancelGoneBusinessPlans();
  } catch (err) {
    logger.warn('plans.tick.gone_business_failed', { error: err.message });
  }
  const lifecycle = await closeAskingAndEnd();
  // Repeating plans that just ended: their next date is posted, and the people who came are asked to it.
  let series = 0;
  try {
    series = await require('../services/plans/planSeries').runDue();
  } catch (err) {
    logger.warn('plans.tick.series_failed', { error: err.message });
  }
  // Before reminders: asked again at a plan's reminder time, the reminder isn't sent as well.
  const askedAgain = await sendStillComingReminders();
  const reminders = await sendReminders();
  let bringOpen = 0;
  try {
    bringOpen = await sendBringStillOpen();
  } catch (err) {
    logger.warn('plans.tick.bring_open_failed', { error: err.message });
  }
  // Paid spots (B2): holds that ran out are released (or let in, when the payment did arrive) and offered on.
  let holds = 0;
  try {
    holds = await require('../services/plans/planPaid').releaseExpiredHolds();
  } catch (err) {
    logger.warn('plans.tick.holds_failed', { error: err.message });
  }
  // Group deals on businesses' plans (B1): settled at their deadline, and the one "closes soon" notice.
  let deals = null;
  try {
    deals = await require('../services/plans/planDeals').runDealTick();
  } catch (err) {
    logger.warn('plans.tick.deals_failed', { error: err.message });
  }
  const summaries = await sendHostSummaries();
  // The assistant's nudges come last, and a failure there never stops the notices above.
  let nudges = null;
  try {
    nudges = await require('../services/ai/nudges/plans').runPlanNudges();
  } catch (err) {
    logger.warn('plans.tick.nudges_failed', { error: err.message });
  }
  // Then "Plans you'd like": newly posted plans, to the people who asked to hear about their kind.
  let alerts = 0;
  try {
    alerts = await require('../services/ai/nudges/planAlerts').runPlanAlerts();
  } catch (err) {
    logger.warn('plans.tick.alerts_failed', { error: err.message });
  }
  // Last, weekly plans posted by standing rules: after the lifecycle above has ended this week's.
  let repeats = 0;
  try {
    repeats = (await require('../services/ai/rules').runPlanRepeats()).posted;
  } catch (err) {
    logger.warn('plans.tick.rules_failed', { error: err.message });
  }
  const result = {
    released, ...lifecycle, askedAgain, reminders, summaries, ...(nudges ? { nudges } : {}), ...(alerts ? { alerts } : {}), ...(repeats ? { repeats } : {}),
    ...(goneCancelled ? { goneCancelled } : {}), ...(series ? { series } : {}), ...(bringOpen ? { bringOpen } : {}),
    ...(deals && (deals.settled || deals.closeSent) ? { deals } : {}), ...(holds ? { holds } : {}),
  };
  if (released || askedAgain || reminders || summaries || goneCancelled || lifecycle.expiredCount || lifecycle.endedCount || lifecycle.closedCount
    || (nudges && nudges.sent) || alerts || repeats || series) {
    logger.info('plans.tick', result);
  }
  return result;
}

module.exports = {
  runPlansTick,
  releaseHeldPushes,
  closeAskingAndEnd,
  sendStillComingReminders,
  stillComingAgainAt,
  sendReminders,
  sendHostSummaries,
};
