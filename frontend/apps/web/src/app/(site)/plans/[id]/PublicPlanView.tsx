import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ANDROID_PLAY_STORE_URL,
  API_BASE_URL,
  IOS_APP_STORE_URL,
  buildPlanAppUrl,
  buildPlanPath,
  buildPlanShareUrl,
} from '@pantopus/utils';
import {
  absoluteMediaUrl,
  buildShareMetadata,
  fetchPublicPlan,
  getStoreDownloadCta,
  planInviteToken,
  playStoreUrlCarrying,
  storePlatform,
  summarizeText,
  type PublicPlan,
  type PublicPlanBusiness,
  type PublicPlanInvite,
  type PublicPlanPrice,
} from '@/lib/publicShare';
import OpenInAppButton from '@/components/public-share/OpenInAppButton';
import JustInstalledHint from '@/components/public-share/JustInstalledHint';
import StoreLink from '@/components/public-share/StoreLink';
import { Icon, KindGlyph, OnlineGlyph, kindColors } from '@/components/plans/planKind';
import GuestAnswer from './GuestAnswer';
import OpenPlanOnWeb from '@/components/plans/OpenPlanOnWeb';
import PayToJoin, { type BookingPlan } from './PayToJoin';
import ClaimSpot, { SpotUnread, type SpotView } from './ClaimSpot';

// A Nearby Plans share link (design board W1). Signed out, area only: the exact
// place, the host's note and the people going are only in the app, for people
// the host lets in. Playdate links show nothing but the kind and the city.
// A business's plan (board D6) adds what the business calls it, its place by name and street address (the
// business's own), the business as host and the price; a kids' class among them gets the whole card. Joining and
// paying happen in the app. Everything it adds is behind `plan.business`, so a person's plan reads as before.
// A private plan shows only that it is private, unless the link carries a live invitation to it.
// An online plan (board Online) says "Online" where the area would be and draws no map; its link is only in the app.
// Plans for the holidays (H1), while the host has the switch: a guest answers here with no account (GuestAnswer, boards
// W1 to W3). The page's ways in are ?invite= and ?open=; the guest's own key lives in an HttpOnly cookie for this plan,
// which only the page's server reads and sends on. Without an `answer` from the server the page is today's.
// The same page is served at /plan-link/<id> (contract 6.9), where the open link and the emailed link lead: it never
// sends anyone on to a /plans/ address, which an installed app that can't show the plan may take, and on a page opened
// with the plan's live open link "Open app" carries that link into the app.

type Kind = PublicPlan['kind'];

/**
 * The signed-in person's part in the plan: host, in (guest), or neither, with their request's status, and on a paid
 * business plan what they paid (B3).
 */
type PlanViewer = {
  booking: BookingPlan;
  role: 'host' | 'guest' | 'none';
  requestStatus: string | null;
  requestsWaiting: number;
  paid: { text: string; leave_text?: string | null; leave_back_cents?: number; receipt?: { link: string } | null } | null;
};

/**
 * Who is looking, when they're signed in on the web. A host's "requests waiting" notices open this
 * page, so the host and people already in get words that fit them. It's the app's own plan read
 * (GET /api/plans/:id) with the person's session cookie, never cached; signed out, or when that read
 * fails, the page reads as it does for everyone.
 */
async function fetchPlanViewer(id: string): Promise<PlanViewer | null> {
  const access = (await cookies()).get('pantopus_access')?.value;
  if (!access) return null;
  try {
    // Match the installed apps' viewer capabilities, including private plans that are still picking a date.
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, '')}/api/plans/${encodeURIComponent(id)}?biz=1&more=1&guests=1&extras=1`, {
      cache: 'no-store',
      // This lookup only personalizes copy. A slow session/API must not hold
      // the public preview open indefinitely, including while reading its body.
      signal: AbortSignal.timeout(1500),
      headers: { Accept: 'application/json', Cookie: `pantopus_access=${access}` },
    });
    if (!response.ok) return null;
    const plan = await response.json();
    const role = plan?.viewer?.role;
    if (role !== 'host' && role !== 'guest' && role !== 'none') return null;
    return {
      role,
      booking: {
        kind: plan.kind,
        kids_welcome: plan.kids_welcome,
        is_full: plan.is_full,
        viewer: { request_status: plan.viewer.request_status },
        my_request: plan.my_request ? { party_size: plan.my_request.party_size, kids_count: plan.my_request.kids_count } : null,
      },
      requestStatus: typeof plan.viewer.request_status === 'string' ? plan.viewer.request_status : null,
      requestsWaiting: Number(plan.requests_count) || 0,
      paid: plan.paid && typeof plan.paid.text === 'string' ? plan.paid : null,
    };
  } catch {
    return null;
  }
}

const KIND_LABEL: Record<Kind, string> = {
  watch_party: 'Watch party',
  playdate: 'Playdate',
  pickup_game: 'Pickup game',
  walk_coffee: 'Walk & coffee',
  study_group: 'Study group',
  food_drinks: 'Food & drinks',
  game_night: 'Game night',
  outdoors: 'Outdoors',
  something_else: 'Something else',
};

/** As a sentence says it: "Sam invited you to their watch party". */
const KIND_NOUN: Record<Kind, string> = {
  watch_party: 'watch party',
  playdate: 'playdate',
  pickup_game: 'pickup game',
  walk_coffee: 'walk & coffee',
  study_group: 'study group',
  food_drinks: 'get-together',
  game_night: 'game night',
  outdoors: 'outing',
  something_else: 'plan',
};

const FOOD_NOUN: Record<string, string> = { dinner: 'dinner', potluck: 'potluck', drinks: 'drinks', brunch: 'brunch', bbq: 'barbecue' };
const OUTDOOR_NOUN: Record<string, string> = { hike: 'hike', bike_ride: 'bike ride', run: 'run' };

/** The kind as a sentence names it, from its details where the server's notices do: "dinner", "hike". */
function kindNoun(plan: PublicPlan): string {
  const detail = (key: string) => (typeof plan.details?.[key] === 'string' ? (plan.details[key] as string) : '');
  if (plan.kind === 'food_drinks') return FOOD_NOUN[detail('food_kind') || 'dinner'] || KIND_NOUN.food_drinks;
  if (plan.kind === 'outdoors') return OUTDOOR_NOUN[detail('outdoor_kind') || 'hike'] || KIND_NOUN.outdoors;
  return KIND_NOUN[plan.kind];
}

/** People join this plan with a link, which only the app shows, to the people who are in. */
const isOnline = (plan: PublicPlan) => plan.place_kind === 'online';

export type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string | string[]; open?: string | string[]; join?: string | string[]; spot?: string | string[] }>;
};

/** Where the page is served: `/plans/<id>`, or `/plan-link/<id>` (the guest's page, contract 6.9). */
export type PlanPageAt = 'plans' | 'plan-link';

/** The guest's page on the web, which no app opens (contract 6.9). */
function planLinkUrl(id: string): string {
  return buildPlanShareUrl(id).replace(/\/plans\/([^/?#]+)$/, '/plan-link/$1');
}

/**
 * An invitation's token from ?invite= and, once the plan is read, the invitation it opens (null when there's none or
 * it was taken back). The page's links carry the token so the app can open the invitation.
 */
async function inviteFrom(searchParams: PageProps['searchParams']): Promise<string | null> {
  const value = (await searchParams)?.invite;
  return planInviteToken(Array.isArray(value) ? value[0] : value);
}

/** The plan's open link (?open=), for answers without an account (H1). */
async function openFrom(searchParams: PageProps['searchParams']): Promise<string | null> {
  const value = (await searchParams)?.open;
  return planInviteToken(Array.isArray(value) ? value[0] : value);
}

/** A buyer's link on a business's paid plan (?spot=; one person pays for the group, the extras). */
async function spotFrom(searchParams: PageProps['searchParams']): Promise<string | null> {
  const value = [(await searchParams)?.spot].flat()[0];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
}

/**
 * What the buyer's link shows ("{Chris} got you a spot"). `spot` null and `failed` false only for the server's clear
 * "not available" (404: the business doesn't take it); any other failure (no answer, a 5xx, a body without the offer)
 * is `failed`, and the page never falls back to the paid join then (08-extras section 7).
 */
async function fetchSpot(id: string, token: string): Promise<{ spot: SpotView | null; failed: boolean }> {
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, '')}/api/public/plans/${encodeURIComponent(id)}/spot?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return { spot: null, failed: false };
    if (!response.ok) return { spot: null, failed: true };
    const body = await response.json();
    return body?.spot && typeof body.spot.button === 'string' ? { spot: body.spot as SpotView, failed: false } : { spot: null, failed: true };
  } catch {
    return { spot: null, failed: true };
  }
}

/** The guest's own key, from this plan's HttpOnly cookie (set by an answer, or by the link in their email). */
async function guestKeyFor(id: string): Promise<string | null> {
  return planInviteToken((await cookies()).get(`pantopus_plan_guest_${id.toLowerCase()}`)?.value);
}

function inviteQuery(token: string | null, invite: PublicPlanInvite | null): string {
  return token && invite?.available ? `?invite=${encodeURIComponent(token)}` : '';
}

function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

/** The kind's tag. A business's plan shows what the business calls it (`label`) in the kind's color and glyph. */
function KindTag({ kind, label = null }: { kind: Kind; label?: string | null }) {
  return (
    <span
      className="inline-flex h-[30px] items-center gap-[7px] self-start whitespace-nowrap rounded-full bg-[var(--plan-cs)] pl-1 pr-3 text-[13px] font-semibold leading-[18px] text-app-text"
      style={kindColors(kind)}
    >
      <span className="grid h-[22px] w-[22px] place-items-center rounded-[7px] bg-[var(--plan-c)] text-white dark:text-[#0b1220]">
        <KindGlyph kind={kind} className="h-[13px] w-[13px]" />
      </span>
      {label || KIND_LABEL[kind]}
    </span>
  );
}

/**
 * The board's illustrated mini-map: a park, blocks and roads, and the plan's area as a soft circle. Not a real map.
 * A business's plan has an exact place, so with `placeName` it draws the kind's pin and the place's name where the
 * circle would be (board D6: no shaded area). Like the rest of the drawing, the pin stands at no real point.
 */
function MiniMap({ kind, placeName = null }: { kind: Kind; placeName?: string | null }) {
  const area: CSSProperties = {
    ...kindColors(kind),
    background:
      'radial-gradient(closest-side, color-mix(in srgb, var(--plan-c) 24%, transparent) 0%, color-mix(in srgb, var(--plan-c) 20%, transparent) 72%, transparent 100%)',
  };
  const block = 'absolute rounded-[4px] bg-[#e8e5de] dark:bg-[#252a30]';
  const road = 'absolute bg-white shadow-[0_0_0_1px_#dcd8cf] dark:bg-[#384049] dark:shadow-[0_0_0_1px_#2a3038]';
  return (
    <div className="relative h-[150px] overflow-hidden bg-[#f2f0eb] dark:bg-[#1d2126]" aria-hidden="true">
      <i className="absolute left-[4%] top-[10%] h-[42%] w-[32%] rounded-[22px] bg-[#d5eac7] dark:bg-[#1e3527]" />
      <i className={`${block} left-[54%] top-[8%] h-[14%] w-[20%]`} />
      <i className={`${block} left-[54%] top-[34%] h-[20%] w-[20%]`} />
      <i className={`${block} left-[84%] top-[34%] h-[20%] w-[14%]`} />
      <i className={`${block} left-[10%] top-[66%] h-[16%] w-[28%]`} />
      <i className={`${block} left-[54%] top-[66%] h-[16%] w-[20%]`} />
      <i className={`${road} left-[-5%] top-[60%] h-[6px] w-[110%]`} />
      <i className={`${road} left-[44%] top-[-10%] h-[120%] w-[6px]`} />
      <i className={`${road} left-[-5%] top-[26%] h-[4px] w-[110%] -rotate-6`} />
      <i className={`${road} left-[78%] top-[-10%] h-[120%] w-[4px]`} />
      {placeName ? (
        <span
          className="absolute left-[56%] top-1/2 z-[2] flex w-[80%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3"
          style={kindColors(kind)}
        >
          <span className="grid h-10 w-10 -rotate-45 place-items-center rounded-[50%_50%_50%_0] bg-[var(--plan-c)] text-white shadow-[0_0_0_3px_#fff,0_4px_10px_rgba(15,23,42,0.18)] dark:text-[#0b1220] dark:shadow-[0_0_0_3px_#1d2126,0_4px_10px_rgba(0,0,0,0.45)]">
            <KindGlyph kind={kind} className="h-5 w-5 rotate-45" />
          </span>
          <span className="max-w-full truncate text-[13px] font-semibold leading-[18px] text-app-text [text-shadow:0_0_3px_#f2f0eb,0_0_3px_#f2f0eb] dark:[text-shadow:0_0_3px_#1d2126,0_0_3px_#1d2126]">
            {placeName}
          </span>
        </span>
      ) : (
        <span
          className="absolute left-[56%] top-1/2 z-[2] h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={area}
        />
      )}
    </div>
  );
}

/**
 * Where an online plan's mini-map would be (board Online): no map and no area, the kind's glyph on a tile of its
 * color, in a band of its tint.
 */
function OnlineHero({ kind }: { kind: Kind }) {
  return (
    <div className="grid h-[150px] place-items-center bg-[var(--plan-cs)]" style={kindColors(kind)} aria-hidden="true">
      <span className="grid h-[72px] w-[72px] place-items-center rounded-[24px] bg-[var(--plan-c)] text-white dark:text-[#0b1220]">
        <KindGlyph kind={kind} className="h-9 w-9" />
      </span>
    </div>
  );
}

/** "Online", beside the kind's tag: people join this plan with a link. */
function OnlineChip() {
  return (
    <span className="inline-flex h-[30px] items-center gap-[6px] whitespace-nowrap rounded-full border border-app-border-strong bg-app-surface-sunken pl-[10px] pr-3 text-[13px] font-semibold leading-[18px] text-app-text-strong">
      <OnlineGlyph className="h-[14px] w-[14px]" />
      Online
    </span>
  );
}

/** A repeating plan's line: "Every Tue and Thu until Feb 4". Null when it doesn't repeat or the plan is over. */
function repeatText(plan: PublicPlan): string | null {
  if (!plan.repeat?.short || plan.state === 'cancelled' || plan.state === 'ended') return null;
  const last = /^\d{4}-\d{2}-\d{2}$/.test(plan.repeat.last_on || '') ? new Date(`${plan.repeat.last_on}T12:00:00Z`) : null;
  const until = last
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(last)
    : null;
  return until ? `${plan.repeat.short} until ${until}` : plan.repeat.short;
}

/** "Private": only the people the host invites can see this plan. */
function PrivateChip() {
  return (
    <span className="inline-flex h-[30px] items-center gap-[6px] whitespace-nowrap rounded-full border border-app-border-strong bg-app-surface-sunken pl-[10px] pr-3 text-[13px] font-semibold leading-[18px] text-app-text-strong">
      <LockIcon className="h-[14px] w-[14px]" />
      Private
    </span>
  );
}

function firstNameOf(displayName: string | undefined): string {
  return String(displayName || 'Someone').split(' ')[0];
}

function nearPhrase(plan: PublicPlan): string {
  if (isOnline(plan)) return 'online';
  if (plan.city) return `near ${plan.city}`;
  const label = plan.area?.city || plan.area?.label || '';
  if (!label) return 'nearby';
  return /^near\s/i.test(label) ? label.replace(/^Near/, 'near') : `near ${label}`;
}

function whereText(plan: PublicPlan): string {
  const label = plan.area?.label || '';
  const city = plan.area?.city || '';
  // "Online · hosted from Camas", as the apps say it; just "Online" for a plan posted with no area.
  if (isOnline(plan)) return city ? `Online · hosted from ${city}` : 'Online';
  if (!label) return city;
  if (!city || label === city || label.endsWith(city)) return label;
  return `${label}, ${city}`;
}

function whenText(plan: PublicPlan): string | null {
  // While the host picks a date the page names none: "Picking a date" (08-extras section 2).
  if (plan.time_text) return plan.time_text;
  if (!plan.starts_at) return null;
  const start = new Date(plan.starts_at);
  if (Number.isNaN(start.getTime())) return null;
  const timeZone = plan.timezone || 'America/Los_Angeles';
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(start);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(start);
  return `${day} · ${time}`;
}

/**
 * A business's plan gives its end time too, as the app does: "Saturday, Nov 21 · 10:00–11:30 AM". Only the start
 * when there's no end, or it ends on another day.
 */
function whenRangeText(plan: PublicPlan): string | null {
  const when = whenText(plan);
  if (!when || plan.time_text || !plan.starts_at || !plan.ends_at) return when;
  const start = new Date(plan.starts_at);
  const end = new Date(plan.ends_at);
  const timeZone = plan.timezone || 'America/Los_Angeles';
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' });
  const length = end.getTime() - start.getTime();
  if (!(length > 0 && length < 24 * 60 * 60 * 1000) || day.format(end) !== day.format(start)) return when;
  const clock = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const startParts = clock.formatToParts(start);
  const periodOf = (parts: Intl.DateTimeFormatPart[]) => parts.find((part) => part.type === 'dayPeriod')?.value;
  // "10:00–11:30 AM" in one half of the day, "11:30 AM–1:00 PM" across noon.
  const from = periodOf(startParts) === periodOf(clock.formatToParts(end))
    ? startParts.filter((part) => part.type !== 'dayPeriod').map((part) => part.value).join('').trim()
    : clock.format(start);
  return `${day.format(start)} · ${from}–${clock.format(end)}`;
}

/** The plan's words on its tag: what a business calls its plan ("Clinic"), else its kind's ("Pickup game"). */
function labelOf(plan: PublicPlan): string {
  return (plan.business && plan.label_text) || KIND_LABEL[plan.kind];
}

/** A business's labels that a sentence names without "a": "invited you to open play". */
const LABELS_WITHOUT_ARTICLE = new Set(['open_play', 'story_time', 'tutoring', 'test_prep']);

/** A business's plan as a sentence names it: "a clinic", "open play", or with `their`, "their clinic". */
function businessPlanNoun(plan: PublicPlan, determiner: 'a' | 'their'): string {
  const words = plan.label_text ? plan.label_text.toLowerCase() : KIND_NOUN[plan.kind];
  if (determiner === 'their') return `their ${words}`;
  if (plan.label_text && plan.label && LABELS_WITHOUT_ARTICLE.has(plan.label)) return words;
  return `${/^[aeiou]/.test(words) ? 'an' : 'a'} ${words}`;
}

/** Where a business's plan is, as a sentence says it: "in Camas". Its place is exact, so it isn't "near". */
function inPhrase(plan: PublicPlan): string {
  return plan.area?.city ? `in ${plan.area.city}` : nearPhrase(plan);
}

/** A business's place by name and street address: "Lacamas Pickleball Club · 625 NE 4th Ave, Camas". */
function placeText(plan: PublicPlan): string {
  const parts = [plan.place?.name, plan.place?.address].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : whereText(plan);
}

/** A business's price as its chip says it: "$18 a person". Null when there's nothing to pay, which reads "Free". */
function priceText(price: PublicPlanPrice | null | undefined): string | null {
  if (!price) return null;
  const amount = Number(price.cents) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = /^[A-Z]{3}$/.test(price.currency || '') ? price.currency : 'USD';
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const per = price.per === 'family' ? ' a family' : price.per === 'person' ? ' a person' : '';
  return `${money}${per}`;
}

/** The line above the card: an invitation, unless the person is the host, is in, or already asked. */
function introText(plan: PublicPlan, hostName: string, viewer: PlanViewer | null, over: boolean, invite: PublicPlanInvite | null): string {
  // A business is named in full, at its exact place ("in Camas"); a person by first name, near an area.
  const business = Boolean(plan.business);
  const near = business ? inPhrase(plan) : nearPhrase(plan);
  const host = business ? hostName : firstNameOf(hostName);
  if (invite?.available && !over && (!viewer || viewer.role === 'none')) {
    const what = business ? businessPlanNoun(plan, 'their') : `their ${kindNoun(plan)}`;
    return `${invite.host_first_name} invited you to ${what} ${near}.`;
  }
  if (viewer?.role === 'host') {
    const waiting = over ? 0 : viewer.requestsWaiting;
    if (waiting > 0) return `Your plan ${near}. ${waiting} ${waiting === 1 ? 'person is' : 'people are'} waiting for your answer.`;
    return `Your plan ${near}.`;
  }
  if (viewer?.role === 'guest') return over ? `You joined ${host}'s plan ${near}.` : `You're in ${host}'s plan ${near}.`;
  if (!over && viewer?.requestStatus === 'pending') return `You asked to join ${host}'s plan ${near}.`;
  if (!over && viewer?.requestStatus === 'waitlisted') return `You're on the waitlist for ${host}'s plan ${near}.`;
  return `${host} invited you to ${business ? businessPlanNoun(plan, 'a') : 'a plan'} ${near}.`;
}

function goingText(plan: PublicPlan): string {
  const going = plan.going_count ?? 0;
  if (plan.state === 'live') return `Happening now · ${going} going`;
  if (plan.is_full) {
    const waiting = plan.waitlist_count ?? 0;
    return `${going} going · Full${waiting > 0 ? ` · ${waiting} waiting` : ''}`;
  }
  const left = plan.spots_left ?? 0;
  return `${going} going · ${left} ${left === 1 ? 'spot' : 'spots'} left`;
}

function HostAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const src = absoluteMediaUrl(avatarUrl);
  if (src) {
    // Native img keeps public avatars working across storage hosts without Next image config churn.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-[30px] w-[30px] flex-none rounded-full object-cover" />;
  }
  return (
    <span
      className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-[#e0e7ff] text-xs font-bold text-[#3730a3] dark:bg-[#23264a] dark:text-[#c7d2fe]"
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** "Verified address" for a person; "Verified business" is the same shield in the business color (board P1). */
function VerifiedBadge({ business = false }: { business?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-semibold leading-[18px] ${business ? 'text-app-business' : 'text-app-success'}`}>
      <Icon className="h-[14px] w-[14px]">
        <path d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6z" />
        <path d="M9 12l2 2 4-4" />
      </Icon>
      {business ? 'Verified business' : 'Verified address'}
    </span>
  );
}

/** The business glyph: a store front with an awning. */
function StoreIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3.5 9.5 5 4h14l1.5 5.5z" />
      <path d="M3.5 9.5a2.83 2.83 0 0 0 5.67 0a2.83 2.83 0 0 0 5.66 0a2.83 2.83 0 0 0 5.67 0" />
      <path d="M5 12.5V20h14v-7.5M10 20v-4.5h4V20" />
    </Icon>
  );
}

/**
 * The business shape (board P1): a rounded square where a person is a circle, holding the business's picture or the
 * store glyph in the business color. "Verified business" beside it names it; without that, it names itself.
 */
function BusinessMark({ avatarUrl, verified }: { avatarUrl: string | null; verified: boolean }) {
  const src = absoluteMediaUrl(avatarUrl);
  return (
    <span
      className="grid h-[30px] w-[30px] flex-none place-items-center overflow-hidden rounded-[8px] bg-[#f3e8ff] text-[#7c3aed] dark:bg-[#221833] dark:text-[#a78bfa]"
      role={verified ? undefined : 'img'}
      aria-label={verified ? undefined : 'A business'}
      aria-hidden={verified ? true : undefined}
    >
      {src ? (
        // Native img, as HostAvatar does.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <StoreIcon className="h-4 w-4" />
      )}
    </span>
  );
}

/** A business's page, only as an http(s) link. */
function businessPageHref(business: PublicPlanBusiness): string | null {
  return business.page_url && /^https?:\/\//i.test(business.page_url) ? business.page_url : null;
}

/**
 * Who hosts a business's plan, in the row where a person's plan shows its host; it opens the business's page.
 * Board D6 draws the shape and "Verified business" alone, because the line above already names the place, which
 * is the business. So the name shows here only when the place goes by another name (`named`), or when there is
 * no "Verified business" to stand in for it; a screen reader hears it either way.
 */
function BusinessHost({ business, name, named }: { business: PublicPlanBusiness; name: string; named: boolean }) {
  const hosted = Math.max(0, Math.floor(Number(business.plans_hosted) || 0));
  const href = businessPageHref(business);
  const showName = named || !business.verified;
  const body = (
    <>
      <span className="sr-only">Hosted by{showName ? '' : ` ${name}`}</span>
      <BusinessMark avatarUrl={business.avatar_url} verified={business.verified} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-x-2 text-sm leading-5">
          {showName ? <span className="font-semibold">{name}</span> : null}
          {business.verified ? <VerifiedBadge business /> : null}
        </span>
        {hosted > 0 ? (
          <span className="text-[13px] leading-[18px] text-app-text-secondary">
            Hosted {hosted} {hosted === 1 ? 'plan' : 'plans'}
          </span>
        ) : null}
      </span>
      {href ? (
        <Icon className="h-4 w-4 text-app-text-secondary">
          <path d="m9 6 6 6-6 6" />
        </Icon>
      ) : null}
    </>
  );
  return href ? (
    <a href={href} className="flex items-center gap-[10px] rounded-xl hover:opacity-80">
      {body}
    </a>
  ) : (
    <div className="flex items-center gap-[10px]">{body}</div>
  );
}

/** A business's price (board P1): bold when there is one, "Free" in plain weight. The web page takes no payment. */
function PriceChip({ price }: { price: PublicPlanPrice | null | undefined }) {
  const text = priceText(price);
  return (
    <span
      className={`inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full bg-app-surface-sunken px-[10px] text-[13px] leading-[18px] text-app-text-strong ${text ? 'font-bold' : 'font-normal'}`}
    >
      {text || 'Free'}
    </span>
  );
}

/** The refund arrow beside "You pay in the app" (board D6). */
function PayIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function TopBar({ id, fallbackUrl, copyPath = null, query = '', universal = true }: {
  id: string;
  fallbackUrl: string | null;
  copyPath?: string | null;
  query?: string;
  /** False: "Open app" opens the app's own link, never this site's /plans/ address (contract 6.9). */
  universal?: boolean;
}) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-app-border bg-app-surface px-4">
      <Link href="/" className="text-[19px] font-bold leading-[22px] tracking-[-0.02em] text-app-text">
        Pantopus
      </Link>
      <OpenInAppButton
        appUrl={`${buildPlanAppUrl(id)}${query}`}
        linkHref={universal ? `${buildPlanShareUrl(id)}${query}` : null}
        fallbackUrl={fallbackUrl}
        copyPath={copyPath}
        className="text-sm font-semibold text-app-link"
      >
        Open app
      </OpenInAppButton>
    </div>
  );
}

/** Both stores, each carrying this page's link through the install (`getStoreDownloadCta`). */
function StoreButtons({ path, copyPath }: { path: string; copyPath: string | null }) {
  if (!IOS_APP_STORE_URL && !ANDROID_PLAY_STORE_URL) return null;
  const button =
    'flex h-10 w-full items-center justify-center rounded-[10px] border border-app-border-strong bg-app-surface text-[15px] font-semibold text-app-text';
  return (
    <div className="grid grid-cols-2 gap-[10px]">
      {IOS_APP_STORE_URL ? (
        <StoreLink href={IOS_APP_STORE_URL} copyPath={copyPath} className={button}>
          Get it for iPhone
        </StoreLink>
      ) : (
        <span />
      )}
      {ANDROID_PLAY_STORE_URL ? (
        <a href={playStoreUrlCarrying(ANDROID_PLAY_STORE_URL, path)} className={button}>
          Get it for Android
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

const PRIMARY_BUTTON =
  'flex h-[50px] w-full items-center justify-center rounded-xl bg-primary-600 text-base font-semibold text-white shadow-[0_6px_16px_rgba(2,132,199,0.18)] hover:opacity-95';

const PLAYDATE_CAPTION = 'Playdate links show no details here. Open them in the app.';

/** Under a business's plan, whose place is shown (board D6). */
const BUSINESS_CAPTION = "A person's plan still shows only its area here.";
/** A private plan's link without a live invitation: nothing about the plan is read, so there is no card. */
const isPrivateOnly = (plan: PublicPlan) => plan.private === true && !plan.kind;

export async function publicPlanMetadata({ params, searchParams }: PageProps, at: PlanPageAt = 'plans'): Promise<Metadata> {
  const { id } = await params;
  const token = await inviteFrom(searchParams);
  const { data: plan } = await fetchPublicPlan(id, token, await openFrom(searchParams), await guestKeyFor(id));
  const base = { robots: { index: false, follow: false } };
  if (!plan) {
    return { ...base, title: 'Plan not available | Pantopus', description: "This plan isn't available." };
  }
  if (isPrivateOnly(plan)) {
    return { ...base, title: 'A private plan | Pantopus', description: 'Only the people invited can see this plan.' };
  }
  // A guest's own page (H1) says only the plan's card in its preview: never a place.
  if (plan.answer && plan.title) {
    return { ...base, title: `${plan.title} | Pantopus`, description: [KIND_LABEL[plan.kind], whenText(plan), whereText(plan)].filter(Boolean).join(' · ') };
  }
  // A texted invitation's preview says whose it is. Its page goes to someone who may not have the app yet, so
  // Safari's banner, which drops the invitation through an install, stays off; the page's buttons carry it.
  const invitedBy = plan.invite?.available ? `${plan.invite.host_first_name} invited you: ` : '';
  const smartBanner = !plan.invite?.available;
  // A business's kids' class is a public class: it gets the whole card, and a preview like any plan's.
  if (plan.kind === 'playdate' && !plan.business) {
    return {
      ...base,
      ...buildShareMetadata({
        title: `${invitedBy}A playdate ${nearPhrase(plan)}`,
        description: 'Open it in Pantopus with a verified address to see the details and ask to join.',
        path: at === 'plan-link' ? `/plan-link/${id}` : buildPlanPath(id),
        appArgument: buildPlanAppUrl(id),
        smartBanner,
      }),
    };
  }
  const when = whenText(plan);
  // A business's plan names what the business calls it, its place by name and street address, the business (when
  // the place goes by another name) and the price.
  const business = plan.business;
  const businessName = business ? business.name || plan.host?.display_name || '' : '';
  const description = business
    ? [
        labelOf(plan),
        whenRangeText(plan),
        placeText(plan),
        !businessName || plan.place?.name === businessName ? null : `Hosted by ${businessName}`,
        priceText(plan.price) || 'Free',
      ].filter(Boolean).join(' · ')
    : [KIND_LABEL[plan.kind], when, whereText(plan)].filter(Boolean).join(' · ');
  return {
    ...base,
    ...buildShareMetadata({
      title: `${invitedBy}${plan.title || labelOf(plan)}`,
      description: summarizeText(`${description}. ${plan.about || ''}`, 160, description),
      path: at === 'plan-link' ? `/plan-link/${id}` : buildPlanPath(id),
      appArgument: buildPlanAppUrl(id),
      smartBanner,
    }),
  };
}

export default async function PublicPlanView({ params, searchParams, at = 'plans' }: PageProps & { at?: PlanPageAt }) {
  const { id } = await params;
  const token = await inviteFrom(searchParams);
  const open = await openFrom(searchParams);
  const guestKey = await guestKeyFor(id);
  const spotToken = at === 'plan-link' ? await spotFrom(searchParams) : null;
  const [result, viewer, spotRead] = await Promise.all([fetchPublicPlan(id, token, open, guestKey), fetchPlanViewer(id),
    spotToken ? fetchSpot(id, spotToken) : Promise.resolve({ spot: null, failed: false })]);
  const spot = spotRead.spot;
  const plan = result.data;
  const userAgent = (await headers()).get('user-agent') || '';
  const invite = plan?.invite ?? null;
  const linkPage = at === 'plan-link';
  // Preserve the original invitation through a failed read. Once loaded, an
  // invitation taken back opens the plan as any ordinary share does.
  const query = token && !plan ? `?invite=${encodeURIComponent(token)}` : inviteQuery(token, invite);
  // Opened with the plan's live open link (contract 6.9): "Open app" opens the app with it, and the app claims it and
  // answers as the person. Always the app's own link then, never this site's /plans/ address.
  const openQuery = open && plan?.answer?.open_live ? `?open=${encodeURIComponent(open)}` : '';
  // Opened with a buyer's link (one person pays for the group): "Open app" and the install carry the spot in the same
  // form, pantopus:///plans/<id>?spot=<token>, so the app offers the spot already bought instead of a paid join. Only
  // while the business takes it (the server's spot read answered).
  const spotQuery = spotToken && (spot || spotRead.failed) ? `?spot=${encodeURIComponent(spotToken)}` : '';
  const appQuery = openQuery || spotQuery || query;
  const universal = !linkPage && !openQuery;
  const appUrl = `${buildPlanAppUrl(id)}${spotQuery || query}`;
  const linkHref = universal ? `${buildPlanShareUrl(id)}${query}` : null;
  // Getting the app from this page carries the same link through the install.
  const path = `${buildPlanPath(id)}${appQuery}`;
  // "Try again" reloads this page as it was opened.
  // A buyer's link keeps its spot through a failed read, so trying again never lands on the paid join (08-extras 7).
  const retryPath = `${linkPage ? `/plan-link/${id}` : buildPlanPath(id)}${open ? `?open=${encodeURIComponent(open)}` : spotQuery || query}`;
  const storeCta = getStoreDownloadCta(userAgent, path);
  const fallbackUrl = storeCta?.href ?? null;
  const copyPath = storeCta?.copyPath ?? null;
  const platform = storePlatform(userAgent);

  if (!plan && result.status === 404) notFound();

  if (!plan) {
    return (
      <main className="min-h-screen bg-app text-app-text">
        <div className="mx-auto w-full max-w-md">
          <TopBar id={id} fallbackUrl={fallbackUrl} copyPath={copyPath} query={spotQuery || query} universal={!linkPage} />
          <div className="flex flex-col gap-4 px-4 pt-10 text-center">
            <h1 className="text-xl font-semibold">Couldn&apos;t load this plan</h1>
            <p className="text-sm text-app-text-secondary">Something went wrong. Please try again.</p>
            <a href={retryPath} className={PRIMARY_BUTTON}>
              Try again
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (plan.removed && isPrivateOnly(plan)) {
    // A guest the host removed (H1): the invitation is no longer open, and nothing else.
    return (
      <main className="min-h-screen bg-app text-app-text">
        <div className="mx-auto w-full max-w-md pb-10">
          <TopBar id={id} fallbackUrl={fallbackUrl} copyPath={copyPath} query="" universal={!linkPage} />
          <div className="flex flex-col gap-4 px-4 pt-[18px]">
            <div className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-app-surface-sunken text-app-text-strong">
                <LockIcon className="h-[22px] w-[22px]" />
              </span>
              <h1 className="text-[17px] font-semibold leading-[22px]">This invitation is no longer open.</h1>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (plan.answer && plan.kind) {
    // A guest without an account (H1): the invitation and its form, the wait, or their part (boards W1 to W3).
    const hostShort = plan.host?.display_name || 'Someone';
    const hostFirst = firstNameOf(hostShort);
    return (
      <main className="min-h-screen bg-app text-app-text">
        <div className="mx-auto w-full max-w-md pb-10">
          <TopBar id={id} fallbackUrl={fallbackUrl} copyPath={copyPath} query={appQuery} universal={universal} />
          <div className="px-4 pt-[18px]">
            <OpenPlanOnWeb id={id} token={token && invite ? token : null} open={openQuery ? open : null} />
            <GuestAnswer
              planId={id}
              plan={plan}
              hostFirst={hostFirst}
              hostShort={hostShort}
              hostAvatar={<HostAvatar name={hostShort} avatarUrl={plan.host?.avatar_url ?? null} />}
              when={whenText(plan)}
              area={whereText(plan)}
              open={open}
              invite={token}
              emailHint={invite?.email_hint ?? null}
              // The store for this device (/get chooses it). The plan's own link isn't carried through the install:
              // a guest has no account for the app to open it with.
              storeHref={IOS_APP_STORE_URL || ANDROID_PLAY_STORE_URL ? '/get' : null}
              mapsBase={platform === 'ios' ? 'apple' : 'google'}
              // The calendar's link: the guest's page, which no app opens (contract 6.9).
              pageUrl={planLinkUrl(id)}
            />
          </div>
        </div>
      </main>
    );
  }

  if (isPrivateOnly(plan)) {
    // The host and the people invited see it in the app; this page never learns anything about the plan.
    const mine = Boolean(viewer);
    return (
      <main className="min-h-screen bg-app text-app-text">
        <div className="mx-auto w-full max-w-md pb-10">
          <TopBar id={id} fallbackUrl={fallbackUrl} copyPath={copyPath} query="" universal={!linkPage} />
          <div className="flex flex-col gap-4 px-4 pt-[18px]">
            <div className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-app-surface-sunken text-app-text-strong">
                <LockIcon className="h-[22px] w-[22px]" />
              </span>
              <div className="flex flex-col gap-1">
                <h1 className="text-[17px] font-semibold leading-[22px]">This plan is private</h1>
                <p className="text-sm leading-5 text-app-text-secondary">
                  {mine
                    ? 'Only the people invited can see it. Open it in the Pantopus app.'
                    : 'Only the people its host invites can see it. If you were invited, use the link in your own invitation, or open the Pantopus app.'}
                </p>
              </div>
            </div>
            {mine && <OpenPlanOnWeb id={id} />}
            <OpenInAppButton
              appUrl={buildPlanAppUrl(id)}
              linkHref={linkPage ? null : buildPlanShareUrl(id)}
              fallbackUrl={fallbackUrl}
              copyPath={copyPath}
              className={PRIMARY_BUTTON}
            >
              Open in Pantopus
            </OpenInAppButton>
            <StoreButtons path={buildPlanPath(id)} copyPath={copyPath} />
          </div>
        </div>
      </main>
    );
  }

  if (plan.kind === 'playdate' && !plan.business) {
    // The host and families who are in see their own playdate's details in the app, as everyone does.
    const mine = viewer?.role === 'host' || viewer?.role === 'guest';
    const invitedBy = invite?.available && !mine ? invite.host_first_name : null;
    return (
      <main className="min-h-screen bg-app text-app-text">
        <div className="mx-auto w-full max-w-md pb-10">
          <TopBar id={id} fallbackUrl={fallbackUrl} copyPath={copyPath} query={query} universal={!linkPage} />
          <div className="flex flex-col gap-4 px-4 pt-[18px]">
            {invitedBy ? <p className="text-sm leading-5 text-app-text-secondary">{invitedBy} invited you to their playdate.</p> : null}
            <KindTag kind="playdate" />
            <h1 className="text-2xl font-bold leading-[30px] tracking-[-0.015em]">
              {viewer?.role === 'host' ? 'Your playdate' : 'A playdate'} {nearPhrase(plan)}
            </h1>
            <div className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-app-surface-sunken text-app-text-strong">
                <LockIcon className="h-[22px] w-[22px]" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-[17px] font-semibold leading-[22px]">
                  Playdate details stay in the app
                </h2>
                <p className="text-sm leading-5 text-app-text-secondary">
                  {viewer?.role === 'host'
                    ? "Open it in the Pantopus app to see who asked to join and who's going."
                    : viewer?.role === 'guest'
                      ? "You're in. Open it in the Pantopus app to see the time, the place and who's going."
                      : invitedBy
                        ? "Open it in the Pantopus app to see the time, the place and who's going, and to say you're in."
                        : "Open it in the Pantopus app to see the time, the place and who's going, and to ask to join."}
                </p>
              </div>
            </div>
            <OpenPlanOnWeb id={id} token={token && invite ? token : null} />
            <OpenInAppButton
              appUrl={appUrl}
              linkHref={linkHref}
              fallbackUrl={fallbackUrl}
              copyPath={copyPath}
              className={PRIMARY_BUTTON}
            >
              Open in Pantopus
            </OpenInAppButton>
            <StoreButtons path={path} copyPath={copyPath} />
            <JustInstalledHint what="this playdate" emailHint={invitedBy ? invite?.email_hint : null} platform={platform} />
            <p className="text-center text-xs leading-4 text-app-text-secondary">{PLAYDATE_CAPTION}</p>
          </div>
        </div>
      </main>
    );
  }

  // A business's plan (board D6): every part it adds below is behind `business`.
  const business = plan.business ?? null;
  const hostName = business
    ? business.name || plan.host?.display_name || 'A business'
    : plan.host?.display_name || 'Someone';
  const when = whenText(plan);
  const whenRange = business ? whenRangeText(plan) : null;
  const over = plan.state === 'cancelled' || plan.state === 'ended';
  // An online plan has no map and no area: "Online", and its link only in the app (never a business's plan).
  const online = isOnline(plan) && !business;
  // Someone who is in, or already asked, opens the plan in the app rather than joining.
  const joined = viewer?.role === 'host' || viewer?.role === 'guest'
    || (!over && (viewer?.requestStatus === 'pending' || viewer?.requestStatus === 'waitlisted'));
  // An invitation is the host's yes: in the app, the person just says they're in.
  const invited = Boolean(invite?.available) && !over && !joined;
  // A business's paid plan: paid on this page after signing in (B3) when the server sends the price's words, which it
  // does while the business takes payment here; otherwise in the app.
  // Opened with a buyer's link (one person pays for the group): "{Chris} got you a spot", taken here (or in the app,
  // "Open app" carries the spot), free, instead of paying. A link that has stopped or is used up says so in the server's
  // words and then shows the ordinary page, unless this person already took a spot.
  const spotShown = Boolean(business && spot && spotToken) && !over && viewer?.role !== 'host';
  // The offer couldn't be read (not the server's "not available"): keep the token, offer no paid join, read it again.
  const spotUnread = Boolean(business && spotRead.failed && spotToken) && !over && viewer?.role !== 'host';
  const claimsSpot = (spotShown && Boolean(spot?.open || viewer?.role === 'guest')) || spotUnread;
  const paysHere = Boolean(business && plan.price?.text) && !over && viewer?.role !== 'host' && !claimsSpot;
  const paysInApp = Boolean(business && priceText(plan.price)) && !over && !joined && !paysHere && !claimsSpot;
  const joinNow = [(await searchParams).join].flat()[0] === '1';

  return (
    <main className="min-h-screen bg-app text-app-text">
      <div className="mx-auto w-full max-w-md pb-10">
        <TopBar id={id} fallbackUrl={fallbackUrl} copyPath={copyPath} query={spotQuery || query} universal={!linkPage} />
        <div className="flex flex-col gap-4 px-4 pt-[18px]">
          <p className="text-sm leading-5 text-app-text-secondary">{introText(plan, hostName, viewer, over, invite)}</p>
          {invite && !invite.available && !over ? (
            <p className="text-sm leading-5 text-app-text-secondary">
              This invitation isn&apos;t available anymore. You can still ask to join in the app.
            </p>
          ) : null}

          <section
            className="overflow-hidden rounded-[20px] border border-app-border bg-app-surface shadow-sm"
            aria-labelledby="plan-title"
          >
            {online ? <OnlineHero kind={plan.kind} /> : <MiniMap kind={plan.kind} placeName={business ? plan.place?.name || null : null} />}
            <div className="flex flex-col gap-2 px-4 pb-4 pt-[14px]">
              <div className="flex flex-wrap items-center gap-2">
                <KindTag kind={plan.kind} label={business ? plan.label_text : plan.occasion?.text || null} />
                {online ? <OnlineChip /> : null}
                {plan.private ? <PrivateChip /> : null}
              </div>
              <h1 id="plan-title" className="text-xl font-semibold leading-[26px] tracking-[-0.012em]">
                {plan.title || labelOf(plan)}
              </h1>
              {business ? (
                <>
                  {whenRange ? (
                    <p className="text-sm leading-5 text-app-text-strong [font-variant-numeric:tabular-nums]">{whenRange}</p>
                  ) : null}
                  <p className="text-sm leading-5 text-app-text-strong">{placeText(plan)}</p>
                  <BusinessHost business={business} name={hostName} named={Boolean(plan.place?.name) && plan.place?.name !== hostName} />
                </>
              ) : (
                <>
                  <p className="text-sm leading-5 text-app-text-strong [font-variant-numeric:tabular-nums]">
                    {[when, whereText(plan)].filter(Boolean).join(' · ')}
                  </p>
                  {repeatText(plan) ? (
                    <p className="text-sm leading-5 text-app-text-secondary [font-variant-numeric:tabular-nums]">{repeatText(plan)}</p>
                  ) : null}
                  <div className="flex items-center gap-[10px]">
                    <HostAvatar name={hostName} avatarUrl={plan.host?.avatar_url ?? null} />
                    <span className="flex flex-wrap items-center gap-x-2 text-sm leading-5">
                      <span className="font-semibold">{hostName}</span>
                      {plan.host?.verified_address ? <VerifiedBadge /> : null}
                    </span>
                  </div>
                </>
              )}
              {over ? (
                <p className="text-sm font-semibold leading-5 text-app-text-strong">
                  {plan.state === 'cancelled' ? 'This plan was cancelled.' : 'This plan has ended.'}
                </p>
              ) : business ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm leading-5 text-app-text-secondary">{goingText(plan)}</p>
                  <PriceChip price={plan.price} />
                </div>
              ) : (
                <p className="text-sm leading-5 text-app-text-secondary">{goingText(plan)}</p>
              )}
            </div>
          </section>

          {spotUnread && spotToken ? <SpotUnread retryHref={`/plan-link/${id}?spot=${encodeURIComponent(spotToken)}`} /> : null}
          {spotShown && spot && spotToken ? (
            <ClaimSpot
              planId={id}
              token={spotToken}
              spot={spot}
              signedIn={Boolean(viewer)}
              joinNow={joinNow}
              alreadyIn={viewer?.role === 'guest'}
              place={placeText(plan)}
            />
          ) : null}
          {paysHere && plan.price?.text ? (
            <PayToJoin
              planId={id}
              plan={viewer?.booking}
              signedIn={Boolean(viewer)}
              joinNow={joinNow}
              priceText={plan.price.text}
              refundText={plan.price.refund_text || null}
              returnPath={linkPage ? `/plan-link/${id}` : buildPlanPath(id)}
              title={plan.title || labelOf(plan)}
              startsAt={plan.starts_at ?? null}
              endsAt={plan.ends_at ?? null}
              place={placeText(plan)}
              paid={viewer?.role === 'guest' ? viewer.paid : null}
              waiting={viewer?.requestStatus === 'waitlisted'}
            />
          ) : null}
          {business ? (
            paysInApp ? (
              <div className="flex items-start gap-[10px] text-sm leading-5 text-app-text-secondary">
                <PayIcon className="mt-0.5 h-4 w-4" />
                <span>You pay in the app when you join.</span>
              </div>
            ) : null
          ) : (
            <div className="flex items-start gap-[10px] text-sm leading-5 text-app-text-secondary">
              <LockIcon className="mt-0.5 h-4 w-4" />
              <span>
                {online
                  ? viewer?.role === 'host'
                    ? 'The link goes only to people you let in.'
                    : viewer?.role === 'guest'
                      ? 'You see the link in the app.'
                      : invited
                        ? 'You see the link in the app once you say you’re in.'
                        : 'The link goes only to people the host lets in.'
                  : viewer?.role === 'host'
                    ? 'The exact place goes only to people you let in.'
                    : viewer?.role === 'guest'
                      ? 'You see the exact place in the app.'
                      : invited
                        ? 'You see the exact place in the app once you say you’re in.'
                        : 'The exact place goes only to people the host lets in.'}
              </span>
            </div>
          )}

          <OpenPlanOnWeb id={id} token={token && invite ? token : null} open={openQuery ? open : null} />
          <OpenInAppButton
            appUrl={appUrl}
            linkHref={linkHref}
            fallbackUrl={fallbackUrl}
            copyPath={copyPath}
            className={PRIMARY_BUTTON}
          >
            {joined
              ? 'Open in Pantopus'
              : over
                ? 'See plans near you in Pantopus'
                : invited
                  ? 'Open in Pantopus to say you’re in'
                  : 'Open in Pantopus to join'}
          </OpenInAppButton>
          <StoreButtons path={path} copyPath={copyPath} />
          <JustInstalledHint what="this plan" emailHint={invited ? invite?.email_hint : null} platform={platform} />
          <p className="text-center text-xs leading-4 text-app-text-secondary">
            {plan.private
              ? `Only the people ${firstNameOf(hostName)} invites can see this plan.`
              : business ? BUSINESS_CAPTION : PLAYDATE_CAPTION}
          </p>
        </div>
      </div>
    </main>
  );
}
