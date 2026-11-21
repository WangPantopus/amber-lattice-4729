'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicPlan, PublicPlanBring, PublicPlanChipIn, PublicPlanDates, PublicPlanGift, PublicPlanGuestState } from '@/lib/publicShare';
import { Icon, KindGlyph, kindColors } from '@/components/plans/planKind';

// Plans for the holidays, H1: the plan's page for a guest without an account (docs/product/plans-holidays/
// 06-screens.md, W1 to W3). W1 is the invitation and its form; W2 the wait after "I'm in" (for the host's yes, or for
// the email that carries the address); W3 the guest's part, read with their own key (an HttpOnly cookie this page
// never sees). The page's server part decides that this shows; everything here comes from the server's answer.

type Which = 'in' | 'maybe' | 'cant';

/** What this browser knows after an answer that brought no key back: the waiting page, or a maybe / can't. */
type Sent = {
  state: 'check_email' | 'maybe' | 'cant';
  mine: PublicPlanGuestState | null;
  already: boolean;
  name: string;
  adults: number;
  kids: number;
  email: string | null;
};

export type GuestAnswerProps = {
  planId: string;
  plan: PublicPlan;
  hostFirst: string;
  hostShort: string;
  hostAvatar: ReactNode;
  when: string | null;
  area: string;
  open: string | null;
  invite: string | null;
  /** For an email invitation, the hint of the address the host typed ("d•••@example.com"). */
  emailHint: string | null;
  storeHref: string | null;
  mapsBase: 'apple' | 'google';
  pageUrl: string;
};

const PRIMARY =
  'flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-semibold text-white shadow-[0_6px_16px_rgba(2,132,199,0.18)] hover:opacity-95 disabled:opacity-50';
const SECONDARY =
  'flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-app-border-strong bg-app-surface text-base font-semibold text-app-text hover:bg-app-hover disabled:opacity-50';
const LABEL = 'text-xs font-semibold uppercase tracking-[0.06em] text-app-text-secondary';
const CARD = 'overflow-hidden rounded-[20px] border border-app-border bg-app-surface shadow-sm';

const memoKey = (planId: string) => `pantopus.planAnswer.${planId}`;

function readMemo(planId: string): Sent | null {
  try {
    const raw = window.localStorage.getItem(memoKey(planId));
    return raw ? (JSON.parse(raw) as Sent) : null;
  } catch {
    return null;
  }
}

function writeMemo(planId: string, sent: Sent | null) {
  try {
    if (sent) window.localStorage.setItem(memoKey(planId), JSON.stringify(sent));
    else window.localStorage.removeItem(memoKey(planId));
  } catch {
    // Private windows and blocked storage: the page works without it.
  }
}

/** "2 adults, 1 kid"; "3 adults" with no kids; "1 adult". The server's notices say it the same way. */
export function peopleText(adults: number, kids: number): string {
  const a = Math.max(1, Number(adults) || 1);
  const k = Math.max(0, Number(kids) || 0);
  return [`${a} ${a === 1 ? 'adult' : 'adults'}`, k > 0 ? `${k} ${k === 1 ? 'kid' : 'kids'}` : null].filter(Boolean).join(', ');
}

// ── Glyphs ───────────────────────────────────────────────────

const Glyph = {
  calendar: (c = 'h-4 w-4') => (
    <Icon className={c}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
  ),
  pin: (c = 'h-4 w-4') => (
    <Icon className={c}><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>
  ),
  home: (c = 'h-4 w-4') => <Icon className={c}><path d="M4 11.5 12 5l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></Icon>,
  clock: (c = 'h-5 w-5') => <Icon className={c}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  mail: (c = 'h-4 w-4') => <Icon className={c}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>,
  lock: (c = 'h-4 w-4') => <Icon className={c}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>,
  check: (c = 'h-5 w-5') => <Icon className={c}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>,
  nav: (c = 'h-4 w-4') => <Icon className={c}><path d="m3 11 18-8-8 18-2-8z" /></Icon>,
  calPlus: (c = 'h-4 w-4') => (
    <Icon className={c}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></Icon>
  ),
  minus: (c = 'h-4 w-4') => <Icon className={c}><path d="M5 12h14" /></Icon>,
  gift: (c = 'h-5 w-5') => (
    <Icon className={c}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 9.5 8 12 8zm0 0c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z" /></Icon>
  ),
  heart: (c = 'h-4 w-4') => <Icon className={c}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></Icon>,
  dollar: (c = 'h-5 w-5') => (
    <Icon className={c}><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2c-.4-.9-1.4-1.4-2.5-1.4-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2.1c1.6.4 2.6.9 2.6 2.1s-1.1 2.1-2.6 2.1c-1.2 0-2.2-.6-2.6-1.5M12 6.5v1.3M12 16.2v1.3" /></Icon>
  ),
  plus: (c = 'h-4 w-4') => <Icon className={c}><path d="M12 5v14M5 12h14" /></Icon>,
};

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}

// ── Pieces ───────────────────────────────────────────────────

/** The plan's card (W1): the kind's band, the title, the time, the area, the note, the host and the count. */
function InvitationCard({ plan, when, area, hostShort, hostAvatar }: {
  plan: PublicPlan; when: string | null; area: string; hostShort: string; hostAvatar: ReactNode;
}) {
  const going = Math.max(0, Number(plan.going_count) || 0);
  return (
    <section className={CARD} aria-labelledby="plan-title" style={kindColors(plan.kind) as CSSProperties}>
      <div className="grid h-[112px] place-items-center bg-[var(--plan-cs)]" aria-hidden="true">
        <span className="grid h-[60px] w-[60px] place-items-center rounded-[18px] bg-[var(--plan-c)] text-white dark:text-[#0b1220]">
          <KindGlyph kind={plan.kind} className="h-8 w-8" />
        </span>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4 pt-[14px]">
        <h1 id="plan-title" className="text-xl font-semibold leading-[26px] tracking-[-0.012em]">{plan.title}</h1>
        {when ? (
          <p className="flex items-center gap-2 text-sm leading-5 text-app-text-strong [font-variant-numeric:tabular-nums]">
            {Glyph.calendar()}<span>{when}</span>
          </p>
        ) : null}
        {area ? (
          <p className="flex items-center gap-2 text-sm leading-5 text-app-text-strong">{Glyph.pin()}<span>{area}</span></p>
        ) : null}
        {plan.about ? <p className="text-base leading-6 text-app-text">{plan.about}</p> : null}
        <div className="flex items-center gap-[10px] pt-1">
          {hostAvatar}
          <span className="text-sm leading-5 text-app-text-secondary">
            <span className="font-semibold text-app-text">{hostShort}</span>
            {` · ${going} coming so far`}
          </span>
        </div>
      </div>
    </section>
  );
}

/** The short card (W2, W3 maybe / can't): the title, the date and the area. Never the address. */
function ShortCard({ plan, when, area }: { plan: PublicPlan; when: string | null; area: string }) {
  return (
    <section className={`${CARD} flex flex-col gap-2 px-4 py-4`} aria-labelledby="plan-title">
      <h1 id="plan-title" className="text-xl font-semibold leading-[26px] tracking-[-0.012em]">{plan.title}</h1>
      {when ? (
        <p className="flex items-center gap-2 text-sm leading-5 text-app-text-strong [font-variant-numeric:tabular-nums]">{Glyph.calendar()}<span>{when}</span></p>
      ) : null}
      {area ? <p className="flex items-center gap-2 text-sm leading-5 text-app-text-strong">{Glyph.pin()}<span>{area}</span></p> : null}
    </section>
  );
}

function Banner({ tone, icon, title, sub = null, onChange }: {
  tone: 'green' | 'quiet'; icon: ReactNode; title: string; sub?: string | null; onChange?: (() => void) | null;
}) {
  return (
    <div
      className={`flex ${sub ? 'items-start' : 'items-center'} gap-3 rounded-2xl px-4 py-[14px] ${tone === 'green' ? 'bg-app-success-bg' : 'bg-app-surface-sunken'}`}
      role="status"
    >
      <span
        className={`grid h-9 w-9 flex-none place-items-center rounded-[10px] ${tone === 'green'
          ? 'bg-app-success-solid text-white'
          : 'border border-app-border bg-app-surface text-app-text-strong'}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-base font-semibold leading-[22px] text-app-text">{title}</p>
        {sub ? <p className="text-sm leading-5 text-app-text-secondary">{sub}</p> : null}
      </div>
      {onChange ? (
        <button type="button" onClick={onChange} className="-my-2 min-h-[44px] px-1 text-sm font-semibold text-app-link">
          Change
        </button>
      ) : null}
    </div>
  );
}

function LockLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-[10px] text-sm leading-5 text-app-text-secondary">
      <span className="mt-0.5">{Glyph.lock()}</span>
      <span>{children}</span>
    </p>
  );
}

function Stepper({ label, value, min, max, onChange, disabled }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void; disabled: boolean;
}) {
  const lower = label.toLowerCase();
  const button = 'grid h-11 w-11 place-items-center rounded-[10px] bg-app-surface-sunken text-app-text disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-base font-semibold" id={`stepper-${lower}`}>{label}</span>
      <div className="flex items-center gap-1 rounded-xl border border-app-border-strong p-1" role="group" aria-labelledby={`stepper-${lower}`}>
        <button type="button" className={button} aria-label={`Fewer ${lower}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          {Glyph.minus()}
        </button>
        <span className="w-8 text-center text-base font-semibold [font-variant-numeric:tabular-nums]" aria-live="polite" aria-label={`${value} ${lower}`}>
          {value}
        </span>
        <button type="button" className={button} aria-label={`More ${lower}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          {Glyph.plus()}
        </button>
      </div>
    </div>
  );
}

function icsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

function icsTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** An .ics file with the title, the time, the place and the page's own link (never the guest's link). */
function downloadCalendar(planId: string, plan: PublicPlan, location: string, pageUrl: string) {
  if (!plan.starts_at) return;
  const end = plan.ends_at || new Date(new Date(plan.starts_at).getTime() + 2 * 3600 * 1000).toISOString();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pantopus//Plans//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:plan-${planId}@pantopus.com`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(plan.starts_at)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(plan.title || 'Plan')}`,
    location ? `LOCATION:${icsText(location)}` : null,
    `URL:${pageUrl}`,
    `DESCRIPTION:${icsText(pageUrl)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([lines], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plan.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── The bring list (H2) ──────────────────────────────────────

/** The thing as the sentence after a claim names it: "Bread" → "bread"; "IPA" stays (its second letter is a capital). */
function claimedThing(label: string): string {
  const text = label.trim();
  const second = text.charAt(1);
  return second && second === second.toLowerCase() && second !== second.toUpperCase() ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/**
 * W3's bring list: who is bringing what, "I'll bring it", "You're bringing it" with "Give back", and "Bring something
 * else" when the host lets guests add. Each change answers the whole list; someone who got there first is named.
 * After a claim goes through, a green line at the top says what was claimed and who can see it (JOURNEYS, 2026-11-21);
 * it shows the latest claim and goes away on "Give back" or on leaving the page.
 */
function BringList({ planId, initial, hostFirst }: { planId: string; initial: PublicPlanBring; hostFirst: string }) {
  const [bring, setBring] = useState<PublicPlanBring>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [claimed, setClaimed] = useState<string | null>(null);

  async function call(path: string, method: 'POST' | 'DELETE', body?: Record<string, unknown>, key = path) {
    setBusy(key);
    setLine(null);
    try {
      const res = await fetch(`/api/public/plans/${encodeURIComponent(planId)}/bring${path}`, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.bring) setBring(data.bring as PublicPlanBring);
      if (res.ok) return true;
      if (res.status === 409 && data.error === 'taken') setLine(data.message);
      else setLine(typeof data.message === 'string' ? data.message : 'Something went wrong. Please try again.');
      return false;
    } catch {
      setLine('Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const text = label.trim();
    if (!text) return;
    if (await call('/items', 'POST', { label: text }, 'add')) {
      setLabel('');
      setAdding(false);
      setClaimed(text);
    }
  }

  async function claim(item: PublicPlanBring['items'][number]) {
    if (await call(`/${item.id}/claim`, 'POST')) setClaimed(item.label);
  }

  async function giveBack(item: PublicPlanBring['items'][number]) {
    if (await call(`/${item.id}/claim`, 'DELETE')) setClaimed(null);
  }

  return (
    <section className={`${CARD} flex flex-col px-4 pb-2 pt-4`} aria-labelledby="bring-title">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <h2 id="bring-title" className="text-base font-semibold leading-[22px]">What will you bring?</h2>
        <span className="text-sm text-app-text-secondary">{`${bring.open_count} still open`}</span>
      </div>
      {/* Always here, so a screen reader reads the sentence when it appears. */}
      <div role="status">
        {claimed ? (
          <p data-testid="plan.bring.claimed" className="mb-1 mt-1 flex items-start gap-2.5 rounded-xl border border-app-success-light bg-app-success-bg px-3 py-2.5 text-sm leading-5 text-app-success">
            <span className="mt-px flex-none" aria-hidden="true">{Glyph.check('h-[18px] w-[18px]')}</span>
            <span><strong className="font-semibold">{`You’re bringing ${claimedThing(claimed)}.`}</strong>{` ${hostFirst} and the other guests can see it.`}</span>
          </p>
        ) : null}
      </div>
      <ul className="divide-y divide-app-border">
        {bring.items.map((item) => (
          <li key={item.id} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-base font-semibold leading-[22px]">{item.label}</span>
              {item.claim?.mine ? (
                <span className="text-[13px] leading-[18px] text-app-success">You’re bringing it</span>
              ) : item.note ? (
                <span className="text-[13px] leading-[18px] text-app-text-secondary">{item.note}</span>
              ) : null}
            </div>
            {item.claim?.mine ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => giveBack(item)}
                className="min-h-[44px] flex-none px-2 text-sm font-semibold text-app-link disabled:opacity-50"
              >
                Give back
              </button>
            ) : item.claim ? (
              <span className="flex flex-none items-center gap-2 text-sm font-semibold text-app-text-strong">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e0e7ff] text-xs font-bold text-[#3730a3] dark:bg-[#23264a] dark:text-[#c7d2fe]" aria-hidden="true">
                  {item.claim.name.slice(0, 1).toUpperCase()}
                </span>
                <span><span className="sr-only">Brought by </span>{item.claim.name}</span>
              </span>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => claim(item)}
                aria-label={`I’ll bring ${item.label}`}
                className="flex min-h-[44px] flex-none items-center gap-2 rounded-xl border border-app-link px-4 text-sm font-semibold text-app-link disabled:opacity-50"
              >
                {busy === `/${item.id}/claim` ? <Spinner /> : null}I’ll bring it
              </button>
            )}
          </li>
        ))}
      </ul>
      {bring.guests_can_add ? (
        adding ? (
          <form
            className="flex items-center gap-2 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <input
              type="text"
              value={label}
              maxLength={60}
              autoFocus
              aria-label="What you’ll bring"
              onChange={(e) => setLabel(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-app-border-strong bg-app-surface px-3 text-base text-app-text outline-none focus:border-primary-600"
            />
            <button type="submit" disabled={busy !== null || !label.trim()} className="h-11 flex-none rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy === 'add' ? <Spinner /> : 'Add'}
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-[48px] items-center gap-2 text-base font-semibold text-app-link">
            {Glyph.plus('h-5 w-5')}Bring something else
          </button>
        )
      ) : null}
      {line ? <p className="pb-3 text-sm leading-5 text-app-text-strong" role="status">{line}</p> : null}
    </section>
  );
}

// ── Chip in (the extras) ─────────────────────────────────────

/**
 * W3's chip in (08-extras section 3, board 27): the amount, what it's for and how many paid; "Pay {Host} on {Venmo}"
 * opens the host's own link outside Pantopus; "I've paid" becomes "You chipped in" with "Undo". No money moves here.
 */
function ChipInCard({ planId, initial }: { planId: string; initial: PublicPlanChipIn }) {
  const [chip, setChip] = useState<PublicPlanChipIn>(initial);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const paid = Boolean(chip.mine?.paid);

  async function mark(nextPaid: boolean) {
    setBusy(true);
    setLine(null);
    try {
      const res = await fetch(`/api/public/plans/${encodeURIComponent(planId)}/chip-in/paid`, {
        method: nextPaid ? 'POST' : 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.chip_in) setChip(data.chip_in as PublicPlanChipIn);
      else setLine(typeof data.message === 'string' ? data.message : 'Something went wrong. Please try again.');
    } catch {
      setLine('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} flex flex-col gap-3 px-4 py-4`} aria-labelledby="chip-in-title">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-app-surface-sunken text-app-text-strong" aria-hidden="true">
          {Glyph.dollar()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="chip-in-title" className="text-base font-semibold leading-[22px]">{chip.text}</h2>
          <p className="text-sm leading-5 text-app-text-secondary">{chip.note}</p>
        </div>
        <span className="flex-none pt-0.5 text-sm text-app-text-secondary [font-variant-numeric:tabular-nums]">{chip.paid_text}</span>
      </div>
      {paid ? (
        <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-app-success-bg px-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-app-success">{Glyph.check('h-4 w-4')}You chipped in</span>
          <button type="button" disabled={busy} onClick={() => mark(false)} className="min-h-[44px] px-2 text-sm font-semibold text-app-link disabled:opacity-50">
            Undo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[10px]">
          <button
            type="button"
            disabled={busy}
            onClick={() => mark(true)}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-app-border-strong bg-app-surface text-[15px] font-semibold text-app-text disabled:opacity-50"
          >
            {busy ? <Spinner /> : null}I’ve paid
          </button>
          <a
            href={chip.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-primary-600 px-2 text-center text-[15px] font-semibold text-white"
          >
            {chip.pay_text}
          </a>
        </div>
      )}
      <p className="text-[13px] leading-[18px] text-app-text-secondary">{chip.straight_text}</p>
      {line ? <p className="text-sm leading-5 text-app-error" role="status">{line}</p> : null}
    </section>
  );
}

// ── Photos afterwards (the extras) ───────────────────────────

type PlanPhoto = { id: string; url: string | null; thumb_url: string | null; by_name: string };

/**
 * W3 on a plan that is over, for a guest who was in (08-extras section 5, board 29): "Photos", "{23} from {5} people",
 * a grid of four across, the note, and "Add yours in the app." The links last minutes; a picture opens full size.
 */
function PhotosCard({ planId, intro, storeHref }: { planId: string; intro: { count: number; add_text: string; note: string }; storeHref: string | null }) {
  const [grid, setGrid] = useState<{ photos: PlanPhoto[]; text: string } | null>(null);
  const [open, setOpen] = useState<PlanPhoto | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/public/plans/${encodeURIComponent(planId)}/photos`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live && data) setGrid({ photos: data.photos || [], text: data.text }); })
      .catch(() => {});
    return () => { live = false; };
  }, [planId]);
  return (
    <section className={`${CARD} flex flex-col gap-3 px-4 py-4`} aria-labelledby="photos-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="photos-title" className="text-base font-semibold leading-[22px]">Photos</h2>
        {grid ? <span className="text-sm text-app-text-secondary">{grid.text}</span> : null}
      </div>
      {grid && grid.photos.length ? (
        <ul className="grid grid-cols-4 gap-1">
          {grid.photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p)} className="block aspect-square w-full overflow-hidden rounded-lg bg-app-surface-sunken" aria-label={`A photo from ${p.by_name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumb_url ? <img src={p.thumb_url} alt="" className="h-full w-full object-cover" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[13px] leading-[18px] text-app-text-secondary">{intro.note}</p>
      {storeHref ? (
        <a href={storeHref} className="flex h-11 w-full items-center justify-center rounded-xl border border-app-border-strong bg-app-surface text-[15px] font-semibold text-app-text">
          {intro.add_text}
        </a>
      ) : <p className="text-sm font-semibold text-app-text">{intro.add_text}</p>}
      {open && open.url ? (
        <div role="dialog" aria-label={`A photo from ${open.by_name}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      ) : null}
    </section>
  );
}

// ── The gift exchange (the extras) ───────────────────────────

/**
 * W3's gift exchange (08-extras section 4, board 28). Before the draw: the budget, when names are drawn and how many
 * joined, "Your wish, if you like" and "Join"; joined, "You're in the exchange" with "Change" and "Leave". After the draw:
 * "You're giving to" and their name and wish, which only this guest's own page carries.
 */
function GiftCard({ planId, initial }: { planId: string; initial: PublicPlanGift }) {
  const [gift, setGift] = useState<PublicPlanGift>(initial);
  const [wish, setWish] = useState(initial.mine.wish || '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const drawn = gift.state === 'drawn';
  const giving = gift.mine.giving_to;

  async function call(method: 'POST' | 'PATCH' | 'DELETE', path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setLine(null);
    try {
      const res = await fetch(`/api/public/plans/${encodeURIComponent(planId)}/gift${path}`, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.gift) {
        setGift(data.gift as PublicPlanGift);
        setWish(data.gift.mine.wish || '');
        setEditing(false);
      } else setLine(typeof data.message === 'string' ? data.message : 'Something went wrong. Please try again.');
    } catch {
      setLine('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const wishField = (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        call(gift.mine.in ? 'PATCH' : 'POST', gift.mine.in ? '/mine' : '/join', { wish });
      }}
    >
      <input
        type="text"
        value={wish}
        maxLength={120}
        placeholder="Your wish, if you like"
        aria-label="Your wish, if you like"
        onChange={(e) => setWish(e.target.value)}
        className="h-11 min-w-0 flex-1 rounded-xl border border-app-border-strong bg-app-surface px-3 text-base text-app-text outline-none placeholder:text-app-text-muted focus:border-primary-600"
      />
      <button type="submit" disabled={busy} className="h-11 flex-none rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? <Spinner /> : gift.mine.in ? 'Save' : 'Join'}
      </button>
    </form>
  );

  return (
    <>
      <section className={`${CARD} flex flex-col gap-3 px-4 py-4`} aria-labelledby="gift-title">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-app-surface-sunken text-app-text-strong" aria-hidden="true">{Glyph.gift()}</span>
          <h2 id="gift-title" className="flex-1 text-base font-semibold leading-[22px]">Gift exchange</h2>
          <span className="text-sm text-app-text-secondary">{gift.budget_text}</span>
        </div>
        {drawn && giving ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-sm text-app-text-secondary">You’re giving to</p>
            <span className="grid h-16 w-16 place-items-center rounded-full bg-app-success-bg text-2xl font-semibold text-app-success" aria-hidden="true">
              {giving.name.slice(0, 1).toUpperCase()}
            </span>
            <p className="text-lg font-semibold">{giving.name}</p>
            {giving.wish ? (
              <p className="flex w-full items-start gap-2 rounded-xl bg-app-info-bg px-3 py-2 text-sm leading-5 text-app-text">
                <span className="mt-0.5 text-app-info">{Glyph.heart()}</span>
                <span><strong>{gift.mine.wish_text}:</strong> {giving.wish}</span>
              </p>
            ) : null}
            <p className="flex w-full items-start gap-2 text-[13px] leading-[18px] text-app-text-secondary">
              <span className="mt-0.5">{Glyph.lock()}</span><span>{gift.mine.secret_text}</span>
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-app-text-secondary">{`${gift.draw_text} · ${gift.joined_text}`}</p>
            {gift.mine.in && !editing ? (
              <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-app-success-bg px-3">
                <span className="flex items-center gap-2 text-[15px] font-semibold text-app-success">{Glyph.check('h-4 w-4')}You’re in the exchange</span>
                {!drawn ? (
                  <span className="flex gap-1">
                    <button type="button" disabled={busy} onClick={() => setEditing(true)} className="min-h-[44px] px-2 text-sm font-semibold text-app-link">Change</button>
                    <button type="button" disabled={busy} onClick={() => call('DELETE', '/mine')} className="min-h-[44px] px-2 text-sm font-semibold text-app-link">Leave</button>
                  </span>
                ) : null}
              </div>
            ) : gift.can_join || editing ? wishField : null}
          </>
        )}
        {line ? <p className="text-sm leading-5 text-app-error" role="status">{line}</p> : null}
      </section>
      {drawn && gift.mine.in ? (
        <section className={`${CARD} flex items-center justify-between gap-3 px-4 py-3`}>
          {editing ? wishField : (
            <>
              <div className="flex min-w-0 flex-col">
                <p className="text-base font-semibold leading-[22px]">Your wish</p>
                <p className="text-sm leading-5 text-app-text-secondary">{gift.mine.wish || 'Nothing yet'}</p>
              </div>
              <button type="button" onClick={() => setEditing(true)} className="min-h-[44px] flex-none px-2 text-sm font-semibold text-app-link">Change</button>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

// ── Find a date (the extras) ─────────────────────────────────

/**
 * W1 while the host picks a date (08-extras section 2, board 24): "{Host} is picking a date", the times with how many
 * can make each and a switch, the guest's name, numbers and (where asked) email, and "Save my times". At a home the
 * answer is "Check your email": the link to the ticks travels only there.
 */
function DatesForm(props: GuestAnswerProps & { dates: PublicPlanDates }) {
  const { planId, plan, hostFirst, area, open, invite, dates } = props;
  const router = useRouter();
  const answer = plan.answer!;
  const mine = answer.mine;
  const hasKey = Boolean(mine);
  const [ticks, setTicks] = useState<Set<string>>(new Set(dates.options.filter((o) => o.mine).map((o) => o.id)));
  const [name, setName] = useState(mine?.name || '');
  const [adults, setAdults] = useState(mine?.adults || 1);
  const [kids, setKids] = useState(mine?.kids || 0);
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; adults?: string; kids?: string }>({});
  const [line, setLine] = useState<string | null>(dates.mine?.answered ? 'Your times are saved.' : null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setTicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLine(null);
  }

  async function save() {
    setBusy(true);
    setErrors({});
    setLine(null);
    const body: Record<string, unknown> = { name, adults, kids: answer.kids_welcome ? kids : 0, options: [...ticks] };
    if (answer.via !== 'email' && email.trim()) body.email = email.trim();
    if (!hasKey) {
      if (answer.via === 'open' && open) body.open = open;
      else if (invite) body.invite = invite;
    }
    try {
      const res = await fetch(`/api/public/plans/${encodeURIComponent(planId)}/dates/mine`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.state === 'check_email') setSentTo(answer.via === 'email' ? props.emailHint || 'your email' : email.trim() || 'your email');
        else {
          setLine('Your times are saved.');
          router.refresh();
        }
      } else if (res.status === 422 && data.field) {
        setErrors({ [data.field]: data.message });
      } else if (res.status === 409 && data.error === 'email_opted_out') {
        setErrors({ email: data.message });
      } else if (res.status === 429) {
        setLine('Try again in a little while.');
      } else {
        setLine(typeof data.message === 'string' ? data.message : 'Something went wrong. Please try again.');
        if (data.error === 'picked' || data.error === 'ended') router.refresh();
      }
    } catch {
      setLine('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="quiet" icon={Glyph.mail('h-5 w-5')} title="Check your email" sub={null} onChange={() => setSentTo(null)} />
        <ShortCard plan={plan} when={null} area={area} />
        <p className="flex items-start gap-[10px] rounded-2xl bg-app-info-bg px-4 py-3 text-sm leading-5 text-app-text">
          <span className="mt-0.5 text-app-info">{Glyph.mail()}</span>
          <span>Your times are saved. The link to see or change them is on its way to <strong>{sentTo}</strong>.</span>
        </p>
        <LockLine>The address is shown only through the link in that email, so only you can open it.</LockLine>
      </div>
    );
  }

  const emailShown = answer.via !== 'email' && !hasKey;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-start gap-3 rounded-2xl bg-app-info-bg px-4 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-app-surface text-sm font-bold text-app-text" aria-hidden="true">
          {hostFirst.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex flex-col">
          <p className="text-base font-semibold leading-[22px]">{dates.host_line}</p>
          <p className="text-sm leading-5 text-app-text-secondary">{`Tick every time that works for you. ${hostFirst} chooses one, and you’ll hear.`}</p>
        </div>
      </section>
      <InvitationCard plan={plan} when={null} area={area} hostShort={props.hostShort} hostAvatar={props.hostAvatar} />
      <section className={`${CARD} flex flex-col px-4 pb-2 pt-4`} aria-labelledby="dates-title">
        <div className="flex items-baseline justify-between gap-3 pb-1">
          <h2 id="dates-title" className="text-base font-semibold leading-[22px]">Which times work?</h2>
          <span className="text-sm text-app-text-secondary">{dates.answered_text}</span>
        </div>
        <ul className="divide-y divide-app-border">
          {dates.options.map((o) => (
            <li key={o.id}>
              <label className="flex min-h-[60px] cursor-pointer items-center justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span className="text-base font-semibold leading-[22px] [font-variant-numeric:tabular-nums]">{o.text}</span>
                  <span className="text-[13px] leading-[18px] text-app-text-secondary">{o.can_text}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={ticks.has(o.id)}
                  onChange={() => toggle(o.id)}
                  aria-label={o.text}
                  className="peer sr-only"
                />
                <span aria-hidden="true" className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors ${ticks.has(o.id) ? 'bg-app-success' : 'bg-app-border-strong'}`}>
                  <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${ticks.has(o.id) ? 'left-[22px]' : 'left-[2px]'}`} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      <label className="flex flex-col gap-2">
        <span className={LABEL}>Your name</span>
        <input
          type="text"
          value={name}
          maxLength={100}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          className="h-[50px] rounded-xl border border-app-border-strong bg-app-surface px-4 text-base text-app-text outline-none focus:border-primary-600"
        />
        {errors.name ? <span className="text-sm text-app-error">{errors.name}</span> : null}
      </label>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Who’s coming</span>
        <div className="divide-y divide-app-border rounded-2xl border border-app-border bg-app-surface px-4">
          <Stepper label="Adults" value={adults} min={1} max={10} onChange={setAdults} disabled={busy} />
          {answer.kids_welcome ? <Stepper label="Kids" value={kids} min={0} max={10} onChange={setKids} disabled={busy} /> : null}
        </div>
        {errors.adults || errors.kids ? <span className="text-sm text-app-error">{errors.adults || errors.kids}</span> : null}
      </div>
      {emailShown ? (
        <label className="flex flex-col gap-2">
          <span className={LABEL}>{answer.needs_email ? 'Email, for the address and one reminder' : 'Email, if you’d like a reminder'}</span>
          <input
            type="email"
            value={email}
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            className="h-[50px] rounded-xl border border-app-border-strong bg-app-surface px-4 text-base text-app-text outline-none placeholder:text-app-text-muted focus:border-primary-600"
          />
          {errors.email ? <span className="text-sm text-app-error">{errors.email}</span> : null}
        </label>
      ) : null}
      <div className="flex flex-col gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !answer.can} onClick={save}>
          {busy ? <Spinner /> : null}Save my times
        </button>
        <p className="text-center text-[13px] leading-[18px] text-app-text-secondary">{dates.mine_text || `You’re in when ${hostFirst} picks a time you ticked`}</p>
        {line ? <p className="text-center text-sm leading-5 text-app-text-strong" role="status">{line}</p> : null}
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────

export default function GuestAnswer(props: GuestAnswerProps) {
  // Find a date: while the host picks, the times take the three answers' place.
  if (props.plan.answer?.dates) return <DatesForm {...props} dates={props.plan.answer.dates} />;
  return <GuestAnswerPage {...props} />;
}

function GuestAnswerPage(props: GuestAnswerProps) {
  const { planId, plan, hostFirst, when, area, open, invite, emailHint, storeHref, mapsBase, pageUrl } = props;
  const router = useRouter();
  const answer = plan.answer!;
  const mine = answer.mine;
  const forGuest = plan.for_guest ?? null;
  const hasKey = Boolean(mine);
  const over = plan.state === 'cancelled' || plan.state === 'ended';
  const atHome = plan.place_kind === 'home';

  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [name, setName] = useState(mine?.name || '');
  const [adults, setAdults] = useState(mine?.adults || 1);
  const [kids, setKids] = useState(mine?.kids || 0);
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; adults?: string; kids?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState<Which | null>(null);

  // The guest's own key answers for itself; otherwise this browser remembers the wait after "I'm in" at a home.
  useEffect(() => {
    if (hasKey) {
      writeMemo(planId, null);
      setSent(null);
    } else {
      const memo = readMemo(planId);
      if (memo) setSent(memo);
    }
  }, [hasKey, planId]);

  function startChange(from: Sent | null) {
    if (from) {
      setName(from.name);
      setAdults(from.adults);
      setKids(from.kids);
      if (from.email && answer.via !== 'email' && !from.email.includes('•')) setEmail(from.email);
    } else if (mine) {
      setName(mine.name);
      setAdults(mine.adults);
      setKids(mine.kids);
    }
    setErrors({});
    setFormError(null);
    setFull(false);
    setEditing(true);
  }

  async function submit(which: Which) {
    setErrors({});
    setFormError(null);
    setBusy(which);
    const typedEmail = email.trim();
    const body: Record<string, unknown> = { name, adults, kids: answer.kids_welcome ? kids : 0, answer: which };
    if (answer.via !== 'email' && typedEmail) body.email = typedEmail;
    if (!hasKey) {
      if (answer.via === 'open' && open) body.open = open;
      else if (invite) body.invite = invite;
    }
    try {
      const res = await fetch(`/api/public/plans/${encodeURIComponent(planId)}/answers${hasKey ? '/mine' : ''}`, {
        method: hasKey ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditing(false);
        if (data.has_key) {
          // The key is in this browser's cookie now: the page reads the guest's part with it.
          writeMemo(planId, null);
          setSent(null);
          router.refresh();
        } else {
          const next: Sent = {
            state: data.state === 'check_email' ? 'check_email' : data.state === 'cant' ? 'cant' : 'maybe',
            mine: data.mine?.state || null,
            already: Boolean(data.already_answered),
            name,
            adults,
            kids: answer.kids_welcome ? kids : 0,
            email: answer.via === 'email' ? emailHint : typedEmail || null,
          };
          writeMemo(planId, next);
          setSent(next);
        }
        return;
      }
      if (res.status === 422 && data.field) {
        setErrors({ [data.field]: data.message });
      } else if (res.status === 409 && data.error === 'email_opted_out') {
        // The address asked not to be emailed: said under the email field; the form keeps what was typed.
        setErrors({ email: typeof data.message === 'string' ? data.message : 'This address asked Pantopus not to email it. Use another one.' });
      } else if (res.status === 409 && data.error === 'full') {
        setFull(true);
      } else if (res.status === 429) {
        setFormError('Try again in a little while.');
      } else if (data && typeof data.message === 'string') {
        setFormError(data.message);
        if (res.status === 404 || data.error === 'ended') router.refresh();
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  // ── The plan is over ──
  if (over && !editing) {
    return (
      <div className="flex flex-col gap-4">
        <ShortCard plan={plan} when={when} area={area} />
        <p className="text-sm font-semibold leading-5 text-app-text-strong">
          {plan.state === 'cancelled' ? `${hostFirst} cancelled this plan.` : 'This plan is over.'}
        </p>
        {plan.state !== 'cancelled' && answer.photos ? <PhotosCard planId={planId} intro={answer.photos} storeHref={storeHref} /> : null}
      </div>
    );
  }

  // ── W2 and the local maybe / can't: an answer that brought no key back ──
  const waitingWithKey = mine?.state === 'waiting_ok' && !editing;
  if ((sent && !hasKey && !editing) || waitingWithKey) {
    const people = sent ? peopleText(sent.adults, sent.kids) : peopleText(mine!.adults, mine!.kids);
    if (sent && sent.state !== 'check_email') {
      return (
        <div className="flex flex-col gap-4">
          <Banner tone="quiet" icon={Glyph.clock()} title={sent.state === 'maybe' ? 'You said maybe' : 'You said you can’t make it'} sub={people} onChange={() => startChange(sent)} />
          <ShortCard plan={plan} when={when} area={area} />
        </div>
      );
    }
    const waiting = waitingWithKey || sent?.mine === 'waiting_ok';
    const address = (sent?.email) || mine?.email_hint || emailHint || 'your email';
    // A guest waiting again after the plan moved to the host's home (contract 6.8): "{Host} changed the place."
    const waitingChanged = waitingWithKey && !sent
      ? (mine?.changed === 'both' ? 'the time and the place' : mine?.changed === 'place' ? 'the place' : mine?.changed === 'time' ? 'the time' : null)
      : null;
    return (
      <div className="flex flex-col gap-4">
        {waiting && !sent?.already ? (
          <Banner tone="quiet" icon={Glyph.clock()} title={`Your answer is with ${hostFirst}`} sub={`${people} · ${hostFirst} lets each person in`} onChange={() => startChange(sent)} />
        ) : (
          // An answer for an address that already had one says nothing about the earlier answer.
          <Banner tone="quiet" icon={Glyph.mail('h-5 w-5')} title="Check your email" sub={sent?.already ? null : people} onChange={() => startChange(sent)} />
        )}
        {waitingChanged ? <p className="text-sm font-semibold leading-5 text-app-text-strong">{`${hostFirst} changed ${waitingChanged}.`}</p> : null}
        <ShortCard plan={plan} when={when} area={area} />
        <p className="flex items-start gap-[10px] rounded-2xl bg-app-info-bg px-4 py-3 text-sm leading-5 text-app-text">
          <span className="mt-0.5 text-app-info">{Glyph.mail()}</span>
          <span>
            {sent?.already ? (
              'There is already an answer for this address. We sent its link there; open it to see or change it.'
            ) : waiting ? (
              <>When {hostFirst} says yes, the address and the bring list come to <strong>{address}</strong>. There is nothing else to do.</>
            ) : (
              <>The address and the bring list are on their way to <strong>{address}</strong>.</>
            )}
          </span>
        </p>
        <LockLine>The address is shown only through the link in that email, so only you can open it.</LockLine>
      </div>
    );
  }

  // ── W3: the guest's part, with their key ──
  if (hasKey && !editing && mine) {
    const people = peopleText(mine.adults, mine.kids);
    if (mine.state !== 'in' || !forGuest) {
      return (
        <div className="flex flex-col gap-4">
          <Banner tone="quiet" icon={Glyph.clock()} title={mine.state === 'cant' ? 'You said you can’t make it' : 'You said maybe'} sub={people} onChange={() => startChange(null)} />
          <ShortCard plan={plan} when={when} area={area} />
        </div>
      );
    }
    const place = forGuest.place;
    const location = [place.name, place.address].filter(Boolean).join(' · ');
    const mapsQuery = encodeURIComponent(place.address || place.name);
    const directions = place.link ? null : mapsBase === 'apple'
      ? `https://maps.apple.com/?q=${mapsQuery}`
      : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
    const changed = forGuest.changed === 'both' ? 'the time and the place' : forGuest.changed === 'place' ? 'the place' : forGuest.changed === 'time' ? 'the time' : null;
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="green" icon={Glyph.check()} title={`You’re in, ${mine.name.split(' ')[0]}`} sub={`${people} · ${hostFirst} knows`} onChange={() => startChange(null)} />
        {changed ? <p className="text-sm font-semibold leading-5 text-app-text-strong">{`${hostFirst} changed ${changed}.`}</p> : null}
        <section className={`${CARD} flex flex-col gap-3 px-4 py-4`} aria-labelledby="plan-title">
          <h1 id="plan-title" className="text-xl font-semibold leading-[26px] tracking-[-0.012em]">{plan.title}</h1>
          {when ? (
            <p className="flex items-center gap-2 text-sm leading-5 text-app-text-strong [font-variant-numeric:tabular-nums]">{Glyph.calendar()}<span>{when}</span></p>
          ) : null}
          <p className="flex items-start gap-2 text-sm leading-5 text-app-text-strong">
            <span className="mt-0.5">{atHome ? Glyph.home() : Glyph.pin()}</span>
            <span>
              <span className="font-semibold">{place.name}</span>
              {place.address ? ` · ${place.address}` : null}
            </span>
          </p>
          {place.link ? (
            <a href={place.link} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-semibold text-app-link">{place.link}</a>
          ) : null}
          <div className="grid grid-cols-2 gap-[10px] pt-1">
            {directions ? (
              <a href={directions} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-app-surface-sunken text-[15px] font-semibold text-app-text">
                {Glyph.nav()}Directions
              </a>
            ) : <span />}
            <button
              type="button"
              onClick={() => downloadCalendar(planId, plan, location, pageUrl)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-app-surface-sunken text-[15px] font-semibold text-app-text"
            >
              {Glyph.calPlus()}Add to calendar
            </button>
          </div>
        </section>
        {forGuest.gift ? <GiftCard key={`${forGuest.gift.state}-${forGuest.gift.joined}`} planId={planId} initial={forGuest.gift} /> : null}
        {forGuest.chip_in ? <ChipInCard key={`${forGuest.chip_in.paid_count}-${forGuest.chip_in.mine?.paid}`} planId={planId} initial={forGuest.chip_in} /> : null}
        {forGuest.guest_note ? (
          <section className={`${CARD} flex flex-col gap-1 px-4 py-3`}>
            <p className="text-[13px] font-semibold leading-[18px] text-app-text-secondary">{`From ${hostFirst}, only for people who are in`}</p>
            <p className="whitespace-pre-line text-base leading-6 text-app-text">{forGuest.guest_note}</p>
          </section>
        ) : null}
        {forGuest.bring ? <BringList key={forGuest.bring.rev} planId={planId} initial={forGuest.bring} hostFirst={hostFirst} /> : null}
        <section className="flex flex-col gap-2 rounded-2xl bg-app-surface-sunken px-4 py-4">
          <p className="text-base font-semibold leading-[22px]">The group chat is in the app</p>
          <p className="text-sm leading-5 text-app-text-secondary">{`So are day-of updates, the photos afterwards and ${hostFirst}'s next plan.`}</p>
          {storeHref ? (
            <a href={storeHref} className="mt-1 flex h-11 w-full items-center justify-center rounded-xl border border-app-border-strong bg-app-surface text-[15px] font-semibold text-app-text">
              Get Pantopus
            </a>
          ) : null}
        </section>
      </div>
    );
  }

  // ── W1: the invitation and its form ──
  const disabled = busy !== null;
  const emailShown = answer.via !== 'email';
  const emailRequired = answer.needs_email;
  const homeLine = atHome
    ? answer.host_says_yes_first ? ` The address comes by email once ${hostFirst} lets you in.` : ' The address comes by email.'
    : '';
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-5 text-app-text-secondary">{`${hostFirst} invited you.`}</p>
      <InvitationCard plan={plan} when={when} area={area} hostShort={props.hostShort} hostAvatar={props.hostAvatar} />
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!full) submit('in');
        }}
      >
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Your name</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'guest-name-error' : undefined}
            className="h-[50px] rounded-xl border border-app-border-strong bg-app-surface px-4 text-base text-app-text outline-none focus:border-primary-600"
          />
          {errors.name ? <span id="guest-name-error" className="text-sm text-app-error">{errors.name}</span> : null}
        </label>
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Who’s coming</span>
          <div className="divide-y divide-app-border rounded-2xl border border-app-border bg-app-surface px-4">
            <Stepper label="Adults" value={adults} min={1} max={10} onChange={setAdults} disabled={disabled} />
            {answer.kids_welcome ? <Stepper label="Kids" value={kids} min={0} max={10} onChange={setKids} disabled={disabled} /> : null}
          </div>
          {errors.adults || errors.kids ? <span className="text-sm text-app-error">{errors.adults || errors.kids}</span> : null}
        </div>
        {emailShown && !hasKey ? (
          <label className="flex flex-col gap-2">
            <span className={LABEL}>{emailRequired ? 'Email, for the address and one reminder' : 'Email, if you’d like a reminder'}</span>
            <input
              type="email"
              value={email}
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'guest-email-error' : undefined}
              className="h-[50px] rounded-xl border border-app-border-strong bg-app-surface px-4 text-base text-app-text outline-none placeholder:text-app-text-muted focus:border-primary-600"
            />
            {errors.email ? <span id="guest-email-error" className="text-sm text-app-error">{errors.email}</span> : null}
          </label>
        ) : null}
        <div className="flex flex-col gap-[10px]">
          <button type="submit" className={PRIMARY} disabled={disabled || full || !answer.can}>
            {busy === 'in' ? <Spinner /> : null}I’m in
          </button>
          <div className="grid grid-cols-2 gap-[10px]">
            <button type="button" className={SECONDARY} disabled={disabled || !answer.can} onClick={() => submit('maybe')}>
              {busy === 'maybe' ? <Spinner /> : null}Maybe
            </button>
            <button type="button" className={SECONDARY} disabled={disabled || !answer.can} onClick={() => submit('cant')}>
              {busy === 'cant' ? <Spinner /> : null}Can’t make it
            </button>
          </div>
          {full ? (
            <p className="text-sm leading-5 text-app-text-strong" role="alert">{`This is full. You can say Maybe, and ${hostFirst} will see it.`}</p>
          ) : null}
          {formError ? <p className="text-sm leading-5 text-app-error" role="alert">{formError}</p> : null}
        </div>
      </form>
      <LockLine>{`No account needed. ${hostFirst} sees your name and your answer.${homeLine}`}</LockLine>
    </div>
  );
}
