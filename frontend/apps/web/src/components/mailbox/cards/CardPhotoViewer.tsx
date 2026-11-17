'use client';

/**
 * A card's own photo over the whole window (the founder, November 16; launch key holiday_card_memories): dark like a
 * photo viewer. It grows out of the print it was opened from and goes back into it. Pinch, the wheel or a double-tap
 * (double-click) enlarges it, up to twice the photo's own size; a drag moves around it; pulling it down, a click beside
 * it, the close button or Escape puts it back. It draws the print's own object URL, so nothing is fetched again and a
 * photo that is still covered never opens here.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type PhotoOrigin = { left: number; top: number; width: number; height: number; tilt: number };

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

type View = { scale: number; x: number; y: number; pull: number };
const AT_REST: View = { scale: 1, x: 0, y: 0, pull: 0 };

export default function CardPhotoViewer({
  src,
  alt,
  origin,
  onClose,
}: {
  /** The photo, as the print drew it. */
  src: string;
  alt: string;
  /** Where the print's photo lies in the window and how it's turned; null fades the photo in. */
  origin: PhotoOrigin | null;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const viewRef = useRef<View>(AT_REST);
  const [view, setViewState] = useState<View>(AT_REST);
  const [shown, setShown] = useState(false);
  const closingRef = useRef(false);
  const setView = useCallback((next: View) => { viewRef.current = next; setViewState(next); }, []);

  /** The photo's box at its resting size, and the most it can be enlarged: twice its own size, at least three times. */
  const fitted = useCallback(() => {
    const image = imageRef.current;
    const rect = { width: image?.clientWidth || 1, height: image?.clientHeight || 1 };
    const own = image?.naturalWidth ? (image.naturalWidth / (rect.width * (window.devicePixelRatio || 1))) * 2 : 3;
    return { ...rect, most: Math.max(3, own) };
  }, []);

  /** Never so far that the photo's edge comes in from the window's. */
  const kept = useCallback((next: View): View => {
    const box = boxRef.current;
    const size = fitted();
    const scale = clamp(next.scale, 1, size.most);
    const reachX = Math.max(0, (size.width * scale - (box?.clientWidth || 0)) / 2);
    const reachY = Math.max(0, (size.height * scale - (box?.clientHeight || 0)) / 2);
    return { scale, x: clamp(next.x, -reachX, reachX), y: clamp(next.y, -reachY, reachY), pull: next.pull };
  }, [fitted]);

  /** The transform that lays the photo, fitted to the window, exactly over the print's photo. */
  const fromPrint = useCallback(() => {
    const image = imageRef.current;
    if (!origin || !image || reducedMotion()) return null;
    const rect = image.getBoundingClientRect();
    if (!rect.width) return null;
    const scale = origin.width / rect.width;
    const dx = origin.left + origin.width / 2 - (rect.left + rect.width / 2);
    const dy = origin.top + origin.height / 2 - (rect.top + rect.height / 2);
    return `translate(${dx}px, ${dy}px) rotate(${origin.tilt}deg) scale(${scale})`;
  }, [origin]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const image = imageRef.current;
    const box = boxRef.current;
    const time = reducedMotion() ? 120 : 260;
    setView(AT_REST);
    box?.animate([{ backgroundColor: 'rgba(0,0,0,0)' }], { duration: time, fill: 'forwards', easing: 'ease-out' });
    const back = fromPrint();
    const done = image?.animate(
      back ? [{ transform: back }] : [{ opacity: 0 }],
      { duration: time, fill: 'forwards', easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
    );
    if (done) done.onfinish = onClose; else onClose();
  }, [fromPrint, onClose, setView]);

  // It grows out of its print (or fades in), and the close button takes the keyboard.
  useLayoutEffect(() => {
    const image = imageRef.current;
    const start = () => {
      if (!image || shown) return;
      setShown(true);
      const time = reducedMotion() ? 150 : 360;
      const from = fromPrint();
      image.animate(
        from ? [{ transform: from }, { transform: 'none' }] : [{ opacity: 0 }, { opacity: 1 }],
        { duration: time, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      boxRef.current?.animate([{ backgroundColor: 'rgba(0,0,0,0)' }, { backgroundColor: 'rgba(0,0,0,1)' }], { duration: time, easing: 'ease-out' });
    };
    if (image?.complete) start(); else image?.addEventListener('load', start, { once: true });
    closeRef.current?.focus();
    return () => image?.removeEventListener('load', start);
    // Once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes it, and no key reaches what is under it; Tab stays on its one button.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
      else if (event.key === '+' || event.key === '=') setView(kept({ ...viewRef.current, scale: viewRef.current.scale * 1.5 }));
      else if (event.key === '-') setView(kept({ ...viewRef.current, scale: viewRef.current.scale / 1.5 }));
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [close, kept, setView]);

  /** Enlarge by `factor` about a point of the window, which stays under the finger or the pointer. */
  const zoomAbout = useCallback((factor: number, px: number, py: number, pan = { x: 0, y: 0 }) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const now = viewRef.current;
    const scale = clamp(now.scale * factor, 1, fitted().most);
    const change = scale / now.scale;
    const cx = px - (box.left + box.width / 2);
    const cy = py - (box.top + box.height / 2);
    setView(kept({ scale, x: (now.x - cx) * change + cx + pan.x, y: (now.y - cy) * change + cy + pan.y, pull: 0 }));
  }, [fitted, kept, setView]);

  // The wheel enlarges it about the pointer (a pinch on a trackpad arrives as the wheel too).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAbout(Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.0022)), event.clientX, event.clientY);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [zoomAbout]);

  // Fingers and the mouse: two enlarge it about themselves, one moves around it while it's enlarged and pulls it down
  // while it isn't. A press that never moves is a tap: beside the photo it closes, twice on it enlarges.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, lastTap: 0, speed: 0, at: 0, onPhoto: false });
  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) gesture.current = { ...gesture.current, moved: 0, speed: 0, at: event.timeStamp, onPhoto: event.target === imageRef.current };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) return;
    const all = [...pointers.current.values()];
    const dx = event.clientX - before.x;
    const dy = event.clientY - before.y;
    gesture.current.moved += Math.hypot(dx, dy);
    if (all.length >= 2) {
      const other = all.find((point) => point !== before)!;
      const was = Math.hypot(before.x - other.x, before.y - other.y) || 1;
      const now = Math.hypot(event.clientX - other.x, event.clientY - other.y) || 1;
      zoomAbout(now / was, (event.clientX + other.x) / 2, (event.clientY + other.y) / 2, { x: dx / 2, y: dy / 2 });
    } else if (gesture.current.moved > 6) {
      const view0 = viewRef.current;
      if (view0.scale > 1.01) setView(kept({ ...view0, x: view0.x + dx, y: view0.y + dy }));
      else {
        setView({ ...view0, pull: Math.max(0, view0.pull + dy) });
        const elapsed = Math.max(1, event.timeStamp - gesture.current.at);
        gesture.current.speed = (dy / elapsed) * 1000;
        gesture.current.at = event.timeStamp;
      }
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (!pointers.current.delete(event.pointerId) || pointers.current.size) return;
    const now = viewRef.current;
    if (gesture.current.moved <= 6) {
      // A tap: beside the photo it closes; twice on the photo enlarges it about that spot, or brings it back.
      if (!gesture.current.onPhoto) { close(); return; }
      if (event.timeStamp - gesture.current.lastTap < 320) {
        gesture.current.lastTap = 0;
        if (now.scale > 1.01) setView(AT_REST); else zoomAbout(2.5, event.clientX, event.clientY);
      } else gesture.current.lastTap = event.timeStamp;
      return;
    }
    if (now.scale < 1.06 && now.scale !== 1) setView({ ...AT_REST, pull: now.pull });
    if (now.pull > 0) {
      const tall = boxRef.current?.clientHeight || 600;
      if (now.pull > tall * 0.14 || (gesture.current.speed > 900 && now.pull > 24)) close(); else setView({ ...viewRef.current, pull: 0 });
    }
  };

  if (typeof document === 'undefined') return null;
  const tall = boxRef.current?.clientHeight || 800;
  const pulled = clamp(view.pull / (tall * 0.3), 0, 1);
  const moving = pointers.current.size > 0;
  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      data-testid="cardPhotoViewer"
      className="fixed inset-0 z-[2147483000] flex touch-none select-none items-center justify-center overflow-hidden"
      style={{ backgroundColor: `rgba(0,0,0,${1 - pulled * 0.75})`, overscrollBehavior: 'contain' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* An object URL from the card's own route: next/image can't load it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        data-testid="cardPhotoFull"
        className="max-h-full max-w-full object-contain"
        style={{
          transform: `translate(${view.x}px, ${view.y + view.pull}px) scale(${view.scale})`,
          transition: moving || reducedMotion() ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
          cursor: view.scale > 1.01 ? 'grab' : 'zoom-in',
          visibility: shown ? 'visible' : 'hidden',
        }}
      />
      <button
        ref={closeRef}
        type="button"
        onClick={close}
        aria-label="Close the photo"
        data-testid="cardPhotoClose"
        className="absolute flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6ecd9]"
        style={{
          left: 'max(12px, env(safe-area-inset-left, 0px))',
          top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          background: 'rgba(24,18,16,0.6)',
          boxShadow: 'inset 0 0 0 0.5px rgba(246,236,217,0.16)',
          opacity: 1 - pulled,
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f6ecd9" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
