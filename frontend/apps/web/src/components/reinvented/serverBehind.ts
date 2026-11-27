'use client';

// A server older than the website (LEAD-2, 2026-11-27 03:01; PHASE-1 section 3): the website is always released before
// the server, in staging and in production, so for a while after each release a new screen's route can answer 404 while
// the switch says on. The new screens then go back to today's at once, exactly as on `403 PULSE_REINVENTED_OFF`, and
// try again a few minutes later. Kept for this browser tab only (sessionStorage), so a reload doesn't flash the new
// screen in between.

import { useEffect, useSyncExternalStore } from 'react';

const KEY = 'pantopus.pulseReinvented.serverBehindUntil';
// How long today's screens stay before the new ones are tried again.
const RETRY_MS = 5 * 60_000;

let until = -1;
const listeners = new Set<() => void>();

function read(): number {
  if (until < 0) {
    until = 0;
    try {
      until = Number(sessionStorage.getItem(KEY)) || 0;
    } catch {
      // Storage refused (private window): this page's memory only.
    }
  }
  return until;
}

function emit() {
  listeners.forEach((l) => l());
}

/** A route that exists on today's server answered 404: the server is older than this website. */
export function isRouteMissing(error: unknown): boolean {
  const e = error as { statusCode?: number; status?: number } | null;
  return e?.statusCode === 404 || e?.status === 404;
}

/** Back to today's screens for a while: every screen that reads `useServerBehind` (through useReinventedOn) follows. */
export function markServerBehind() {
  until = Date.now() + RETRY_MS;
  try {
    sessionStorage.setItem(KEY, String(until));
  } catch {
    // As above.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the server was found older than this website, until it is time to try the new screens again. */
export function useServerBehind(): boolean {
  const behind = useSyncExternalStore(
    subscribe,
    () => read() > Date.now(),
    () => false,
  );
  useEffect(() => {
    if (!behind) return undefined;
    const t = window.setTimeout(emit, Math.max(1000, read() - Date.now() + 50));
    return () => window.clearTimeout(t);
  }, [behind]);
  return behind;
}

/** For a new screen's reads: a 404 from any of them puts today's screens back (route reads only, never one Moment's 404). */
export function useBackWhenMissing(...errors: unknown[]) {
  const missing = errors.some(isRouteMissing);
  useEffect(() => {
    if (missing) markServerBehind();
  }, [missing]);
}
