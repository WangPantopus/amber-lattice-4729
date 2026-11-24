// ============================================================
// StartFunnel — the signed-out Place funnel at /start, which is also
// Place's address-first page for someone signed in with nothing saved
// (Place's "Preview an address", Today's "Type my address").
//
// A2 hero (sentence-case, "free, no account" on the demonstration only)
// → address autocomplete (public api.geo) → the taste → the wall.
//
// The taste (Wedge v2, D1): the AHA card first — the one most non-obvious
// fact for this spot, ranked server-side — then EVERY free Band-A layer
// as a one-shot snapshot (today's air / weather / alerts, wildfire, flood,
// seismic, radon, water, EPA facilities, block, rent band, civic),
// rendered through the same `renderSection` the claimed dashboard uses.
// Only Band B (ATTOM exact record) is a LockedCard. The privacy promise
// sits above the wall. The preview persists nothing — the resolved
// address is only stashed (sessionStorage) to save once the account
// exists.
// ============================================================

'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  MapPinned,
  Globe,
  ArrowRight,
  ShieldCheck,
  Trash2,
  Mailbox,
  Smartphone,
  Share2,
  Home,
  Bell,
  Wind,
  Waves,
  Flame,
  Activity,
  TestTube,
  Droplets,
  Factory,
  BadgePercent,
  Vote,
  Landmark,
  House,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import * as api from '@pantopus/api';
import type {
  FunnelLayout,
  PlacePreview,
  PlacePreviewGlanceRow,
  PlacePreviewLayout,
  PlacePreviewLockedSection,
  PlacePreviewMoney,
  PlacePreviewMoneyLead,
  PlacePreviewTone,
  PlaceReading,
} from '@pantopus/api';
import type { PlaceBlockDensityData, PlaceSection } from '@pantopus/types';
import { Group, SectionCard, LockedCard, DensityCard, PlaceHeader, TextButton, AhaCard } from '@/components/archetypes/place';
import { PantopusLockup } from '@/components/brand/PantopusMark';
import { renderSection } from '@/components/place/presentation';
import { ShimmerBlock } from '@/components/ui/Shimmer';
import { absoluteMediaUrl, getStoreDownloadCta, type StoreDownloadCta } from '@/lib/publicShare';
import StoreLink from '@/components/public-share/StoreLink';
import { clearPendingPlaces, stashPendingPlace } from './pendingPlace';
import { authPageHref } from '@/lib/auth-utils';
import { launchFeatures } from '@/lib/featureFlags';
import PrivacyPromise from './PrivacyPromise';
import AddressAutocomplete, { type SelectedAddress } from './AddressAutocomplete';
import { isDailyLookupLimit, lookupLimitMessage } from './lookupLimit';
import BallotTeaser from '@/components/ballot/BallotTeaser';
import { ballotTeaserData } from '@/components/ballot/BallotCard';
import SunCard from '@/components/sky/SunCard';
import { useMe } from '@/lib/me';
import { areaSunData, areaTodayQuery, useHasNoPlace, useKeptArea } from '@/lib/todayArea';


// ── Brand lockup + static region pill ───────────────────────
function TopBar() {
  return (
    <div className="flex items-center justify-between pt-2">
      <PantopusLockup size={30} />
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-app-text-muted">
        <Globe size={13} strokeWidth={2} />
        <span className="text-[12px] font-medium -tracking-[0.01em]">United States</span>
      </span>
    </div>
  );
}

/** The person whose invite link (/join/:code) opened the funnel. */
export type StartInvite = { code: string; name: string; avatarUrl: string | null };

/** Sign-up links from an invite carry its code, so the person who sent it is credited. */
function inviteExtras(invite?: StartInvite): Record<string, string> {
  return invite ? { invite_code: invite.code } : {};
}

export function InvitedBy({ invite }: { invite: StartInvite }) {
  const src = absoluteMediaUrl(invite.avatarUrl);
  return (
    <span
      data-testid="start-invited-by"
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-app-border bg-app-surface py-1 pl-1 pr-3 text-[13.5px] font-semibold text-app-text"
    >
      {src ? (
        // Native img keeps public avatars working across storage hosts without Next image config churn.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-7 w-7 flex-none rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-600 text-[12px] font-bold text-white">
          {invite.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{invite.name} invited you to Pantopus</span>
    </span>
  );
}

// ── The hero step ───────────────────────────────────────────
//
// One job: get a stranger from a postcard, a share card or a search to
// type their address. The field is the hero; the example card shows what
// comes back (a glimpse, not a second page); the proof line answers the
// privacy objection before it is raised. Two columns from lg, one below.
function HeroStep({
  onSelect,
  onClear,
  onFallbackChange,
  onSubmit,
  canSubmit,
  onBrowse,
  fromCard,
  invite,
  signedIn = false,
  areaCard = null,
  topic,
}: {
  onSelect: (p: SelectedAddress) => void;
  onClear: () => void;
  onFallbackChange: (address: string | null) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  onBrowse: () => void;
  /** Opened from a mailed card (`/start?r=…`). */
  fromCard: boolean;
  /** Opened from a friend's invite link: their name leads the page. */
  invite?: StartInvite;
  /** Someone signed in, starting their Place here. */
  signedIn?: boolean;
  /** Signed in with an area kept in this browser: their city right now, in place of the example. */
  areaCard?: ReactNode;
  /** The page a property-tax card or ad opens (`/tax-check`): the same lookup, speaking about the county's value. */
  topic?: StartTopic;
}) {
  const taxCheck = topic === 'tax';
  return (
    <div className="flex flex-col min-h-screen pb-8">
      <TopBar />
      <div className="flex-1 flex flex-col justify-center py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-14">
        <div>
          {invite ? (
            <InvitedBy invite={invite} />
          ) : fromCard ? (
            <span
              data-testid="start-from-card"
              className="inline-flex items-center gap-1.5 rounded-full bg-app-home-bg px-2.5 py-1 text-[12.5px] font-semibold text-app-home"
            >
              <Mailbox size={14} strokeWidth={2.25} />
              From the card in your mailbox
            </span>
          ) : null}
          <h1
            className={`text-[31px] leading-[37px] sm:text-[36px] sm:leading-[43px] lg:text-[42px] lg:leading-[48px] font-bold -tracking-[0.028em] text-app-text text-balance ${invite || fromCard ? 'mt-4' : ''}`}
          >
            {taxCheck
              ? 'Does the county value your home above similar homes on your street?'
              : 'Know what matters for your home, and stay on top of it.'}
          </h1>
          <p className="mt-3.5 max-w-[46ch] text-[15.5px] leading-[23px] text-app-text-secondary -tracking-[0.005em]">
            {taxCheck ? (
              <span data-testid="start-tax-check">
                Where county records allow it, Pantopus compares the county&apos;s value for your home, per square
                foot, with similar houses on your street. Look up your address free, then add your home as its owner
                to see your comparison.
              </span>
            ) : signedIn ? (
              <>Your flood risk, today&apos;s air, home values and taxes where you live, and the verified homes near you.</>
            ) : (
              <>
                Wildfire and flood risk, today&apos;s air, radon, water, who represents you, and the people who&apos;ve
                proven they&apos;re real. Free, no account.
              </>
            )}
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <AddressAutocomplete onSelect={onSelect} onClear={onClear} onFallbackChange={onFallbackChange} onSubmit={onSubmit} autoFocus />
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="h-[54px] w-full flex items-center justify-center gap-1.5 rounded-2xl bg-primary-600 text-white text-base font-semibold -tracking-[0.01em] shadow-[var(--shadow-primary)] enabled:hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {taxCheck ? 'Check my home' : 'See your place'}
              <ArrowRight size={17} strokeWidth={2.5} />
            </button>
            {/* From a friend's invite, the app is one tap away and keeps the invite through the install. */}
            {invite ? (
              <div className="flex justify-center pt-0.5">
                <AppDownloadLink invite={invite} />
              </div>
            ) : null}
          </div>

          <PrivacyProof />
        </div>

        {areaCard ? <div className="mt-8 lg:mt-0">{areaCard}</div> : <ExampleReadings className="mt-8 lg:mt-0" />}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={onBrowse}
          className="inline-flex items-center gap-1.5 py-2 px-1 text-[13.5px] font-medium text-app-text-secondary -tracking-[0.005em]"
        >
          Just here to follow someone or browse?
          <ArrowRight size={14} strokeWidth={2.25} className="text-primary-600" />
        </button>
        {/*
          The "you are a different kind of user than this funnel assumes"
          affordance, for the shopper. This funnel asks people to claim
          the address they live at; Scout's reader is standing outside an
          open house with twenty minutes before a showing and has no
          place to save. Routing them by INTENT rather than dropping them
          into the claim flow is also the only way to find out whether
          that intent exists — never carry the typed address in the URL.

          `redirectTo`, NOT `intent`: the register page reads redirectTo
          (via readAuthRedirectQuery) and nothing anywhere reads `intent`,
          so the first version of this link dropped the shopper into the
          default /app/place claim flow — the exact funnel it exists to
          route around.
        */}
        <Link
          href={invite ? authPageHref('/register', '/app/place/scout', inviteExtras(invite)) : '/register?redirectTo=%2Fapp%2Fplace%2Fscout'}
          className="inline-flex items-center gap-1.5 py-2 px-1 text-[13.5px] font-medium text-app-text-secondary -tracking-[0.005em]"
        >
          Considering a place you don&apos;t live at yet?
          <ArrowRight size={14} strokeWidth={2.25} className="text-primary-600" />
        </Link>
      </div>
    </div>
  );
}

// The privacy answer, in the one place a stranger is deciding whether to
// type their address. Specific beats reassuring: it names what a neighbor
// sees and what they never see.
function PrivacyProof() {
  return (
    <div className="mt-4 flex items-start gap-2 px-1" data-testid="start-privacy-proof">
      <ShieldCheck size={15} strokeWidth={2.1} className="mt-[3px] text-app-home shrink-0" />
      <span className="text-[13px] leading-[19px] text-app-text-secondary">
        Others see a first name and a street.{' '}
        <span className="font-semibold text-app-text">Never your house number.</span>
      </span>
    </div>
  );
}

// A glimpse of the answer, using the dashboard's own row grammar so the
// real preview feels like more of the same. Static and clearly labeled
// as an example: no network, no synthesized "your" data.
const EXAMPLE_READINGS: { icon: LucideIcon; label: string; value: string; tone: 'good' | 'watch' | 'neutral' }[] = [
  { icon: Wind, label: 'Air today', value: 'Good · AQI 24', tone: 'good' },
  { icon: Waves, label: 'Flood zone', value: 'X · minimal', tone: 'good' },
  { icon: TestTube, label: 'Radon', value: 'Zone 1 · test it', tone: 'watch' },
  { icon: Trash2, label: 'Next pickup', value: 'Tue · garbage + recycling', tone: 'neutral' },
];

const TONE_DOT: Record<'good' | 'watch' | 'neutral', string> = {
  good: 'bg-app-home-solid',
  watch: 'bg-app-warning-solid',
  neutral: 'bg-app-text-muted',
};

function ExampleReadings({ className = '' }: { className?: string }) {
  return (
    <aside
      aria-label="Example of what an address shows"
      data-testid="start-example"
      className={`rounded-2xl border border-app-border bg-app-surface shadow-sm ${className}`}
    >
      <div className="px-4 pt-3.5 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-app-text-muted">Example</span>
      </div>
      <ul className="divide-y divide-app-border-subtle">
        {EXAMPLE_READINGS.map(({ icon: Icon, label, value, tone }) => (
          <li key={label} className="flex items-center gap-3 px-4 py-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-app-bg text-app-text-secondary">
              <Icon size={16} strokeWidth={2} />
            </span>
            <span className="flex-1 text-[14px] font-medium text-app-text">{label}</span>
            <span className="inline-flex items-center gap-1.5 text-[13.5px] text-app-text-secondary">
              <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
              {value}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-4 pt-2 pb-3.5 text-[12px] leading-[17px] text-app-text-muted">
        Yours takes about three seconds and stays on this page until you save it.
      </p>
    </aside>
  );
}

// ── Preview hero card ("here's what's public…") ─────────────
function PreviewHeroCard() {
  return (
    <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">Public preview</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-app-home-bg text-app-home text-[11px] font-semibold px-2 py-0.5">
          <ShieldCheck size={12} strokeWidth={2.25} />
          Free · one-time look
        </span>
      </div>
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center shrink-0 w-[42px] h-[42px] rounded-xl bg-app-home-bg text-app-home">
          <MapPinned size={22} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-app-text leading-[23px] -tracking-[0.012em]">
            Here&apos;s what&apos;s public about your address — a free, one-time look.
          </p>
          <p className="text-[13.5px] text-app-text-secondary leading-[19px] mt-1.5">
            Keep this preview, then choose whether to save it to your account.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── The money lead — the preview's headline figure (Wave 4) ──
//
// A real, free, public benchmark for the AREA: an NFIP tract premium
// band or a HUD county fair market rent. The server composes the
// sentence AND the figure — nothing here is computed or rounded client
// side, because a dollar figure is the most believable thing on the page
// and the easiest to overclaim.
//
// `money_lead: null` means no figure was genuinely available. The tiles
// then carry the page exactly as they did before this existed: no
// placeholder, no gap, no invented number.
// A truthy-but-empty lead object took the hero slot AND rendered nothing
// in it, leaving a blank card where the page's whole argument goes. The
// headline is the card, so no headline means fall back to the hero.
function isRenderableLead(lead: PlacePreviewMoneyLead | null | undefined): lead is PlacePreviewMoneyLead {
  return !!lead && typeof lead.headline === 'string' && lead.headline.trim().length > 0;
}

// `header`: the old order's "Public preview" strip. The new order draws the
// flood cost band as a plain card at the top of Risk (LOOKUPORDER).
function MoneyLeadCard({ lead, header = true }: { lead: PlacePreviewMoneyLead; header?: boolean }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm p-4" data-testid={`start-money-lead.${lead.kind}`}>
      {header ? (
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">Public preview</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-app-home-bg text-app-home text-[11px] font-semibold px-2 py-0.5">
            <ShieldCheck size={12} strokeWidth={2.25} />
            Free · one-time look
          </span>
        </div>
      ) : null}
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center shrink-0 w-[42px] h-[42px] rounded-xl bg-app-home-bg text-app-home">
          {lead.kind === 'flood_premium'
            ? <Waves size={22} strokeWidth={2} />
            : <House size={22} strokeWidth={2} />}
        </span>
        <div className="min-w-0">
          <p className="text-[20px] font-bold text-app-text leading-[26px] -tracking-[0.018em]">{lead.headline}</p>
          <p className="text-[13.5px] text-app-text-secondary leading-[19px] mt-1.5">{lead.detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-app-border-subtle text-[12px] text-app-text-muted">
        <span className="font-medium">{lead.source}</span>
        <span className="opacity-50">·</span>
        <span>{lead.scope}-level, not this home</span>
      </div>
    </div>
  );
}

// ── At a glance (LOOKUPORDER) ───────────────────────────────
// One line per check the server could answer, worst first, each with the
// stand-out card's tone as a dot (the example card's dot style, the stand-out
// card's colors). A tap scrolls to that check's card below.
const GLANCE_DOT: Record<PlacePreviewTone, string> = {
  alert: TONE_DOT.watch,
  watch: 'bg-app-info-solid',
  calm: TONE_DOT.good,
  info: TONE_DOT.neutral,
};

const sectionAnchor = (id: string) => `start-section-${id}`;

function scrollToSection(id: string) {
  const el = typeof document !== 'undefined' ? document.getElementById(sectionAnchor(id)) : null;
  if (!el) return;
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
}

function GlanceCard({ rows }: { rows: PlacePreviewGlanceRow[] }) {
  return (
    <section aria-label="At a glance" data-testid="start-glance" className="rounded-2xl border border-app-border bg-app-surface shadow-sm">
      <div className="px-4 pt-3.5 pb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">At a glance</span>
      </div>
      <ul className="divide-y divide-app-border-subtle pb-1">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => scrollToSection(row.section_id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-app-hover"
              data-testid={`start-glance.${row.id}`}
            >
              <span className="flex-1 text-[14px] font-medium text-app-text">{row.label}</span>
              <span className="inline-flex items-center gap-1.5 text-right text-[13.5px] text-app-text-secondary">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GLANCE_DOT[row.tone] ?? TONE_DOT.neutral}`} aria-hidden />
                {row.value}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Money here (LOOKUPORDER; founder 2026-11-24: "make the money related
// obvious somewhere front, like home values, taxes, and possibly make a curve")
// The area's figures as the server sends them, never this home's: the
// tract's typical value and property tax, and the county's FHFA price index
// over 15 years as percent change (an index, never dollars). Nothing is
// computed here but the curve's drawing and the signs on its two labels.
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
function signedPct(n: number, digits: number): string {
  const abs = Math.abs(n).toFixed(digits);
  if (Number(abs) === 0) return `${(0).toFixed(digits)}%`;
  return `${n > 0 ? '+' : '−'}${abs}%`;
}

function TrendCurve({ trend }: { trend: NonNullable<PlacePreviewMoney['trend']> }) {
  const points = trend.change_since_first_pct;
  if (!Array.isArray(points) || points.length < 2 || !points.every(Number.isFinite)) return null;
  const W = 320;
  const H = 80;
  const PAD = 5;
  const low = Math.min(0, ...points);
  const high = Math.max(0, ...points);
  const span = high - low || 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (v: number) => PAD + (H - 2 * PAD) * (1 - (v - low) / span);
  const path = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const county = trend.county_name || (trend.scope === 'county' ? trend.area_name : null);
  const countyLast = trend.county_last_change_pct ?? (trend.scope === 'county' ? trend.last_change_pct : null);
  const since = `${signedPct(trend.since_change_pct, 0)} since ${trend.since_year}`;
  const last = countyLast != null && Number.isFinite(countyLast) ? `${signedPct(countyLast, 1)} in ${trend.year}` : null;
  const caption = `Home prices across ${county ?? 'the county'}, FHFA price index`;
  return (
    <div className="mt-4" data-testid="start-money-trend">
      {/* A fixed height at every width: the line stretches sideways only, and
          the end dot is drawn outside the drawing so it stays round. */}
      <div className="relative h-20">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-full w-full"
          role="img"
          aria-label={[caption, since, last].filter(Boolean).join('. ')}
        >
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="text-app-border" stroke="currentColor" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={path} fill="none" className="text-app-home" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          aria-hidden
          className="absolute h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-app-home-solid"
          style={{ right: `${(PAD / W) * 100}%`, top: `${(y(points[points.length - 1]) / H) * 100}%` }}
        />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-app-text-muted">{trend.years?.[0] ?? trend.since_year}</span>
        <span className="text-right font-semibold text-app-text">{last ? `${since} · ${last}` : since}</span>
      </div>
      {trend.scope === 'zip' ? (
        <p className="mt-0.5 text-right text-[12px] text-app-text-secondary">
          {`${trend.area_name}: ${signedPct(trend.last_change_pct, 1)} in ${trend.year}`}
        </p>
      ) : null}
      <p className="mt-1.5 text-[12px] text-app-text-muted">{caption}</p>
    </div>
  );
}

function MoneyCard({ money, onRecord }: { money: PlacePreviewMoney; onRecord?: () => void }) {
  const figures = [money.value, money.tax].filter((f): f is NonNullable<PlacePreviewMoney['value']> => !!f && Number.isFinite(f.amount));
  const sources = [...new Set(figures.map((f) => f.source))];
  return (
    <section aria-label="Money here" data-testid="start-money" className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">Money here</span>
      {figures.length ? (
        <div className={`mt-2 grid gap-4 ${figures.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {figures.map((f) => (
            <div key={f.label}>
              <p className="text-[26px] font-bold leading-[32px] -tracking-[0.02em] text-app-text">{dollars(f.amount)}</p>
              <p className="text-[12.5px] text-app-text-secondary">{f.label}</p>
            </div>
          ))}
        </div>
      ) : null}
      {money.trend ? <TrendCurve trend={money.trend} /> : null}
      <p className="mt-3 border-t border-app-border-subtle pt-2.5 text-[12px] text-app-text-muted">
        {[...sources, 'Area figures, not this home.'].join(' · ')}
      </p>
      {money.record_line ? (
        onRecord ? (
          <button
            type="button"
            onClick={onRecord}
            className="mt-2 flex w-full items-start justify-between gap-2 text-left text-[13.5px] font-semibold text-primary-600 hover:text-primary-700"
            data-testid="start-money-record"
          >
            {money.record_line}
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <p className="mt-2 text-[13.5px] text-app-text-secondary">{money.record_line}</p>
        )
      ) : null}
    </section>
  );
}

// The record button, where the page has a record to open: in the new order it
// sits under the money card, whose last line points into it.
function RecordButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-primary-600 px-4 py-3 text-left text-[15px] font-semibold text-white shadow-sm hover:bg-primary-700"
      data-testid="start-home-record"
    >
      See this home&apos;s full record
      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
    </button>
  );
}

// ── The taste: aha → every free layer → the one locked layer ──
const GROUP_ORDER = ['today', 'risk_readiness', 'health_environment', 'your_block', 'money_signals', 'civic'] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  today: 'Right now',
  risk_readiness: 'Risk & readiness',
  health_environment: 'Health & environment',
  your_block: 'Your block',
  money_signals: 'Money signals',
  civic: 'Civic',
};

const AHA_ICON: Partial<Record<string, LucideIcon>> = {
  alerts: Bell,
  air_quality: Wind,
  flood: Waves,
  wildfire: Flame,
  seismic: Activity,
  lead_radon: TestTube,
  drinking_water: Droplets,
  environmental_hazards: Factory,
  rent_band: BadgePercent,
  civic_election: Vote,
  civic_districts: Landmark,
  census_context: House,
};

// ── Legacy tiles: a payload with no `sections` (an older backend, or a
// client fixture) still carries the sanitized `free` subset, so the page
// renders that instead of nothing. Same three tiles the funnel showed
// before the snapshot existed.
function floodChip(zone?: string): { label: string; variant: 'success' | 'warning' | 'error' } {
  const z = (zone || '').toUpperCase();
  if (z.startsWith('A') || z.startsWith('V')) return { label: 'High risk', variant: 'error' };
  if (z.includes('0.2') || z.includes('X500') || z.includes('SHADED')) return { label: 'Moderate risk', variant: 'warning' };
  return { label: 'Minimal risk', variant: 'success' };
}
function money(n?: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
function LegacyFreeTiles({ preview, onWall, stack }: { preview: PlacePreview; onWall: () => void; stack: boolean }) {
  const free = preview.free;
  if (!free) return null;
  return (
    <>
      <Group label="Risk & readiness" stack={stack}>
        {free.flood.status === 'ready' ? (
          <SectionCard
            icon={Waves}
            title="Flood"
            value={`Zone ${free.flood.zone} — ${floodChip(free.flood.zone).label.toLowerCase()}`}
            chip={floodChip(free.flood.zone)}
            caption="FEMA flood zone, area-level"
          />
        ) : (
          <SectionCard icon={Waves} title="Flood" state="unavailable" />
        )}
      </Group>
      <Group label="Your block" stack={stack}>
        <DensityCard bucket={free.density.bucket} label={free.density.label} ctaLabel="Claim this address and be one of the first here" onCta={onWall} />
        {free.area.status === 'ready' ? (
          <SectionCard
            icon={House}
            title="Homes here"
            value={
              free.area.median_year_built
                ? `Median built ${free.area.median_year_built}`
                : money(free.area.median_home_value)
                  ? `Typical value ${money(free.area.median_home_value)}`
                  : 'Area facts'
            }
            caption="Census, area-level — not your home"
          />
        ) : (
          <SectionCard icon={House} title="Homes here" state="unavailable" />
        )}
      </Group>
    </>
  );
}

// ── Ask Pantopus (LOOKUPORDER SPEC 5.2) ─────────────────────
// The row opens a panel in the column with Pantopus AI's reading of this
// page's public records. The reading is asked for on the first tap; any
// error (the day's cap, a refused or broken answer) leaves the panel open with
// one line, and it isn't asked again on this page (founder, 2026-11-24). Never
// half a reading. Where the reading is off, the server's order leaves the row out.
export type AskReadingProps = {
  /** The words this lookup was made with: the reading answers only for an address this browser just looked up. */
  address: string;
  /** Called once, the first time the panel opens (the t0_ask_opened beacon). */
  onOpened?: () => void;
  /** "Ask your own question. Free with an account." goes where the bar's button goes; absent when signed in. */
  onAskOwn?: () => void;
};

function AskReading({ address, onOpened, onAskOwn }: AskReadingProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [reading, setReading] = useState<PlaceReading | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const opened = useRef(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    if (!opened.current) {
      opened.current = true;
      onOpened?.();
    }
    if (state !== 'idle') return;
    setState('loading');
    try {
      const res = await api.getPublicPlaceReading(address);
      if (!res?.reading?.matters || !Array.isArray(res.reading.questions)) throw new Error('No reading');
      setReading(res.reading);
      setState('ready');
    } catch {
      setState('failed');
    }
  };

  return (
    <section className="rounded-2xl border border-app-border bg-app-surface shadow-sm" data-testid="start-ask">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left hover:bg-app-hover"
        data-testid="start-ask-row"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-home-bg text-app-home">
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <span className="flex-1 text-[15px] font-semibold text-app-text">Ask Pantopus: what does this mean for me?</span>
        <ChevronRight className={`h-5 w-5 shrink-0 text-app-text-muted transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="border-t border-app-border-subtle px-4 pb-4 pt-3" data-testid="start-ask-panel">
          {state === 'loading' ? (
            <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2 py-1">
              <ShimmerBlock className="h-4 w-11/12" />
              <ShimmerBlock className="h-4 w-4/5" />
              <ShimmerBlock className="h-4 w-2/3" />
            </div>
          ) : state === 'failed' ? (
            <p className="text-[14px] leading-[21px] text-app-text-secondary" role="status" data-testid="start-ask-failed">
              Pantopus AI couldn&apos;t read this page just now.
            </p>
          ) : reading ? (
            <div className="flex flex-col gap-4 text-[14px] leading-[21px] text-app-text">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">What matters most here</h3>
                <p className="mt-1.5">{reading.matters}</p>
              </div>
              {reading.steps.length ? (
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">What to do, in order</h3>
                  <ol className="mt-1.5 flex flex-col gap-2">
                    {reading.steps.map((step, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="mt-[1px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-surface-sunken text-[12px] font-semibold text-app-text-secondary">{i + 1}</span>
                        <span>
                          {step.text}
                          <span className="block text-[12px] text-app-text-muted">{step.source}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-app-text-secondary">What this page can&apos;t tell you</h3>
                <p className="mt-1.5">{reading.cannot_tell}</p>
              </div>
              <ul className="divide-y divide-app-border-subtle rounded-xl border border-app-border">
                {reading.questions.map((item, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setShown(shown === i ? null : i)}
                      aria-expanded={shown === i}
                      className="flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left font-medium hover:bg-app-hover"
                    >
                      {item.q}
                      <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-app-text-muted transition-transform ${shown === i ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </button>
                    {shown === i ? <p className="px-3.5 pb-3 text-app-text-secondary">{item.a}</p> : null}
                  </li>
                ))}
              </ul>
              {onAskOwn ? (
                <button type="button" onClick={onAskOwn} className="self-start text-left text-[14px] font-semibold text-primary-600 hover:text-primary-700">
                  Ask your own question. Free with an account.
                </button>
              ) : null}
              <p className="text-[12px] leading-[17px] text-app-text-muted">
                Written by Pantopus AI from the public records on this page. It is not given your street address.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// The order a client draws when the server sends none (an older server): the
// same list the server sends (LOOKUPORDER, SPEC 1.1).
const BUILT_IN_ORDER = [
  'aha', 'glance', 'money', 'record', 'ask',
  'group:risk_readiness', 'group:health_environment', 'section:census_context',
  'group:today', 'group:money_signals', 'group:civic', 'section:block_density',
  'locked', 'not_checked', 'privacy',
];

type GroupId = (typeof GROUP_ORDER)[number];
const isGroupId = (g: string): g is GroupId => (GROUP_ORDER as readonly string[]).includes(g);

type PreviewBodyProps = {
  preview: PlacePreview;
  onWall: () => void;
  /** Re-reads the preview when a section failed to load ("Try again"). */
  onRetry?: () => void;
  retrying?: boolean;
  /** One card per row at every width (the funnel's phone-width column). */
  stack?: boolean;
  /** The order to draw: v2 follows the server's `layout`; v1 is the order before LOOKUPORDER (the side-by-side). */
  layout?: FunnelLayout;
  /** Opens this home's full record (the record button and the money card's last line). */
  onRecord?: () => void;
  /** Draw the record button in its place in the order (the funnel); off where the page has its own. */
  recordButton?: boolean;
  /** Called once when the closed group at the end comes into view. */
  onEndReached?: () => void;
  /** The Ask row (LOOKUPORDER SPEC 5.2), where the server's order names it; absent where the page has no reading. */
  ask?: AskReadingProps;
  /** v1 only: drawn right after the stand-out card (the funnel's dollar figure, as the phones order it). */
  afterAha?: ReactNode;
};

// Exported for the /dev/start-preview fixture page (design QA + the aha
// audit without a live backend), and drawn by a saved address's Place.
export function PreviewBody({ layout = 'v2', ...props }: PreviewBodyProps) {
  return layout === 'v1' ? <PreviewBodyV1 {...props} /> : <PreviewBodyV2 {...props} />;
}

// Calls `onReached` once, the first time the element comes into view.
function useReachedOnce(onReached?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const done = useRef(false);
  const latest = useRef(onReached);
  latest.current = onReached;
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || done.current) return;
      done.current = true;
      observer.disconnect();
      latest.current?.();
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// LOOKUPORDER (v2): the blocks in the server's order. The stand-out card, at a
// glance, money, the record, then the groups, "Homes here" and "Verified homes
// nearby" as their own blocks, the closed group, what could not be checked,
// and the privacy lines. A block the page doesn't know, or has nothing for, is
// left out.
function PreviewBodyV2({ preview, onWall, onRetry, retrying, stack = false, onRecord, recordButton = true, onEndReached, ask }: Omit<PreviewBodyProps, 'layout'>) {
  const sections: PlaceSection[] = preview.sections ?? [];
  const locked = preview.locked ?? [];
  const aha = preview.aha;
  const ahaSection = aha?.section_id ? sections.find((s) => s.id === aha.section_id) : undefined;
  const order = preview.layout?.order?.length ? preview.layout.order : BUILT_IN_ORDER;
  const endRef = useReachedOnce(onEndReached);

  // Ballot: the server puts it under the stand-out card while the election is
  // close; otherwise it opens the Civic group. Either way Civic leaves out its
  // "Next election" row, as the Place dashboard does.
  const teaser = ballotTeaserData(preview.ballot_teaser);
  const ballotUp = order.includes('ballot');
  const ownBlocks = new Set(order.filter((b) => b.startsWith('section:')).map((b) => b.slice('section:'.length)));
  const floodCost = isRenderableLead(preview.flood_cost)
    ? preview.flood_cost
    : isRenderableLead(preview.money_lead) && preview.money_lead.kind === 'flood_premium' ? preview.money_lead : null;
  // With no money card (an older server, or the money switch off) the dollar
  // figure the server chose takes its place.
  const leadInMoneySlot = !preview.money && isRenderableLead(preview.money_lead) && preview.money_lead.kind !== 'flood_premium'
    ? preview.money_lead
    : null;

  const card = (env: PlaceSection) => {
    if (env.id === 'block_density') {
      const d = env.data as PlaceBlockDensityData | null;
      return (
        <DensityCard
          bucket={d?.bucket ?? preview.free?.density.bucket ?? 'none'}
          label={d?.label ?? preview.free?.density.label}
          ctaLabel="Claim this address and be one of the first here"
          onCta={onWall}
        />
      );
    }
    return renderSection(env, { onRetry, retrying });
  };
  const anchored = (env: PlaceSection) => (
    <div key={env.id} id={sectionAnchor(env.id)} className="scroll-mt-4">{card(env)}</div>
  );

  // A group's label shows once: a `section:` block under a label already on
  // the page above it draws without one (SPEC 1.1).
  const labelsDrawn = new Set<string>();
  const blocks: ReactNode[] = [];
  for (const block of order) {
    if (block === 'aha' && aha) {
      blocks.push(
        <AhaCard
          key={block}
          tone={aha.tone}
          grade={aha.grade}
          headline={aha.headline}
          detail={aha.detail}
          followUp={aha.follow_up}
          onFollowUp={onWall}
          icon={aha.section_id ? AHA_ICON[aha.section_id] : undefined}
          source={ahaSection?.source ?? null}
          className="mb-6"
        />,
      );
    } else if (block === 'ballot' && teaser) {
      blocks.push(<BallotTeaser key={block} teaser={teaser} address={preview.place?.address || 'This address'} className="mb-6" />);
    } else if (block === 'glance' && preview.glance?.length) {
      blocks.push(<div key={block} className="mb-6"><GlanceCard rows={preview.glance} /></div>);
    } else if (block === 'money' && (preview.money || leadInMoneySlot)) {
      blocks.push(
        <div key={block} className="mb-6">
          {preview.money ? <MoneyCard money={preview.money} onRecord={onRecord} /> : <MoneyLeadCard lead={leadInMoneySlot!} header={false} />}
        </div>,
      );
    } else if (block === 'record' && onRecord && recordButton) {
      blocks.push(<div key={block} className="mb-6"><RecordButton onClick={onRecord} /></div>);
    } else if (block === 'ask' && ask) {
      blocks.push(<div key={block} className="mb-6"><AskReading {...ask} /></div>);
    } else if (block.startsWith('group:')) {
      const g = block.slice('group:'.length);
      if (!isGroupId(g)) continue;
      const items = sections.filter((s) => s.group === g && !ownBlocks.has(s.id) && !(teaser && s.id === 'civic_election'));
      const lead = g === 'risk_readiness' && floodCost ? <MoneyLeadCard key="flood-cost" lead={floodCost} header={false} /> : null;
      const ballotHere = g === 'civic' && teaser && !ballotUp
        ? <BallotTeaser key="ballot" teaser={teaser} address={preview.place?.address || 'This address'} />
        : null;
      if (!items.length && !lead && !ballotHere) continue;
      labelsDrawn.add(GROUP_LABEL[g]);
      blocks.push(
        <Group key={block} label={GROUP_LABEL[g]} stack={stack}>
          {lead}
          {ballotHere}
          {items.map(anchored)}
        </Group>,
      );
    } else if (block.startsWith('section:')) {
      const env = sections.find((s) => s.id === block.slice('section:'.length));
      if (!env) continue;
      const label = isGroupId(env.group) ? GROUP_LABEL[env.group] : null;
      if (label && !labelsDrawn.has(label)) {
        labelsDrawn.add(label);
        blocks.push(<Group key={block} label={label} stack={stack}>{anchored(env)}</Group>);
      } else {
        blocks.push(<div key={block} className="mb-6">{anchored(env)}</div>);
      }
    } else if (block === 'locked' && locked.length > 0) {
      blocks.push(
        <div key={block} ref={endRef}>
          <Group label="Claim it to see" stack={stack}>
            {locked.map((s: PlacePreviewLockedSection) => (
              <LockedCard key={s.id} icon={Home} title={s.title} reason={s.reason} cta="Claim this address" onCta={onWall} />
            ))}
          </Group>
        </div>,
      );
    } else if (block === 'not_checked' && preview.not_checked?.length) {
      blocks.push(
        <p key={block} className="mb-5 px-0.5 text-[13px] leading-[19px] text-app-text-secondary" data-testid="start-not-checked">
          {`Could not check today: ${preview.not_checked.map((n) => n.label).join(', ')}.`}
        </p>,
      );
    } else if (block === 'privacy') {
      blocks.push(<PrivacyPromise key={block} compact className="mb-4" />);
    }
  }

  return (
    <div className="mt-5">
      {sections.length === 0 ? <LegacyFreeTiles preview={preview} onWall={onWall} stack={stack} /> : null}
      {blocks}
    </div>
  );
}

// The order before LOOKUPORDER (v1), drawn from the same answer: kept for the
// side-by-side test, which only runs while the founder switches it on.
function PreviewBodyV1({ preview, onWall, onRetry, retrying, stack = false, afterAha, onEndReached }: Omit<PreviewBodyProps, 'layout'>) {
  const endRef = useReachedOnce(onEndReached);
  const sections: PlaceSection[] = preview.sections ?? [];
  const locked = preview.locked ?? [];
  const aha = preview.aha;
  const ahaSection = aha?.section_id ? sections.find((s) => s.id === aha.section_id) : undefined;

  // Ballot P0: the teaser carries the election, so the Civic group leaves
  // out its "Next election" row, as the Place dashboard does.
  const teaser = ballotTeaserData(preview.ballot_teaser);
  const shown = teaser ? sections.filter((s) => s.id !== 'civic_election') : sections;
  const groups = GROUP_ORDER
    .map((g) => ({ g, items: shown.filter((s) => s.group === g) }))
    .filter((x) => x.items.length > 0);

  return (
    <div className="mt-5">
      {aha ? (
        <AhaCard
          tone={aha.tone}
          grade={aha.grade}
          headline={aha.headline}
          detail={aha.detail}
          followUp={aha.follow_up}
          onFollowUp={onWall}
          icon={aha.section_id ? AHA_ICON[aha.section_id] : undefined}
          source={ahaSection?.source ?? null}
          className="mb-6"
        />
      ) : null}
      {aha && afterAha ? <div className="mb-6">{afterAha}</div> : null}

      {/* Ballot P0 (ballot_p0): the election card under the aha, per the
          guide §5.8 — the aha ranking itself is unchanged. */}
      {teaser ? (
        <BallotTeaser
          teaser={teaser}
          address={preview.place?.address || 'This address'}
          className="mb-6"
        />
      ) : null}

      {sections.length === 0 ? <LegacyFreeTiles preview={preview} onWall={onWall} stack={stack} /> : null}

      {groups.map(({ g, items }) => (
        <Group key={g} label={GROUP_LABEL[g]} stack={stack}>
          {items.map((env) => {
            if (env.id === 'block_density') {
              const d = env.data as PlaceBlockDensityData | null;
              return (
                <DensityCard
                  key={env.id}
                  bucket={d?.bucket ?? preview.free?.density.bucket ?? 'none'}
                  label={d?.label ?? preview.free?.density.label}
                  ctaLabel="Claim this address and be one of the first here"
                  onCta={onWall}
                />
              );
            }
            return <Fragment key={env.id}>{renderSection(env, { onRetry, retrying })}</Fragment>;
          })}
        </Group>
      ))}

      {locked.length > 0 ? (
        <div ref={endRef}>
          <Group label="Claim it to see" stack={stack}>
            {locked.map((s: PlacePreviewLockedSection) => (
              <LockedCard key={s.id} icon={Home} title={s.title} reason={s.reason} cta="Claim this address" onCta={onWall} />
            ))}
          </Group>
        </div>
      ) : null}

      <PrivacyPromise compact className="mb-4" />
    </div>
  );
}

// ── App-download link (platform-aware; the QR-scanner's other path) ──
// The store URLs ship with real fallbacks, so this is never a dead link;
// computed on the client from the user agent to point at the right store.
// From a friend's invite it carries the invite through the install (Google
// Play's referrer on Android, copied for the app's Paste button on an iPhone),
// so the app still credits the friend.
function AppDownloadLink({ invite }: { invite?: StartInvite }) {
  const [cta, setCta] = useState<StoreDownloadCta | null>(null);
  const code = invite?.code;
  useEffect(() => {
    try {
      setCta(getStoreDownloadCta(navigator.userAgent, code ? `/join/${encodeURIComponent(code)}` : null));
    } catch {
      setCta(null);
    }
  }, [code]);
  if (!cta) return null;
  return (
    <StoreLink
      href={cta.href}
      copyPath={cta.copyPath}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-600 hover:text-primary-700"
    >
      <Smartphone size={14} strokeWidth={2} />
      Prefer the app? Get it
      <ArrowRight size={13} strokeWidth={2.25} />
    </StoreLink>
  );
}

// ── Share this address (Wedge v2 D5: the share card) ─────────
// The link is the preview of THIS address; the card image is rendered
// on the fly by /api/og/place (nothing is stored). Web Share where it
// exists, copy-to-clipboard elsewhere.
function ShareAddressLink({ address, layout }: { address: string; layout: FunnelLayout }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (typeof window === 'undefined') return;
    // The link is the preview of THIS address; the browser URL is left alone.
    const url = `${window.location.origin}/start?address=${encodeURIComponent(address)}`;
    const title = "What's true about this address";
    // Funnel: the share rate (D5). Method only — never the address.
    api.recordFunnelEvent('t0_share_clicked', { method: typeof navigator.share === 'function' ? 'share' : 'copy', layout });
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* dismissed */
    }
  };
  return (
    <button type="button" onClick={share} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-600 hover:text-primary-700">
      <Share2 size={14} strokeWidth={2} />
      {copied ? 'Link copied' : 'Share this address'}
    </button>
  );
}

// ── Sticky wall bar ─────────────────────────────────────────
// The bar says what saving gives (LOOKUPORDER): this page kept, fresh each day.
function WallBar({ onWall, shareAddress, invite, signedIn, layout }: {
  onWall: () => void;
  shareAddress: string;
  invite?: StartInvite;
  signedIn: boolean;
  layout: FunnelLayout;
}) {
  return (
    <div className="sticky bottom-[var(--fab-lift,0px)] left-0 right-0 -mx-5 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-app-surface/95 backdrop-blur border-t border-app-border sm:rounded-t-2xl sm:border-x sm:shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-3.5">
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold text-app-text leading-[19px] -tracking-[0.01em]">
            Save this address. It opens fresh every day.
          </p>
          <p className="text-[12.5px] text-app-text-secondary mt-0.5">
            {signedIn
              ? 'Saving a place does not create or verify a Home.'
              : 'Your preview stays on this device for up to 24 hours while you sign in.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onWall}
          className="shrink-0 rounded-xl bg-primary-600 text-white px-4 py-3 text-[15px] font-semibold -tracking-[0.01em] shadow-[var(--shadow-primary)] hover:bg-primary-700 transition-colors whitespace-nowrap"
        >
          {signedIn ? 'Continue' : 'Save it, free'}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-center gap-4">
        <ShareAddressLink address={shareAddress} layout={layout} />
        <AppDownloadLink invite={invite} />
      </div>
    </div>
  );
}

// ── Preview loading skeleton ────────────────────────────────
function PreviewSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <ShimmerBlock className="h-7 w-36" />
          <ShimmerBlock className="h-4 w-52" />
        </div>
        <ShimmerBlock className="h-5 w-12" />
      </div>
      <div className="mt-4 bg-app-surface border border-app-border rounded-2xl shadow-sm p-4">
        <ShimmerBlock className="h-4 w-11/12 mb-2" />
        <ShimmerBlock className="h-4 w-2/3" />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-app-surface border border-app-border rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3 mb-3">
              <ShimmerBlock className="w-[34px] h-[34px] rounded-[9px]" />
              <ShimmerBlock className="h-[15px] w-28" />
            </div>
            <ShimmerBlock className="h-[15px] w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Unsupported region (non-US) ─────────────────────────────
/**
 * "We could not read that address" — NOT the geographic denial below.
 *
 * `geocodeUsAddress` fails four ways and only one means "outside the US".
 * Collapsing them showed a US visitor the U.S.-only hand-off during any
 * geocoder outage, and offered them nothing to do about it. The retry is
 * the point: adding a city and state usually resolves it.
 */
function CouldNotPlace({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center text-center px-2">
      <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-app-surface-sunken text-app-text-muted mb-5">
        <MapPinned size={30} strokeWidth={2} />
      </span>
      <h2 className="text-xl font-bold -tracking-[0.02em] text-app-text">We couldn&apos;t find that address</h2>
      <p className="mt-2 text-sm text-app-text-secondary leading-relaxed max-w-sm">
        Adding the city and state usually does it — &ldquo;1421 SE Oak St, Portland, OR&rdquo;.
      </p>
      <div className="mt-5">
        <TextButton arrow={false} onClick={onRetry}>Try another address</TextButton>
      </div>
    </div>
  );
}

function UnsupportedRegion({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center text-center px-2">
      <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-app-home-bg text-app-home mb-5">
        <MapPinned size={30} strokeWidth={2} />
      </span>
      <h2 className="text-xl font-bold -tracking-[0.02em] text-app-text">Home features are U.S.-only for now</h2>
      <p className="mt-2 text-sm text-app-text-secondary leading-relaxed max-w-sm">
        Records, risks, and home details come from U.S. public-data sources. Following, fanning, and messaging
        verified people work everywhere today.
      </p>
      <div className="mt-5">
        <TextButton onClick={onBrowse}>Create a free account to follow people and places</TextButton>
      </div>
    </div>
  );
}

// ── Which order this browser draws (LOOKUPORDER, SPEC 6) ────
// v2 (the server's `layout`) for everyone, unless the side-by-side is on: then
// the browser's own anonymous id picks a side, the same one on every visit.
function lookupSide(layout: PlacePreviewLayout | undefined): FunnelLayout {
  const split = layout?.split;
  if (!split?.on) return 'v2';
  if (split.until && Date.parse(split.until) <= Date.now()) return 'v2';
  const id = api.getFunnelAnonId();
  if (!id) return 'v2';
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  const share = Number.isFinite(split.share) ? split.share : 0.5;
  return hash / 4294967296 < share ? 'v2' : 'v1';
}

// ── The funnel ──────────────────────────────────────────────
/** What the page speaks about first: the county's value (`/tax-check`), or everything (`/start`). */
export type StartTopic = 'tax';

export default function StartFunnel({ invite, topic }: { invite?: StartInvite; topic?: StartTopic } = {}) {
  const router = useRouter();
  const [fromCard, setFromCard] = useState(false);
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [fallbackAddress, setFallbackAddress] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  // Signed in (TABCARD 4b): the sentence speaks to your own home, and with an area kept in this browser
  // (Today's "Use my location") your city's sun right now takes the example's place once its answer comes.
  // The page's HTML is the signed-out one; the session is read in the browser.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(api.hasActiveSession()); }, []);
  const viewer = useMe({ enabled: signedIn });
  // A kept token the server refuses (expired, signed out elsewhere) is not a session: the page reads as signed out.
  const refusedStatus = (viewer.error as { statusCode?: number; status?: number } | null)?.statusCode
    ?? (viewer.error as { status?: number } | null)?.status;
  const liveSession = signedIn && !(refusedStatus === 401 || refusedStatus === 403);
  const userId = signedIn ? viewer.data?.id ?? null : null;
  const [keptArea] = useKeptArea(userId);
  // Only while nothing is saved, as on Today: once there's a Home, a saved address or a claim, the area is ignored.
  const { noPlace } = useHasNoPlace(userId, !!keptArea);
  const areaQuery = useQuery({ ...areaTodayQuery(userId, keptArea), enabled: noPlace && !!keptArea });
  const areaSun = areaSunData(areaQuery.data);
  const areaPlace = areaQuery.data ? (areaQuery.data.area.city || areaQuery.data.area.label) : null;
  const areaCard = noPlace && areaSun && areaPlace ? (
    <SunCard data={areaSun} countdown overline={`RIGHT NOW IN ${areaPlace.toUpperCase()}`} testId="place.firstRun.sunCard" />
  ) : null;

  // Deep links (Wedge v2 D5): `?r=<route>` from an EDDM card or invite
  // postcard is remembered for every funnel beacon; `?address=` (a share
  // card, a postcard QR) resolves the first suggestion and shows the
  // preview straight away. A paid ad's code starts with `ad-`: it is
  // remembered the same way, but the visitor didn't get a card, so no
  // "From the card in your mailbox".
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const route = params.get('r') || params.get('route');
    if (route) {
      api.rememberFunnelRoute(route);
      if (!/^ad-/i.test(route.trim())) setFromCard(true);
    } else if (topic === 'tax') {
      // No card or ad code on the link: sign-ups from this page still count apart from /start's.
      api.rememberFunnelRoute('tax-check');
    }
    const address = (params.get('address') || '').trim();
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.geo.autocompleteWithAbort(address, new AbortController().signal);
        const first = res?.suggestions?.[0];
        if (cancelled) return;
        const lat = first?.center?.lat;
        const lng = first?.center?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') throw new Error('No suggestion');
        setSelected({ label: first.label, latitude: lat, longitude: lng });
        setSubmitted(first.label);
      } catch {
        // Share links and homepage arrivals still have their preview allowance
        // when the separate suggestions allowance is exhausted.
        if (!cancelled) {
          setFallbackAddress(address);
          setSubmitted(address);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, from the link the page opened with
  }, []);

  const previewQuery = useQuery({
    queryKey: ['place', 'public-preview', submitted],
    queryFn: () => api.place.getPublicPlacePreview(submitted as string),
    enabled: !!submitted,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // A fast preview can arrive before its slow public-data requests finish.
  // They keep warming the server's caches. Give failed cards two chances to
  // recover, within the caller's free-repeat window; never poll an old tab or
  // retry a refused lookup. Real outages still leave the manual retry visible.
  const recovery = useRef({ address: submitted, attempts: 0, firstResponseAt: 0 });
  const { refetch: refetchPreview } = previewQuery;
  useEffect(() => {
    if (recovery.current.address !== submitted) {
      recovery.current = { address: submitted, attempts: 0, firstResponseAt: 0 };
    }
    if (!submitted || !previewQuery.data || previewQuery.isError || previewQuery.isFetching) return;
    const run = recovery.current;
    if (!run.firstResponseAt) run.firstResponseAt = previewQuery.dataUpdatedAt;
    const hasFailedCards = previewQuery.data.sections?.some((section) => section.status === 'error');
    if (!hasFailedCards || run.attempts >= 2 || Date.now() - run.firstResponseAt >= 60_000) return;
    const timer = setTimeout(() => {
      if (document.visibilityState !== 'visible' || Date.now() - run.firstResponseAt >= 60_000) return;
      run.attempts += 1;
      void refetchPreview();
    }, 4_000);
    return () => clearTimeout(timer);
  }, [submitted, previewQuery.data, previewQuery.dataUpdatedAt, previewQuery.isError,
    previewQuery.isFetching, refetchPreview]);

  // Funnel: T0 preview rendered — client-reported, because the preview
  // endpoint itself persists nothing by contract. Once per submit.
  // Every t0_* beacon says which order the lookup was drawn in (meta.layout).
  const previewStatus = previewQuery.data?.status ?? null;
  const side = lookupSide(previewQuery.data?.layout);
  const viewedPreview = useRef<string | null>(null);
  useEffect(() => {
    if (submitted && previewStatus && viewedPreview.current !== submitted) {
      viewedPreview.current = submitted;
      api.recordFunnelEvent('t0_preview_viewed', { status: previewStatus, layout: side });
    }
  }, [submitted, previewStatus, side]);

  // Funnel: the aha rate (D1) — which card led, and whether it was the
  // calm fallback. Section id, tone and grade only; never the address.
  // Counted once per submit for every preview that shows the card, as
  // t0_preview_viewed counts every preview: a ready one, or a partial one
  // once no retry of its failed cards is coming (the lead card can change on
  // a retry). Counting ready previews alone left partial lookups out.
  const aha = previewQuery.data?.aha ?? null;
  const viewedAha = useRef<string | null>(null);
  const settled = previewStatus === 'ready' || (previewStatus === 'partial' && !previewQuery.isFetching
    && (!previewQuery.data?.sections?.some((section) => section.status === 'error') || recovery.current.attempts >= 2));
  useEffect(() => {
    if (submitted && settled && aha && viewedAha.current !== submitted) {
      viewedAha.current = submitted;
      api.recordFunnelEvent('t0_aha_viewed', {
        section_id: aha.section_id ?? '',
        tone: aha.tone,
        grade: aha.grade ?? '',
        layout: side,
      });
    }
  }, [submitted, settled, aha, side]);

  // The end of the lookup: the closed group came into view. Once per address.
  const reachedEnd = useRef<string | null>(null);
  const onEndReached = () => {
    if (!submitted || reachedEnd.current === submitted) return;
    reachedEnd.current = submitted;
    api.recordFunnelEvent('t0_end_reached', { layout: side });
  };

  const [continuationError, setContinuationError] = useState('');
  const goBrowse = () => {
    clearPendingPlaces();
    // Launch cut #1 (Beacon): browsing lands on Pulse, not the Beacons feed.
    router.push(authPageHref('/register', launchFeatures.beacon ? '/app/feed?surface=personas' : '/app/feed', inviteExtras(invite)));
  };

  const continueWithPreview = (page: '/login' | '/register') => {
    // Funnel: the soft wall converted a preview into intent.
    api.recordFunnelEvent('t0_wall_viewed', { layout: side });
    if (selected || submitted) {
      const place = previewQuery.data?.place;
      const previewId = stashPendingPlace({
        label: selected?.label ?? (place?.address
          ? [place.address, place.city, place.state, place.zipcode].filter(Boolean).join(', ')
          : submitted!),
        latitude: selected?.latitude ?? null,
        longitude: selected?.longitude ?? null,
        city: place?.city ?? null,
        state: place?.state ?? null,
      });
      if (!previewId) {
        setContinuationError('Your browser could not keep this preview. Allow site storage and try again.');
        return;
      }
      router.push(authPageHref(page, `/app/place?preview=${previewId}`, inviteExtras(invite)));
      return;
    }
    router.push(authPageHref(page, '/app/place', inviteExtras(invite)));
  };
  const goWall = () => continueWithPreview('/register');

  // The record page reads the address from the lookup's own device-local preview, by its opaque id: never in a URL.
  // It asks with the words this lookup used, so it costs no second lookup.
  const openRecord = () => {
    if (!submitted) return;
    api.recordFunnelEvent('t0_record_opened', { layout: side });
    const place = previewQuery.data?.place;
    const previewId = stashPendingPlace({
      label: submitted,
      latitude: selected?.latitude ?? null,
      longitude: selected?.longitude ?? null,
      city: place?.city ?? null,
      state: place?.state ?? null,
    });
    if (!previewId) {
      setContinuationError('Your browser could not keep this preview. Allow site storage and try again.');
      return;
    }
    router.push(`/start/record?preview=${previewId}`);
  };

  const submit = () => {
    const address = selected?.label ?? fallbackAddress;
    if (address) setSubmitted(address);
  };

  // Hero step.
  if (!submitted) {
    return (
      <main className="min-h-screen bg-app-bg">
        <div className="mx-auto w-full max-w-[480px] sm:max-w-[540px] lg:max-w-[1000px] px-5">
          <HeroStep
            onSelect={setSelected}
            onClear={() => setSelected(null)}
            onFallbackChange={setFallbackAddress}
            onSubmit={submit}
            canSubmit={!!selected || !!fallbackAddress}
            onBrowse={goBrowse}
            fromCard={fromCard}
            invite={invite}
            signedIn={liveSession}
            areaCard={areaCard}
            topic={topic}
          />
        </div>
      </main>
    );
  }

  // Preview step.
  const preview = previewQuery.data;
  const addressLabel = preview?.place?.address
    ? [preview.place.address, preview.place.city].filter(Boolean).join(', ')
    : selected?.label ?? submitted;

  return (
    <main className="min-h-screen bg-app-bg">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[540px] px-5 pt-3 flex flex-col min-h-screen">
        {continuationError ? <p role="alert" className="py-3 text-red-700 dark:text-red-300">{continuationError}</p> : null}
        {previewQuery.isPending ? (
          <PreviewSkeleton />
        ) : previewQuery.isError ? (
          <div className="mt-10 text-center">
            <p className="text-sm text-app-text-secondary">
              {lookupLimitMessage(previewQuery.error) ?? "We couldn't look up that address. Try again."}
            </p>
            <div className="mt-3 flex justify-center">
              {isDailyLookupLimit(previewQuery.error) ? (
                api.hasActiveSession() ? (
                  <TextButton onClick={() => router.push('/app/place')}>Back to Place</TextButton>
                ) : (
                  <TextButton onClick={goWall}>Create a free account</TextButton>
                )
              ) : (
                <TextButton arrow={false} onClick={() => previewQuery.refetch()}>Try again</TextButton>
              )}
            </div>
          </div>
        ) : preview && preview.status === 'could_not_place' ? (
          <CouldNotPlace onRetry={() => { setSelected(null); setFallbackAddress(null); setSubmitted(null); }} />
        ) : preview && preview.status === 'unsupported_region' ? (
          <UnsupportedRegion onBrowse={goBrowse} />
        ) : preview ? (
          <>
            <div className="flex-1 motion-safe:animate-[fadeInUp_0.3s_ease-out_both]">
              <PlaceHeader
                address={addressLabel}
                status="none"
                rightSlot={
                  <button
                    type="button"
                    onClick={() => continueWithPreview('/login')}
                    className="text-sm font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Sign in
                  </button>
                }
              />
              {side === 'v1' ? (
                <>
                  {preview.status === 'ready' || preview.status === 'partial' ? (
                    <div className="mt-4"><RecordButton onClick={openRecord} /></div>
                  ) : null}
                  {/* The old order: the stand-out card, then the dollar figure (otherwise the
                      original hero), as the phones drew it. */}
                  {preview.aha ? null : (
                    <div className="mt-4">
                      {isRenderableLead(preview.money_lead)
                        ? <MoneyLeadCard lead={preview.money_lead} />
                        : <PreviewHeroCard />}
                    </div>
                  )}
                  <PreviewBody
                    layout="v1"
                    afterAha={isRenderableLead(preview.money_lead)
                      ? <MoneyLeadCard lead={preview.money_lead} />
                      : <PreviewHeroCard />}
                    preview={preview}
                    onWall={goWall}
                    onRetry={() => { void previewQuery.refetch(); }}
                    retrying={previewQuery.isFetching}
                    onEndReached={onEndReached}
                    stack
                  />
                </>
              ) : (
                <PreviewBody
                  layout="v2"
                  preview={preview}
                  onWall={goWall}
                  onRetry={() => { void previewQuery.refetch(); }}
                  retrying={previewQuery.isFetching}
                  onRecord={preview.status === 'ready' || preview.status === 'partial' ? openRecord : undefined}
                  onEndReached={onEndReached}
                  ask={submitted && (preview.status === 'ready' || preview.status === 'partial') ? {
                    address: submitted,
                    onOpened: () => api.recordFunnelEvent('t0_ask_opened', { layout: side }),
                    onAskOwn: liveSession ? undefined : goWall,
                  } : undefined}
                  stack
                />
              )}
              <div className="h-4" />
            </div>
            <WallBar onWall={goWall} shareAddress={selected?.label ?? submitted ?? ''} invite={invite} signedIn={liveSession} layout={side} />
          </>
        ) : null}
      </div>
    </main>
  );
}
