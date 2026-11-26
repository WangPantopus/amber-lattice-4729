/**
 * Urgent Fanout Service
 *
 * When an urgent task is posted, notifies nearby available helpers
 * via push notification and Socket.IO real-time event.
 *
 * Uses PostGIS ST_DWithin via Supabase RPC to find users with homes
 * near the task location, then fans out push + in-app notifications.
 */

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');
const { skipForLaunchCut } = require('../utils/featureFlags');

const DEFAULT_RADIUS_MILES = 10;
const METERS_PER_MILE = 1609.34;
const MAX_RECIPIENTS = 50;
const ACTIVE_WITHIN_DAYS = 7;
const IN_CHUNK_SIZE = 100;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fan out push notifications for an urgent task to nearby users.
 *
 * @param {string} gigId - ID of the newly created gig
 * @param {Object} gigData - The gig row data (title, category, exact_location, etc.)
 * @param {string} posterUserId - User who posted the task
 * @param {Object} [locationCoords] - { latitude, longitude } of the task
 */
async function fanoutUrgentTask(gigId, gigData, posterUserId, locationCoords) {
  // Launch cut #4 (Open Gigs): no "urgent task nearby" push for the first
  // launch. It pushes directly, so the notification-type filter can't catch it.
  if (skipForLaunchCut('open_gigs', 'urgentFanout')) return 0;
  try {
    if (!locationCoords || !locationCoords.latitude || !locationCoords.longitude) {
      logger.info('Urgent fanout skipped — no location coordinates', { gigId });
      return 0;
    }

    const { latitude, longitude } = locationCoords;
    const radiusMiles = gigData.radius_miles || DEFAULT_RADIUS_MILES;
    const radiusMeters = Math.round(radiusMiles * METERS_PER_MILE);

    // Find users with homes near the task location who are:
    // - Not the poster
    // - Active in the last 7 days
    // - Not blocked by/blocking the poster
    const activeAfter = new Date(
      Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Step 1: Find nearby home IDs using PostGIS
    const { data: nearbyHomes, error: homeError } = await supabaseAdmin.rpc(
      'find_homes_nearby',
      {
        user_lat: latitude,
        user_lon: longitude,
        radius_meters: radiusMeters,
      },
    );

    if (homeError) {
      logger.error('Urgent fanout: nearby homes query failed', {
        gigId,
        error: homeError.message,
      });
      return 0;
    }

    if (!nearbyHomes || nearbyHomes.length === 0) {
      logger.info('Urgent fanout: no nearby homes found', { gigId, radiusMiles });
      return 0;
    }

    const nearbyHomeIds = nearbyHomes.map((h) => h.id);

    // Step 2: Find users occupying those homes (chunked to avoid PostgREST URL length limits)
    const occupants = [];
    for (const homeChunk of chunkArray(nearbyHomeIds, IN_CHUNK_SIZE)) {
      const { data: chunkOccupants, error: occError } = await supabaseAdmin
        .from('HomeOccupancy')
        .select('user_id')
        .in('home_id', homeChunk)
        .eq('is_active', true)
        .not('user_id', 'eq', posterUserId);

      if (occError) {
        logger.error('Urgent fanout: occupant query failed', {
          gigId,
          error: occError.message,
        });
        return 0;
      }
      if (chunkOccupants) occupants.push(...chunkOccupants);
    }

    if (occupants.length === 0) {
      logger.info('Urgent fanout: no nearby occupants found', { gigId });
      return 0;
    }

    // Deduplicate user IDs (a user may occupy multiple nearby homes)
    const candidateUserIds = [...new Set(occupants.map((o) => o.user_id))];

    // Step 3: Filter by recent activity (chunked to <=100 IDs per .in() query)
    const activeUsers = [];
    for (const userChunk of chunkArray(candidateUserIds, IN_CHUNK_SIZE)) {
      if (activeUsers.length >= MAX_RECIPIENTS) break;
      const { data: chunkUsers, error: userError } = await supabaseAdmin
        .from('User')
        .select('id')
        .in('id', userChunk)
        .gte('updated_at', activeAfter)
        .limit(MAX_RECIPIENTS - activeUsers.length);

      if (userError) {
        logger.error('Urgent fanout: active user query failed', {
          gigId,
          error: userError.message,
        });
        return 0;
      }
      if (chunkUsers) activeUsers.push(...chunkUsers);
    }

    if (activeUsers.length === 0) {
      logger.info('Urgent fanout: no recently active users nearby', { gigId });
      return 0;
    }

    // Step 4: Filter out users who have blocked the poster (or vice versa), fail closed on error
    const { data: blocks, error: blockError } = await supabaseAdmin
      .from('UserBlock')
      .select('blocker_user_id, blocked_user_id')
      .or(
        `and(blocker_user_id.eq.${posterUserId},blocked_user_id.in.(${activeUsers.map((u) => u.id).join(',')})),` +
        `and(blocked_user_id.eq.${posterUserId},blocker_user_id.in.(${activeUsers.map((u) => u.id).join(',')}))`
      );

    if (blockError) {
      logger.error('Urgent fanout: block lookup failed — aborting fanout', {
        gigId,
        error: blockError.message,
      });
      return 0;
    }

    const blockedUserIds = new Set();
    if (blocks) {
      for (const b of blocks) {
        blockedUserIds.add(b.blocker_user_id === posterUserId ? b.blocked_user_id : b.blocker_user_id);
      }
    }

    const recipientIds = activeUsers
      .map((u) => u.id)
      .filter((id) => !blockedUserIds.has(id))
      .slice(0, MAX_RECIPIENTS);

    if (recipientIds.length === 0) {
      logger.info('Urgent fanout: all nearby users filtered out', { gigId });
      return 0;
    }

    // Step 5: Build notification content
    const responseWindow = gigData.response_window_minutes || 15;
    const title = '\u26A1 Urgent help needed nearby';
    const body = `${gigData.title || 'Someone needs help'} — respond within ${responseWindow} min`;

    // Step 6: Create in-app notifications and dispatch preference-checked pushes once
    // (avoiding the prior double-push from calling both pushService.sendToUsers and createBulkNotifications).
    const notifications = recipientIds.map((userId) => ({
      userId,
      type: 'urgent_task_nearby',
      title,
      body,
      icon: '\u26A1',
      link: `/gig/${gigId}`,
      metadata: {
        gig_id: gigId,
        gigId,
        category: gigData.category || null,
        response_window_minutes: responseWindow,
      },
    }));

    notificationService.createBulkNotifications(notifications).catch((err) => {
      logger.warn('Urgent fanout: bulk notification creation failed', {
        gigId,
        error: err.message,
      });
    });

    logger.info('Urgent fanout completed', {
      gigId,
      recipientCount: recipientIds.length,
      radiusMiles,
      responseWindow,
    });

    return recipientIds.length;
  } catch (err) {
    // Never let fanout errors bubble up — this is fire-and-forget
    logger.error('Urgent fanout unexpected error', {
      gigId,
      error: err.message,
    });
    return 0;
  }
}

module.exports = { fanoutUrgentTask };
