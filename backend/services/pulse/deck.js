'use strict';

// Pulse, reinvented, phase 2: the step deck (coord CONTRACT 7g). Up to four photo or video Moments of one recipe or
// repair, posted one by one as today's several photos are, each with its own caption and voice tip (7e), linked by
// `post_metadata.moment.deck` = { v, id, index, count }. Older apps and the switch off see four ordinary Moments.

const Joi = require('joi');
const supabaseAdmin = require('../../config/supabaseAdmin');

const MAX_STEPS = 4;
const schema = Joi.object({
  id: Joi.string().uuid().required(),
  index: Joi.number().integer().min(1).max(MAX_STEPS).required(),
  count: Joi.number().integer().min(2).max(MAX_STEPS).required(),
});

// Required when used: momentStore requires this file for its answers.
// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

/** The deck in a Moment's body, as stored, or null; throws 400 MOMENT_INVALID for a malformed one. */
function parseDeck(value, { kind, penName }) {
  if (value == null) return null;
  const store = momentStore();
  const { error, value: deck } = schema.validate(value, { abortEarly: true, stripUnknown: true });
  if (error) throw store.fail(400, 'MOMENT_INVALID', `deck: ${error.details[0].message.replace(/"/g, '')}`);
  if (deck.index > deck.count) throw store.fail(400, 'MOMENT_INVALID', 'deck: index must be within count.');
  if (!['photo', 'video'].includes(kind)) throw store.fail(400, 'MOMENT_INVALID', 'A step deck is photos or videos.');
  if (penName) throw store.fail(400, 'MOMENT_INVALID', 'A step deck goes out under your own name.');
  return { v: 1, id: deck.id.toLowerCase(), index: deck.index, count: deck.count };
}

/**
 * A deck belongs to one author (LEAD-3, 04:47): every read of a deck is by its author and its id together, so another
 * person's Moment with the same id is a deck of its own and never one of these steps; nothing reads every stored Moment
 * (the reads use the author index). A step after the first needs the deck's first step by the same person, and each
 * step is posted once (`retryRowId`: the row a retry of the same tap would make, let through so the route answers it).
 */
async function checkStep(userId, deck, retryRowId = null) {
  if (!deck) return;
  const { data, error } = await supabaseAdmin.from('Post').select('id, post_metadata')
    .eq('is_story', true).eq('user_id', userId).eq('post_metadata->moment->deck->>id', deck.id).limit(MAX_STEPS * 4);
  if (error) throw new Error(`Failed to read the deck: ${error.message}`);
  const rows = (data || []).filter((row) => row.id !== retryRowId);
  const fail = (message) => momentStore().fail(400, 'MOMENT_INVALID', message);
  const mine = rows.map((row) => row.post_metadata?.moment?.deck?.index);
  if (mine.includes(deck.index)) throw fail('This step of the deck is already posted.');
  if (deck.index > 1 && !mine.includes(1)) throw fail("Post the deck's first step before the others.");
}

/**
 * The steps of the decks these Moments belong to, as `viewerId` may see them, by deck id: [moment id, …] in step order.
 * One read of the steps, then the Moments store's own visibility rules.
 */
async function decksFor(rows, viewerId) {
  const store = momentStore();
  // A deck is its author's: steps are gathered, kept and looked up by the author and the id together
  // (`${user_id}:${id}`), so another person's Moment with the same id is never one of its steps, even on the same page
  // (LEAD-3, 04:47 and 04:49). The read is on the authors' own rows.
  const keyOf = (userId, deckId) => `${String(userId)}:${deckId}`;
  const wanted = new Set(rows.filter((row) => store.meta(row).deck?.id).map((row) => keyOf(row.user_id, store.meta(row).deck.id)));
  const out = new Map();
  if (!wanted.size) return out;
  const ids = [...new Set([...wanted].map((key) => key.slice(key.indexOf(':') + 1)))];
  const authors = [...new Set([...wanted].map((key) => key.slice(0, key.indexOf(':'))))];
  const { data, error } = await supabaseAdmin.from('Post').select('id, user_id, post_metadata')
    .eq('is_story', true).in('user_id', authors).in('post_metadata->moment->deck->>id', ids)
    .limit(wanted.size * MAX_STEPS * 2);
  if (error) throw new Error(`Failed to read the decks: ${error.message}`);
  const own = (data || []).filter((row) => wanted.has(keyOf(row.user_id, row.post_metadata?.moment?.deck?.id)));
  const visible = new Set((await store.openMoments(own.map((row) => row.id), viewerId)).map((row) => row.id));
  const seen = new Set();
  for (const row of own) {
    const deck = row.post_metadata?.moment?.deck;
    const key = keyOf(row.user_id, deck?.id);
    // One Moment per step.
    if (!deck || !visible.has(row.id) || seen.has(`${key}:${deck.index}`)) continue;
    seen.add(`${key}:${deck.index}`);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ id: row.id, index: deck.index });
  }
  for (const [key, steps] of out) out.set(key, steps.sort((a, b) => a.index - b.index).map((step) => step.id));
  return out;
}

/** A Moment's `deck` as a reader gets it, or null; its steps looked up by its author and the deck id together. */
function deckOf(m, decks, authorId) {
  const deck = m?.deck;
  if (!deck) return null;
  return { id: deck.id, index: deck.index, count: deck.count, steps: decks.get(`${String(authorId)}:${deck.id}`) || [] };
}

// ─── "Save the steps" (CONTRACT 7g; LEAD-3 04:31) ───────────────────────────
// The reader's field guide keeps a deck as one PostAnswer row (kind collect, item k-deck) on the deck's first step: only
// words (each step's caption and its voice tip's words), never a picture or a sound, so nothing of the author's media
// outlives the Moments. It opens the deck while the deck is open to the reader or its author kept it, and it goes from
// the guide when the author deletes the Moments (it stays when they only fade).

const SAVE_ITEM = 'k-deck';

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** All steps of a deck by its author, as stored, one per step, in order. */
async function stepRows(deckId, authorId) {
  const { data, error } = await supabaseAdmin.from('Post')
    .select('id, user_id, content, archived_at, archive_reason, story_expires_at, post_metadata, created_at')
    .eq('is_story', true).eq('user_id', authorId).eq('post_metadata->moment->deck->>id', deckId)
    .order('created_at', { ascending: true }).limit(MAX_STEPS * 2);
  if (error) throw new Error(`Failed to read the deck: ${error.message}`);
  const byIndex = new Map();
  for (const row of data || []) {
    const index = row.post_metadata.moment.deck.index;
    if (!byIndex.has(index)) byIndex.set(index, row);
  }
  return [...byIndex.values()].sort((a, b) => a.post_metadata.moment.deck.index - b.post_metadata.moment.deck.index);
}

/** Whether the author deleted this step (Delete, or Delete for good), not only let it fade. */
function deletedByAuthor(row) {
  const m = row?.post_metadata?.moment || {};
  return Boolean(m.deleted_for_good_at) || (row?.archived_at && row.archive_reason === 'manual');
}

/** POST /moments/:id/deck/save — keeps the words of the deck's steps the reader may see in their field guide. */
async function saveSteps(momentId, viewerId) {
  const store = momentStore();
  const [moment] = await store.openMoments([momentId], viewerId);
  const deck = moment && store.meta(moment).deck;
  if (!deck) throw fail(404, 'PLAY_NOT_FOUND', 'This step deck could not be found.');
  const rows = await stepRows(deck.id, moment.user_id);
  const visible = new Set((await store.openMoments(rows.map((row) => row.id), viewerId)).map((row) => row.id));
  const first = rows.find((row) => row.post_metadata.moment.deck.index === 1);
  if (!first) throw fail(404, 'PLAY_NOT_FOUND', 'This step deck could not be found.');
  const steps = rows.filter((row) => visible.has(row.id)).map((row) => {
    const m = row.post_metadata.moment;
    return {
      index: m.deck.index,
      caption: row.content || null,
      words: Array.isArray(m.sound?.words) && m.sound.kind === 'voice' ? m.sound.words.map((word) => word.w).join(' ').slice(0, 1200) : null,
    };
  });
  const value = { deck: deck.id, count: deck.count, steps };
  const { error } = await supabaseAdmin.from('PostAnswer').upsert({
    post_id: first.id, user_id: viewerId, item: SAVE_ITEM, kind: 'collect', value, updated_at: new Date().toISOString(),
  }, { onConflict: 'post_id,item,user_id' });
  if (error) throw new Error(`Failed to save the steps: ${error.message}`);
  return { saved: { deck_id: deck.id, first_moment_id: first.id, steps } };
}

/** DELETE /moments/:id/deck/save — lets the saved steps go (any step's id, even after the deck faded). */
async function unsaveSteps(momentId, viewerId) {
  const { data, error } = await supabaseAdmin.from('Post').select('user_id, post_metadata').eq('id', momentId).eq('is_story', true).maybeSingle();
  if (error) throw new Error(`Failed to read the deck: ${error.message}`);
  const deckId = data?.post_metadata?.moment?.deck?.id;
  if (!deckId) return;
  const first = (await stepRows(deckId, data.user_id)).find((row) => row.post_metadata.moment.deck.index === 1);
  if (!first) return;
  const { error: deleteError } = await supabaseAdmin.from('PostAnswer').delete()
    .eq('post_id', first.id).eq('item', SAVE_ITEM).eq('user_id', viewerId);
  if (deleteError) throw new Error(`Failed to let the steps go: ${deleteError.message}`);
}

/**
 * The field guide's saved decks among these collect rows: dropped when the author deleted the deck's first step; `open`
 * while the reader may open it now, or its author kept it.
 */
async function savedDecks(rows, viewerId) {
  const store = momentStore();
  const firstIds = rows.map((row) => row.post_id);
  if (!firstIds.length) return [];
  const { data, error } = await supabaseAdmin.from('Post').select('id, archived_at, archive_reason, post_metadata').in('id', firstIds);
  if (error) throw new Error(`Failed to read the saved decks: ${error.message}`);
  const firsts = new Map((data || []).map((row) => [row.id, row]));
  const live = new Set((await store.openMoments(firstIds, viewerId)).map((row) => row.id));
  return rows.filter((row) => firsts.has(row.post_id) && !deletedByAuthor(firsts.get(row.post_id))).map((row) => ({
    deck_id: row.value?.deck || null,
    first_moment_id: row.post_id,
    saved_at: row.created_at,
    steps: Array.isArray(row.value?.steps) ? row.value.steps : [],
    open: live.has(row.post_id) || Boolean(firsts.get(row.post_id)?.post_metadata?.moment?.kept_post_at),
  }));
}

module.exports = { parseDeck, checkStep, decksFor, deckOf, MAX_STEPS, saveSteps, unsaveSteps, savedDecks, SAVE_ITEM };
