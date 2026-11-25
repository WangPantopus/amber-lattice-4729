/**
 * Around you: who hears about a reply (founder, November 24, 2026: "for users to interact with each other").
 *
 * A story on Around you is posted by the region's curator account, which nobody reads, so the "commented on your
 * post" notice a reply normally sends went nowhere, and the people talking under a story never heard that someone
 * had answered unless the answer was to their own reply. Here the people already in a story's thread are told when
 * someone else replies: one notice per story per person in any six hours, however busy the thread gets, and none to
 * the replier, to whoever already got a direct "replied to your comment" notice, or across a block.
 *
 * The notice is an ordinary `comment_replied` (every app already shows and opens that kind), linked to the post.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const blockService = require('../blockService');
const notificationService = require('../notificationService');
const logger = require('../../utils/logger');

const HOUR_MS = 3_600_000;
const WINDOW_HOURS = 6;
const MAX_PEOPLE = 50;

/** A post Around you made for a story (services/aroundYouService.js). */
function isAroundYouPost(post) {
  return post?.origin === 'curator' && Boolean(post.post_metadata?.around_you);
}

function clip(text, max) {
  const plain = String(text || '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/**
 * After a reply on an Around you post is stored. `skipUserIds` already have a direct notice about it (the parent
 * reply's author). Returns how many people were told. Never throws: a notice is not worth failing a reply for.
 */
async function replyCreated({ post, reply, replierName, skipUserIds = [], now = Date.now() }) {
  try {
    if (!isAroundYouPost(post) || !reply?.id || (reply.moderation_state || 'live') !== 'live') return 0;
    const { data, error } = await supabaseAdmin.from('PostComment')
      .select('user_id, moderation_state')
      .eq('post_id', post.id)
      .eq('is_deleted', false)
      .neq('user_id', reply.user_id)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    const skip = new Set(skipUserIds.filter(Boolean).map(String));
    const people = [...new Set((data || [])
      .filter((row) => (row.moderation_state || 'live') === 'live' && !skip.has(String(row.user_id)))
      .map((row) => row.user_id))].slice(0, MAX_PEOPLE);
    const window = Math.floor(now / (WINDOW_HOURS * HOUR_MS));
    let told = 0;
    for (const userId of people) {
      if (await blockService.isBlocked(reply.user_id, userId)) continue;
      const notice = await notificationService.createNotification({
        userId,
        type: 'comment_replied',
        title: `${replierName || 'Someone'} replied to a story you replied to`,
        body: clip(reply.comment, 100),
        icon: '💬',
        link: `/posts/${post.id}`,
        idempotencyKey: `around-thread:${post.id}:${userId}:${window}`,
        metadata: { post_id: post.id, comment_id: reply.id, user_id: reply.user_id, around_you: true },
      });
      if (notice) told += 1;
    }
    return told;
  } catch (err) {
    logger.warn('Around you thread notices failed (non-blocking)', { error: err.message, postId: post?.id });
    return 0;
  }
}

module.exports = { replyCreated, isAroundYouPost, WINDOW_HOURS };
