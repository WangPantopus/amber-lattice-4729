import type { ProfileInk } from '@pantopus/api';

export const INK_WORD: Record<ProfileInk, string> = { seen: 'Seen', signed: 'Signed', said: 'Said' };

/** An ink the server sent, or Said when it is anything else (rule 4.1: unsure means Said). */
export function inkOf(value: unknown): ProfileInk {
  return value === 'seen' || value === 'signed' ? value : 'said';
}

/** "Seen · By mail, June 2026", or the word alone. */
export function howText(ink: ProfileInk, how?: string | null): string {
  const detail = typeof how === 'string' ? how.trim() : '';
  return detail ? `${INK_WORD[ink]} · ${detail}` : INK_WORD[ink];
}
