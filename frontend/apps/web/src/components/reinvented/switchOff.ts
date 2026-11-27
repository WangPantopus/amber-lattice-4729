'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * "The switch is off for you" (coord/CONTRACT.md §1): a request only the new screens make answers
 * `403 PULSE_REINVENTED_OFF` once the person's switch is off. The app then re-reads the switch at once and goes back to
 * today's screens, keeping what the person made.
 */
export function isSwitchedOff(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'PULSE_REINVENTED_OFF';
}

/** Re-read the switch now (every screen that reads it follows). */
export function useRereadSwitch() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: ['featureFlag', 'pulse_reinvented'] }), [client]);
}
