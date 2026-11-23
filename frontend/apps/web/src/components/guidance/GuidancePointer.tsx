'use client';

// ============================================================
// The pointer (GUIDE SPEC §1, drawings "The two shapes"): a ring around one control
// (2.5 px, #0369A1 light / #7DD3FC dark, a 6 px soft halo, 4 px clear of the control)
// and a 272 px bubble attached to it, its arrow centred on the control: below the
// control, or above it when the control is in the lower half of the screen, 12 px
// from the screen's edges. The bubble is #0369A1 with white words in both modes: a
// bold title, one sentence and a "Got it" pill. The page isn't dimmed and still
// works: "Got it", a tap anywhere (the ringed control's own tap included, which still
// does its usual thing) and Escape close it. It follows the control as the page
// scrolls or resizes.
// ============================================================

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PointerContent } from './cards';
import styles from './guidance.module.css';

export type PointerClose = 'ok' | 'tap' | 'escape' | 'gone';

const BUBBLE_W = 272;
const EDGE = 12;
const CLEAR = 4;
const GAP = 14;

interface Box { left: number; top: number; width: number; height: number; radius: number }

function measure(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const own = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const radius = Math.min(own > 0 ? own : Math.min(r.width, r.height) / 2, Math.min(r.width, r.height) / 2);
  return { left: r.left, top: r.top, width: r.width, height: r.height, radius };
}

export default function GuidancePointer({
  pointer,
  anchor,
  onClose,
}: {
  pointer: PointerContent;
  anchor: Element;
  onClose: (how: PointerClose) => void;
}) {
  const titleId = useId();
  const textId = useId();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [box, setBox] = useState<Box | null>(() => measure(anchor));
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [bubbleH, setBubbleH] = useState(120);

  // Follow the control every frame while shown (scroll, resize, layout shifts).
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (!anchor.isConnected) { closeRef.current('gone'); return; }
      const next = measure(anchor);
      setBox((prev) => (prev && next && prev.left === next.left && prev.top === next.top
        && prev.width === next.width && prev.height === next.height ? prev : next));
      setView((prev) => (prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleH(bubbleRef.current.offsetHeight);
  }, [box, view, pointer]);

  // A tap anywhere closes it (the tap still reaches what's under it); Escape closes it.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (bubbleRef.current?.contains(event.target as Node)) return;
      closeRef.current('tap');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current('escape'); }
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // Keyboard and screen-reader users land on the bubble; focus goes back when it closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bubble = bubbleRef.current;
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      // Only when focus was still on the bubble: a tap elsewhere keeps what it focused.
      const at = document.activeElement;
      if (before && before.isConnected && (!at || at === document.body || bubble?.contains(at))) {
        before.focus({ preventScroll: true });
      }
    };
  }, []);

  if (!box) return null;
  const cx = box.left + box.width / 2;
  const below = box.top + box.height / 2 < view.h / 2;
  const left = Math.max(EDGE, Math.min(view.w - EDGE - BUBBLE_W, cx - BUBBLE_W / 2));
  const arrow = Math.max(18, Math.min(BUBBLE_W - 18, cx - left));
  const top = below
    ? box.top + box.height + CLEAR + GAP
    : box.top - CLEAR - GAP - bubbleH;

  return createPortal(
    // The fade sits on the ring and the bubble: on a wrapper it would make one layer under the top bar.
    <div data-guidance="pointer">
      <div
        aria-hidden
        className={`${styles.pointer} pointer-events-none fixed z-[1200] border-[2.5px] border-[#0369A1] shadow-[0_0_0_6px_rgba(3,105,161,0.2)] dark:border-[#7DD3FC] dark:shadow-[0_0_0_6px_rgba(125,211,252,0.28)]`}
        style={{
          left: box.left - CLEAR,
          top: box.top - CLEAR,
          width: box.width + CLEAR * 2,
          height: box.height + CLEAR * 2,
          borderRadius: box.radius + CLEAR,
        }}
      />
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-testid={`guidance.pointer.${pointer.id}`}
        className={`${styles.pointer} fixed z-[1200] flex w-[272px] flex-col gap-[6px] rounded-[18px] bg-[#0369A1] px-[16px] pb-[12px] pt-[15px] text-white shadow-[0_14px_34px_rgba(8,15,30,0.3)]`}
        style={{ left, top }}
      >
        <span
          aria-hidden
          className="absolute h-[16px] w-[16px] rotate-45 rounded-[3px] bg-[#0369A1]"
          style={{ left: arrow - 8, ...(below ? { top: -7 } : { bottom: -7 }) }}
        />
        <p ref={titleRef} id={titleId} tabIndex={-1} className="relative text-[1.0625rem] font-bold tracking-[-0.01em] outline-none">
          {pointer.title}
        </p>
        <p id={textId} className="relative text-[0.96875rem] leading-[1.38]">{pointer.text}</p>
        <div className="relative mt-[4px] flex justify-end">
          <button
            type="button"
            data-testid={`guidance.pointer.${pointer.id}.ok`}
            onClick={() => onClose('ok')}
            className="rounded-full bg-white/20 px-[16px] py-[7px] text-[0.9375rem] font-semibold text-white transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
