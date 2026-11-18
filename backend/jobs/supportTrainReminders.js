// ============================================================
// JOB: Support Train Reminders
// Sends reminders to helpers for upcoming slots and nudges
// organizers about unfilled slots. Runs every 30 minutes.
//
// Five tasks:
//   1. Give a train with no time zone its zone (from its delivery point or Home)
//   2. End a live train three days after its last date
//   3. Reminders after 17:00 train-local time the evening before
//   4. Day-of reminders at 07:00 local or 4h before an earlier start
//   5. Open-slots nudges for organizers (max once per 48h)
// ============================================================

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { emitSupportTrainEvent } = require('../services/supportTrainNotifications');
const { listEffectivelyOpenSlots } = require('../services/supportTrainSlotAvailability');
const { resolveTrainTimezone } = require('../services/supportTrainZone');
const { DateTime } = require('luxon');

const LIVE_STATUSES = ['published', 'active', 'paused'];
// A live train ends by itself this many days after its last date, so a late "delivered" or "thank you" still fits.
const END_DAYS_AFTER_LAST_DATE = 3;
const TRAIN_ZONE_COLUMNS = 'delivery_lat, delivery_lng, recipient_home_id, Activity:activity_id ( timezone, home_id )';

// Helpers are reminded only while the Train is running: not once it is closed (completed),
// paused, unpublished or archived. The open-slots nudge below applies the same rule.
function trainTakesReminders(reservation) {
  return ['published', 'active'].includes(reservation.SupportTrain?.status);
}

/** Each train's zone, read once per run (a train's Activity zone, delivery point or Home). */
function zoneCache() {
  const zones = new Map();
  return async (trainId, train) => {
    if (!zones.has(trainId)) zones.set(trainId, await resolveTrainTimezone(train));
    return zones.get(trainId);
  };
}

function localTime(zone, now) {
  return zone ? DateTime.fromJSDate(now, { zone }) : DateTime.invalid('timezone unavailable');
}

// A reservation is claimed (its marker set while it is still reserved and
// unmarked) before anything is sent, so overlapping runs, or a run after a
// failed marker write, never send twice, and a helper who cancelled first is
// never reminded. A delivery that doesn't go out releases the claim, so the
// next run retries it.
async function claimReminder(reservationId, marker, claimedAt) {
  const { data, error } = await supabaseAdmin
    .from('SupportTrainReservation')
    .update({ [marker]: claimedAt })
    .eq('id', reservationId)
    .eq('status', 'reserved')
    .is(marker, null)
    .select('id')
    .maybeSingle();
  if (error) {
    logger.error('[supportTrainReminders] reminder claim failed', { errorCode: error.code });
    return false;
  }
  return Boolean(data);
}

async function releaseReminder(reservationId, marker, claimedAt) {
  const { error } = await supabaseAdmin
    .from('SupportTrainReservation')
    .update({ [marker]: null })
    .eq('id', reservationId)
    .eq(marker, claimedAt);
  if (error) {
    logger.error('[supportTrainReminders] reminder release failed', { errorCode: error.code });
  }
}

async function runSupportTrainReminders() {
  await _fillMissingZones();
  await _endFinishedTrains();
  await _send24hReminders();
  await _sendDayOfReminders();
  await _sendOpenSlotNudges();
}

// ─── Zones ─────────────────────────────────────────────────────────────────

// A train made without a zone (the web sent none before 2026-11-17, and a train at a Home has no delivery point) gets
// one from its delivery point or Home, so its reminders fire and its "today" is its own day (A5). Only an empty zone
// is filled.
async function _fillMissingZones() {
  try {
    const { data: trains, error } = await supabaseAdmin
      .from('SupportTrain')
      .select('id, activity_id, delivery_lat, delivery_lng, recipient_home_id, Activity!inner ( timezone, home_id )')
      .in('status', ['draft', ...LIVE_STATUSES])
      .is('Activity.timezone', null)
      .limit(200);
    if (error) {
      logger.error('[supportTrainReminders] zone query failed', { errorCode: error.code });
      return;
    }
    let filled = 0;
    for (const train of trains || []) {
      const zone = await resolveTrainTimezone(train);
      if (!zone) continue;
      const { error: updateError } = await supabaseAdmin
        .from('Activity').update({ timezone: zone }).eq('id', train.activity_id).is('timezone', null);
      if (!updateError) filled++;
    }
    if (filled > 0) logger.info('[supportTrainReminders] train zones filled', { count: filled });
  } catch (err) {
    logger.error('[supportTrainReminders] zone fill failed', { errorCode: err.code });
  }
}

// ─── Ending ────────────────────────────────────────────────────────────────

// A live train (published, active or paused) whose last date (of the dates not removed) was three or more days ago
// where it is ends by itself, as if its organizer closed it: it leaves the nearby list, its page says it is over, and
// the thank-you letters go out (A8). A train with no dates at all waits for its organizer.
async function _endFinishedTrains() {
  try {
    const now = new Date();
    const { data: trains, error } = await supabaseAdmin
      .from('SupportTrain')
      .select(`id, activity_id, status, ${TRAIN_ZONE_COLUMNS}, SupportTrainSlot ( slot_date, status )`)
      .in('status', LIVE_STATUSES);
    if (error) {
      logger.error('[supportTrainReminders] end query failed', { errorCode: error.code });
      return;
    }
    let ended = 0;
    for (const train of trains || []) {
      const dates = (train.SupportTrainSlot || []).filter((s) => s.status !== 'canceled').map((s) => s.slot_date).sort();
      if (!dates.length) continue;
      const local = localTime(await resolveTrainTimezone(train), now);
      const today = local.isValid ? local.toISODate() : now.toISOString().slice(0, 10);
      const endsOn = DateTime.fromISO(dates[dates.length - 1]).plus({ days: END_DAYS_AFTER_LAST_DATE }).toISODate();
      if (today < endsOn) continue;
      const { data: closed, error: closeError } = await supabaseAdmin
        .from('SupportTrain')
        .update({ status: 'completed' })
        .eq('id', train.id)
        .in('status', LIVE_STATUSES)
        .select('id');
      if (closeError || !closed?.length) continue;
      await supabaseAdmin.from('Activity').update({ status: 'completed' }).eq('id', train.activity_id);
      await emitSupportTrainEvent({
        event: 'support_train.closed',
        supportTrainId: train.id,
        actorUserId: null,
        payload: { ended_by_schedule: true },
      });
      ended++;
    }
    if (ended > 0) logger.info('[supportTrainReminders] finished trains ended', { count: ended });
  } catch (err) {
    logger.error('[supportTrainReminders] ending trains failed', { errorCode: err.code });
  }
}

// ─── 24h Reminders ─────────────────────────────────────────────────────────

async function _send24hReminders() {
  try {
    const now = new Date();

    const { data: reservations, error } = await supabaseAdmin
      .from('SupportTrainReservation')
      .select(`
        id, user_id, guest_name, guest_email, support_train_id, contribution_mode,
        dish_title, restaurant_name, guest_address_shared_at, guest_email_confirmed_at, last_reminder_sent,
        SupportTrain:support_train_id ( status, ${TRAIN_ZONE_COLUMNS} ),
        SupportTrainSlot:slot_id (
          id, slot_date, slot_label, support_mode, start_time, end_time, status
        )
      `)
      .eq('status', 'reserved')
      .is('last_reminder_sent', null);

    if (error) {
      logger.error('[supportTrainReminders] 24h query failed', { errorCode: error.code });
      return;
    }

    const zoneOf = zoneCache();
    const tomorrowReservations = [];
    for (const r of reservations || []) {
      if (!trainTakesReminders(r)) continue;
      const localNow = localTime(await zoneOf(r.support_train_id, r.SupportTrain), now);
      if (localNow.isValid && localNow.hour >= 17 &&
        r.SupportTrainSlot?.slot_date === localNow.plus({ days: 1 }).toISODate() &&
        ['open', 'full'].includes(r.SupportTrainSlot.status)) tomorrowReservations.push(r);
    }

    let sent = 0;
    for (const res of tomorrowReservations) {
      const slot = res.SupportTrainSlot;
      const claimedAt = now.toISOString();
      if (!(await claimReminder(res.id, 'last_reminder_sent', claimedAt))) continue;
      const delivery = await emitSupportTrainEvent({
        event: 'support_train.reservation_reminder_24h',
        supportTrainId: res.support_train_id,
        actorUserId: res.user_id,
        payload: {
          reservation_id: res.id,
          helper_user_id: res.user_id,
          helper_guest_email: res.guest_email,
          helper_guest_name: res.guest_name,
          contribution_mode: res.contribution_mode,
          dish_title: res.dish_title,
          restaurant_name: res.restaurant_name,
          guest_address_shared_at: res.guest_address_shared_at,
          guest_email_confirmed: Boolean(res.guest_email_confirmed_at),
          slot_id: slot.id,
          slot_label: slot.slot_label,
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
        },
      });

      if (delivery?.delivered !== true) {
        await releaseReminder(res.id, 'last_reminder_sent', claimedAt);
        continue;
      }

      sent++;
    }

    if (sent > 0) {
      logger.info('[supportTrainReminders] 24h reminders sent', { count: sent });
    }
  } catch (err) {
    logger.error('[supportTrainReminders] 24h reminders failed', { errorCode: err.code });
  }
}

// ─── Day-of Reminders ──────────────────────────────────────────────────────

async function _sendDayOfReminders() {
  try {
    const now = new Date();

    const { data: reservations, error } = await supabaseAdmin
      .from('SupportTrainReservation')
      .select(`
        id, user_id, guest_name, guest_email, support_train_id, contribution_mode,
        dish_title, restaurant_name, guest_address_shared_at, guest_email_confirmed_at, day_of_reminder_sent_at,
        SupportTrain:support_train_id ( status, ${TRAIN_ZONE_COLUMNS} ),
        SupportTrainSlot:slot_id (
          id, slot_date, slot_label, support_mode, start_time, end_time, status
        )
      `)
      .eq('status', 'reserved')
      .is('day_of_reminder_sent_at', null);

    if (error) {
      logger.error('[supportTrainReminders] day-of query failed', { errorCode: error.code });
      return;
    }

    const zoneOf = zoneCache();
    const zones = new Map();
    for (const r of reservations || []) {
      if (trainTakesReminders(r)) zones.set(r.id, await zoneOf(r.support_train_id, r.SupportTrain));
    }
    const eligible = (reservations || []).filter(r => {
      if (!trainTakesReminders(r)) return false;
      const slot = r.SupportTrainSlot;
      const localNow = localTime(zones.get(r.id), now);
      if (!localNow.isValid || !slot || slot.slot_date !== localNow.toISODate()) return false;
      if (!['open', 'full'].includes(slot.status)) return false;
      const morning = localNow.startOf('day').set({ hour: 7 });
      if (!slot.start_time) return localNow >= morning;
      const start = DateTime.fromISO(`${slot.slot_date}T${slot.start_time}`, { zone: localNow.zoneName });
      if (!start.isValid || start < localNow) return false;
      const fourHoursBefore = start.minus({ hours: 4 });
      const due = fourHoursBefore < morning ? fourHoursBefore : morning;
      // A start before 04:00 is eligible from midnight on the slot's day;
      // the day-of email must not say "today" on the preceding evening.
      return localNow >= due;
    });

    let sent = 0;
    for (const res of eligible) {
      const slot = res.SupportTrainSlot;
      const claimedAt = now.toISOString();
      if (!(await claimReminder(res.id, 'day_of_reminder_sent_at', claimedAt))) continue;
      const delivery = await emitSupportTrainEvent({
        event: 'support_train.reservation_reminder_dayof',
        supportTrainId: res.support_train_id,
        actorUserId: res.user_id,
        payload: {
          reservation_id: res.id,
          helper_user_id: res.user_id,
          helper_guest_email: res.guest_email,
          helper_guest_name: res.guest_name,
          contribution_mode: res.contribution_mode,
          dish_title: res.dish_title,
          restaurant_name: res.restaurant_name,
          guest_address_shared_at: res.guest_address_shared_at,
          guest_email_confirmed: Boolean(res.guest_email_confirmed_at),
          slot_id: slot.id,
          slot_label: slot.slot_label,
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
        },
      });

      if (delivery?.delivered !== true) {
        await releaseReminder(res.id, 'day_of_reminder_sent_at', claimedAt);
        continue;
      }

      sent++;
    }

    if (sent > 0) {
      logger.info('[supportTrainReminders] day-of reminders sent', { count: sent });
    }
  } catch (err) {
    logger.error('[supportTrainReminders] day-of reminders failed', { errorCode: err.code });
  }
}

// ─── Open Slot Nudges ──────────────────────────────────────────────────────

// Train-local hours an organizer may get the open-slots nudge: from 9 AM, until 8 PM.
const OPEN_SLOT_NUDGE_FROM_HOUR = 9;
const OPEN_SLOT_NUDGE_UNTIL_HOUR = 20;

async function _sendOpenSlotNudges() {
  try {
    const now = new Date();
    // A day either side of UTC's, so every zone's today and next six days are in; each train then counts its own.
    const todayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weekDate = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // Find slots with real remaining capacity in the next 7 days. Do not trust
    // denormalized slot counters alone; stale rows can otherwise nudge organizers
    // after every visible slot already has an active reservation.
    let openSlots;
    try {
      openSlots = await listEffectivelyOpenSlots({
        fromDate: todayDate,
        toDate: weekDate,
        columns: 'id, support_train_id, slot_date, status, capacity, filled_count',
      });
    } catch (error) {
      logger.error('[supportTrainReminders] open slots query failed', { errorCode: error.code });
      return;
    }

    // Group by support_train_id
    const trainSlots = {};
    for (const slot of (openSlots || [])) {
      (trainSlots[slot.support_train_id] ||= []).push(slot);
    }

    let sent = 0;
    for (const [trainId, slots] of Object.entries(trainSlots)) {
      // Check train is published or active
      const { data: train } = await supabaseAdmin
        .from('SupportTrain')
        .select('id, organizer_user_id, status, delivery_lat, delivery_lng, recipient_home_id, Activity!inner ( title, timezone, home_id )')
        .eq('id', trainId)
        .in('status', ['published', 'active'])
        .single();

      if (!train) continue;

      // The organizer hears about open slots in the daytime where the Train is, 9 AM to 8 PM: this job runs all
      // day, and the 48-hour spacing below would otherwise keep whatever hour the first nudge went, 3 AM included.
      // A Train whose zone can't be told waits for UTC daytime. Only its dates from today to six days on count: a
      // date that has passed is not open (A8).
      const local = localTime(await resolveTrainTimezone(train), now);
      const hour = local.isValid ? local.hour : now.getUTCHours();
      const localToday = local.isValid ? local.toISODate() : now.toISOString().slice(0, 10);
      const localLast = DateTime.fromISO(localToday).plus({ days: 6 }).toISODate();
      const openCount = slots.filter((slot) => slot.slot_date >= localToday && slot.slot_date <= localLast).length;
      if (openCount === 0) continue;
      if (hour < OPEN_SLOT_NUDGE_FROM_HOUR || hour >= OPEN_SLOT_NUDGE_UNTIL_HOUR) continue;

      // Check if we already nudged in the last 48 hours (use notification log)
      // Simple approach: check last open_slots nudge notification
      const { count: recentNudgeCount } = await supabaseAdmin
        .from('Notification')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', train.organizer_user_id)
        .eq('type', 'support_train_open_slots')
        .gte('created_at', fortyEightHoursAgo);

      if ((recentNudgeCount || 0) > 0) continue;

      const title = train.Activity?.title || 'Support Train';
      await emitSupportTrainEvent({
        event: 'support_train.open_slots_nudge',
        supportTrainId: trainId,
        actorUserId: train.organizer_user_id,
        payload: {
          open_count: openCount,
          nudge_text: `${openCount} slot${openCount > 1 ? 's' : ''} on "${title}" ${openCount > 1 ? 'are' : 'is'} still open this week. Want to send a gentle reminder?`,
        },
      });
      sent++;
    }

    if (sent > 0) {
      logger.info('[supportTrainReminders] open slot nudges sent', { count: sent });
    }
  } catch (err) {
    logger.error('[supportTrainReminders] open slot nudges failed', { errorCode: err.code });
  }
}

module.exports = { runSupportTrainReminders };
