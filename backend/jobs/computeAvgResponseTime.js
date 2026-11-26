/**
 * Compute Average Response Time — Nightly Cron Job
 *
 * For each business with a published profile, computes the average time
 * between ChatRoom creation and the first reply from the business user.
 * Stores the result on BusinessProfile.avg_response_minutes.
 *
 * Rules:
 *   - Only counts rooms created in the last 90 days (recency).
 *   - Skips rooms where the business sent the very first message
 *     (business-initiated chats have no "response" to measure).
 *   - Caps individual response times at 7 days (outlier guard).
 *   - Requires response time > 0 minutes (sanity).
 *
 * Runs daily at 5:00 AM UTC.
 *
 * Bounded execution: each run processes at most BATCH_SIZE published profiles,
 * least-recently-computed first (avg_response_calc_at ASC, NULLs first), then
 * stamps avg_response_calc_at so subsequent runs rotate to the rest. This caps
 * per-run work so the job can't exceed the Lambda HTTP timeout. With <= BATCH_SIZE
 * published businesses every business is still refreshed on every run.
 */

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');

// Only look at rooms from the last 90 days
const LOOKBACK_DAYS = 90;
// Max response time to count (7 days in minutes)
const MAX_RESPONSE_MINUTES = 7 * 24 * 60;
// Max published profiles processed per run (rotated by avg_response_calc_at).
const BATCH_SIZE = 150;
// Safety cap on messages fetched per business (guards hyper-active businesses).
const MAX_MESSAGES_PER_BUSINESS = 10000;
const IN_CHUNK_SIZE = 100;
const PAGE_SIZE = 1000;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function computeAvgResponseTime() {
  // 1. Get all published business user IDs
  const { data: profiles, error: profileErr } = await supabaseAdmin
    .from('BusinessProfile')
    .select('business_user_id')
    .eq('is_published', true)
    .order('avg_response_calc_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (profileErr) {
    logger.error('[computeAvgResponseTime] Error fetching profiles', { error: profileErr.message });
    return;
  }
  if (!profiles?.length) {
    logger.info('[computeAvgResponseTime] No published profiles, skipping');
    return;
  }

  const cutoffDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const processedIds = [];
  let updatedCount = 0;
  let skippedCount = 0;

  for (const { business_user_id: bizId } of profiles) {
    processedIds.push(bizId);
    try {
      // 2. Get rooms this business participates in (paginated past 1,000 rows)
      const participations = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data: pageParts, error: partErr } = await supabaseAdmin
          .from('ChatParticipant')
          .select('room_id')
          .eq('user_id', bizId)
          .eq('is_active', true)
          .range(offset, offset + PAGE_SIZE - 1);
        if (partErr || !pageParts?.length) break;
        participations.push(...pageParts);
        if (pageParts.length < PAGE_SIZE) break;
      }

      if (!participations.length) {
        skippedCount++;
        continue;
      }

      const roomIds = [...new Set(participations.map(p => p.room_id))];

      // 3. Get room creation times (recent rooms only, chunked <=100 UUIDs per .in())
      const rooms = [];
      for (const roomChunk of chunkArray(roomIds, IN_CHUNK_SIZE)) {
        const { data: chunkRooms } = await supabaseAdmin
          .from('ChatRoom')
          .select('id, created_at')
          .in('id', roomChunk)
          .gte('created_at', cutoffDate);
        if (chunkRooms?.length) rooms.push(...chunkRooms);
      }

      if (!rooms.length) {
        skippedCount++;
        continue;
      }

      const recentRoomIds = rooms.map(r => r.id);

      // 4. Get messages in these rooms, oldest first (chunked <=100 room IDs per .in(), bounded total)
      const messages = [];
      for (const roomChunk of chunkArray(recentRoomIds, IN_CHUNK_SIZE)) {
        if (messages.length >= MAX_MESSAGES_PER_BUSINESS) break;
        const remaining = MAX_MESSAGES_PER_BUSINESS - messages.length;
        const { data: chunkMsgs } = await supabaseAdmin
          .from('ChatMessage')
          .select('room_id, user_id, created_at')
          .in('room_id', roomChunk)
          .eq('deleted', false)
          .order('created_at', { ascending: true })
          .limit(Math.min(PAGE_SIZE, remaining));
        if (chunkMsgs?.length) messages.push(...chunkMsgs);
      }

      if (!messages.length) {
        skippedCount++;
        continue;
      }

      // 5. Group by room: find first overall message + first business reply
      const firstMsgByRoom = new Map();       // room_id → { user_id, created_at }
      const firstBizReplyByRoom = new Map();  // room_id → created_at (Date)

      for (const msg of messages) {
        // Track the very first message in each room
        if (!firstMsgByRoom.has(msg.room_id)) {
          firstMsgByRoom.set(msg.room_id, msg);
        }
        // Track the first message from the business in each room
        if (msg.user_id === bizId && !firstBizReplyByRoom.has(msg.room_id)) {
          firstBizReplyByRoom.set(msg.room_id, new Date(msg.created_at));
        }
      }

      // 6. Compute response times
      const responseTimes = [];

      for (const [roomId, bizReplyAt] of firstBizReplyByRoom) {
        const firstMsg = firstMsgByRoom.get(roomId);

        // Skip rooms where the business sent the first message (business-initiated)
        if (!firstMsg || firstMsg.user_id === bizId) continue;

        // Response time = first business reply - first customer message
        const customerMsgAt = new Date(firstMsg.created_at);
        const diffMinutes = (bizReplyAt - customerMsgAt) / (1000 * 60);

        if (diffMinutes > 0 && diffMinutes < MAX_RESPONSE_MINUTES) {
          responseTimes.push(diffMinutes);
        }
      }

      // 7. Update BusinessProfile with the average
      if (responseTimes.length > 0) {
        const avg = Math.round(
          responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        );

        const { error: updateErr } = await supabaseAdmin
          .from('BusinessProfile')
          .update({ avg_response_minutes: avg })
          .eq('business_user_id', bizId);

        if (updateErr) {
          logger.error('[computeAvgResponseTime] Update failed', {
            businessId: bizId,
            error: updateErr.message,
          });
        } else {
          updatedCount++;
        }
      } else {
        skippedCount++;
      }
    } catch (err) {
      logger.error('[computeAvgResponseTime] Error processing business', {
        businessId: bizId,
        error: err.message,
      });
    }
  }

  // Stamp calc time for every processed business so the next run rotates to the
  // least-recently-computed profiles (chunked <=100 UUIDs per .in()).
  if (processedIds.length > 0) {
    const nowIso = new Date().toISOString();
    for (const idChunk of chunkArray(processedIds, IN_CHUNK_SIZE)) {
      const { error: touchErr } = await supabaseAdmin
        .from('BusinessProfile')
        .update({ avg_response_calc_at: nowIso })
        .in('business_user_id', idChunk);
      if (touchErr) {
        logger.error('[computeAvgResponseTime] Failed to stamp avg_response_calc_at', { error: touchErr.message });
      }
    }
  }

  logger.info('[computeAvgResponseTime] Completed', {
    processedBusinesses: profiles.length,
    batchSize: BATCH_SIZE,
    updatedCount,
    skippedCount,
  });
}

module.exports = computeAvgResponseTime;
