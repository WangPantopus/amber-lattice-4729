// Made-up names: what happens after abuse (the design's "Safety" table).
//
//   * Two different people reporting a made-up-name post or reply hides it until someone has looked (the rule Moments
//     use). A reply whose reports were all dismissed shows again.
//   * A moderator removing one is a strike on the account behind it: the first is a warning; a second within
//     STRIKE_WINDOW_DAYS takes the made-up name away for SUSPENSION_DAYS; a removal marked severe (a threat, exposing
//     someone's private details, anything aimed at a child) takes it away for good.
//   * A member of staff may look up who wrote a row, with a reason, and the look is written to "IdentityAuditLog".
//
// A penalty is a "UserPostingCooldown" row with surface 'pen_name' (gate.js reads it). The account's named posts
// are untouched by any of this: what the moderator does to the account itself is the admin tools' own business.

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const owner = require('./owner');
const { STANDING_SURFACE } = require('./gate');

const REPORTS_TO_HOLD = 2;
const STRIKE_WINDOW_DAYS = 90;
const SUSPENSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOLD_RULE = 'pen_name_reports';

/**
 * After a report on a made-up-name post: holds it once REPORTS_TO_HOLD different people have open reports on it.
 * Returns true when it was held now. Never throws: the report itself is already filed.
 */
async function holdIfReported(post) {
  if (!owner.isPenNameRow(post)) return false;
  try {
    // The post's own reports: a report on one of its replies has a comment_id.
    const { data, error } = await supabaseAdmin.from('PostReport').select('reported_by')
      .eq('post_id', post.id).is('comment_id', null).in('status', ['pending', 'reviewed']);
    if (error) throw error;
    if (new Set((data || []).map((row) => row.reported_by)).size < REPORTS_TO_HOLD) return false;
    const now = new Date().toISOString();
    const { data: held, error: holdError } = await supabaseAdmin.from('Post')
      .update({ moderation_state: 'held', moderation_rule: HOLD_RULE, moderated_at: now })
      .eq('id', post.id).eq('moderation_state', 'live').select('id');
    if (holdError) throw holdError;
    return Boolean(held?.length);
  } catch (error) {
    logger.warn('penName.hold_failed', { postId: post.id, error: error.message });
    return false;
  }
}

/**
 * The same for a made-up-name reply (PostComment has no moderated_at). Returns true when it was held now. Never throws.
 */
async function holdReplyIfReported(reply) {
  if (!owner.isPenNameRow(reply)) return false;
  try {
    const { data, error } = await supabaseAdmin.from('PostReport').select('reported_by')
      .eq('comment_id', reply.id).in('status', ['pending', 'reviewed']);
    if (error) throw error;
    if (new Set((data || []).map((row) => row.reported_by)).size < REPORTS_TO_HOLD) return false;
    const { data: held, error: holdError } = await supabaseAdmin.from('PostComment')
      .update({ moderation_state: 'held', moderation_rule: HOLD_RULE })
      .eq('id', reply.id).eq('moderation_state', 'live').select('id');
    if (holdError) throw holdError;
    return Boolean(held?.length);
  } catch (error) {
    logger.warn('penName.reply_hold_failed', { commentId: reply.id, error: error.message });
    return false;
  }
}

/**
 * After a moderator closes a report on a reply (routes/adminReports.js): a reply held by the reports rule whose reports
 * were all dismissed (no violation) shows again. One closed as resolved means the moderator agreed something was
 * wrong, so it stays held. Returns true when it was released now.
 */
async function releaseReplyIfReviewed(commentId) {
  const { data: reply, error } = await supabaseAdmin.from('PostComment').select('id, moderation_state, moderation_rule')
    .eq('id', commentId).maybeSingle();
  if (error || !reply || reply.moderation_state !== 'held' || reply.moderation_rule !== HOLD_RULE) return false;
  const { count, error: countError } = await supabaseAdmin.from('PostReport').select('id', { count: 'exact', head: true })
    .eq('comment_id', commentId).neq('status', 'dismissed');
  if (countError || count > 0) return false;
  const { data, error: updateError } = await supabaseAdmin.from('PostComment')
    .update({ moderation_state: 'live', moderation_rule: null })
    .eq('id', commentId).eq('moderation_state', 'held').eq('moderation_rule', HOLD_RULE).select('id');
  if (updateError) return false;
  return Boolean(data?.length);
}

/**
 * A moderator removed a made-up-name post or reply (`kind` 'post' or 'comment'): the strike on its writer. Returns
 * { level: 'warning' | 'suspended', until } or null when it wasn't written under a made-up name. `severe`: for good.
 */
async function recordRemoval({ postId, kind = 'post', contentId = postId, severe = false }) {
  const writer = await owner.ownerOf(kind, contentId);
  if (!writer) return null;
  const now = Date.now();
  let level = 'warning';
  let until = new Date(now + STRIKE_WINDOW_DAYS * DAY_MS).toISOString();
  if (severe) {
    level = 'suspended';
    until = null;
  } else {
    const { data, error } = await supabaseAdmin.from('UserPostingCooldown').select('id')
      .eq('user_id', writer).eq('surface', STANDING_SURFACE)
      .gte('created_at', new Date(now - STRIKE_WINDOW_DAYS * DAY_MS).toISOString()).limit(1);
    if (error) throw error;
    if (data?.length) {
      level = 'suspended';
      until = new Date(now + SUSPENSION_DAYS * DAY_MS).toISOString();
    }
  }
  const { error: insertError } = await supabaseAdmin.from('UserPostingCooldown').insert({
    user_id: writer, surface: STANDING_SURFACE, restriction_level: level, expires_at: until, created_by: 'admin',
    reason: `A made-up-name ${kind === 'comment' ? 'reply' : 'post'} was removed${severe ? ' (severe)' : ''}`,
  });
  if (insertError) throw insertError;
  return { level, until };
}

/**
 * Who wrote a made-up-name row, for a member of staff. The look is logged with its reason before the answer is
 * given, and refused when it can't be logged.
 */
async function staffLook({ req, kind, contentId, reason }) {
  const text = String(reason || '').trim();
  if (text.length < 8) throw Object.assign(new Error('Say why you need to know who wrote this.'), { status: 400, code: 'REASON_NEEDED' });
  const writer = await owner.ownerOf(kind, contentId);
  if (!writer) return null;
  const { error } = await supabaseAdmin.from('IdentityAuditLog').insert({
    actor_user_id: req.user.id,
    target_user_id: writer,
    action: 'pen_name.writer_looked_up',
    target_type: kind === 'post' ? 'Post' : 'PostComment',
    target_id: String(contentId),
    metadata: { reason: text.slice(0, 500) },
  });
  if (error) throw Object.assign(new Error('The look could not be logged, so it was not made.'), { status: 503, code: 'LOOK_NOT_LOGGED' });
  return writer;
}

module.exports = {
  REPORTS_TO_HOLD, STRIKE_WINDOW_DAYS, SUSPENSION_DAYS, HOLD_RULE,
  holdIfReported, holdReplyIfReported, releaseReplyIfReviewed, recordRemoval, staffLook,
};
