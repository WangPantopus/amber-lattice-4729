'use client';

// What a mail-level part of Place (Block founders, the Fridge card, Rate watch) shows a person verified by a fast
// check: the server's MAIL_PROOF_REQUIRED words and a way to ask for the postcard (FASTVERIFY).

import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { FAST_VERIFY_WORDS } from './fastVerifyWords';

export const MAIL_PROOF_WORDS = 'This needs a mailed code. Ask for the postcard in Place.';

/** True when the server refused because the thing needs a mailed code (403 MAIL_PROOF_REQUIRED). */
export function isMailProofRequired(error: unknown): boolean {
  const e = error as { code?: unknown; data?: { code?: unknown } } | null;
  return e?.data?.code === 'MAIL_PROOF_REQUIRED' || e?.code === 'MAIL_PROOF_REQUIRED';
}

export default function MailProofCard({ title, homeId }: { title: string; homeId: string }) {
  const router = useRouter();
  return (
    <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm p-4 flex items-start gap-3.5" data-testid="mail-proof-required">
      <span className="w-11 h-11 rounded-xl bg-app-surface-sunken flex items-center justify-center shrink-0">
        <Lock size={20} strokeWidth={2} className="text-app-text-muted" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-semibold text-app-text">{title}</div>
        <div className="text-[12.5px] text-app-text-muted mt-0.5">{MAIL_PROOF_WORDS}</div>
        <button
          type="button"
          onClick={() => router.push(`/app/homes/${homeId}/verify-postcard?return=place`)}
          className="mt-2 text-[13.5px] font-semibold text-primary-600 dark:text-primary-300 hover:underline underline-offset-2"
        >
          {FAST_VERIFY_WORDS.mailMeACode}
        </button>
      </div>
    </div>
  );
}
