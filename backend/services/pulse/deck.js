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

module.exports = { parseDeck, checkFirstStep, decksFor, deckOf, MAX_STEPS };
