// Circles and the weekly magazine (Pulse, reinvented, phase 3; coord/CONTRACT.md §8d): circles of 2 to 8 close people,
// nobody in one without their own yes, and nobody outside it learns it exists. Switch on only.

import { del, get, patch, post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';

export type Person = Moment['author'];

export interface Circle {
  id: string;
  name: string;
  owner: Person;
  members: { person: Person; state: 'invited' | 'in' }[];
  mine: boolean;
  week_day: number;
  magazine_ready: boolean;
  my_state?: 'invited' | 'in';
  my_keep_faded?: boolean;
  /** The reader's own window for their home in this circle (CONTRACT 9f), or null. */
  my_window?: { label: string } | null;
}

export interface CirclesPage {
  circles: Circle[];
  invites: Circle[];
}

export interface MagazineItem {
  type: 'moment' | 'post';
  id: string;
  author: Person;
  at: string;
  caption: string | null;
  thumb_url: string | null;
  ended?: boolean;
}

export interface Magazine {
  circle: { id: string; name: string };
  week: { from: string; to: string };
  pages: { layout: 'cover' | 'one' | 'two' | 'grid'; items: MagazineItem[] }[];
  people: { person: Person; count: number }[];
  empty: boolean;
}

export const CIRCLES_KEY = ['reinvented', 'circles'];
export const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};
const base = '/api/reinvented/circles';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const readCircles = (signal?: AbortSignal) => get<CirclesPage>(base, zone() ? { tz: zone()! } : {}, { signal });
export const makeCircle = (name: string, people: string[]) => post<{ circle: Circle }>(base, { name, people });
export const joinCircle = (id: string, keepFaded: boolean) => post<{ circle: Circle }>(`${one(id)}/join`, { keep_faded: keepFaded });
export const leaveCircle = (id: string) => post<{ circle?: Circle }>(`${one(id)}/leave`, {});
export const changeCircle = (id: string, body: { name?: string; add?: string[]; remove?: string[] }) => patch<{ circle: Circle }>(one(id), body);
export const endCircle = (id: string) => del(one(id));
export const setKeepFaded = (id: string, keep: boolean) => post<{ circle: Circle }>(`${one(id)}/me`, { keep_faded: keep });
/** Show a window for one's home to this circle (CONTRACT 9f), or stop (null). */
export const setWindow = (id: string, label: string | null) => post<{ circle: Circle }>(`${one(id)}/me`, { window: label ? { label } : null });
export const readMagazine = (id: string, week: string | null, signal?: AbortSignal) =>
  get<Magazine>(`${one(id)}/magazine`, { ...(week ? { week } : {}), ...(zone() ? { tz: zone()! } : {}) }, { signal });
