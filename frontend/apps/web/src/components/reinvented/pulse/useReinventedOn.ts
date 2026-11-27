'use client';

import { useEffect } from 'react';
import { useMe } from '@/lib/me';
import { useHydrated } from '@/hooks/useHydrated';
import { usePulseReinvented } from '../usePulseReinvented';
import { KEPT_COOKIE } from './keptCookie';

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
 */
export function useReinventedOn(enabled = true, keptOnServer = false): boolean {
  const account = useMe().data?.id ?? null;
  const flag = usePulseReinvented(enabled);
  const hydrated = useHydrated();
  const known = flag.data ? flag.data.enabled === true : undefined;
  useEffect(() => {
    if (!account || known === undefined) return;
    try {
      if (known) localStorage.setItem(KEPT + account, '1');
      else localStorage.removeItem(KEPT + account);
    } catch {
      // Storage refused (private window): the server's answer still decides each time.
    }
    document.cookie = known
      ? `${KEPT_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
      : `${KEPT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }, [account, known]);
  if (known !== undefined) return known;
  if (keptOnServer) return true;
  if (!hydrated || !account) return false;
  try {
    return localStorage.getItem(KEPT + account) === '1';
  } catch {
    return false;
  }
}
