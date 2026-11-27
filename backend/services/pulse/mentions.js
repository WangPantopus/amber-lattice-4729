'use strict';

// Pulse, reinvented, phase 0 step 5: mentions in a caption (coord CONTRACT 7h; LEAD-3 2026-11-27 05:19). The caption
// keeps "@First Last" as plain words; the ids sent beside it are kept only for the author's connections, not blocked
// either way, who may see the post, and never under a made-up name (a mention says who the author knows). Nobody is
// told for now: no notice kind that exists today fits, and a new push kind waits for a notification settings row.

const blockService = require('../blockService');
const logger = require('../../utils/logger');

const MAX = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const play = () => require('./play');

/** The ids sent (`mentions`), or null when none were sent; throws an Error that says what is wrong. */
function parse(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > MAX || !value.every((id) => UUID.test(String(id)))) {
    throw new Error(`mentions must be a list of up to ${MAX} person ids.`);
  }
  return [...new Set(value.map((id) => String(id).toLowerCase()))];
}

/**
 * The mentioned people kept, in the order sent: the author's connections, not blocked either way, for whom
 * `maySee(personId)` holds. None under a made-up name.
 */
async function keep(ids, authorId, { penName = false, maySee }) {
  if (!ids?.length || penName) return [];
  const store = momentStore();
  const [connections, blocked] = await Promise.all([store.connectionIds(authorId), blockService.blockedUserIds(authorId)]);
  const linked = new Set(connections.map(String));
  const candidates = ids.filter((id) => id !== String(authorId).toLowerCase() && linked.has(id) && !blocked.has(id));
  const seeing = await Promise.all(candidates.map((id) => Promise.resolve(maySee(id)).catch((error) => {
    logger.warn('mentions.may_see_failed', { error: error.message });
    return false;
  })));
  return candidates.filter((_, index) => seeing[index]);
}

/** Whether `personId` may see a Moment like `row` (today's rules: audience, blocks, mutes), for `keep`'s `maySee`. */
async function maySeeMoment(row, personId) {
  const store = momentStore();
  const ctx = await store.viewerContext(personId, [row.user_id]);
  return store.canSee(row, ctx);
}

/**
 * The mentioned people as `viewerId` reads them, by row id: [<Author>] in the order kept, without people the reader has
 * blocked or muted, or who blocked the reader. `listOf(row)` gives a row's kept ids.
 */
async function shownFor(rows, viewerId, listOf) {
  const out = new Map();
  const withAny = (rows || []).filter((row) => listOf(row)?.length);
  if (!withAny.length) return out;
  const store = momentStore();
  const [authors, hidden] = await Promise.all([
    store.loadAuthors(withAny.flatMap((row) => listOf(row))),
    play().hiddenPeople(viewerId),
  ]);
  for (const row of withAny) {
    out.set(row.id, listOf(row).filter((id) => !hidden.has(String(id)) && authors.has(String(id))).map((id) => authors.get(String(id))));
  }
  return out;
}

module.exports = { parse, keep, maySeeMoment, shownFor, MAX };
