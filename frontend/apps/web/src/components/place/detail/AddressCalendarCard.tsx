// ============================================================
// Address calendar — what recurs at THIS address (Wedge Phase 2, D6).
//
// The next two weeks as a dated list (garbage, recycling, tax dates,
// council, hearings…), plus the one control that makes it the
// household's own: the pickup-day picker. Seeded city defaults say so
// ("unverified") until the household sets its day or the city confirms.
// ============================================================

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  Trash2,
  Recycle,
  Leaf,
  Truck,
  Landmark,
  Receipt,
  Flame,
  Droplets,
  Construction,
  Gavel,
  School,
  Vote,
  Info,
  CircleCheck,
} from 'lucide-react';
import * as api from '@pantopus/api';
import type { PickupWeekday } from '@pantopus/api';
import type { PlaceAddressCalendarData, PlaceCalendarEvent, PlaceCalendarKind, PickupCollection } from '@pantopus/types';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/toast-store';
import { IconTile } from '@/components/archetypes/place';
import {
  PICKUP_EDITOR_HASH, PICKUP_KINDS, eventKey, nextDateOn, nextPickup, pickupSavedTitle, startingCollections, takePickupLight,
} from './pickupSaved';

const KIND_ICON: Record<PlaceCalendarKind, LucideIcon> = {
  garbage: Trash2,
  recycling: Recycle,
  yard_waste: Leaf,
  bulk_pickup: Truck,
  street_sweeping: Truck,
  property_tax: Receipt,
  utility_bill: Receipt,
  burn_ban: Flame,
  boil_water: Droplets,
  road_closure: Construction,
  council: Landmark,
  permit_hearing: Gavel,
  school: School,
  election_deadline: Vote,
  other: CalendarDays,
};

const WEEKDAYS: { id: PickupWeekday; label: string }[] = [
  { id: 'MO', label: 'Mon' },
  { id: 'TU', label: 'Tue' },
  { id: 'WE', label: 'Wed' },
  { id: 'TH', label: 'Thu' },
  { id: 'FR', label: 'Fri' },
  { id: 'SA', label: 'Sat' },
  { id: 'SU', label: 'Sun' },
];

const DAY_WORDS: Record<PickupWeekday, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
const DAY_ORDER: PickupWeekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Every other week (or every 3 or 4): the start date is the person's to give. Says so when it is not on a chosen day. */
function startOffDays(row: PickupCollection): string | null {
  if (!row.anchor_date || row.weekdays.length === 0) return null;
  const on = DAY_ORDER[new Date(`${row.anchor_date}T12:00:00Z`).getUTCDay()];
  if (!on || row.weekdays.includes(on)) return null;
  const days = WEEKDAYS.filter((d) => row.weekdays.includes(d.id)).map((d) => DAY_WORDS[d.id]);
  const list = days.length > 1 ? `${days.slice(0, -1).join(', ')} or ${days[days.length - 1]}` : days[0];
  return `This date is a ${DAY_WORDS[on]}. Choose a first collection date that is a ${list}.`;
}

// How long the next pickup's entry stays lit after a save, or after "See it in Today".
const LIT_MS = 3000;
const LIT_TICK_MS = 250;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Same wording as the apps' holiday line.
function holidayMoveLine(e: PlaceCalendarEvent): string | null {
  if (!e.moved_from || !e.holiday || !e.shift_days || e.shift_days <= 0) return null;
  return e.shift_days === 1 ? `Moved a day for ${e.holiday}.` : `Moved for ${e.holiday}.`;
}

function whenLabel(e: PlaceCalendarEvent): string {
  if (e.days_until === 0) return 'Today';
  if (e.days_until === 1) return 'Tomorrow';
  const d = new Date(`${e.date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

interface EventRowProps {
  e: PlaceCalendarEvent;
  /** A pickup entry, for someone who may change the schedule: a tap opens the pickup editor. */
  onOpen?: () => void;
  /** The id of the words a screen reader adds to a tappable entry. */
  hintId?: string;
  /** The next pickup, lit for a moment after a save or "See it in Today". */
  lit?: boolean;
  rowRef?: (el: HTMLLIElement | null) => void;
}

function EventRow({ e, onOpen, hintId, lit = false, rowRef }: EventRowProps) {
  const Icon = KIND_ICON[e.kind] ?? CalendarDays;
  const soon = e.days_until <= e.lead_days;
  const body = (
    <>
      <IconTile icon={Icon} tone={soon || lit ? 'home' : 'muted'} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14.5px] font-semibold text-app-text truncate">{e.title}</span>
          <span className={`shrink-0 text-[12.5px] font-semibold tabular-nums ${soon || lit ? 'text-app-home' : 'text-app-text-secondary'}`}>{whenLabel(e)}</span>
        </div>
        {e.detail ? <p className="text-[12.5px] leading-[17px] text-app-text-secondary mt-0.5">{e.detail}</p> : null}
        {holidayMoveLine(e) ? <p className="text-[12.5px] leading-[17px] text-app-text-secondary mt-0.5">{holidayMoveLine(e)}</p> : null}
        <p className="text-[11.5px] leading-4 text-app-text-muted mt-1">
          {e.source ?? 'Pantopus registry'}
          {e.confidence === 'unverified' ? ' · unconfirmed, please double-check' : ''}
        </p>
      </div>
    </>
  );
  // The lit entry's green reaches a little past the text, as on the phones; it fades in and out unless
  // the person asked for less motion.
  const shape = `flex items-start gap-3 rounded-xl py-2.5 -mx-2 px-2 w-[calc(100%+1rem)] transition-colors duration-500 motion-reduce:transition-none ${lit ? 'bg-app-success-bg' : ''}`;
  return (
    <li ref={rowRef} data-lit={lit ? 'true' : undefined} className="scroll-mt-24">
      {onOpen ? (
        <button
          type="button"
          data-testid={`pickup.entry.${e.date}`}
          aria-describedby={hintId}
          onClick={onOpen}
          className={`${shape} text-left ${lit ? '' : 'hover:bg-app-hover'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500`}
        >
          {body}
        </button>
      ) : (
        <div className={shape}>{body}</div>
      )}
    </li>
  );
}

/** What the page around the card asks of it: open the editor ("Change day"), or show a schedule saved elsewhere. */
export type PickupCardAsk = { n: number; kind: 'edit' } | { n: number; kind: 'show' } | { n: number; kind: 'saved'; collections: PickupCollection[] };

export interface AddressCalendarCardProps {
  homeId: string | null;
  data: PlaceAddressCalendarData;
  /** A new `n` is a new ask (the Today page's question card, the bins in the picture, the "Needs you" pickup row). */
  ask?: PickupCardAsk | null;
  /**
   * The card on the Today tab. A saved schedule's green box has no button there: the next pickup's entry is
   * scrolled into view and lit instead, as it is when "See it in Today" brings the person here.
   */
  onToday?: boolean;
  /** Place's card: the green box's "See it in Today". Left out, the box has no button. */
  onSeeInToday?: () => void;
}

export default function AddressCalendarCard({ homeId, ...rest }: AddressCalendarCardProps) {
  return <HouseholdCalendar key={homeId ?? 'preview'} homeId={homeId} {...rest} />;
}

function HouseholdCalendar({ homeId, data, onToday = false, onSeeInToday, ask = null }: AddressCalendarCardProps) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState<PlaceAddressCalendarData | null>(null);
  useEffect(() => { setConfirmed(null); }, [data]);
  const calendar = confirmed ?? data;
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // Place's card opens on the editor while the home has no schedule; the Today tab's stays a list with
  // "Pickup schedule" one tap away.
  const [picking, setPicking] = useState(data.needs_pickup_day && !onToday);
  const [collections, setCollections] = useState<PickupCollection[]>(() => startingCollections(data));
  // The schedule this form started from. A save sends it back, so a change
  // saved meanwhile on another device is not silently undone.
  const [openedVersion, setOpenedVersion] = useState(data.pickup_version);
  const [error, setError] = useState<string | null>(null);
  // A collection's end date when its first date field got focus. Typing a date passes other dates
  // on the way ("12/10" before "12/01"), so the end date follows the start from there.
  const untilAtFocus = useRef<{ kind: PickupCollection['kind']; until: string | null } | null>(null);
  // Start dates the editor filled in from a chosen weekday. Right for "every week" on any such day; for any other
  // pattern the date says which week or month, so a filled-in one is taken back and the person gives the real one.
  const filledStart = useRef(new Set<PickupCollection['kind']>());
  // After a save that sets a schedule: the green box's title, until the person leaves the screen.
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  // Read once by a screen reader when the box appears.
  const [announce, setAnnounce] = useState('');
  // The entry lit for a moment (its list key), and a count that asks for it to be scrolled into view.
  const [lit, setLit] = useState<string | null>(null);
  const [showLit, setShowLit] = useState(0);
  const [showEditor, setShowEditor] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const litRef = useRef<HTMLLIElement | null>(null);
  const entryHintId = useId();

  const upcoming = calendar.upcoming ?? [];
  // A home whose pickups still need a day hears how to start them, as in the apps.
  const setupMessage = homeId && calendar.needs_pickup_day && !upcoming.some((e) => PICKUP_KINDS.includes(e.kind))
    ? 'Set your pickup day and your pickups start here.'
    : null;
  const update = (kind: PickupCollection['kind'], patch: Partial<PickupCollection>) => {
    setCollections(rows => rows.map(row => row.kind === kind ? { ...row, ...patch } : row));
  };
  // The end date can't precede the start: a later start moves it along, as in the apps.
  const moveStart = (row: PickupCollection, anchor: string) => {
    const until = untilAtFocus.current?.kind === row.kind ? untilAtFocus.current.until : row.until_date ?? null;
    update(row.kind, until ? { anchor_date: anchor, until_date: anchor > until ? anchor : until } : { anchor_date: anchor });
  };
  const valid = collections.length > 0 && collections.every(row => row.anchor_date
    && (row.frequency !== 'weekly' || row.weekdays.length > 0));

  const lightNextPickup = (events: PlaceCalendarEvent[]) => {
    const next = nextPickup(events);
    setLit(next ? eventKey(next) : null);
    setShowLit((n) => n + 1);
  };
  // The editor, opened by a pickup entry, the tip card's "Set pickup day", or "Pickup schedule".
  const openEditor = () => {
    setCollections(startingCollections(calendar));
    filledStart.current.clear();
    setOpenedVersion(calendar.pickup_version);
    setError(null);
    setPicking(true);
    setShowEditor((n) => n + 1);
  };

  // Brought here by "See it in Today", or by the tip card's "Set pickup day" (a link ending #pickup-schedule).
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (onToday && takePickupLight()) lightNextPickup(data.upcoming ?? []);
    if (homeId && typeof window !== 'undefined' && window.location.hash === PICKUP_EDITOR_HASH) {
      setPicking(true);
      setShowEditor((n) => n + 1);
      // Used once: a reload shows the page as it is, not the editor again.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
    // Once, when the card first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The page asked: the editor, the schedule's place in the list, or the green box for a schedule it just saved.
  const answered = useRef(0);
  useEffect(() => {
    if (!ask || ask.n === answered.current) return;
    answered.current = ask.n;
    if (ask.kind === 'edit') { if (homeId) openEditor(); return; }
    if (ask.kind === 'saved') {
      const title = pickupSavedTitle(ask.collections);
      setSavedTitle(title);
      setAnnounce(title ?? '');
      setPicking(false);
    }
    lightNextPickup(calendar.upcoming ?? []);
    // Only a new ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);
  useEffect(() => {
    if (!showEditor) return;
    const el = editorRef.current;
    if (!el) return;
    el.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }, [showEditor]);
  // The lit entry (the Today tab), or the card with its box (Place), comes into view; the light goes out again.
  useEffect(() => {
    if (!showLit) return;
    // Place: the card's top, so the box and the dates under it clear the phone's bottom bar.
    const target = onToday ? litRef.current ?? cardRef.current : cardRef.current;
    target?.scrollIntoView?.({ block: onToday ? 'center' : 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    // About three seconds of being seen: a card over the page (a first-visit tip) or the scroll on the way
    // to the entry doesn't use the time up.
    let seen = 0;
    const timer = window.setInterval(() => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const at = litRef.current?.getBoundingClientRect();
      if (at && (at.bottom < 0 || at.top > window.innerHeight)) return;
      seen += LIT_TICK_MS;
      if (seen < LIT_MS) return;
      window.clearInterval(timer);
      setLit(null);
      setAnnounce('');
    }, LIT_TICK_MS);
    return () => window.clearInterval(timer);
  }, [showLit, onToday]);

  const save = async (reset = false) => {
    if (!homeId || busy.current || (!reset && !valid)) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = reset ? await api.clearPickupDay(homeId, openedVersion) : await api.setPickupDay(homeId, {
        collections,
        ...(openedVersion ? { expected_version: openedVersion } : {}),
      });
      setConfirmed(response.calendar);
      setCollections(response.calendar.pickup_schedule?.collections ?? []);
      setOpenedVersion(response.calendar.pickup_version);
      filledStart.current.clear();
      // A saved schedule answers with the green box above the dates; a cleared one with the toast as before.
      const title = reset ? null : pickupSavedTitle(response.calendar.pickup_schedule?.collections ?? collections);
      setSavedTitle(title);
      setAnnounce(title ?? '');
      if (title) lightNextPickup(response.calendar.upcoming ?? []);
      else {
        setLit(null);
        toast.success(reset ? 'Household pickup schedule cleared.' : 'Pickup schedule saved to your household calendar.');
      }
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.placeIntelligence(homeId) });
      void queryClient.invalidateQueries({ queryKey: ['household-calendar', homeId] });
    } catch (err) {
      // Changed meanwhile: nothing was saved. Show the current schedule in the
      // form so the person can review it and try again.
      const failure = err as { statusCode?: number; data?: { calendar?: PlaceAddressCalendarData } } | null;
      if (failure?.statusCode === 409 && failure.data?.calendar) {
        const current = failure.data.calendar;
        setConfirmed(current);
        setCollections(current.pickup_schedule?.collections ?? []);
        setOpenedVersion(current.pickup_version);
        void queryClient.invalidateQueries({ queryKey: queryKeys.placeIntelligence(homeId) });
        void queryClient.invalidateQueries({ queryKey: ['household-calendar', homeId] });
      }
      setError(err instanceof Error ? err.message : 'Could not save your pickup schedule. Try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div ref={cardRef} className="bg-app-surface border border-app-border rounded-2xl shadow-sm p-4 scroll-mt-40">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">Next {data.window_days} days at this address</span>
        {homeId ? (
          <button type="button" disabled={saving} onClick={() => {
            setCollections(startingCollections(calendar));
            filledStart.current.clear();
            setOpenedVersion(calendar.pickup_version);
            setError(null);
            setPicking((p) => !p);
          }} className="text-[12.5px] font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
            {picking ? 'Cancel' : 'Pickup schedule'}
          </button>
        ) : null}
      </div>

      {picking && homeId ? (
        <div ref={editorRef} tabIndex={-1} className="mt-2 mb-3 rounded-xl bg-app-surface-sunken p-3 scroll-mt-40 focus:outline-none">
          <p className="text-[13px] text-app-text-strong mb-2">Choose the collections your household uses.</p>
          {(['garbage', 'recycling', 'yard_waste', 'bulk_pickup'] as const).map(kind => {
            const row = collections.find(item => item.kind === kind);
            const label = { garbage: 'Garbage', recycling: 'Recycling', yard_waste: 'Yard waste', bulk_pickup: 'Bulk collection' }[kind];
            const pattern = row?.frequency === 'weekly' ? `weekly-${row.interval}` : row?.frequency === 'monthly' ? `monthly-${row.monthly_mode ?? 'day_of_month'}` : 'once';
            return <fieldset key={kind} className="mb-3 border-b border-app-border pb-3" disabled={saving}>
              <label className="flex gap-2 items-center text-[13px] font-semibold">
                <input type="checkbox" checked={!!row} onChange={e => setCollections(rows => e.target.checked
                  ? [...rows, { kind, frequency: 'weekly', interval: 1, weekdays: [], anchor_date: '', monthly_mode: 'day_of_month' }]
                  : rows.filter(item => item.kind !== kind))} />{label}
              </label>
              {row && <div className="mt-2 space-y-2">
                <label className="block text-[13px]">{label} repeats
                  <select aria-label={`${label} repeats`} value={pattern} onChange={e => {
                    const value = e.target.value;
                    const takeBack = value !== 'weekly-1' && filledStart.current.delete(kind) ? { anchor_date: '' } : {};
                    update(kind, value.startsWith('weekly-') ? { frequency: 'weekly', interval: Number(value.slice(7)), ...takeBack }
                      : value.startsWith('monthly-') ? { frequency: 'monthly', interval: row.frequency === 'monthly' ? row.interval : 1, monthly_mode: value.slice(8) as PickupCollection['monthly_mode'], ...takeBack }
                      : { frequency: 'once', interval: 1, until_date: null, ...takeBack });
                  }} className="mt-1 w-full rounded-lg border border-app-border bg-app-surface p-2">
                    {[1, 2, 3, 4].map(n => <option key={n} value={`weekly-${n}`}>{n === 1 ? 'Every week' : `Every ${n} weeks`}</option>)}
                    <option value="monthly-day_of_month">Monthly on this date</option>
                    <option value="monthly-weekday">Monthly on this weekday (e.g. second Tuesday)</option>
                    <option value="once">One time</option>
                  </select>
                </label>
                {row.frequency === 'monthly' && <label className="block text-[13px]">{label} month interval
                  <select aria-label={`${label} month interval`} value={row.interval} onChange={e => update(kind, { interval: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-app-border bg-app-surface p-2">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? 'Every month' : `Every ${n} months`}</option>)}
                  </select>
                </label>}
                {row.frequency === 'weekly' && <div className="flex flex-wrap gap-1.5" aria-label={`${label} days`}>
                  {WEEKDAYS.map(day => <button key={day.id} type="button" aria-label={`${label} ${day.label}`} aria-pressed={row.weekdays.includes(day.id)}
                    onClick={() => {
                      const weekdays = row.weekdays.includes(day.id) ? row.weekdays.filter(d => d !== day.id) : [...row.weekdays, day.id];
                      // Every week: the start date follows the chosen day (the next date on one of them, today counts),
                      // on a saved schedule too, so "it changed to Thursday" is one choice and "Save schedule". The server
                      // takes only a start date on a chosen day. Any other pattern's date says which week it is: it stays.
                      if (row.interval !== 1) { update(kind, { weekdays }); return; }
                      const first = weekdays.map(d => nextDateOn(d, calendar.today)).sort()[0] ?? '';
                      if (first) filledStart.current.add(kind); else filledStart.current.delete(kind);
                      update(kind, first ? { weekdays, anchor_date: first } : { weekdays });
                    }}
                    className="px-3 py-1.5 rounded-lg border border-app-border bg-app-surface text-[13px]">{day.label}{row.weekdays.includes(day.id) ? ' ✓' : ''}</button>)}
                </div>}
                <label className="block text-[13px]">{row.frequency === 'once' ? `${label} collection date` : `${label} first collection date`}
                  <input aria-label={`${label} collection date`} type="date" value={row.anchor_date} onChange={e => { filledStart.current.delete(kind); moveStart(row, e.target.value); }}
                    onFocus={() => { untilAtFocus.current = { kind, until: row.until_date ?? null }; }} onBlur={() => { untilAtFocus.current = null; }}
                    className="mt-1 w-full rounded-lg border border-app-border bg-app-surface p-2" />
                </label>
                {row.frequency !== 'once' && <label className="block text-[13px]">{label} end date (optional)
                  <input type="date" value={row.until_date ?? ''} min={row.anchor_date} onChange={e => update(kind, { until_date: e.target.value || null })}
                    className="mt-1 w-full rounded-lg border border-app-border bg-app-surface p-2" />
                </label>}
                {row.frequency === 'weekly' && row.interval > 1 && <p className="text-[12px] text-app-text-secondary">The start date anchors the collection week. Weeks begin Monday.</p>}
                {row.frequency === 'weekly' && row.interval > 1 && startOffDays(row) ? <p role="status" className="text-[12.5px] font-medium text-app-warning">{startOffDays(row)}</p> : null}
                {row.frequency === 'monthly' && <p className="text-[12px] text-app-text-secondary">The start date sets the monthly pattern. Dates absent from a month are skipped; a fifth weekday means the last weekday.</p>}
              </div>}
            </fieldset>;
          })}
          <p className="text-[11.5px] text-app-text-muted mt-2">Use collection dates, not the night you put bins out. Keep the original start date when editing an unchanged cycle. Uncheck a type to remove it. Check your provider for holiday changes.</p>
          {error ? <p role="alert" className="text-[13px] text-red-600 mt-2">{error}</p> : null}
          <div className="flex flex-wrap gap-3 mt-3">
            <button type="button" disabled={saving || !valid} onClick={() => save()} className="rounded-lg bg-primary-600 px-3 py-2 text-white text-[13px] font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save schedule'}</button>
            {calendar.pickup_schedule ? <button type="button" disabled={saving} onClick={() => save(true)} className="text-[13px] text-app-text-secondary">Clear household schedule</button> : null}
          </div>
        </div>
      ) : null}

      {/* Read once when a schedule is saved; the box below is what the eye sees. */}
      <p role="status" className="sr-only">{announce}</p>
      {savedTitle && !picking ? (
        <div data-testid="pickup.saved" className="mt-2 mb-2 rounded-xl border border-app-success-light bg-app-success-bg p-3.5 scroll-mt-24">
          <div className="flex items-start gap-2.5">
            <CircleCheck size={20} strokeWidth={2} aria-hidden className="shrink-0 mt-0.5 text-app-success" />
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-5 text-app-success">{savedTitle}</p>
              <p className="text-[13px] leading-[18px] text-app-success mt-0.5">People in this home can see it.</p>
            </div>
          </div>
          {onSeeInToday && !onToday ? (
            <button type="button" data-testid="pickup.saved.seeToday" onClick={onSeeInToday}
              className="mt-3 w-full rounded-lg bg-primary-600 px-3 py-2.5 text-white text-[14px] font-semibold hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500">
              See it in Today
            </button>
          ) : null}
        </div>
      ) : null}

      {upcoming.length === 0 ? (
        <div className="flex items-start gap-2.5 py-3">
          <Info size={16} strokeWidth={2} className="shrink-0 mt-0.5 text-app-text-muted" />
          <p className="text-[13.5px] text-app-text-secondary leading-[19px]">{setupMessage ?? 'Nothing on the calendar for the next two weeks.'}</p>
        </div>
      ) : (
        <>
          {setupMessage ? <p className="text-[13.5px] text-app-text-secondary leading-[19px] py-2">{setupMessage}</p> : null}
          {homeId ? <span id={entryHintId} hidden>Opens the pickup schedule</span> : null}
          <ul className="divide-y divide-app-border-subtle">
            {upcoming.map((e) => {
              const key = eventKey(e);
              const isLit = lit === key;
              return (
                <EventRow
                  key={key}
                  e={e}
                  lit={isLit}
                  rowRef={isLit ? (el) => { litRef.current = el; } : undefined}
                  hintId={entryHintId}
                  onOpen={homeId && PICKUP_KINDS.includes(e.kind) ? openEditor : undefined}
                />
              );
            })}
          </ul>
        </>
      )}
      {calendar.tax_note ? <p className="text-[12.5px] text-app-text-muted leading-[18px] pt-2">{calendar.tax_note}</p> : null}
    </div>
  );
}
