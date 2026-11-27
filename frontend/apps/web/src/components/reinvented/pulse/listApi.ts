// The one Pulse list (Pulse, reinvented, phase 1; coord/CONTRACT.md §6a): Moments that fade and posts that stay, mixed
// by reach, for a reader whose switch is on. Shapes as the server sends them. A post here carries no distance: the only
// distance anywhere in this list is its band.

import { get } from '@pantopus/api/client';
import type { Post } from '@pantopus/api';
import type { Moment } from '@pantopus/api/endpoints/moments';
import type { ShownStamp } from '../stamps/stampTypes';

export type Reach = 'close' | 'around';
export type Chip = 'all' | 'live' | 'learn' | 'spots' | 'ask' | 'plans' | 'sports';
export const CHIPS: readonly Chip[] = ['all', 'live', 'learn', 'spots', 'ask', 'plans', 'sports'];
export const CHIP_WORDS: Record<Chip, string> = {
  all: 'All',
  live: 'Live',
  learn: 'Learn',
  spots: 'Spots',
  ask: 'Ask',
  plans: 'Plans',
  sports: 'Sports',
};
export const isChip = (v: unknown): v is Chip => typeof v === 'string' && (CHIPS as readonly string[]).includes(v);

export type ListMoment = Moment & {
  stamps?: ShownStamp[];
  my_signal?: string | null;
  signal_counts?: { signal: string; count: number }[] | null;
};

export type ListItem =
  | { type: 'moment'; id: string; band: string | null; moment: ListMoment }
  | { type: 'post'; id: string; band: string | null; post: Post };

export interface Band {
  band: string;
  label: string;
}

export interface ListPage {
  reach: Reach;
  miles?: number;
  place: { label: string } | null;
  chips: string[] | null;
  bands: Band[];
  items: ListItem[];
  next_cursor: string | null;
  end: string | null;
  needs_place?: boolean;
}

export interface Point {
  latitude: number;
  longitude: number;
}

export function readList(
  { reach, chip, cursor, point }: { reach: Reach; chip: Chip; cursor: string | null; point: Point | null },
  signal?: AbortSignal,
): Promise<ListPage> {
  const params: Record<string, string | number> = { reach, chip, limit: 20 };
  if (cursor) params.cursor = cursor;
  if (point && reach === 'around') {
    params.latitude = Math.round(point.latitude * 1e5) / 1e5;
    params.longitude = Math.round(point.longitude * 1e5) / 1e5;
  }
  return get<ListPage>('/api/reinvented/list', params, { signal });
}

/** The time a Moment has left, as the board writes it: "23 h left", "40 min left". Null once it has ended. */
export function timeLeft(expiresAt: string | null | undefined, now: number): string | null {
  const end = Date.parse(expiresAt || '');
  if (!Number.isFinite(end) || end <= now) return null;
  const minutes = Math.ceil((end - now) / 60_000);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h left`;
  return `${Math.floor(hours / 24)} days left`;
}

/** "Live from here" holds while the author is still where they took it (today's Live mark: `taken_here`, `live_until`). */
export function isLiveHere(m: Pick<Moment, 'taken_here' | 'live_until'>, now: number): boolean {
  return m.taken_here === true && Date.parse(m.live_until || '') > now;
}
