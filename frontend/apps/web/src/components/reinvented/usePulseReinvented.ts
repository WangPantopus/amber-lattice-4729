'use client';

import { useQuery } from '@tanstack/react-query';
import { featureFlags, getAuthToken } from '@pantopus/api';

/**
 * "Pulse, reinvented" (founder, 2026-11-26): one switch on the server, `pulse_reinvented`, turns every new screen on
 * and puts today's back. It is read the way `moments` is (useMomentsAccess): from the server, again whenever the window
 * gets focus and once a minute, so switching needs no rebuild. Anything but a clear `true` (not read yet, an error, an
 * older server) is off, and off is today's screens exactly.
 *
 * `enabled`: read only where a new screen could open (the Moments page reads it as it opens).
 */
export function usePulseReinvented(enabled = true) {
  return useQuery({
    queryKey: ['featureFlag', 'pulse_reinvented'],
    queryFn: () => featureFlags.getFeatureFlag('pulse_reinvented'),
    enabled: enabled && typeof window !== 'undefined' && !!getAuthToken(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  });
}
