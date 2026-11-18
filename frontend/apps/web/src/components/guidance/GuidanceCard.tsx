'use client';

// ============================================================
// The centre card (GUIDE SPEC §1, drawings "The two shapes"): in the middle of the
// screen over a dimmed page that takes no taps. A title with an X at its right, up to
// three outlined-icon rows, one full-width button. The button, the X, a tap on the
// dimmed area and Escape all close it. Phone width: 16 px side margins, radius 20,
// 48 px button; computer: 460 px wide, radius 20, 46 px button. Sizes are in rem, so
// they follow the browser's text size; at large sizes the rows scroll inside the card
// while the title and button stay. Screen readers hear a dialog: the title (where
// focus starts), each row, then the button.
// ============================================================

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CentreCardContent } from './cards';
import GuidanceIcon from './GuidanceIcon';
import styles from './guidance.module.css';

export type CentreCardClose = 'primary' | 'close' | 'dim' | 'escape';

export default function GuidanceCard({
  card,
  onClose,
}: {
  card: CentreCardContent;
  /** How it closed; every way counts as seen. */
  onClose: (how: CentreCardClose) => void;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus starts on the title and goes back where it was when the card closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  // Escape closes; Tab stays inside the card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current('escape');
        return;
      }
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const at = document.activeElement;
      if (event.shiftKey && (at === first || at === titleRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && at === last) { event.preventDefault(); first.focus(); }
      else if (!cardRef.current.contains(at)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center px-[16px]" data-guidance="card">
      {/* The dimmed page: takes no taps but this one, which closes the card. */}
      <div
        aria-hidden
        className={`${styles.dim} absolute inset-0 bg-[rgba(17,24,39,0.52)] dark:bg-[rgba(0,0,0,0.62)]`}
        onClick={() => onClose('dim')}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={`guidance.card.${card.id}`}
        className={`${styles.card} relative flex max-h-[calc(100dvh-32px)] w-full flex-col gap-[20px] rounded-[20px] bg-white px-[20px] pb-[20px] pt-[24px] text-[#111827] shadow-[0_24px_60px_rgba(0,0,0,0.35)] dark:bg-[#1C2230] dark:text-[#e6edf3] md:w-[460px] md:px-[28px] md:pb-[24px] md:pt-[28px]`}
      >
        <h2
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="flex-none pr-[40px] text-[1.4375rem] font-bold leading-[1.12] tracking-[-0.01em] outline-none md:text-[1.5rem]"
        >
          {card.title}
        </h2>
        <div className="-mr-[8px] min-h-0 flex-1 overflow-y-auto pr-[8px]">
          <div className="flex flex-col gap-[16px]">
            {card.lines.map(([icon, text]) => (
              <div key={text} className="grid grid-cols-[26px_1fr] items-start gap-[14px]">
                <GuidanceIcon name={icon} className="mt-px h-[26px] w-[26px]" />
                <p className="text-[0.96875rem] leading-[1.38] text-[#1f2937] dark:text-[#c9d1db]">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          data-testid={`guidance.card.${card.id}.primary`}
          onClick={() => onClose('primary')}
          className="mt-[4px] flex min-h-[3rem] flex-none items-center justify-center rounded-[12px] bg-[#0369A1] px-[16px] py-[8px] text-[1rem] font-semibold text-white transition hover:bg-[#075985] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0369A1] focus-visible:ring-offset-2 dark:focus-visible:ring-[#7DD3FC] dark:focus-visible:ring-offset-[#1C2230] md:min-h-[2.875rem] md:text-[0.96875rem]"
        >
          {card.button}
        </button>
        {/* Last in reading order (title, rows, button), drawn at the title's right. */}
        <button
          type="button"
          aria-label="Close"
          data-testid={`guidance.card.${card.id}.close`}
          onClick={() => onClose('close')}
          className="absolute right-[12px] top-[18px] flex h-[44px] w-[44px] items-center justify-center rounded-full transition hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0369A1] dark:hover:bg-white/10 dark:focus-visible:ring-[#7DD3FC] md:right-[20px] md:top-[22px]"
        >
          <X aria-hidden className="h-[24px] w-[24px]" strokeWidth={2} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
