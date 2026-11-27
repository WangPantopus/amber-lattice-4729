// Illuminate's suggestion (Pulse, reinvented; DESIGN row 32; CONTRACT 7i, the one table all three apps use): at most
// one playable kind for what the person is making, worked out on this device from what the Studio already holds. No
// route, no model call, nothing sent: the person's unposted words never leave the device.

export type SuggestedKind = 'deck' | 'before_after' | 'guess' | 'poll' | 'question' | 'swatch';

export interface Suggestion {
  kind: SuggestedKind;
  /** The chip's words (CONTRACT 7i). */
  words: string;
  /** For a poll: the choices cut from the question. */
  choices?: string[];
}

export interface SuggestInput {
  /** The words typed so far (a text card's own words count as its caption). */
  caption: string;
  /** Photos or videos picked together (0 for a text card). */
  picked: number;
  /** Every picked item is a photo. */
  photosOnly: boolean;
  /** The picture now in the Studio is a photo (not a video, not a text card). */
  photo: boolean;
  /** A step deck may go here: a Moment, under the person's own name. */
  deckMayGo: boolean;
  /** A before and after may go here (photos, nothing else in the way). */
  pairMayGo: boolean;
  /** Playable items may go on this post at all. */
  playMayGo: boolean;
}

const GUESS_WORDS = /\b(how many|how much|how far|how long|how tall|how old|how deep|how high|how big|what year)\b/i;
const COLOUR_WORDS = new Set(
  (
    'red orange yellow green blue purple violet pink brown black white gray grey gold silver teal navy beige cream maroon ' +
    'turquoise lavender olive mint coral peach rust burgundy ivory charcoal emerald crimson amber tan sage paint colour ' +
    'color colours colors swatch'
  ).split(' '),
);

const isQuestion = (s: string) => /[?？]/.test(s);

/**
 * A poll's choices (CONTRACT 7i rule 4): the question without its `?`; only what follows its last `:`; split on commas and
 * the whole word "or". 2 to 4 parts of 1 to 40 characters, and the word "or" must be there; otherwise none.
 */
export function pollChoices(caption: string): string[] | null {
  let q = caption.replace(/[?？]/g, '');
  if (!/\bor\b/i.test(q)) return null;
  const colon = q.lastIndexOf(':');
  if (colon >= 0) q = q.slice(colon + 1);
  const parts = q
    .split(/,|\bor\b/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 && parts.every((p) => p.length <= 40) ? parts : null;
}

/** The one suggestion for what the Studio holds, first rule that matches and may go there; null for none. */
export function suggestPlay(input: SuggestInput): Suggestion | null {
  const caption = input.caption.trim();
  // Rule 1: three or four photos or videos → a step deck (a Moment, under the person's own name).
  if ((input.picked === 3 || input.picked === 4) && input.deckMayGo) return { kind: 'deck', words: 'Post these as steps?' };
  // Rule 2: exactly two photos → before and after.
  if (input.picked === 2 && input.photosOnly && input.pairMayGo) return { kind: 'before_after', words: 'Show before and after?' };
  if (!input.playMayGo || !caption) return null;
  if (isQuestion(caption)) {
    // Rule 3: a question with a number in digits, or asking how many, how far and the like → let people guess.
    if (/\d/.test(caption) || GUESS_WORDS.test(caption)) return { kind: 'guess', words: 'Let people guess?' };
    // Rule 4: a question "or" splits into 2 to 4 choices → a poll.
    const choices = pollChoices(caption);
    if (choices) return { kind: 'poll', words: 'Make it a poll?', choices };
    // Rule 5: any other question → a question box.
    return { kind: 'question', words: 'Ask with a question box?' };
  }
  // Rule 6: a colour word on a photo → the swatch slider.
  if (input.photo && caption.toLowerCase().split(/[^a-z]+/).some((w) => COLOUR_WORDS.has(w)))
    return { kind: 'swatch', words: 'Try the colours on?' };
  return null;
}
