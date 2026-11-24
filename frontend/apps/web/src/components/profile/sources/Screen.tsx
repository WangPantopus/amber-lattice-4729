'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';

/**
 * A screen of its own over the profile (boards 8 and 10): full screen on a phone, a centred panel on a wider screen,
 * with its title in a top bar, Back or Close on the left and one action on the right. Escape closes it (through
 * `onClose`, which may ask first); focus goes back where it was.
 */
export default function Screen({ open, onClose, title, close = 'back', right, footer, children, z = 'z-50' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  close?: 'back' | 'close';
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  z?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only the top screen answers Escape.
      if (e.key !== 'Escape' || !panel.current) return;
      const screens = document.querySelectorAll('[data-profile-screen]');
      if (screens[screens.length - 1] !== panel.current) return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
  if (!open || !mounted) return null;
  const Icon = close === 'back' ? ChevronLeft : X;
  return createPortal(
    <div className={`fixed inset-0 ${z} flex items-stretch sm:items-center justify-center`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] hidden sm:block" onClick={onClose} />
      <div
        ref={panel}
        data-profile-screen=""
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl bg-app sm:rounded-2xl sm:border sm:border-app shadow-2xl flex flex-col overflow-hidden outline-none"
      >
        <div className="shrink-0 h-12 grid grid-cols-[minmax(2.75rem,auto)_minmax(0,1fr)_minmax(2.75rem,auto)] items-center gap-1 px-1 bg-surface border-b border-app">
          <button type="button" onClick={onClose} aria-label={close === 'back' ? 'Back' : 'Close'} className="w-11 h-11 rounded-full flex items-center justify-center text-app hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]">
            <Icon aria-hidden="true" className={close === 'back' ? 'w-[1.625rem] h-[1.625rem]' : 'w-6 h-6'} strokeWidth={2.25} />
          </button>
          <h2 id={titleId} className="text-center text-[1.0625rem] font-semibold text-app truncate">{title}</h2>
          <div className="flex justify-end">{right}</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="shrink-0 bg-surface border-t border-app px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
