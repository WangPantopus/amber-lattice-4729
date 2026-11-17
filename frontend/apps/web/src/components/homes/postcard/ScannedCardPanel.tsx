'use client';

// "Did you ask for this card?" (FASTVERIFY drawing M2): what a scanned card's link shows when the person who
// opened it can't finish here (nobody signed in, or another account). "This wasn't me" stops the card.

import { useState } from 'react';
import * as api from '@pantopus/api';
import { ShieldCheck } from 'lucide-react';
import type { ScannedCard } from './scannedCard';

export default function ScannedCardPanel({ card, onSignIn }: {
  card: ScannedCard;
  /** "Yes, sign in to finish"; left out for someone already signed in. */
  onSignIn?: () => void;
}) {
  const [state, setState] = useState<'ask' | 'sending' | 'done' | 'failed'>('ask');
  const report = async () => {
    setState('sending');
    try {
      await api.homeVerify.reportPostcard(card.homeId, card.code);
      setState('done');
    } catch {
      setState('failed');
    }
  };
  const button = 'w-full min-h-[52px] rounded-xl font-semibold text-base transition-colors disabled:opacity-50';
  return (
    <section aria-labelledby="scanned-card-title" className="space-y-4" data-testid="scanned-card">
      <span className="inline-flex w-12 h-12 items-center justify-center rounded-2xl bg-app-home-bg text-app-home">
        <ShieldCheck size={26} strokeWidth={2} aria-hidden />
      </span>
      {state === 'done' ? (
        <p role="status" id="scanned-card-title" className="text-[17px] font-semibold text-app-text">
          Thank you. We stopped this card and will look into it.
        </p>
      ) : (
        <>
          <h1 id="scanned-card-title" className="text-[24px] font-bold -tracking-[0.02em] text-app-text">Did you ask for this card?</h1>
          <p className="text-[15px] text-app-text-secondary">Someone asked Pantopus to mail a code to this address.</p>
          {state === 'failed' ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-200">
              This couldn’t be sent. Check your connection and try again.
            </p>
          ) : null}
          <div className="space-y-2.5 pt-1">
            {onSignIn ? (
              <button type="button" onClick={onSignIn} disabled={state === 'sending'} className={`${button} bg-primary-600 hover:bg-primary-700 text-white`}>
                Yes, sign in to finish
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void report()}
              disabled={state === 'sending'}
              className={`${button} border border-app-border bg-app-surface text-app-text hover:bg-app-hover`}
            >
              This wasn&apos;t me
            </button>
          </div>
        </>
      )}
    </section>
  );
}
