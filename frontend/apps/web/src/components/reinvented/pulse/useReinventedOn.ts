'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '@/lib/me';
import { useHydrated } from '@/hooks/useHydrated';
import { usePulseReinvented } from '../usePulseReinvented';
import { useServerBehind } from '../serverBehind';
import { CSRF_COOKIE, KEPT_COOKIE, keptValue } from './keptCookie';

const KEPT = 'pantopus.pulseReinvented.';

/**
 * Whether `pulse_reinvented` is on for this person, for the screens that pick between today's and the new ones (the
 * bar, the sidebar, /app/feed). The server's answer when there is one; until then the account's last answer kept on
 * this device, so a person whose switch is on doesn't see today's Pulse flash first. A person with no kept answer
 * (everyone whose switch is off) gets `false` at once: today's screens never wait on this read.
 *
 * `enabled`: whether this screen may send the read itself (the bar and sidebar only while `moments` is on; the feed page
 * always). Another screen's read answers every caller, as the query is shared. `keptOnServer`: the server render saw the
 * kept-answer cookie, so the page starts on the new screen (the same on the server and in the first browser render).
 *
 * It asks for "my profile" itself (useMe), so never mount it on a page a signed-out visitor can open (a public profile):
 * use `useKnownOn` there.
 */
export function useReinventedOn(enabled = true, keptOnServer = false): boolean {
  const account = useMe().data?.id ?? null;
  const flag = usePulseReinvented(enabled);
  const hydrated = useHydrated();
  // A server older than this website (a new route answered 404): today's screens for a while, as when off.
  const behind = useServerBehind();
  const known = flag.data ? flag.data.enabled === true : undefined;
  useEffect(() => {
    if (!account || known === undefined) return;
    try {
      if (known) localStorage.setItem(KEPT + account, '1');
      else localStorage.removeItem(KEPT + account);
    } catch {
      // Storage refused (private window): the server's answer still decides each time.
    }
    const csrf = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))?.[1];
    // While the server is behind, the cookie is left out too, so /app/feed's server render is today's Pulse (no flash of
    // the new one before it falls back); it comes back once the server answers.
    const value = known && !behind ? keptValue(csrf ? decodeURIComponent(csrf) : null) : null;
    document.cookie = value
      ? `${KEPT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
      : `${KEPT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }, [account, known, behind]);
  if (behind) return false;
  if (known !== undefined) return known;
  if (keptOnServer) return true;
  if (!hydrated || !account) return false;
  try {
    return localStorage.getItem(KEPT + account) === '1';
  } catch {
    return false;
  }
}

/**
 * For a page that exists only for the new Pulse (circles, the field guide): true once it is certain the switch is off for
 * this person (the server said so, or its read failed and nothing is kept on), so the page answers today's 404 rather
 * than naming what isn't there. While not known yet it is false: the page shows nothing until it is.
 */
export function useKnownOff(): boolean {
  const on = useReinventedOn();
  const flag = usePulseReinvented();
  return !on && (flag.data !== undefined || flag.isError);
}

/**
 * For a page anyone can open (a public profile): whether the switch is on for this viewer as far as this device knows,
 * with no request at all: another screen's switch read if there was one, else the viewer's kept answer. A signed-out
 * visitor (no viewer) is always off.
 */
export function useKnownOn(viewerId: string | null): boolean {
  const flag = useQuery<{ enabled?: boolean }>({ queryKey: ['featureFlag', 'pulse_reinvented'], enabled: false });
  if (!viewerId) return false;
  if (flag.data) return flag.data.enabled === true;
  try {
    return localStorage.getItem(KEPT + viewerId) === '1';
  } catch {
    return false;
  }
}
