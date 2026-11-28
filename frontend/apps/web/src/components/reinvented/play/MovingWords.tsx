'use client';

// Moving words (Pulse, reinvented; coord/CONTRACT.md §7k): the author's own short words over a photo, in one of the
// Studio's ten letterings, moving in one of four ways for as long as the photo shows. Drawn only, never into the
// picture, and still when the reader's system asks for reduced motion. Loaded only where such an item is drawn (the
// switch-on viewer and the Studio), so today's pages fetch nothing of it.

import { useEffect, useState } from 'react';
import { TEXT_LOOKS } from '../studio/fonts';
import type { PlayItem } from './playTypes';
import './movingWords.css';

export type MovingWordsItem = Extract<PlayItem, { kind: 'moving_words' }>;

/** The shared lettering ids (CONTRACT §7k): the Studio's ten text looks, by name. */
export const LETTERINGS = TEXT_LOOKS.map((l) => ({ id: l.name.toLowerCase(), look: l }));
export const MOTIONS = [
  { id: 'drift', label: 'Drift' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'wave', label: 'Wave' },
  { id: 'type', label: 'Type' },
] as const;

/** The CSS for a lettering: its font, or today's words (Classic) for an id this app doesn't know. */
export function letteringStyle(id: string) {
  const font = LETTERINGS.find((l) => l.id === id)?.look.font;
  return font
    ? { fontFamily: font.family, fontWeight: font.weight, fontStyle: font.style || 'normal' }
    : { fontFamily: 'system-ui, sans-serif', fontWeight: 700, fontStyle: 'normal' as const };
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setReduce(q.matches);
    read();
    q.addEventListener('change', read);
    return () => q.removeEventListener('change', read);
  }, []);
  return reduce;
}

/** "Type": the letters appear one by one, hold, and start again. */
function useTyped(length: number, on: boolean) {
  const [shown, setShown] = useState(length);
  useEffect(() => {
    if (!on) {
      setShown(length);
      return undefined;
    }
    let n = 0,
      timer: ReturnType<typeof setTimeout>;
    const next = () => {
      n = n >= length ? 0 : n + 1;
      setShown(n);
      timer = setTimeout(next, n >= length ? 1600 : n === 0 ? 350 : 95);
    };
    next();
    return () => clearTimeout(timer);
  }, [length, on]);
  return shown;
}

export default function MovingWords({ item }: { item: MovingWordsItem }) {
  const reduce = useReducedMotion();
  const motion = MOTIONS.some((m) => m.id === item.motion) ? item.motion : 'drift';
  const text = item.text || '';
  const letters = [...text];
  const shown = useTyped(letters.length, motion === 'type' && !reduce);
  const perLetter = motion === 'wave' || motion === 'type';
  let at = 0;
  return (
    <p
      className="mw-words"
      data-motion={reduce ? 'still' : motion}
      style={{ ...letteringStyle(item.lettering), color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : '#FFFFFF' }}
    >
      <span className="mw-said">{text}</span>
      {perLetter ? (
        <span aria-hidden="true">
          {text.split(' ').map((word, w) => {
            const start = at;
            at += [...word].length + 1;
            return (
              <span key={w}>
                {w > 0 && ' '}
                <span className="mw-word">
                  {[...word].map((ch, i) => (
                    <span
                      key={i}
                      className="mw-letter"
                      style={{ ['--i' as string]: start + i, visibility: motion === 'type' && start + i >= shown ? 'hidden' : undefined }}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              </span>
            );
          })}
        </span>
      ) : (
        <span aria-hidden="true">{text}</span>
      )}
    </p>
  );
}
