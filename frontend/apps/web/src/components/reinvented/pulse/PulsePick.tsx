'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useReinventedOn } from './useReinventedOn';

// Loaded only for a person whose switch is on, so today's Pulse page carries none of it.
const ReinventedPulse = dynamic(() => import('./ReinventedPulse'), { ssr: false });

/**
 * /app/feed picks its screen (Pulse, reinvented, phase 1): the one Pulse tab while `pulse_reinvented` is on for the
 * person, today's Pulse (`children`, untouched) otherwise. Off, unknown or unread, it is today's at once.
 */
export default function PulsePick({ children }: { children: ReactNode }) {
  return useReinventedOn() ? <ReinventedPulse /> : <>{children}</>;
}
