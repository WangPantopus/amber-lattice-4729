// Playable items on a post or a Moment (Pulse, reinvented, phase 2; coord/CONTRACT.md §7b): a poll, a slider or the
// spectrum dial, the board ("where do you stand"), the question box, guess and reveal, and a countdown. Each sits on
// the picture as a stamp does (x, y, scale, rotation). Only for a reader whose switch is on: everyone else, and the apps
// in the stores, see the plain picture and its words.

import { del, get, put } from '@pantopus/api/client';

export type PlayKind =
  | 'poll'
  | 'slider'
  | 'board'
  | 'question'
  | 'guess'
  | 'countdown'
  | 'quote'
  | 'fog'
  | 'swatch'
  | 'before_after'
  | 'moving_words';

export interface PlayPerson {
  id: string;
  name: string | null;
  first_name: string | null;
  avatar_url: string | null;
  initials: string | null;
}

/** A face on a board or along the dial: the reader's own first, then newest. `person` is null for anyone the reader isn't connected with. */
export interface PlayFace {
  x: number;
  y?: number;
  note?: string | null;
  mine: boolean;
  person: PlayPerson | null;
}

interface Base {
  id: string;
  kind: PlayKind;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Whether answers are taken now: false once the Moment ended, on a countdown, and for the author. */
  open: boolean;
}

export type PlayItem =
  | (Base & {
      kind: 'poll';
      question: string;
      options: string[];
      mine: { choice: number } | null;
      results: { counts: number[]; total: number } | null;
    })
  | (Base & {
      kind: 'slider';
      question: string;
      left: string;
      right: string;
      look: 'slider' | 'dial';
      emoji?: string | null;
      mine: { value: number } | null;
      results: { average: number | null; count: number; faces?: PlayFace[] } | null;
    })
  | (Base & {
      kind: 'board';
      question: string;
      x_axis: { left: string; right: string };
      y_axis: { bottom: string; top: string };
      mine: { x: number; y: number; note?: string | null } | null;
      results: { count: number; faces: PlayFace[] } | null;
    })
  | (Base & {
      kind: 'question';
      prompt: string;
      mine: { text: string } | null;
      results: { count: number } | null;
    })
  | (Base & {
      kind: 'guess';
      prompt: string;
      options?: string[];
      range?: { min: number; max: number; unit?: string | null };
      /** There only after the reader's try, and for the author. */
      answer?: number;
      mine: { choice?: number; value?: number; right?: boolean; off_by?: number } | null;
      results: { counts: number[]; total: number } | { average: number | null; count: number } | null;
    })
  | (Base & {
      kind: 'countdown';
      title: string;
      ends_at: string;
      mine: null;
      results: null;
    })
  // §7g: kinds that take no answer.
  | (Base & { kind: 'quote'; text: string; source?: string | null; mine: null; results: null })
  | (Base & { kind: 'fog'; mine: null; results: null })
  | (Base & { kind: 'swatch'; colors: string[]; box: { x: number; y: number; w: number; h: number }; mine: null; results: null })
  // The picture is the two photos side by side (left before, right after); readers drag a curtain between them.
  | (Base & { kind: 'before_after'; before?: string | null; after?: string | null; mine: null; results: null })
  // §7k: the author's words over a photo, in a lettering, moving; drawn only.
  | (Base & { kind: 'moving_words'; text: string; lettering: string; motion: string; color?: string; mine: null; results: null });

export type PlayAnswer =
  | { choice: number }
  | { value: number }
  | { x: number; y: number; note?: string }
  | { text: string };

const path = (postId: string, item: string) => `/api/reinvented/play/${encodeURIComponent(postId)}/${encodeURIComponent(item)}`;

/** Answer (or change one's answer); the item comes back with what this reader may now see. */
export function answerPlay(postId: string, item: string, body: PlayAnswer) {
  return put<{ item: PlayItem }>(path(postId, item), body);
}

/** Take one's answer back (not a guess). */
export function takeBackPlay(postId: string, item: string) {
  return del(path(postId, item));
}

/** The items a reader may answer now: open, and not yet answered. */
export function waitingItems(play: readonly PlayItem[] | undefined | null): PlayItem[] {
  return (play || []).filter((p) => p.open && !['countdown', 'quote', 'fog', 'swatch', 'before_after', 'moving_words'].includes(p.kind) && !p.mine);
}

export function isPlayList(value: unknown): value is PlayItem[] {
  return Array.isArray(value) && value.every((p) => p && typeof p === 'object' && typeof (p as PlayItem).id === 'string');
}

export interface PlayAnswerRow {
  id: string;
  text?: string;
  note?: string | null;
  at: string;
  person: PlayPerson | null;
}

/** The author's list of a question box's answers or a board's notes, newest first, 50 a page. */
export function readAnswers(postId: string, item: string, cursor: string | null, signal?: AbortSignal) {
  return get<{ answers: PlayAnswerRow[]; next_cursor: string | null }>(`${path(postId, item)}/answers`, cursor ? { cursor } : {}, { signal });
}

/** The author removes one answer; the person who gave it isn't told. */
export function removeAnswer(postId: string, item: string, answerId: string) {
  return del(`${path(postId, item)}/answers/${encodeURIComponent(answerId)}`);
}

/** One post's or Moment's items as this reader may see them now (with its dots, §7c). */
export function readPlay(postId: string) {
  return get<{ play: PlayItem[]; dots?: unknown[] }>(`/api/reinvented/play/${encodeURIComponent(postId)}`);
}
