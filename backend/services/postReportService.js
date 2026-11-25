'use strict';

/**
 * File a report on a post into the admin report queue (PostReport), the same
 * way POST /api/posts/:id/report does: one report per person per post, keyed
 * by a deterministic id so retries are no-ops, and the admin alert only for the
 * request that wrote the row. Nearby Plans uses it for "Something wasn't
 * right" and for reporting a plan, whose post the generic route can't see.
 *
 * A report on a reply is a PostReport row too, with the reply's comment_id and
 * its post's post_id (fileReplyReport). A post's own reports are the rows with
 * no comment_id: everything that counts a post's reports reads only those.
 */

const { createHash } = require('node:crypto');
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');

const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'misinformation', 'safety', 'other'];

/**
 * @returns {Promise<{ created: boolean, reportId: string }>}
 */
async function filePostReport({ postId, userId, reason, details = null }) {
  if (!REPORT_REASONS.includes(reason)) throw new Error(`Unknown report reason: ${reason}`);
  const reportId = createHash('sha256')
    .update(`pantopus:post-report:v1:${String(postId).toLowerCase()}:${String(userId).toLowerCase()}`)
    .digest('hex').slice(0, 32);

  const { data: existing, error: readError } = await supabaseAdmin.from('PostReport')
    .select('id').eq('post_id', postId).eq('reported_by', userId).is('comment_id', null).limit(1);
  if (readError) throw new Error(`Failed to read reports: ${readError.message}`);
  if (existing?.length) return { created: false, reportId: existing[0].id };

  const { data: inserted, error } = await supabaseAdmin.from('PostReport').upsert({
    id: reportId, post_id: postId, reported_by: userId, reason, details: details ? String(details).slice(0, 1000) : null,
  }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`Failed to file the report: ${error.message}`);
  const created = Boolean(inserted?.length);
  if (created) {
    require('./adminAlerts').notifyReportToReview({ kind: 'post', reason, reportId })
      .catch((err) => logger.warn('postReport.alert_failed', { error: err?.message }));
  }
  return { created, reportId };
}

/**
 * File a report on a reply: one per person per reply (the same row whichever route filed it: POST
 * /api/posts/:postId/comments/:commentId/report or Pulse's /api/pulse/posts/:postId/replies/:replyId/report).
 * `reply` needs id, post_id, identity_context_type and identity_context_id. The caller has checked that the person may
 * read the reply and didn't write it. A made-up-name reply that two different people reported is hidden until
 * someone has looked (penName/standing.js).
 *
 * @returns {Promise<{ created: boolean, reportId: string }>}
 */
async function fileReplyReport({ reply, userId, reason, details = null }) {
  if (!REPORT_REASONS.includes(reason)) throw new Error(`Unknown report reason: ${reason}`);
  const reportId = createHash('sha256')
    .update(`pantopus:reply-report:v1:${String(reply.id).toLowerCase()}:${String(userId).toLowerCase()}`)
    .digest('hex').slice(0, 32);

  const { data: existing, error: readError } = await supabaseAdmin.from('PostReport')
    .select('id').eq('comment_id', reply.id).eq('reported_by', userId).limit(1);
  if (readError) throw new Error(`Failed to read reports: ${readError.message}`);
  if (existing?.length) return { created: false, reportId: existing[0].id };

  const { data: inserted, error } = await supabaseAdmin.from('PostReport').upsert({
    id: reportId, post_id: reply.post_id, comment_id: reply.id, reported_by: userId, reason,
    details: details ? String(details).slice(0, 1000) : null,
  }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`Failed to file the report: ${error.message}`);
  const created = Boolean(inserted?.length);
  if (created) {
    require('./adminAlerts').notifyReportToReview({ kind: 'reply', reason, reportId })
      .catch((err) => logger.warn('replyReport.alert_failed', { error: err?.message }));
    await require('./penName').standing.holdReplyIfReported(reply);
  }
  return { created, reportId };
}

/** Whether this person already reported this reply (an answer for a retry once the reply is hidden). */
async function hasReportedReply({ commentId, userId }) {
  const { data, error } = await supabaseAdmin.from('PostReport')
    .select('id').eq('comment_id', commentId).eq('reported_by', userId).limit(1);
  if (error) throw new Error(`Failed to read reports: ${error.message}`);
  return Boolean(data?.length);
}

module.exports = { filePostReport, fileReplyReport, hasReportedReply, REPORT_REASONS };
