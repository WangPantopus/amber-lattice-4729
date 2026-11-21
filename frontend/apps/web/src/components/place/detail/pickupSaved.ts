// ============================================================
// Pickup day, joined up (JOURNEYS, founder approval 2026-11-21): the editor's first state, the
// words of the green box a saved schedule shows, and the one-shot "light the next pickup"
// that "See it in Today" hands to the Today tab. Same words as the iPhone and Android apps.
// ============================================================

import type { PlaceAddressCalendarData, PlaceCalendarEvent, PlaceCalendarKind, PickupCollection } from '@pantopus/types';

type Weekday = PickupCollection['weekdays'][number];

export const PICKUP_KINDS: PlaceCalendarKind[] = ['garbage', 'recycling', 'yard_waste', 'bulk_pickup'];

/** The order the box names a collection in: the first of these the schedule has. */
const KIND_ORDER: PickupCollection['kind'][] = ['garbage', 'recycling', 'yard_waste', 'bulk_pickup'];
const KIND_WORDS: Record<PickupCollection['kind'], string> = {
  garbage: 'Garbage pickup',
  recycling: 'Recycling pickup',
  yard_waste: 'Yard waste pickup',
  bulk_pickup: 'Bulk collection',
};
const WEEKDAY_ORDER: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const WEEKDAY_WORDS: Record<Weekday, string> = {
  MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday',
};

/**
 * What the editor opens with. A home with a schedule: that schedule. A home with none: Garbage already
 * on and weekly, so the first choice is the day.
 */
export function startingCollections(calendar: PlaceAddressCalendarData): PickupCollection[] {
  if (calendar.pickup_schedule) return calendar.pickup_schedule.collections ?? [];
  return [{ kind: 'garbage', frequency: 'weekly', interval: 1, weekdays: [], anchor_date: '', monthly_mode: 'day_of_month' }];
}

/** The next date that falls on `weekday`, counting `today` (the home's local day, YYYY-MM-DD) itself. */
export function nextDateOn(weekday: Weekday, today: string): string {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(today) ? new Date(`${today}T12:00:00Z`) : new Date();
  // getUTCDay: Sunday is 0; WEEKDAY_ORDER starts on Monday.
  const want = (WEEKDAY_ORDER.indexOf(weekday) + 1) % 7;
  const ahead = (want - start.getUTCDay() + 7) % 7;
  start.setUTCDate(start.getUTCDate() + ahead);
  return start.toISOString().slice(0, 10);
}

function dayList(days: Weekday[]): string {
  const words = WEEKDAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_WORDS[d]);
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * The green box's title after a save: "Garbage pickup is Tuesday", "… is Tuesday and Friday",
 * "… is every other Tuesday", or "… is saved" for any other pattern. Null when nothing was saved.
 */
export function pickupSavedTitle(collections: PickupCollection[] | null | undefined): string | null {
  const first = KIND_ORDER.map((kind) => (collections ?? []).find((row) => row.kind === kind)).find(Boolean);
  if (!first) return null;
  const what = KIND_WORDS[first.kind];
  if (first.frequency === 'weekly' && first.weekdays.length > 0) {
    if (first.interval === 1) return `${what} is ${dayList(first.weekdays)}`;
    if (first.interval === 2 && first.weekdays.length === 1) return `${what} is every other ${dayList(first.weekdays)}`;
  }
  return `${what} is saved`;
}

/** A row of the calendar's list, as React keys it. */
export function eventKey(e: PlaceCalendarEvent): string {
  return `${e.rule_id}:${e.date}`;
}

/** The next pickup on the calendar (its list is soonest first). */
export function nextPickup(upcoming: PlaceCalendarEvent[]): PlaceCalendarEvent | null {
  return upcoming.find((e) => PICKUP_KINDS.includes(e.kind)) ?? null;
}

// "See it in Today" → the Today tab's calendar lights the next pickup once, when it shows.
let lightRequested = false;

export function requestPickupLight(): void {
  lightRequested = true;
}

export function takePickupLight(): boolean {
  const asked = lightRequested;
  lightRequested = false;
  return asked;
}

/** Where "See it in Today" lands, and the tip card's "Set pickup day". */
export const TODAY_COMING_UP_ID = 'coming-up-at-home';
export const PICKUP_EDITOR_HASH = '#pickup-schedule';
