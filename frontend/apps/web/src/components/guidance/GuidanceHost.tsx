'use client';

// ============================================================
// GuidanceHost: decides when a guidance card shows (GUIDE SPEC §2). Mounted once in the
// app shell; it replaced the web's seven older promo pop-ups (founder decision 4).
//
// - Nothing shows unless the profile's `guidance.enabled` is true. New accounts (under
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
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import type { GuidanceState } from '@pantopus/types';
import { useNotificationPreferences } from '@/lib/me';
import { launchFeatures } from '@/lib/featureFlags';
import {
  KNOWN_CARD_IDS, POINTERS, TAB_CARD_IDS, mailCard, placeSavedCard, pointerById, pulseCard, todayCard, welcomeCard,
  type CentreCardContent, type PointerContent,
} from './cards';
import GuidanceCard from './GuidanceCard';
import GuidancePointer from './GuidancePointer';
import { currentScreen, screenForPath, subscribeScreen, type GuidanceScreenReport } from './screens';
import { subscribeReplay, takeReplay } from './replay';
import {
  appOpenNumber, countVisit, flushPending, isSeen, markShownThisOpen, mergeServerSeen, noteVisibility,
  oneShownThisOpen, recordSeen, startAppOpen, type GuidanceScreenName,
} from './store';

export const DEBUG_GUIDANCE_KEY = 'PANTOPUS_DEBUG_GUIDANCE';
const SETTLE_MS = 500;
const TICK_MS = 400;

type Active =
  | { kind: 'card'; card: CentreCardContent; replay?: boolean; forced?: boolean }
  | { kind: 'pointer'; pointer: PointerContent; anchor: Element; forced?: boolean };

interface HostUser {
  id: string;
  accountType?: string;
  guidance?: GuidanceState;
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

/** A tab card's content for this screen, whatever its record (the force switch). */
function tabCardById(id: string, screen: GuidanceScreenReport, computer: boolean): CentreCardContent | null {
  switch (id) {
    case 'welcome': return welcomeCard({ computer, invited: !!screen.facts.invited });
    case 'place_saved': return placeSavedCard();
    case 'tab_today': return todayCard({ aroundYou: !!findAnchor('todayHalfToggle') });
    case 'tab_mail': return mailCard({ letters: launchFeatures.mailExtras });
    case 'tab_pulse': return pulseCard();
    default: return null;
  }
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
    case 'tip_messages': return screen.name !== 'mail';
    case 'tip_menu': return !computer;
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
  const userId = user?.id ?? null;
  const guidance = user?.guidance;
  const screen = useSyncExternalStore(subscribeScreen, currentScreen, () => null);
  const prefs = useNotificationPreferences({ enabled: !!userId });
  const [active, setActive] = useState<Active | null>(null);
  const visit = useRef<{ path: string | null; screen: GuidanceScreenName | null; n: number; shown: boolean }>({ path: null, screen: null, n: 0, shown: false });
  const lastScroll = useRef(0);

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

  const eligible = !!userId && user?.accountType !== 'business' && !!guidance?.enabled && guidance.new_account;
  const visitNumber = visit.current.screen === screen?.name ? visit.current.n : 0;
  // "No post yet" for the Pulse pointer, asked only where it could show.
  const wantsPostCheck = eligible && screen?.name === 'pulse' && visitNumber >= 2 && !!userId && !isSeen(userId, 'tip_pulse_post');
  const posted = useQuery({
    queryKey: ['guidance', 'has-posted', userId],
    queryFn: async () => ((await api.posts.getUserPosts(userId as string, { limit: 1 })).posts ?? []).length > 0,
    enabled: wantsPostCheck,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const hasPosted = posted.data;

  const briefingPending = !!userId && !prefs.isError && (prefs.data === undefined || !prefs.data.daily_briefing_prompted_at);

  const choose = useCallback((report: GuidanceScreenReport): Active | null => {
    if (!userId) return null;
    const forced = forcedCardId();
    if (forced) {
      if ((TAB_CARD_IDS as readonly string[]).includes(forced)) {
        const card = tabCardById(forced, report, computer);
        return card ? { kind: 'card', card, forced: true } : null;
      }
      const pointer = pointerById(forced);
      const anchor = pointer ? findAnchor(pointer.anchor) : null;
      return pointer && anchor ? { kind: 'pointer', pointer, anchor, forced: true } : null;
    }
    if (!eligible || visit.current.shown || visit.current.screen !== report.name) return null;
    const tab = tabCardFor(userId, report, computer);
    if (tab) return { kind: 'card', card: tab };
    if (appOpenNumber() >= 2 && !oneShownThisOpen()) {
      const context: PointerContext = { screen: report, visit: visit.current.n, computer, hasPosted };
      for (const pointer of POINTERS) {
        if (isSeen(userId, pointer.id) || !pointerApplies(pointer.id, context)) continue;
        const anchor = findAnchor(pointer.anchor);
        if (anchor) return { kind: 'pointer', pointer, anchor };
      }
    }
    return null;
  }, [userId, eligible, computer, hasPosted]);

  // The wait: half a second after the screen loaded, the page still and plain.
  useEffect(() => {
    if (!userId || active || !screen) return;
    if (!eligible && !forcedCardId()) return;
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
  }, [userId, eligible, active, screen, blocked, briefingPending, choose]);

  const activeRef = useRef<{ active: Active; path: string } | null>(null);
  useEffect(() => {
    activeRef.current = active ? { active, path: activeRef.current?.active === active ? activeRef.current.path : pathname } : null;
  }, [active, pathname]);

  // Every way a card closes counts as seen, except a replay from "Tips for each screen".
  const close = useCallback(() => {
    const was = activeRef.current?.active;
    activeRef.current = null;
    setActive(null);
    if (!was || !userId || (was.kind === 'card' && was.replay)) return;
    recordSeen(userId, was.kind === 'card' ? was.card.id : was.pointer.id);
    if (was.forced) clearForced();
  }, [userId]);

  // Moving to another page (the browser's Back, a link from the keyboard) closes it too.
  useEffect(() => {
    const shownOn = activeRef.current;
    if (shownOn && shownOn.path !== pathname) close();
  }, [pathname, close]);

  if (!active) return null;
  if (active.kind === 'card') return <GuidanceCard key={active.card.id} card={active.card} onClose={close} />;
  return <GuidancePointer key={active.pointer.id} pointer={active.pointer} anchor={active.anchor} onClose={close} />;
}
