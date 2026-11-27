'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import MomentComposer from '@/components/moments/MomentComposer';
import { usePulseReinvented } from './usePulseReinvented';

const Studio = dynamic(() => import('./studio/Studio'), { ssr: false });

/**
 * Where Moments' + opens: today's composer, unchanged, or the Studio while `pulse_reinvented` is on for this person.
 * The answer is taken once, as the composer opens, so a switch flipped meanwhile never swaps screens under someone
 * who is writing. Not known yet waits a moment; an error, or no answer, is today's composer.
 */
export default function MomentComposerEntry(props: ComponentProps<typeof MomentComposer>) {
  const flag = usePulseReinvented();
  const known = !flag.isPending || flag.fetchStatus === 'idle';
  const [studio, setStudio] = useState<boolean | null>(known ? flag.data?.enabled === true : null);
  useEffect(() => {
    if (studio === null && known) setStudio(flag.data?.enabled === true);
  }, [studio, known, flag.data?.enabled]);
  if (studio === null) return null;
  return studio ? <Studio {...props} /> : <MomentComposer {...props} />;
}
