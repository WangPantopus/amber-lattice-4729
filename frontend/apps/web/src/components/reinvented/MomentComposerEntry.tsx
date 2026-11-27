'use client';

import { useState, type ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import MomentComposer from '@/components/moments/MomentComposer';
import { usePulseReinvented } from './usePulseReinvented';

const Studio = dynamic(() => import('./studio/Studio'), { ssr: false });

/**
 * Where Moments' + opens: today's composer, unchanged, or the Studio while `pulse_reinvented` is on for this person.
 * The answer is taken once, as the composer opens, so a switch flipped meanwhile never swaps screens under someone
 * who is writing. Nothing waits for it: the Moments page reads the switch as it opens, and an answer not in yet (a slow
 * network), an error or no answer opens today's composer at once (lead, 2026-11-27: nothing on today's screens may get
 * slower).
 */
export default function MomentComposerEntry(props: ComponentProps<typeof MomentComposer>) {
  const flag = usePulseReinvented();
  const [studio] = useState(() => flag.data?.enabled === true);
  return studio ? <Studio {...props} /> : <MomentComposer {...props} />;
}
