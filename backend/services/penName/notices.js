// Made-up names: notices to the writer.
//
// A made-up-name post or reply is stored under the system account, so a notice "to the row's account" ("Maria replied
// to your post", a reaction, a repost) is addressed to the system account. notificationService asks here who should
// really get it, in one place, so no caller has to know and none can leak or lose a notice:
//   * the account that wrote the post or reply the notice is about (behind owner.js);
//   * nobody, when that can't be worked out, when the writer did the thing themself, or when the writer blocked
//     whoever did it (their person, or the made-up name they acted under).
// The words of the notice are the caller's: they name whoever acted, by the name they acted under, and never name
// the writer's made-up name ("your post"), so nothing on a lock screen says which made-up name is theirs.

const logger = require('../../utils/logger');
const owner = require('./owner');
const present = require('./present');

/** Which row a notice is about: { kind, id }, or null. */
function subjectOf(type, metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  if (metadata.parent_comment_id) return { kind: 'comment', id: metadata.parent_comment_id };
  if (String(type || '').startsWith('comment_') && type !== 'comment_replied' && metadata.comment_id) {
    return { kind: 'comment', id: metadata.comment_id };
  }
  if (metadata.post_id) return { kind: 'post', id: metadata.post_id };
  return null;
}

/**
 * The account a notice addressed to the system account goes to, or null to send nothing.
 */
async function recipientFor({ type, metadata }) {
  try {
    const subject = subjectOf(type, metadata);
    if (!subject) return null;
    const writer = await owner.ownerOf(subject.kind, subject.id);
    if (!writer) return null;
    // A reply to the post's own writer: the post's notice already tells them.
    if (type === 'comment_replied' && metadata.post_id
      && String(await owner.ownerOf('post', metadata.post_id).catch(() => '')) === String(writer)) return null;
    const actorId = metadata.user_id || null;
    if (actorId && String(actorId) === String(writer)) return null;
    if (actorId) {
      // eslint-disable-next-line global-require
      const blockService = require('../blockService');
      if (await blockService.isBlocked(actorId, writer)) return null;
    }
    if (metadata.pen_name_id) {
      // The actor wrote under a made-up name: no notice of their own doing, and none from a name the writer hid.
      if ((await owner.mine(writer, owner.KIND, [metadata.pen_name_id])).has(String(metadata.pen_name_id))) return null;
      if ((await present.hiddenIds(writer)).has(String(metadata.pen_name_id))) return null;
    }
    return writer;
  } catch (error) {
    logger.warn('penName.notice_recipient_unavailable', { type, error: error.message });
    return null;
  }
}

module.exports = { recipientFor, subjectOf };
