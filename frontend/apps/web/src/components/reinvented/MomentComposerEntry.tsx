'use client';

import { useState, type ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import type { MomentChatDraft } from '@pantopus/types';
import MomentComposer from '@/components/moments/MomentComposer';
import { usePulseReinvented } from './usePulseReinvented';
import { useRereadSwitch } from './switchOff';

const Studio = dynamic(() => import('./studio/Studio'), { ssr: false });

/**
 * Where Moments' + opens: today's composer, unchanged, or the Studio while `pulse_reinvented` is on for this person.
 * The answer is taken once, as the composer opens, so a switch flipped meanwhile never swaps screens under someone
 * who is writing. Nothing waits for it: the Moments page reads the switch as it opens, and an answer not in yet (a slow
 * network), an error or no answer opens today's composer at once (lead, 2026-11-27: nothing on today's screens may get
 * slower). When the server says the switch went off while the Studio was open, the switch is read again and today's
 * composer takes over with the person's words (CONTRACT §1).
 */
export default function MomentComposerEntry(props: ComponentProps<typeof MomentComposer>) {
  const flag = usePulseReinvented();
  const [studio, setStudio] = useState(() => flag.data?.enabled === true);
  const [kept, setKept] = useState<MomentChatDraft | null>(null);
  const reread = useRereadSwitch();
  return studio ? (
    <Studio
      {...props}
      onSwitchedOff={(words) => {
        void reread();
        setKept(words);
        setStudio(false);
      }}
    />
  ) : (
    <MomentComposer {...props} draft={kept ?? props.draft} />
  );
}
