'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

// "Moment updated": said over the picture for a few seconds after an edit is saved. The edit closes with the viewer's
// options sheet, so the word is kept here, outside both, for the viewer's picture to show.
let last: { id: string; at: number } | null = null;
const listeners = new Set<() => void>();

export function savedMoment(id: string) {
  last = { id, at: Date.now() };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True for a few seconds after `id` was saved. */
export function useJustSaved(id: string, ms = 3_000) {
  const saved = useSyncExternalStore(subscribe, () => last, () => null);
  const [, setTick] = useState(0);
  const fresh = !!saved && saved.id === id && Date.now() - saved.at < ms;
  useEffect(() => {
    if (!fresh || !saved) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.max(0, ms - (Date.now() - saved.at)) + 20);
    return () => clearTimeout(t);
  }, [fresh, saved, ms]);
  return fresh;
}
