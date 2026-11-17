// ============================================================
// Guidance cards: which tab screen is on show and ready, as the screens report it.
//
// A screen mounts <GuidanceScreen> once its content has loaded (not its skeleton), with
// the facts its cards need. The host (GuidanceHost) waits about half a second after
// that, never while the page scrolls, and shows at most one card per visit.
// ============================================================

import type { GuidanceScreenName } from './store';

export interface GuidanceScreenFacts {
  /** Place shows an address the person saved (privately, before setting up a home). */
  savedAddress?: boolean;
  /** Place shows a home that is set up and not verified, with its “Verify address” on screen. */
  verifiable?: boolean;
  /** Every home this person has came by a household invitation: they never typed an address. */
  invited?: boolean;
  /** Place shows no address and no home ("Start with a place that matters to you"). */
  empty?: boolean;
  /** The saved address Place shows, and when it was saved. */
  savedPlaceId?: string;
  savedAt?: string | null;
  /** The home Place shows (not a claim still in review). */
  home?: { id: string; tier: string; verified: boolean; setUpAt: string | null; privateSetup: boolean };
  /** A saved address's view knows whether a home is set up too. */
  hasHome?: boolean;
  /** Mail: this person has sent a letter or a card. */
  sentAny?: boolean;
}

export interface GuidanceScreenReport {
  name: GuidanceScreenName;
  facts: GuidanceScreenFacts;
  /** When the screen said it was ready. */
  readyAt: number;
  token: number;
}

type Listener = () => void;

let current: GuidanceScreenReport | null = null;
let nextToken = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function reportScreen(name: GuidanceScreenName, facts: GuidanceScreenFacts): number {
  const token = nextToken++;
  current = { name, facts, readyAt: Date.now(), token };
  emit();
  return token;
}

export function updateScreenFacts(token: number, facts: GuidanceScreenFacts): void {
  if (!current || current.token !== token) return;
  current = { ...current, facts };
  emit();
}

export function clearScreen(token: number): void {
  if (!current || current.token !== token) return;
  current = null;
  emit();
}

export function subscribeScreen(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function currentScreen(): GuidanceScreenReport | null {
  return current;
}

/** The tab screen a path is (its first screen), or null. */
export function screenForPath(pathname: string): GuidanceScreenName | null {
  if (pathname === '/app/place') return 'place';
  if (pathname === '/app/today' || pathname === '/app/hub/today') return 'today';
  if (pathname === '/app/feed') return 'pulse';
  if (/^\/app\/mailbox\/(?:personal|home|business|earn|counter|vault)$/.test(pathname)) return 'mail';
  if (pathname === '/app/chat') return 'messages';
  return null;
}
