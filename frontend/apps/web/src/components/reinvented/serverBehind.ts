'use client';

// A server older than the website (LEAD-2, 2026-11-27 03:01; PHASE-1 section 3): the website is always released before
// the server, in staging and in production, so for a while after each release a new screen's route can answer 404 while
// the switch says on. The new screens then go back to today's at once, exactly as on `403 PULSE_REINVENTED_OFF`, and
// try again later: every minute, and when the window comes back to the front. A try is a quiet read of the list's route
// first; the new screens come back only once it answers, so nobody sees the new Pulse flash up and fall back again.
// Kept on this device (localStorage), so a reload or another tab doesn't flash the new screen in between either, and
// /app/feed's kept-answer cookie is left out meanwhile (useReinventedOn), so the server render is today's Pulse too.

import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { get } from '@pantopus/api/client';

const KEY = 'pantopus.pulseReinvented.serverBehindSince';
// How long after a 404 the route is tried again.
const RETRY_MS = 60_000;
// A mark this old is no longer believed (the browser was closed meanwhile): the new screens are tried at once.
const STALE_MS = 30 * 60_000;
// Window focus tries again, but not more often than this.
const FOCUS_GAP_MS = 10_000;

// When a new route last answered 404 (0: never, or it answered since).
let since = -1;
let lastTry = 0;
let trying: Promise<void> | null = null;
const listeners = new Set<() => void>();

function read(): number {
  if (since < 0) {
    since = 0;
    try {
      since = Number(localStorage.getItem(KEY)) || 0;
    } catch {
      // Storage refused (private window): this page's memory only.
    }
  }
  return since;
}

function write(value: number) {
  since = value;
  try {
    if (value) localStorage.setItem(KEY, String(value));
    else localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
  listeners.forEach((l) => l());
}

function behindNow(): boolean {
  const at = read();
  return at > 0 && Date.now() - at < STALE_MS;
}

/** A route that exists on today's server answered 404: the server is older than this website. */
export function isRouteMissing(error: unknown): boolean {
  const e = error as { statusCode?: number; status?: number } | null;
  return e?.statusCode === 404 || e?.status === 404;
}

/**
 * For a route on one Moment (the edit, a guess): a 404 that isn't the Moment's own "not found". An older server has no
 * such route and answers its plain "Route not found", with no code.
 */
export function isRouteGone(error: unknown): boolean {
  return isRouteMissing(error) && (error as { code?: string } | null)?.code !== 'MOMENT_NOT_FOUND';
}

/** Back to today's screens: every screen that reads `useServerBehind` (through useReinventedOn) follows. */
export function markServerBehind() {
  write(Date.now());
}

/**
 * Try the new screens' route quietly. Still 404: today's screens stay, and the next try is a minute away. Any other
 * answer (the list, a 403 for a switch that went off, a 401) means the route is there: the cached 404s are dropped, so
 * the new screens read again instead of falling back on an old answer, and they come back. No answer at all (offline)
 * changes nothing.
 */
function tryAgain(client: QueryClient) {
  if (trying) return;
  lastTry = Date.now();
  trying = get('/api/reinvented/list', { limit: 1 })
    .then(
      () => false,
      (error: unknown) => {
        if (isRouteMissing(error)) return true;
        return (error as { statusCode?: number } | null)?.statusCode ? false : null;
      },
    )
    .then((missing) => {
      if (missing === true) markServerBehind();
      else if (missing === false) {
        client.removeQueries({ predicate: (q) => q.state.status === 'error' && isRouteMissing(q.state.error) });
        write(0);
      }
    })
    .finally(() => {
      trying = null;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab found the server behind, or found it caught up.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    since = -1;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** True while the server was found older than this website, until a try finds the new screens' route there. */
export function useServerBehind(): boolean {
  const client = useQueryClient();
  // When the last 404 came (0 while not behind), so each new 404 sets the next try a minute after it.
  const at = useSyncExternalStore(subscribe, () => (behindNow() ? read() : 0), () => 0);
  const behind = at > 0;
  useEffect(() => {
    if (!behind) return undefined;
    const t = window.setTimeout(() => tryAgain(client), Math.max(0, at + RETRY_MS - Date.now()));
    const onFront = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastTry > FOCUS_GAP_MS) tryAgain(client);
    };
    window.addEventListener('focus', onFront);
    document.addEventListener('visibilitychange', onFront);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('focus', onFront);
      document.removeEventListener('visibilitychange', onFront);
    };
  }, [at, behind, client]);
  return behind;
}

/** For a new screen's reads: a 404 from any of them puts today's screens back (route reads only, never one Moment's 404). */
export function useBackWhenMissing(...errors: unknown[]) {
  const missing = errors.some(isRouteMissing);
  useEffect(() => {
    if (missing) markServerBehind();
  }, [missing]);
}
