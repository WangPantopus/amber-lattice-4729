'use client';

// The reach dial (Pulse, reinvented, phase 1, board B15), opened from the scope pill: how far Pulse looks, each choice
// with one line saying what it shows and how it is ordered, and "No hidden ranking". In this phase Close circle is the
// people the person is connected with (circles of 2 to 8 are phase 3); Around me reaches 1 to 25 miles; Explore is the
// world: ten picked a day, then the newest (the rules page says how).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Reach } from './listApi';
import { CIRCLES_KEY, readCircles } from '../circles/circlesApi';

export const EXPLORE_RULES_PATH = '/about/explore';

interface Props {
  reach: Reach;
  miles: number;
  place: string | null;
  onReach(r: Reach): void;
  onMiles(m: number): void;
  onClose(): void;
  /** One of the person's circles inside Close circle (CONTRACT 8d), or null for all their connections. */
  circle?: string | null;
  onCircle?(c: { id: string; name: string } | null): void;
}

export default function ReachDial({ reach, miles, place, onReach, onMiles, onClose, circle = null, onCircle }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  // The person's circles (phase 3): Close circle can be one of them.
  const circles = useQuery({ queryKey: CIRCLES_KEY, queryFn: ({ signal }) => readCircles(signal), enabled: !!onCircle, staleTime: 60_000, retry: false });
  const mine = circles.data?.circles || [];
  const chosen = mine.find((c) => c.id === circle) || null;
  const news = (circles.data?.invites.length || 0) + mine.filter((c) => c.magazine_ready).length;
  const [draft, setDraft] = useState(miles);
  useEffect(() => setDraft(miles), [miles]);
  // The list reads again once the slider rests, not at every step.
  useEffect(() => {
    if (draft === miles) return undefined;
    const t = window.setTimeout(() => onMiles(draft), 350);
    return () => window.clearTimeout(t);
  }, [draft, miles, onMiles]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: PointerEvent) => {
      const el = panel.current;
      if (el && !el.contains(e.target as Node) && !(e.target as Element | null)?.closest?.('.rp-scope')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const lines: Record<Reach, { name: string; line: string }> = {
    close: { name: 'Close circle', line: chosen ? `Only ${chosen.name} · newest first` : 'People you’re connected with · newest first' },
    around: { name: 'Around me', line: `${place ? `${place}, out` : 'Out'} to ${draft} ${draft === 1 ? 'mile' : 'miles'} · nearest first` },
    explore: { name: 'Explore', line: 'The world · ten picked a day, then newest' },
  };
  return (
    // data-covers-shell: on a phone the panel covers the shell bars (AppShell lifts the page over them while it is open).
    <div ref={panel} className="rp-dial" role="dialog" aria-label="How far do you want to see?" data-covers-shell="">
      <h2 className="rp-dial-title">How far do you want to see?</h2>
      <div className="rp-dial-choices" role="radiogroup" aria-label="Reach">
        {(['close', 'around', 'explore'] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reach === r}
            className="rp-dial-choice"
            data-reach={r}
            onClick={() => onReach(r)}
          >
            <span className="rp-dial-dot" aria-hidden />
            <span className="rp-dial-words">
              <strong>{lines[r].name}</strong>
              <span>{lines[r].line}</span>
            </span>
          </button>
        ))}
      </div>
      {reach === 'close' && onCircle && circles.data && (
        <div className="rp-dial-circles">
          {mine.length > 0 && (
            <div role="radiogroup" aria-label="Which people">
              <button type="button" role="radio" aria-checked={!chosen} onClick={() => onCircle(null)}>
                All your connections
              </button>
              {mine.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={chosen?.id === c.id} onClick={() => onCircle({ id: c.id, name: c.name })}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <Link href="/app/circles" className="rp-dial-circles-link">
            {mine.length ? 'Your circles' : 'Make a circle of 2 to 8 close people'}
            {news > 0 && <span className="rp-dial-new">{news} new</span>}
          </Link>
        </div>
      )}
      {reach === 'around' && (
        <div className="rp-dial-miles">
          <label htmlFor="rp-miles">
            Around me reaches out to {draft} {draft === 1 ? 'mile' : 'miles'}
          </label>
          <input
            id="rp-miles"
            type="range"
            min={1}
            max={25}
            step={1}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value))}
            aria-valuetext={`${draft} ${draft === 1 ? 'mile' : 'miles'}`}
          />
          <div className="rp-dial-ends" aria-hidden>
            <span>1 mi</span>
            <span>25 mi</span>
          </div>
        </div>
      )}
      <p className="rp-dial-foot">
        <span>No hidden ranking. This is the whole rule.</span>
        <Link href={EXPLORE_RULES_PATH}>See the rules</Link>
      </p>
    </div>
  );
}
