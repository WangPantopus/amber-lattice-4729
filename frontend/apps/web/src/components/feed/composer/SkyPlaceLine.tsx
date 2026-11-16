'use client';

import { SKY_WORDS } from './skyWords';

/** The Sky's floating icon: a dashed circle with a dot in it (contract section 10.1). */
function FloatingIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-primary-600 dark:text-primary-400" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.3" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2.5 2.3" strokeLinecap="round" />
      <circle cx="9" cy="9" r="2.7" fill="currentColor" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/**
 * The Pulse composer's place line under the Sky (phase A, contract section 10.2): "Floating over Camas, WA" with a
 * small "Pin it at a place" button that opens the place picker, or "At Esther Short Park" when a venue is tagged and a
 * photo taken there pins the post exactly.
 */
export default function SkyPlaceLine({
  area,
  pinnedAt,
  onPin,
}: {
  area: string;
  pinnedAt: string | null;
  onPin: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid="composer-sky-line">
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-app">
        {pinnedAt ? <PinIcon /> : <FloatingIcon />}
        <span className="truncate">{pinnedAt ? SKY_WORDS.at(pinnedAt) : SKY_WORDS.floatingOver(area)}</span>
      </span>
      {!pinnedAt && (
        <button
          type="button"
          onClick={onPin}
          className="rounded-full border border-primary-200 px-3 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-50 dark:border-primary-700/50 dark:text-primary-300 dark:hover:bg-primary-500/10"
          data-testid="composer-sky-pin"
        >
          {SKY_WORDS.pinAtPlace}
        </button>
      )}
    </div>
  );
}
