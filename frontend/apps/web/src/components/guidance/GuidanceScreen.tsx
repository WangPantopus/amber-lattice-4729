'use client';

import { useEffect, useRef } from 'react';
import { clearScreen, reportScreen, updateScreenFacts, type GuidanceScreenFacts } from './screens';
import type { GuidanceScreenName } from './store';

/**
 * Says "this tab screen has loaded" to the guidance cards (nothing is drawn). Mount it
 * only in the screen's loaded state, with the facts its cards need.
 */
export default function GuidanceScreen({ name, facts = {} }: { name: GuidanceScreenName; facts?: GuidanceScreenFacts }) {
  const token = useRef<number | null>(null);
  const key = JSON.stringify(facts);
  const factsRef = useRef(facts);
  factsRef.current = facts;

  useEffect(() => {
    const t = reportScreen(name, factsRef.current);
    token.current = t;
    return () => { clearScreen(t); token.current = null; };
  }, [name]);

  useEffect(() => {
    if (token.current != null) updateScreenFacts(token.current, factsRef.current);
  }, [key]);

  return null;
}
