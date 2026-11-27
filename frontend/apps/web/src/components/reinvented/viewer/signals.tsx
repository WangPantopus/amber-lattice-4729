'use client';

// The five signals (coord/CONTRACT.md §4): Learned, Want to go, Smile, Same, Helpful. They replace the seven emoji on the
// new screens only; every field that exists today keeps answering emoji, so today's screens and older apps never see a
// signal (each shows as its nearest emoji there).

import type { ReactNode } from 'react';

export type Signal = 'learned' | 'want_to_go' | 'smile' | 'same' | 'helpful';
export const SIGNALS: readonly Signal[] = ['learned', 'want_to_go', 'smile', 'same', 'helpful'];
export const SIGNAL_WORDS: Record<Signal, string> = {
  learned: 'Learned',
  want_to_go: 'Want to go',
  smile: 'Smile',
  same: 'Same',
  helpful: 'Helpful',
};

const PATHS: Record<Signal, ReactNode> = {
  // Board B3's marks.
  learned: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  want_to_go: (
    <>
      <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  same: (
    <>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </>
  ),
  helpful: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
};

export function SignalIcon({ signal, size = 16 }: { signal: Signal; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[signal]}
    </svg>
  );
}

export const isSignal = (v: unknown): v is Signal => typeof v === 'string' && (SIGNALS as readonly string[]).includes(v);
