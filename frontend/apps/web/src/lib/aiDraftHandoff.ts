// A draft the assistant wrote, on its way to the screen that sends it. The chat keeps it in this tab's session
// storage and opens the screen; the screen takes it once as it opens (the way the feed's composer takes
// `ai_post_draft`). Never the address bar: a letter or a note can name someone's health or home.

import type { LetterChatDraft, MomentChatDraft } from '@pantopus/types';

/** A letter for Mail's letter compose (mailbox/layout.tsx). */
export const AI_LETTER_DRAFT_KEY = 'ai_letter_draft';
/** A Moment for the Moments composer (MomentsExperience.tsx). */
export const AI_MOMENT_DRAFT_KEY = 'ai_moment_draft';

/** Keeps a draft for the screen about to open. False when storage is blocked: that screen then opens empty. */
export function handOffDraft(key: string, draft: unknown): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function take(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const LETTER_INTENTS = ['say_hello', 'congratulations', 'condolences', 'business_note', 'just_because'] as const;
// What each kind of letter is called where the person chooses or reads it (the phones' letter wizard).
export const LETTER_KIND_NAMES: Record<LetterChatDraft['intent'], string> = {
  say_hello: 'Say hello',
  congratulations: 'Congratulations',
  condolences: 'Condolences',
  business_note: 'Business note',
  just_because: 'Just because',
};
// The subject each kind of letter goes out under (the phones' wizard writes the same).
export const LETTER_KIND_SUBJECTS: Record<LetterChatDraft['intent'], string> = {
  say_hello: 'A note from a friend',
  congratulations: 'Congratulations!',
  condolences: 'Thinking of you',
  business_note: 'A business note',
  just_because: 'Just because',
};

export function letterIntentOf(value: unknown): LetterChatDraft['intent'] {
  return (LETTER_INTENTS as readonly unknown[]).includes(value) ? (value as LetterChatDraft['intent']) : 'say_hello';
}

/** The letter waiting for Mail's compose, taken once. Null when there is none, or it names nobody. */
export function takeLetterDraft(): LetterChatDraft | null {
  const draft = take(AI_LETTER_DRAFT_KEY) as LetterChatDraft | null;
  const to = draft?.recipient;
  if (!draft || !to || typeof to.userId !== 'string' || !to.userId || typeof draft.body !== 'string') return null;
  return {
    recipient: { ...to, name: typeof to.name === 'string' ? to.name : '', homeId: typeof to.homeId === 'string' ? to.homeId : null },
    intent: letterIntentOf(draft.intent),
    body: draft.body,
  };
}

const MOMENT_BACKGROUNDS = ['teal', 'sky', 'green', 'amber', 'rose', 'slate'];

/** The Moment waiting for the Moments composer, taken once. */
export function takeMomentDraft(): MomentChatDraft | null {
  const draft = take(AI_MOMENT_DRAFT_KEY) as MomentChatDraft | null;
  if (!draft || (draft.kind !== 'text' && draft.kind !== 'photo')) return null;
  return {
    kind: draft.kind,
    text: typeof draft.text === 'string' ? draft.text.slice(0, 200) : '',
    background: MOMENT_BACKGROUNDS.includes(draft.background as string) ? draft.background : 'teal',
    caption: typeof draft.caption === 'string' ? draft.caption.slice(0, 100) : '',
    hours: ([1, 6, 24, 48] as const).includes(draft.hours) ? draft.hours : 24,
    audience: draft.audience === 'connections' ? 'connections' : 'nearby',
  };
}
