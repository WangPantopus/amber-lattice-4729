/**
 * How people react to a post (POST /api/posts/:id/like, one reaction per person, counted in Post.like_count), the same
 * on web, iPhone and Android and in the author's notice. On an event the reaction is Going ("2 going"). On every other
 * kind it is one of the emoji below, and each emoji's count shows under the post.
 */

const GOING_POST_TYPES = ['event'];
const CELEBRATE_POST_TYPES = ['neighborhood_win', 'progress_wins'];

/**
 * The emoji a post can get, in the order the apps offer them. The apps carry the same list
 * (frontend/packages/ui-utils/src/post-types.ts, iOS PostReactionRequest.swift, Android PostReactionRequest.kt).
 */
const POST_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉'];

/** A mark made before emoji reactions, or by an app that predates them, has no emoji and shows as this one. */
const DEFAULT_POST_REACTION = POST_REACTION_EMOJIS[0];

/**
 * The five signals (Pulse, reinvented, founder 2026-11-26), in the order the new screens offer them. Only a person with
 * `pulse_reinvented` on can choose one. A signal is stored where an emoji is (PostLike.reaction, one per person per
 * post), so choosing one replaces the other. Every answer that exists today keeps saying emoji: a signal shows there,
 * and on the apps already in the stores, as its nearest emoji (SIGNAL_EMOJI); the new screens show an emoji as its
 * nearest signal (EMOJI_SIGNAL), and a mark from before emoji, which was "Helpful", as `helpful`.
 */
const POST_SIGNALS = ['learned', 'want_to_go', 'smile', 'same', 'helpful'];
const SIGNAL_EMOJI = { learned: '😮', want_to_go: '❤️', smile: '😂', same: '👍', helpful: '🙏' };
const EMOJI_SIGNAL = { '👍': 'same', '❤️': 'smile', '😂': 'smile', '😮': 'learned', '😢': 'same', '🙏': 'helpful', '🎉': 'smile' };
const SIGNAL_OF_OLD_MARK = 'helpful';

// U+FE0F only asks for the emoji presentation; "❤" and "❤️" are the same reaction.
const bare = (emoji) => emoji.replace(/️/g, '');
const BY_BARE_FORM = new Map(POST_REACTION_EMOJIS.map((emoji) => [bare(emoji), emoji]));

/** The emoji as stored, or null when it isn't one a post can get. */
function normalizePostReaction(value) {
  if (typeof value !== 'string') return null;
  return BY_BARE_FORM.get(bare(value.trim())) || null;
}

/** A stored reaction as the apps show it: a row without one (an older mark) is 👍, a signal its nearest emoji. */
function shownReaction(stored) {
  return normalizePostReaction(stored) || SIGNAL_EMOJI[stored] || DEFAULT_POST_REACTION;
}

/** The signal as stored, or null when it isn't one of POST_SIGNALS. */
function normalizePostSignal(value) {
  return typeof value === 'string' && POST_SIGNALS.includes(value.trim()) ? value.trim() : null;
}

/** A stored reaction as the new screens show it: a signal as itself, an emoji as its nearest signal. */
function shownSignal(stored) {
  if (POST_SIGNALS.includes(stored)) return stored;
  if (stored == null) return SIGNAL_OF_OLD_MARK;
  return EMOJI_SIGNAL[shownReaction(stored)] || SIGNAL_OF_OLD_MARK;
}

/** Rows of { reaction, count } as [{ signal, count }], the most used first, ties in the order the screens offer them. */
function signalSummary(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    const count = Number(row.count ?? row.reaction_count) || 0;
    if (count <= 0) continue;
    const signal = shownSignal(row.reaction);
    counts.set(signal, (counts.get(signal) || 0) + count);
  }
  return [...counts.entries()]
    .map(([signal, count]) => ({ signal, count }))
    .sort((a, b) => b.count - a.count || POST_SIGNALS.indexOf(a.signal) - POST_SIGNALS.indexOf(b.signal));
}

/**
 * Rows of { reaction, count } (post_reaction_counts) as [{ reaction, count }]: one entry per emoji with its count, the
 * most used first, ties in the order the apps offer them.
 */
function reactionSummary(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    const count = Number(row.count ?? row.reaction_count) || 0;
    if (count <= 0) continue;
    const reaction = shownReaction(row.reaction);
    counts.set(reaction, (counts.get(reaction) || 0) + count);
  }
  return [...counts.entries()]
    .map(([reaction, count]) => ({ reaction, count }))
    .sort((a, b) => b.count - a.count
      || POST_REACTION_EMOJIS.indexOf(a.reaction) - POST_REACTION_EMOJIS.indexOf(b.reaction));
}

/** 'going' for an event, 'emoji' for every other kind (an unknown or missing type takes emoji). */
function postReaction(postType) {
  return GOING_POST_TYPES.includes(postType) ? 'going' : 'emoji';
}

/**
 * The post types whose marks About's "Around the neighborhood" leaves out of its count (Going on an event, and a win's
 * marks, which were Celebrate before emoji reactions).
 */
const NOT_HELPFUL_POST_TYPES = [...GOING_POST_TYPES, ...CELEBRATE_POST_TYPES];

/** What the post's author is told when someone reacts: "Ben reacted ❤️ to your post", "Ben is going to your event". */
function reactionNotice(postType, name, reaction) {
  if (postReaction(postType) === 'going') return { title: `${name} is going to your event`, icon: '📅' };
  const emoji = shownReaction(reaction);
  return { title: `${name} reacted ${emoji} to your post`, icon: emoji };
}

module.exports = {
  POST_REACTION_EMOJIS,
  DEFAULT_POST_REACTION,
  normalizePostReaction,
  shownReaction,
  reactionSummary,
  postReaction,
  reactionNotice,
  NOT_HELPFUL_POST_TYPES,
  POST_SIGNALS,
  SIGNAL_EMOJI,
  EMOJI_SIGNAL,
  normalizePostSignal,
  shownSignal,
  signalSummary,
};
