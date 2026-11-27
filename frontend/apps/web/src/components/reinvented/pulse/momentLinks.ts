'use client';

// Links and notices (Pulse, reinvented, phase 1 step 8): a Moment's link, `/app/moments/<id>` (shares, notices, chat
// quotes, the assistant), opens the Moment in the one Pulse tab while `pulse_reinvented` is on for the person, and in
// today's Moments tab while it is off. Today's Moments page asks this hook first; the new Pulse opens `?moment=<id>`.

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useReinventedOn } from './useReinventedOn';

const BASE = '/app/moments';

/**
 * For today's Moments page: true while the person's switch is on and the page is handing over to the new Pulse (it
 * then draws only a holding line). A link that names a person (`?person=`) stays on today's page. Off, unknown or
 * unread: false at once, and today's page is drawn as before.
 */
export function useMomentLinksToPulse(): boolean {
  const on = useReinventedOn(true);
  const path = usePathname() || BASE;
  const params = useSearchParams();
  const router = useRouter();
  const id = path.startsWith(BASE + '/') ? path.slice(BASE.length + 1).split('/')[0] : '';
  const leaving = on && !params?.get('person');
  useEffect(() => {
    if (leaving) router.replace(id ? `/app/feed?moment=${encodeURIComponent(id)}` : '/app/feed');
  }, [leaving, id, router]);
  return leaving;
}

/** For the new Pulse: the Moment a link named (`?moment=<id>`), taken once and cleared from the address. */
export function useLinkedMoment(open: (id: string) => void) {
  const params = useSearchParams();
  const router = useRouter();
  const id = params?.get('moment') || '';
  useEffect(() => {
    if (!id) return;
    open(id);
    router.replace('/app/feed', { scroll: false });
  }, [id, open, router]);
}

/** A convergence's link (`/app/feed?sky=<id>`, CONTRACT 8h): opens the piece over Pulse. */
export function useLinkedSky(open: (id: string) => void) {
  const params = useSearchParams();
  const router = useRouter();
  const id = params?.get('sky') || '';
  useEffect(() => {
    if (!id) return;
    open(id);
    router.replace('/app/feed', { scroll: false });
  }, [id, open, router]);
}
