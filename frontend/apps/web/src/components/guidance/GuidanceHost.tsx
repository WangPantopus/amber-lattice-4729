'use client';

// ============================================================
// GuidanceHost: decides when a guidance card shows (GUIDE SPEC §2). Mounted once in the
// app shell; it replaced the web's seven older promo pop-ups (founder decision 4).
//
// - Nothing shows unless the profile's `guidance.enabled` is true (a top-level key of GET /api/users/profile). New accounts (under
//   14 days) get the tab cards and pointers; business accounts get none.
// - Never over something else: the daily briefings notice (and until it has been
//   answered), the name prompt, a composer, the menu drawer, any open dialog, menu or
//   list, a field being typed in, a full-screen viewer, or a Christmas card link that is
//   still deciding where the first load lands. It waits until the page is plain.
// - About half a second after a tab screen has loaded, never while the page scrolls;
//   at most one card per visit, and one on screen.
// - A tab's own card shows on the first open of that tab; every other card is limited
//   to one per app open. Pointers start on the second app open, in the spec's order,
//   each only where its control is on screen.
// - Closing a card any way counts as seen (store.ts records and sends it).
// Outside production builds, local storage `PANTOPUS_DEBUG_GUIDANCE=<card id>` forces
// a card on the next plain tab screen (for checking), until it closes.
// ============================================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import { useNotificationPreferences } from '@/lib/me';
import { launchFeatures } from '@/lib/featureFlags';
import { FEED_POST_CREATED_EVENT } from '@/lib/feedComposerEvents';
import {
  ACTIVE_INTRODUCTIONS, CENTRE_CARD_IDS, KNOWN_CARD_IDS, POINTERS, REMINDER_IDS, TAB_CARD_IDS, addAddressCard,
  connectedCard, firstLetterCard, firstPostCard, homeSetUpCard, householdCard, introductionCard, inviteCard, mailCard,
  placeSavedCard, pointerById, pulseCard, setUpHomeCard, todayCard, verifiedCard, verifyReminderCard, welcomeCard,
  type CentreCardContent, type PointerContent,
} from './cards';
import { PICKUP_EDITOR_HASH } from '@/components/place/detail/pickupSaved';
import GuidanceCard from './GuidanceCard';
import GuidancePointer from './GuidancePointer';
import { currentScreen, screenForPath, subscribeScreen, type GuidanceScreenReport } from './screens';
import { subscribeReplay, takeReplay } from './replay';
import { setProfileGuidance, useProfileGuidance } from './profileGuidance';
import {
  allSeen, appOpenNumber, countVisit, flushPending, isSeen, markShownThisOpen, mergeServerSeen, noteVisibility,
  oneShownThisOpen, recordSeen, seenEntry, startAppOpen, type GuidanceScreenName,
} from './store';

export const DEBUG_GUIDANCE_KEY = 'PANTOPUS_DEBUG_GUIDANCE';
const SETTLE_MS = 500;
const TICK_MS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

type Active =
  | { kind: 'card'; card: CentreCardContent; replay?: boolean; forced?: boolean; facts?: GuidanceScreenReport['facts'] }
  | { kind: 'pointer'; pointer: PointerContent; anchor: Element; forced?: boolean };

interface HostUser {
  id: string;
  accountType?: string;
  /** The account's sign-up (GET /api/users/profile `createdAt`). */
  createdAt?: string;
  created_at?: string;
}

/** The forced card, honoured only outside production builds. */
function forcedCardId(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  try {
    const id = window.localStorage.getItem(DEBUG_GUIDANCE_KEY);
    return id && KNOWN_CARD_IDS.includes(id) ? id : null;
  } catch {
    return null;
  }
}

function clearForced(): void {
  if (process.env.NODE_ENV === 'production') return;
  try { window.localStorage.removeItem(DEBUG_GUIDANCE_KEY); } catch { /* nothing kept */ }
}

function shown(el: Element): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Something else is up (GUIDE SPEC §2 "Never covers something else"). */
function pageIsBusy(): boolean {
  if (document.fullscreenElement) return true;
  const open = document.querySelectorAll('[aria-modal="true"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-notification-panel], #mobile-navigation');
  for (const el of Array.from(open)) if (shown(el)) return true;
  const at = document.activeElement;
  if (at instanceof HTMLElement && (at.isContentEditable
    || at.matches('textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"])'))) return true;
  return false;
}

/** A Christmas card link may still move the first load off this screen (cardDoors useWaitingCardLanding). */
function cardLandingPending(userId: string): boolean {
  if (!(launchFeatures.holidayCards && launchFeatures.mailbox)) return false;
  try { return window.localStorage.getItem(`pantopus_card_waiting_asked:${userId}`) == null; } catch { return false; }
}

/** The control, if it is fully on screen and nothing covers its middle. */
function findAnchor(testId: string): Element | null {
  const all = document.querySelectorAll(`[data-testid="${testId}"]`);
  for (const el of Array.from(all)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && (hit === el || el.contains(hit))) return el;
  }
  return null;
}

function tabCardFor(userId: string, screen: GuidanceScreenReport, computer: boolean): CentreCardContent | null {
  switch (screen.name) {
    case 'place':
      if (!isSeen(userId, 'welcome')) return welcomeCard({ computer, invited: !!screen.facts.invited });
      if (screen.facts.savedAddress && !isSeen(userId, 'place_saved')) return placeSavedCard();
      return null;
    case 'today':
      return isSeen(userId, 'tab_today') ? null : todayCard({ aroundYou: !!findAnchor('todayHalfToggle') });
    case 'mail':
      return !launchFeatures.mailbox || isSeen(userId, 'tab_mail') ? null : mailCard({ letters: launchFeatures.mailExtras });
    case 'pulse':
      return isSeen(userId, 'tab_pulse') ? null : pulseCard();
    default:
      return null;
  }
}

/** A centre card's content for this screen, whatever its record (the force switch). */
function centreCardById(id: string, screen: GuidanceScreenReport, computer: boolean): CentreCardContent | null {
  switch (id) {
    case 'welcome': return welcomeCard({ computer, invited: !!screen.facts.invited });
    case 'place_saved': return placeSavedCard();
    case 'tab_today': return todayCard({ aroundYou: !!findAnchor('todayHalfToggle') });
    case 'tab_mail': return mailCard({ letters: launchFeatures.mailExtras });
    case 'tab_pulse': return pulseCard();
    case 'done_home_setup': return homeSetUpCard({ needsPickupDay: !!screen.facts.home?.needsPickupDay });
    case 'done_verified': return verifiedCard({ mailbox: launchFeatures.mailbox });
    case 'done_first_post': return firstPostCard();
    case 'done_connected': return connectedCard();
    case 'done_first_letter': return firstLetterCard();
    case 'done_household': return householdCard();
    case 'next_add_address': return addAddressCard();
    case 'next_setup_home': return setUpHomeCard();
    case 'next_verify': return verifyReminderCard();
    case 'next_invite': return inviteCard();
    default: return introductionCard(id);
  }
}

function olderThan(iso: string | null | undefined, days: number): boolean {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) && Date.now() - at >= days * DAY_MS;
}

/** At most one reminder a week across 24-27, and never on a day another centre card showed. */
function reminderDayOpen(userId: string): boolean {
  const seen = allSeen(userId);
  const lastReminder = Math.max(0, ...REMINDER_IDS.map((id) => Date.parse(seen[id]?.last_at ?? '') || 0));
  if (Date.now() - lastReminder < 7 * DAY_MS) return false;
  const today = new Date().toDateString();
  return !CENTRE_CARD_IDS.some((id) => seen[id] && new Date(seen[id].last_at).toDateString() === today);
}

interface CardContext {
  screen: GuidanceScreenReport;
  hasPosted: boolean | undefined;
  members: number | undefined;
  connected: boolean | undefined;
  createdAt: string | undefined;
}

/** 16-23: right after the app's own success, or on the next visit to the named screen (one per app open). */
function afterActionCard(userId: string, { screen, hasPosted, members, connected }: CardContext): CentreCardContent | null {
  const f = screen.facts;
  const fresh = (id: string) => !isSeen(userId, id);
  switch (screen.name) {
    case 'place':
      if (f.home && !f.invited && fresh('done_home_setup')) return homeSetUpCard({ needsPickupDay: !!f.home.needsPickupDay });
      if (f.home?.verified && fresh('done_verified')) return verifiedCard({ mailbox: launchFeatures.mailbox });
      if (f.home && members !== undefined && members >= 2 && fresh('done_household')) return householdCard();
      return null;
    case 'pulse':
      return hasPosted === true && fresh('done_first_post') ? firstPostCard() : null;
    case 'mail':
      return f.sentAny && fresh('done_first_letter') ? firstLetterCard() : null;
    case 'messages':
      return connected === true && fresh('done_connected') ? connectedCard() : null;
    default:
      return null;
  }
}

/** 24-27 on Place: each at most twice, and only while its condition is still true. */
function reminderCard(userId: string, { screen, members, createdAt }: CardContext): CentreCardContent | null {
  if (screen.name !== 'place' || !reminderDayOpen(userId)) return null;
  const f = screen.facts;
  const left = (id: string) => (seenEntry(userId, id)?.times ?? 0) < 2;
  if (f.empty && olderThan(createdAt, 2) && left('next_add_address')) return addAddressCard();
  if (f.savedAddress && !f.hasHome && f.savedPlaceId && olderThan(f.savedAt, 3) && left('next_setup_home')) return setUpHomeCard();
  if (f.home && !f.home.verified && olderThan(f.home.setUpAt, 7) && left('next_verify')) return verifyReminderCard();
  if (f.home && members === 1 && olderThan(f.home.setUpAt, 7) && left('next_invite')) return inviteCard();
  return null;
}

interface PointerContext {
  screen: GuidanceScreenReport;
  visit: number;
  computer: boolean;
  hasPosted: boolean | undefined;
}

/** A pointer's own condition (SPEC §5 table), before its control is looked for. */
function pointerApplies(id: string, { screen, visit, computer, hasPosted }: PointerContext): boolean {
  switch (id) {
    case 'tip_ask': return screen.name === 'place';
    case 'tip_messages': return screen.name === 'place' || screen.name === 'today' || screen.name === 'pulse';
    case 'tip_menu': return !computer && screen.name !== 'messages';
    case 'tip_verify': return screen.name === 'place' && !!screen.facts.verifiable && visit >= 2;
    case 'tip_place_row': return screen.name === 'place';
    case 'tip_pulse_post': return screen.name === 'pulse' && visit >= 2 && hasPosted === false;
    case 'tip_pulse_area': return screen.name === 'pulse' && visit >= 3;
    case 'tip_mail_me_home': return screen.name === 'mail' && visit >= 2;
    default: return false;
  }
}

export default function GuidanceHost({
  user,
  computer,
  blocked,
}: {
  user: HostUser | null;
  /** The computer layout (the sidebar): no bottom tabs and no ☰. */
  computer: boolean;
  /** The shell has something up: the name prompt, a composer, the menu drawer, the "Save privately" preview. */
  blocked: boolean;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  // The profile's top-level `guidance`, from the profile the shell already loads.
  const guidance = useProfileGuidance(userId);
  const screen = useSyncExternalStore(subscribeScreen, currentScreen, () => null);
  const prefs = useNotificationPreferences({ enabled: !!userId });
  const [active, setActive] = useState<Active | null>(null);
  const visit = useRef<{ path: string | null; screen: GuidanceScreenName | null; n: number; shown: boolean }>({ path: null, screen: null, n: 0, shown: false });
  const lastScroll = useRef(0);

  useEffect(() => api.users.onProfileGuidance((state, id) => { if (id) setProfileGuidance(id, state); }), []);

  // App opens: this page load, and a return after 30 minutes in the background.
  useEffect(() => {
    if (!userId) return;
    startAppOpen(userId);
    const onVisibility = () => noteVisibility(userId, document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [userId]);

  // The server's record wins on every profile load; undelivered closes are sent again.
  useEffect(() => {
    if (!userId || !guidance) return;
    mergeServerSeen(userId, guidance);
    if (guidance.enabled) void flushPending(userId);
  }, [userId, guidance]);
  useEffect(() => {
    if (!userId) return;
    const retry = () => { void flushPending(userId); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [userId]);

  // Visits to each tab screen (kept on this device).
  useEffect(() => {
    if (!userId || visit.current.path === pathname) return;
    const name = screenForPath(pathname);
    visit.current = { path: pathname, screen: name, n: name ? countVisit(userId, name) : 0, shown: false };
  }, [pathname, userId]);

  // Never while the page scrolls.
  useEffect(() => {
    const onScroll = () => { lastScroll.current = Date.now(); };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('touchmove', onScroll);
    };
  }, []);

  // "Tips for each screen" asks for a card again.
  useEffect(() => subscribeReplay(() => {
    const card = takeReplay();
    if (card) setActive({ kind: 'card', card, replay: true });
  }), []);

  // Cards are on for this account (introductions); new accounts (under 14 days) get cards 1-27.
  const cardsOn = !!userId && user?.accountType !== 'business' && !!guidance?.enabled;
  const eligible = cardsOn && !!guidance?.new_account;
  const visitNumber = visit.current.screen === screen?.name ? visit.current.n : 0;
  // Whether this person has posted: "Post to Pulse" (no post yet) and "Your post is up", asked only on Pulse.
  const wantsPostCheck = eligible && screen?.name === 'pulse' && !!userId
    && ((visitNumber >= 2 && !isSeen(userId, 'tip_pulse_post')) || !isSeen(userId, 'done_first_post'));
  const posted = useQuery({
    queryKey: ['guidance', 'has-posted', userId],
    queryFn: async () => ((await api.posts.getUserPosts(userId as string, { limit: 1 })).posts ?? []).length > 0,
    enabled: wantsPostCheck,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const hasPosted = posted.data;
  // The members of the home Place shows: "Your household" (2 or more) and "Invite your household" (only you).
  const placeHome = screen?.name === 'place' ? screen.facts.home : undefined;
  const wantsMembers = eligible && !!placeHome && !!userId
    && (!isSeen(userId, 'done_household') || ((seenEntry(userId, 'next_invite')?.times ?? 0) < 2 && olderThan(placeHome.setUpAt, 7)));
  const occupants = useQuery({
    queryKey: ['guidance', 'members', placeHome?.id],
    queryFn: async () => (await api.homes.getHomeOccupants(placeHome?.id as string)).occupants?.length ?? 0,
    enabled: wantsMembers,
    staleTime: 60_000,
    retry: false,
  });
  const members = occupants.data;
  // A connection, either way: "You're connected" on Messages, asked only there and only until it has shown.
  const wantsConnections = eligible && screen?.name === 'messages' && !!userId && !isSeen(userId, 'done_connected');
  const connections = useQuery({
    queryKey: ['guidance', 'connected', userId],
    queryFn: async () => ((await api.relationships.getConnections({ limit: 1 })).relationships ?? []).length > 0,
    enabled: wantsConnections,
    staleTime: 60_000,
    retry: false,
  });
  const connected = connections.data;
  const createdAt = user?.createdAt ?? user?.created_at;

  // A post just went up: "Your post is up" may follow the app's "Posted!" on this same visit.
  const [actionTick, setActionTick] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const onPosted = () => {
      queryClient.setQueryData(['guidance', 'has-posted', userId], true);
      visit.current.shown = false;
      setActionTick((n) => n + 1);
    };
    window.addEventListener(FEED_POST_CREATED_EVENT, onPosted);
    return () => window.removeEventListener(FEED_POST_CREATED_EVENT, onPosted);
  }, [userId, queryClient]);

  const briefingPending = !!userId && !prefs.isError && (prefs.data === undefined || !prefs.data.daily_briefing_prompted_at);

  const choose = useCallback((report: GuidanceScreenReport): Active | null => {
    if (!userId) return null;
    const forced = forcedCardId();
    if (forced) {
      const pointer = pointerById(forced);
      if (!pointer) {
        const card = centreCardById(forced, report, computer);
        return card ? { kind: 'card', card, forced: true, facts: report.facts } : null;
      }
      const anchor = findAnchor(pointer.anchor);
      return anchor ? { kind: 'pointer', pointer, anchor, forced: true } : null;
    }
    if (!cardsOn || visit.current.screen !== report.name) return null;
    const context: CardContext = { screen: report, hasPosted, members, connected, createdAt };
    if (eligible && !visit.current.shown) {
      const tab = tabCardFor(userId, report, computer);
      if (tab) return { kind: 'card', card: tab };
    }
    if (oneShownThisOpen()) return null;
    // Right after doing something: not held back by a card shown earlier on this visit.
    const done = eligible ? afterActionCard(userId, context) : null;
    if (done) return { kind: 'card', card: done, facts: report.facts };
    if (visit.current.shown) return null;
    // Introductions: older accounts too (none is switched on yet).
    const intro = ACTIVE_INTRODUCTIONS.find((id) => !isSeen(userId, id));
    const introCard = intro ? introductionCard(intro) : null;
    if (introCard) return { kind: 'card', card: introCard };
    if (!eligible) return null;
    const reminder = reminderCard(userId, context);
    if (reminder) return { kind: 'card', card: reminder, facts: report.facts };
    if (appOpenNumber() >= 2) {
      const pointerContext: PointerContext = { screen: report, visit: visit.current.n, computer, hasPosted };
      for (const pointer of POINTERS) {
        if (isSeen(userId, pointer.id) || !pointerApplies(pointer.id, pointerContext)) continue;
        const anchor = findAnchor(pointer.anchor);
        if (anchor) return { kind: 'pointer', pointer, anchor };
      }
    }
    return null;
  }, [userId, cardsOn, eligible, computer, hasPosted, members, connected, createdAt]);

  // The wait: half a second after the screen loaded, the page still and plain.
  useEffect(() => {
    if (!userId || active || !screen) return;
    if (!cardsOn && !forcedCardId()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    const tick = () => {
      timer = null;
      const report = currentScreen();
      if (!report || report.token !== screen.token) return;
      const now = Date.now();
      const wait = Math.max(report.readyAt + SETTLE_MS - now, lastScroll.current + SETTLE_MS - now);
      if (wait > 0) { timer = setTimeout(tick, wait); return; }
      if (blocked || briefingPending || cardLandingPending(userId) || pageIsBusy()) { timer = setTimeout(tick, TICK_MS); return; }
      const next = choose(report);
      if (next) {
        visit.current.shown = true;
        if (!next.forced && (next.kind === 'pointer' || !(TAB_CARD_IDS as readonly string[]).includes(next.card.id))) markShownThisOpen();
        setActive(next);
        return;
      }
      // A control can arrive a moment after its screen (late rows): look a few more times.
      if (++tries < 4) timer = setTimeout(tick, 1000);
    };
    timer = setTimeout(tick, 0);
    return () => { if (timer) clearTimeout(timer); };
  }, [userId, cardsOn, active, screen, blocked, briefingPending, choose, actionTick]);

  const activeRef = useRef<{ active: Active; path: string } | null>(null);
  useEffect(() => {
    activeRef.current = active ? { active, path: activeRef.current?.active === active ? activeRef.current.path : pathname } : null;
  }, [active, pathname]);

  // Every way a card closes counts as seen, except a replay from "Tips for each screen".
  // A reminder's button also opens its next step, and so does “Set pickup day” on “Your home is set up”.
  const runAction = useCallback((card: CentreCardContent, facts: GuidanceScreenReport['facts'] | undefined) => {
    const homeId = facts?.home?.id;
    switch (card.action) {
      case 'add_address':
        router.push('/start');
        break;
      case 'setup_home':
        if (facts?.savedPlaceId) router.push(`/app/homes/new?savedPlace=${encodeURIComponent(facts.savedPlaceId)}`);
        break;
      case 'verify': {
        // A claimed home's “Verify address” opens its sheet; a home set up privately is verified by mail.
        const banner = findAnchor('place.verifyAddress');
        if (banner instanceof HTMLElement) window.setTimeout(() => banner.click(), 0);
        else if (homeId) router.push(`/app/homes/${homeId}/verify-postcard?return=place`);
        break;
      }
      case 'invite':
        if (homeId) router.push(`/app/homes/${homeId}/members?invite=1`);
        break;
      case 'pickup_day': {
        // The pickup editor is on Place's Today page, where “Set your pickup day” goes; a switched place stays switched.
        const switched = new URLSearchParams(window.location.search).get('home');
        router.push(`/app/place/today${switched ? `?home=${encodeURIComponent(switched)}` : ''}${PICKUP_EDITOR_HASH}`);
        break;
      }
      default:
        break;
    }
  }, [router]);

  const close = useCallback((how?: string) => {
    const was = activeRef.current?.active;
    activeRef.current = null;
    setActive(null);
    if (!was || !userId) return;
    if (was.kind === 'card' && how === 'primary' && !was.replay) runAction(was.card, was.facts);
    if (was.kind === 'card' && was.replay) return;
    recordSeen(userId, was.kind === 'card' ? was.card.id : was.pointer.id);
    if (was.forced) clearForced();
  }, [userId, runAction]);

  // Moving to another page (the browser's Back, a link from the keyboard) closes it too.
  useEffect(() => {
    const shownOn = activeRef.current;
    if (shownOn && shownOn.path !== pathname) close();
  }, [pathname, close]);

  if (!active) return null;
  if (active.kind === 'card') return <GuidanceCard key={active.card.id} card={active.card} onClose={close} />;
  return <GuidancePointer key={active.pointer.id} pointer={active.pointer} anchor={active.anchor} onClose={close} />;
}
