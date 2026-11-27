'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useReinventedOn } from './useReinventedOn';

// Loaded only for a person whose switch is on, so today's Pulse page carries none of it.
const ReinventedPulse = dynamic(() => import('./ReinventedPulse'), { ssr: false });

/**
 * /app/feed picks its screen (Pulse, reinvented, phase 1): the one Pulse tab while `pulse_reinvented` is on for the
 * person, today's Pulse (`children`, untouched) otherwise. Off, unknown or unread, it is today's at once. `kept`: the
 * server render saw the person's kept answer (a cookie), so a person whose switch was on starts on the new Pulse.
 */
export default function PulsePick({ children, kept = false }: { children: ReactNode; kept?: boolean }) {
  return useReinventedOn(true, kept) ? <ReinventedPulse /> : <>{children}</>;
}
