'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

// A word over the viewer's picture for a few seconds after an edit closes ("Moment updated", or why nothing changed).
// The edit closes with the viewer's options sheet, so the word is kept here, outside both, for the picture to show.
let last: { id: string; at: number; words: string } | null = null;
const listeners = new Set<() => void>();

export function afterEdit(id: string, words: string) {
  last = { id, at: Date.now(), words };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The word for `id`, for a few seconds after its edit closed; otherwise null. */
export function useAfterEdit(id: string, ms = 4_000) {
  const said = useSyncExternalStore(subscribe, () => last, () => null);
  const [, setTick] = useState(0);
  const fresh = !!said && said.id === id && Date.now() - said.at < ms;
  useEffect(() => {
    if (!fresh || !said) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.max(0, ms - (Date.now() - said.at)) + 20);
    return () => clearTimeout(t);
  }, [fresh, said, ms]);
  return fresh ? said!.words : null;
}
