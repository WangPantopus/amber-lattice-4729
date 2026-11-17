'use client';

// B3 for a fast check (FASTVERIFY drawing 6): "You're verified", what opens now, and what still needs a
// mailed code. Shown by VerifiedSuccess when the server's verify-options says the level is `fast`.

import { Check, Lock, ArrowRight, BadgeCheck } from 'lucide-react';
import type { FastCheckKind } from '@pantopus/api';
import { verifiedSentence } from './fastVerifyWords';

export interface FastVerifiedProps {
  kind: FastCheckKind | string;
  /** The Home's street line, e.g. "5207 Example Trust Lane". */
  address: string;
  /** Renters also see what others near them pay. */
  renter: boolean;
  onMailCode: () => void;
  onContinue: () => void;
}

export default function FastVerified({ kind, address, renter, onMailCode, onContinue }: FastVerifiedProps) {
  const sentence = verifiedSentence(kind, address);
  const openNow = [
    'Message homes near you',
    'The Verified mark on your home and profile',
    "Your home's details from the county record",
    ...(renter ? ['What others near you pay in rent'] : []),
  ];
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 sm:px-5 py-10 flex flex-col" data-testid="place.fastVerifiedDone">
      <div className="flex flex-col items-center text-center motion-safe:animate-[fadeInUp_0.4s_ease-out_both]">
        <span className="w-[76px] h-[76px] rounded-full bg-app-home-bg text-app-home flex items-center justify-center">
          <BadgeCheck size={38} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="mt-5 text-[25px] font-bold -tracking-[0.025em] text-app-text leading-[31px]">You&apos;re verified</h1>
        <p className="mt-2 text-[15px] text-app-text-secondary leading-[22px] max-w-[340px]">
          {sentence.before}<strong className="font-semibold text-app-text">{sentence.address}</strong>.
        </p>
      </div>

      <div className="mt-7 bg-app-surface border border-app-border rounded-2xl shadow-sm p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-app-text-muted mb-2.5">Open now</div>
        <ul className="space-y-2.5">
          {openNow.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-[15px] text-app-text leading-[21px]">
              <Check size={17} strokeWidth={2.5} aria-hidden className="mt-0.5 shrink-0 text-app-home" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 bg-app-surface border border-app-border rounded-2xl shadow-sm p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-app-text-muted mb-2.5">Needs a mailed code</div>
        <div className="flex items-start gap-2.5">
          <Lock size={17} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-app-text-muted" />
          <div>
            <div className="text-[15px] text-app-text leading-[21px]">Residency letters and home Mail</div>
            <div className="text-[13px] text-app-text-secondary mt-0.5">Ask for the postcard whenever you need them.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onMailCode}
          className="mt-3 inline-flex items-center gap-1 text-[15px] font-semibold text-app-text hover:text-primary-600 dark:hover:text-primary-300"
        >
          Mail me a code
          <ArrowRight size={15} strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-8 w-full h-[52px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base -tracking-[0.01em] flex items-center justify-center shadow-sm transition-colors"
      >
        Go to your Place
      </button>
    </div>
  );
}
