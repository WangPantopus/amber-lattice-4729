'use client';

// Guess the spot in the viewer (Pulse, reinvented, step 8; coord/CONTRACT.md §5). A guess-the-spot Moment comes with
// its place left out until the reader guesses: the viewer shows "Where is this?", holds still (a puzzle never skips
// itself), and a map opens to drop a pin. The answer says how far off it was ("1.2 mi off") and brings the Moment in
// full. Distance only: no points, no ranks. Drawn only while `pulse_reinvented` is on for the reader.

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import './guess.css';

// The map loads only when the reader opens it (Leaflet needs a window, and most readers never guess).
const GuessMap = dynamic(() => import('./GuessMap'), { ssr: false });

export interface GuessInfo {
  count: number;
  mine: { distance_m: number; label: string } | null;
}
type GuessMoment = Moment & { guess?: GuessInfo | null };

const guessOf = (m: Moment) => (m as GuessMoment).guess || null;
const guesses = (n: number) => (n === 1 ? '1 guess' : `${n} guesses`);

/** Hold the viewer on a spot the reader hasn't guessed yet (not their own). */
export function holdsForGuess(m: Moment, account: string | undefined) {
  const g = guessOf(m);
  return !!g && !g.mine && m.viewer_count == null && m.author.id !== account;
}

/**
 * Over the picture of a guess-the-spot Moment: "Where is this?" and the button that opens the map until the reader has
 * guessed; then how far off they were. The author sees how many have guessed.
 */
export function GuessOverPicture({ moment }: { moment: Moment }) {
  const account = useMe().data?.id;
  const g = guessOf(moment);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  if (!g || !account) return null;
  const own = moment.viewer_count != null || moment.author.id === account;
  // Taps on these never reach the viewer's own tap-to-step and hold-to-pause.
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onPointerUp: (e: React.PointerEvent) => e.stopPropagation() };
  return (
    <>
      <span ref={anchor} hidden />
      {own ? (
        <p className="gs-pill">{g.count ? `Guess the spot · ${guesses(g.count)}` : 'Guess the spot · No guesses yet'}</p>
      ) : g.mine ? (
        <p className="gs-pill" role="status">
          {g.mine.label} · {guesses(g.count)}
        </p>
      ) : (
        <div className="gs-ask" {...stop}>
          <span>
            <strong>Where is this?</strong>
            <small>Guess, then see where it was taken.</small>
          </span>
          <button type="button" onClick={() => setOpen(true)}>
            <MapPin size={17} aria-hidden="true" />
            Guess
          </button>
        </div>
      )}
      {open && (
        <GuessMap
          moment={moment}
          account={account}
          container={anchor.current?.closest('dialog') || document.body}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
