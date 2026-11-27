'use strict';

// Pulse, reinvented, phase 1: "Keep this?" (coord CONTRACT 6d, POST /api/reinvented/moments/:id/keep). A Moment that
// drew a reply asks its author once, in its last two hours, whether to keep it. Yes marks the Moment's own row
// (`post_metadata.moment.kept_post_at`): nothing is copied, its picture stays in the private bucket, and the new routes
// list it after its end as a post that stays, for the same people (canSee). To today's routes it simply ended.

const store = require('../moments/momentStore');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const NOT_OFFERED = "This Moment can't be kept now.";

/** The author answers "Keep this?" (`keep` true or false) for their own Moment; answers the Moment as they see it. */
async function answerKeep(userId, id, keep) {
  const row = await store.ownMoment(id, userId);
  if (!row) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  if (store.momentState(row) === 'ended') throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  if (!store.keepOfferable(row)) throw fail(409, 'KEEP_NOT_OFFERED', NOT_OFFERED);
  if (!(await store.repliedMoments([row])).has(row.id)) throw fail(409, 'KEEP_NOT_OFFERED', NOT_OFFERED);
  const now = new Date().toISOString();
  const updated = await store.updateMoment(row, {
    moment: { keep_answered_at: now, ...(keep ? { kept_post_at: now } : {}) },
  }) || row;
  const [moment] = await store.serializeMoments([updated], userId);
  return { moment };
}

module.exports = { answerKeep };
