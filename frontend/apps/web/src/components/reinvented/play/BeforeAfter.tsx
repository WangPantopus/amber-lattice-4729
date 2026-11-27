'use client';

// Before and after (Pulse, reinvented, phase 2; coord/CONTRACT.md §7g, LEAD-3 05:19). The Studio posts the two photos
// side by side as ONE picture (left before, right after) with a `before_after` item, so today's screens and the apps in
// the stores show that side-by-side picture. The new viewer and Pulse cut the halves from it and show one over the other
// with a curtain the reader drags. Stamps, items and dots sit on one half's frame, so they stay put as the curtain moves.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { PlayItem } from './playTypes';
import './play.css';

export type BeforeAfterItem = Extract<PlayItem, { kind: 'before_after' }>;

/** The post's before and after, if it has one (one at most, on a photo). */
export function beforeAfterOf(play: readonly PlayItem[] | null | undefined): BeforeAfterItem | null {
  return (play || []).find((p): p is BeforeAfterItem => p?.kind === 'before_after') ?? null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The two halves of `src`, the before over the after up to the curtain. The curtain moves by dragging its handle or with
 * the arrow keys; a tap on the picture away from it is left to the screen under it (the viewer's next and back).
 * `still` draws it at the middle with nothing to drag (a row in the list).
 */
export default function BeforeAfter({ src, item, still = false }: { src: string; item: BeforeAfterItem; still?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [at, setAt] = useState(0.5);
  const before = item.before || 'Before',
    after = item.after || 'After';
  const half = (side: 'before' | 'after') => ({
    backgroundImage: `url(${JSON.stringify(src)})`,
    backgroundSize: '200% 100%',
    backgroundPosition: side === 'before' ? '0 0' : '100% 0',
  });
  const follow = (e: PointerEvent) => {
    const b = box.current?.getBoundingClientRect();
    if (b && b.width) setAt(clamp01((e.clientX - b.left) / b.width));
  };
  const keys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.2 : 0.05;
    const move: ((a: number) => number) | null =
      e.key === 'ArrowLeft' ? (a) => a - step : e.key === 'ArrowRight' ? (a) => a + step : e.key === 'Home' ? () => 0 : e.key === 'End' ? () => 1 : null;
    if (!move) return;
    e.preventDefault();
    e.stopPropagation();
    setAt((a) => clamp01(move(a)));
  };
  return (
    <div ref={box} className="pl-ba" data-still={still || undefined}>
      <span className="pl-ba-half" style={half('after')} role="img" aria-label={after} />
      <span className="pl-ba-half" style={{ ...half('before'), clipPath: `inset(0 ${(1 - at) * 100}% 0 0)` }} role="img" aria-label={before} />
      <span className="pl-ba-label" data-side="before" style={{ opacity: at < 0.12 ? 0 : 1 }}>
        {before}
      </span>
      <span className="pl-ba-label" data-side="after" style={{ opacity: at > 0.88 ? 0 : 1 }}>
        {after}
      </span>
      {still ? (
        <span className="pl-ba-line" style={{ left: `${at * 100}%` }} aria-hidden="true" />
      ) : (
        <span
          className="pl-ba-line"
          style={{ left: `${at * 100}%` }}
          role="slider"
          tabIndex={0}
          aria-label={`Curtain between ${before.toLowerCase()} and ${after.toLowerCase()}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(at * 100)}
          aria-valuetext={`${Math.round(at * 100)}% ${before.toLowerCase()}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            dragging.current = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* a pointer that is already gone */
            }
          }}
          onPointerMove={(e) => dragging.current && follow(e)}
          onPointerUp={(e) => {
            e.stopPropagation();
            dragging.current = false;
          }}
          onPointerCancel={() => (dragging.current = false)}
          onLostPointerCapture={() => (dragging.current = false)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={keys}
        >
          <i aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
