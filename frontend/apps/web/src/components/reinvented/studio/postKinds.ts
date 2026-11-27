// "+ Ask / Kind" in the Studio (Pulse, reinvented, phase 1 piece 11; coord CONTRACT 6d): the picture or the words become
// one of today's Pulse posts, the October 13 kinds (LEAD-2, 02:28), posted with today's request (`POST /api/posts`) plus
// the Studio's `studio` field. Nothing here is a new kind: each is a post type today's composer already makes.

import type { PostType } from '@pantopus/types';

export type StudioKind = 'ask_local' | 'alert' | 'lost_found' | 'recommendation' | 'local_update' | 'event';

export const STUDIO_KINDS: { kind: StudioKind; name: string; hint: string }[] = [
  { kind: 'ask_local', name: 'Question', hint: 'Answers will show under it' },
  { kind: 'alert', name: 'Heads-up', hint: 'Shows first, in red, on the map' },
  { kind: 'lost_found', name: 'Lost and found', hint: 'Stays until it’s claimed' },
  { kind: 'recommendation', name: 'Spot', hint: 'Stays on the map and in your Atlas' },
  { kind: 'local_update', name: 'Learning', hint: 'Stays on the map and in your Atlas' },
  { kind: 'event', name: 'Event', hint: 'Shows on the map until it happens' },
];

export const kindName = (kind: StudioKind) => STUDIO_KINDS.find((k) => k.kind === kind)!.name;
export const kindHint = (kind: StudioKind) => STUDIO_KINDS.find((k) => k.kind === kind)!.hint;

// The kinds that may go to Explore (CONTRACT 6d/6f: a Spot, Learning or Event with a place, under one's own name).
export const EXPLORE_KINDS: StudioKind[] = ['recommendation', 'local_update', 'event'];

// What a Heads-up is about (today's SafetyAlertFields, in its words).
export const ALERT_KINDS: [string, string][] = [
  ['road_hazard', 'Road hazard'],
  ['power_outage', 'Power outage'],
  ['weather_damage', 'Weather damage'],
  ['missing_pet', 'Missing pet'],
  ['hazard', 'Other hazard'],
  ['other', 'Other'],
];

export const CONTACT_CHOICES: ['dm' | 'comment' | 'phone', string][] = [
  ['dm', 'Direct message'],
  ['comment', 'Comments'],
  ['phone', 'Phone'],
];

// Today's composer's purpose for each kind (PostComposer POST_TYPE_TO_API_PURPOSE).
const PURPOSE: Record<StudioKind, string> = {
  ask_local: 'ask',
  alert: 'heads_up',
  lost_found: 'lost_found',
  recommendation: 'recommend',
  local_update: 'local_update',
  event: 'event',
};
export const purposeOf = (kind: StudioKind) => PURPOSE[kind];

// A Heads-up stays up two days (PostCategoryTTL `alert`).
const ALERT_MS = 2 * 24 * 3600 * 1000;

/** "Saturday 11 am", or "today 4:30 pm" / "tomorrow 9 am" when it is that close (read after "Until"). */
export function untilLabel(at: Date, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(at) - day(now)) / 86400000);
  const name = days === 0 ? 'today' : days === 1 ? 'tomorrow' : at.toLocaleDateString([], days < 7 ? { weekday: 'long' } : { month: 'short', day: 'numeric' });
  const time = at
    .toLocaleTimeString([], { hour: 'numeric', minute: at.getMinutes() ? '2-digit' : undefined })
    .replace(/\s?AM$/, ' am')
    .replace(/\s?PM$/, ' pm');
  return `${name} ${time}`;
}

/** The pill's first line for a kind (CONTRACT 6d). `eventAt`: the event's end, or its start; a local date-time input. */
export function kindPill(kind: StudioKind, eventAt: string, now = new Date()): string {
  if (kind === 'ask_local') return 'Stays until answered';
  if (kind === 'recommendation' || kind === 'local_update') return 'Stays in Atlas';
  if (kind === 'lost_found') return 'Until claimed';
  if (kind === 'alert') return `Until ${untilLabel(new Date(now.getTime() + ALERT_MS), now)}`;
  const at = eventAt ? new Date(eventAt) : null;
  return at && !Number.isNaN(at.getTime()) ? `Until ${untilLabel(at, now)}` : 'Until it happens';
}

/**
 * Words that ask something: they end with a question mark (or one is followed only by an emoji or a space). The
 * Studio then offers "Keep until answered?" (CONTRACT 6d: the app's own chip; yes makes the post an Ask).
 */
export function asksSomething(words: string): boolean {
  const t = words.trim();
  return t.length > 3 && /\?[\s\p{Extended_Pictographic}️]*$/u.test(t);
}

/**
 * Event times are stored as the wall-clock time the poster picked, labelled UTC, as today's composer and the apps
 * send them (PostComposer `asStoredWallClock`).
 */
export function asStoredWallClock(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00Z`;
  return value;
}

/** Today's composer's check on an event's two times, in its words (PostComposer `eventTimeError`). */
export function eventTimeError(start: string, end: string): string | null {
  if (!start) return 'Add when the event starts.';
  if (end && new Date(asStoredWallClock(end)).getTime() <= new Date(asStoredWallClock(start)).getTime())
    return 'The event end time must be after its start time.';
  return null;
}

export const isStudioKind = (t: PostType | string): t is StudioKind => STUDIO_KINDS.some((k) => k.kind === t);
