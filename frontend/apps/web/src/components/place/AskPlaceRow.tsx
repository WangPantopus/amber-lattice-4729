'use client';

import { ChevronRight, Sparkles } from 'lucide-react';

/** The assistant about the place on screen, as the phones' Place ends ("Ask Pantopus about your home"). */
export default function AskPlaceRow({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3.5 text-left shadow-sm hover:bg-app-hover"
      data-testid="place-ask"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-home-bg text-app-home">
        <Sparkles size={18} strokeWidth={2} />
      </span>
      <span className="flex-1 text-[15px] font-semibold text-app-text">{label}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-app-text-muted" aria-hidden="true" />
    </button>
  );
}
