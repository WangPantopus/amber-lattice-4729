'use client';

// ============================================================
// The house on Today, in words (JOURNEYS, founder approval 2026-11-21; behind the profile's `today_house`).
//
// Under Today's picture: one question that is already answered ("Bins go out Tuesday. Is that your day?")
// while the home still runs on its city's general schedule, and the "Needs you" card, which says
// what the picture shows: mail that came, what waits on the person (GET /api/ai/needs-you, the list the
// apps' card reads), and tomorrow's pickup. With nothing to list it says so instead of hiding.
// The same words as the iPhone and Android apps, except the question: the apps ask "Remind you Monday night?"
// and turn the reminder on; the web cannot set one, so it asks only whether that is the day.
// ============================================================

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock, CalendarCheck, Check, ChevronRight, Home, ListChecks, Mail, MessageSquare, Sparkles, Trash2, UserPlus, Users,
} from 'lucide-react';
import type { PlaceCalendarEvent, PickupCollection } from '@pantopus/types';

type Weekday = PickupCollection['weekdays'][number];
const DAYS: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_WORDS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function utcDay(date: string): number {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

/** A general date for the address (the city's schedule), not the household's own. A holiday's move is undone. */
function generalDates(upcoming: PlaceCalendarEvent[], kind: PlaceCalendarEvent['kind']): string[] {
  return upcoming.filter((e) => e.kind === kind && e.scope !== 'home').map((e) => (e.moved_from ?? e.date).slice(0, 10)).sort();
}

/** The garbage date the question is about: the city's next one, while the household has no schedule of its own. */
export function generalGarbageDate(upcoming: PlaceCalendarEvent[]): PlaceCalendarEvent | null {
  return upcoming.find((e) => e.kind === 'garbage' && e.scope !== 'home') ?? null;
}

/**
 * The household's schedule as the address's general schedule shows it, for garbage and recycling: what "Yes, remind
 * me" saves. Two dates a week apart are every week; a single date in the two weeks is every other week from it.
 */
export function generalSchedule(upcoming: PlaceCalendarEvent[]): PickupCollection[] {
  const rows: PickupCollection[] = [];
  for (const kind of ['garbage', 'recycling'] as const) {
    const dates = generalDates(upcoming, kind);
    if (dates.length === 0) continue;
    const first = dates[0];
    const weekly = dates.some((d) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000) === 7);
    rows.push({ kind, frequency: 'weekly', interval: weekly ? 1 : 2, weekdays: [DAYS[utcDay(first)]], anchor_date: first, monthly_mode: 'day_of_month' });
  }
  return rows;
}

/** "Garbage and recycling": the kinds collected tomorrow. */
export function pickupKindsLine(kinds: string[]): string {
  const words = kinds.map((k) => (k === 'yard_waste' ? 'yard waste' : k));
  const line = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? '';
  return line.charAt(0).toUpperCase() + line.slice(1);
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/**
 * The web's page for a needs-you item's link (the apps' pantopus://…), or null where the web has none (plans,
 * the assistant): that row still shows, and is not a button.
 */
export function webPathForNeed(link: string | null | undefined): string | null {
  const path = (link ?? '').trim().replace(/^pantopus:\/\//i, '').toLowerCase();
  let m = path.match(new RegExp(`^homes/(${UUID})/tasks/(${UUID})$`));
  if (m) return `/app/homes/${m[1]}/tasks/${m[2]}`;
  m = path.match(new RegExp(`^homes/(${UUID})/members(\\?tab=requests)?$`));
  if (m) return `/app/homes/${m[1]}/members${m[2] ?? ''}`;
  if (/^connections(\?tab=requests)?$/.test(path)) return `/app/${path}`;
  if (path === 'notifications') return '/app/notifications';
  m = path.match(new RegExp(`^posts/(${UUID})$`));
  if (m) return `/app/feed/post/${m[1]}`;
  return null;
}

// ── One question, already answered ───────────────────────────

export function TodayPickupQuestion({ event, saving, error, onYes, onChange }: {
  /** The city's next garbage date for this address. */
  event: PlaceCalendarEvent;
  saving: boolean;
  error: string | null;
  onYes: () => void;
  onChange: () => void;
}) {
  const day = utcDay(event.moved_from ?? event.date);
  // Whose schedule the date comes from, by the date's own scope (a county's public map, a city's, a state's).
  const whose = event.scope === 'county' ? 'county’s' : event.scope === 'state' ? 'state’s' : 'city’s';
  return (
    <section data-testid="today.house.question" aria-labelledby="today-house-question" className="rounded-2xl border border-primary-300 bg-primary-50 p-4 dark:border-primary-700 dark:bg-primary-900/20">
      <h2 id="today-house-question" className="text-[17px] font-bold leading-6 text-app-text">
        {`Bins go out ${DAY_WORDS[day]}. Is that your day?`}
      </h2>
      <p className="mt-1 text-[13px] leading-[18px] text-app-text-secondary">
        {event.confidence === 'unverified'
          ? `From your ${whose} schedule, not confirmed. Change it if yours differs.`
          : `From your ${whose} schedule. Change it if yours differs.`}
      </p>
      {error ? <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" data-testid="today.house.question.yes" disabled={saving} onClick={onYes}
          className="min-h-[44px] rounded-xl bg-primary-600 px-3 text-[15px] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
          {saving ? 'Saving…' : `Yes, ${DAY_WORDS[day]}`}
        </button>
        <button type="button" data-testid="today.house.question.change" disabled={saving} onClick={onChange}
          className="min-h-[44px] rounded-xl border border-app-border-strong bg-app-surface px-3 text-[15px] font-semibold text-primary-600 hover:bg-app-hover disabled:opacity-60 dark:text-primary-400">
          Change day
        </button>
      </div>
    </section>
  );
}

// ── Needs you ────────────────────────────────────────────────

export interface NeedsYouRow {
  key: string;
  testId?: string;
  /** A needs-you item's type, or 'mail' / 'pickup' for the house's own rows. */
  type: string;
  title: string;
  subtitle: string | null;
  /** Left out for a row the web has no page for: it shows, and is not a button. */
  onOpen?: () => void;
}

const LOOK: Record<string, { icon: LucideIcon; tile: string }> = {
  mail: { icon: Mail, tile: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  pickup: { icon: Trash2, tile: 'bg-app-home-bg text-app-home' },
  still_coming: { icon: CalendarCheck, tile: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' },
  plan_requests: { icon: Users, tile: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' },
  task_overdue: { icon: AlarmClock, tile: 'bg-app-warning-bg text-app-warning' },
  task_assigned: { icon: ListChecks, tile: 'bg-app-home-bg text-app-home' },
  home_invite: { icon: Home, tile: 'bg-app-home-bg text-app-home' },
  household_request: { icon: Home, tile: 'bg-app-home-bg text-app-home' },
  connection_request: { icon: UserPlus, tile: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' },
  question_answered: { icon: MessageSquare, tile: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' },
};
const OTHER = { icon: Sparkles, tile: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' };
const FIRST_ROWS = 3;

/**
 * The card under the picture. [rows] in order: mail that came, what waits on the person, tomorrow's pickup.
 * [quiet]: with nothing to list, a person with a home reads one line instead of an empty space.
 */
export function TodayNeedsYouCard({ rows, quiet }: { rows: NeedsYouRow[]; quiet: boolean }) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) {
    if (!quiet) return null;
    return (
      <div data-testid="today.house.quiet" className="flex items-center gap-3 rounded-2xl border border-app bg-surface px-5 py-4 dark:bg-surface-dark">
        <Check aria-hidden className="h-5 w-5 shrink-0 text-app-success" strokeWidth={2.5} />
        <p className="text-[15px] text-app-text">Nothing needs you today.</p>
      </div>
    );
  }
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);
  return (
    <section data-testid="today.house.needsYou" aria-labelledby="today-house-needs-you" className="rounded-2xl border border-app bg-surface px-5 pb-2 pt-5 dark:bg-surface-dark">
      <h2 id="today-house-needs-you" className="mb-1 text-xs font-bold uppercase tracking-wider text-app-text-muted">Needs you</h2>
      <ul className="divide-y divide-app-border-subtle">
        {shown.map((row) => {
          const look = LOOK[row.type] ?? OTHER;
          const Icon = look.icon;
          const body = (
            <>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${look.tile}`} aria-hidden="true"><Icon size={17} strokeWidth={2.2} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-5 text-app-text">{row.title}</span>
                {row.subtitle ? <span className="block text-[13px] leading-[18px] text-app-text-secondary">{row.subtitle}</span> : null}
              </span>
              {row.onOpen ? <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-app-text-muted" strokeWidth={2.25} /> : null}
            </>
          );
          return (
            <li key={row.key}>
              {row.onOpen ? (
                <button type="button" data-testid={row.testId} onClick={row.onOpen}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-app-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
                  {body}
                </button>
              ) : (
                <div data-testid={row.testId} className="flex min-h-[44px] items-center gap-3 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > FIRST_ROWS ? (
        <button type="button" data-testid="needsYou.showAll" aria-expanded={all} onClick={() => setAll((v) => !v)}
          className="min-h-[44px] w-full border-t border-app-border-subtle text-left text-[14px] font-semibold text-primary-600 hover:underline dark:text-primary-400">
          {all ? 'Show fewer' : `Show all (${rows.length})`}
        </button>
      ) : null}
    </section>
  );
}
