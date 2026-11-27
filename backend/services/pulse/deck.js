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

/** A step after the first needs the deck's first step, posted by the same person. */
async function checkFirstStep(userId, deck) {
  if (!deck || deck.index === 1) return;
  const { data, error } = await supabaseAdmin.from('Post').select('id')
    .eq('is_story', true).eq('user_id', userId)
    .eq('post_metadata->moment->deck->>id', deck.id).eq('post_metadata->moment->deck->>index', '1').limit(1);
  if (error) throw new Error(`Failed to read the deck: ${error.message}`);
  if (!data?.length) throw momentStore().fail(400, 'MOMENT_INVALID', "Post the deck's first step before the others.");
}

/**
 * The steps of the decks these Moments belong to, as `viewerId` may see them, by deck id: [moment id, …] in step order.
 * One read of the steps, then the Moments store's own visibility rules.
 */
async function decksFor(rows, viewerId) {
  const store = momentStore();
  const ids = [...new Set(rows.map((row) => store.meta(row).deck?.id).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const { data, error } = await supabaseAdmin.from('Post').select('id, post_metadata')
    .eq('is_story', true).in('post_metadata->moment->deck->>id', ids).limit(ids.length * MAX_STEPS * 2);
  if (error) throw new Error(`Failed to read the decks: ${error.message}`);
  const visible = new Set((await store.openMoments((data || []).map((row) => row.id), viewerId)).map((row) => row.id));
  for (const row of data || []) {
    const deck = row.post_metadata?.moment?.deck;
    if (!deck || !visible.has(row.id)) continue;
    if (!out.has(deck.id)) out.set(deck.id, []);
    out.get(deck.id).push({ id: row.id, index: deck.index });
  }
  for (const [id, steps] of out) out.set(id, steps.sort((a, b) => a.index - b.index).map((step) => step.id));
  return out;
}

/** A Moment's `deck` as a reader gets it, or null. */
function deckOf(m, decks) {
  const deck = m?.deck;
  if (!deck) return null;
  return { id: deck.id, index: deck.index, count: deck.count, steps: decks.get(deck.id) || [] };
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

/** All steps of a deck, as stored, in order. */
async function stepRows(deckId) {
  const { data, error } = await supabaseAdmin.from('Post')
    .select('id, user_id, content, archived_at, archive_reason, story_expires_at, post_metadata')
    .eq('is_story', true).eq('post_metadata->moment->deck->>id', deckId).limit(MAX_STEPS * 2);
  if (error) throw new Error(`Failed to read the deck: ${error.message}`);
  return (data || []).sort((a, b) => a.post_metadata.moment.deck.index - b.post_metadata.moment.deck.index);
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
  const rows = await stepRows(deck.id);
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
  const { data, error } = await supabaseAdmin.from('Post').select('post_metadata').eq('id', momentId).eq('is_story', true).maybeSingle();
  if (error) throw new Error(`Failed to read the deck: ${error.message}`);
  const deckId = data?.post_metadata?.moment?.deck?.id;
  if (!deckId) return;
  const first = (await stepRows(deckId)).find((row) => row.post_metadata.moment.deck.index === 1);
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

module.exports = { parseDeck, checkFirstStep, decksFor, deckOf, MAX_STEPS, saveSteps, unsaveSteps, savedDecks, SAVE_ITEM };
