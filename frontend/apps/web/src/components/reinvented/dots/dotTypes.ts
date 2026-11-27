// Living objects (Pulse, reinvented, phase 2; coord/CONTRACT.md §7c, §7d, §7f): dots an author puts on things in a
// photo. A reader taps one for a note, a rating, a link, or a field card that names the thing ("likely", with a source),
// and may keep that card in their field guide. Only for a reader whose switch is on.

import { del, post } from '@pantopus/api/client';

export interface FieldCard {
  name: string | null;
  likely: boolean;
  scientific: string | null;
  why: string;
  source: { title: string; url: string } | null;
  caution: string | null;
  named_by: string;
  made_at: string;
  corrections: number;
  my_correction: { name: string; note?: string | null } | null;
  collected?: boolean;
}

interface Base {
  id: string;
  x: number;
  y: number;
}

export type Dot =
  | (Base & { kind: 'note'; text: string })
  | (Base & { kind: 'rating'; label: string; stars: number })
  | (Base & { kind: 'link'; url: string; title?: string | null })
  | (Base & { kind: 'thing'; box: { x: number; y: number; w: number; h: number }; label?: string | null; card: FieldCard | null })
  | (Base & { kind: 'whisper' });

const dotPath = (postId: string, dot: string) => `/api/reinvented/dots/${encodeURIComponent(postId)}/${encodeURIComponent(dot)}`;

/** The field card for a `thing` dot: made by the first tap (one Pantopus AI call), kept for everyone after. */
export function openCard(postId: string, dot: string) {
  return post<{ card: FieldCard }>(`${dotPath(postId, dot)}/card`, {});
}

export function correctCard(postId: string, dot: string, name: string, note: string) {
  return post<{ card: FieldCard }>(`${dotPath(postId, dot)}/card/correction`, { name, ...(note ? { note } : {}) });
}

export function collectCard(postId: string, dot: string, keep: boolean) {
  return keep ? post<{ card: FieldCard }>(`${dotPath(postId, dot)}/collect`, {}) : del(`${dotPath(postId, dot)}/collect`);
}

/** The author removes a dot from their own post. */
export function removeDot(postId: string, dot: string) {
  return del(dotPath(postId, dot));
}

/** The words a reader sees on a refused field card, by the server's code. */
export function cardRefusal(code: string | undefined): string | null {
  switch (code) {
    case 'PANTOPUS_AI_OFF':
      return 'Pantopus AI is off for you. Turn it on in Settings.';
    case 'FIELD_CARD_OFF':
      return 'The author keeps Pantopus AI off for their photos.';
    case 'AI_DISABLED':
      return 'Naming things isn’t available right now.';
    case 'AI_BUDGET':
      return 'That’s all the new cards for today. Try again tomorrow.';
    case 'FIELD_CARD_FAILED':
    case 'PANTOPUS_AI_UNAVAILABLE':
      return 'Couldn’t name it this time. Try again.';
    default:
      return null;
  }
}
