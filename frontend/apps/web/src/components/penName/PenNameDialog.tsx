'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocusTrap } from '@/lib/useDialogFocusTrap';

/**
 * The frame of the made-up name's small card and its name screen: above everything that can open them (the post panel
 * and the Pulse composer window sit at z-60 to z-71).
 */
export default function PenNameDialog({
  open,
  onClose,
  title,
  busy = false,
  maxWidth = 'max-w-sm',
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  busy?: boolean;
  maxWidth?: string;
  children: ReactNode;
  testId?: string;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const close = () => { if (!busy) onClose(); };
  const ref = useDialogFocusTrap<HTMLDivElement>(close, null, open && mounted);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !mounted) return null;
  return createPortal(
    // data-pen-name-dialog: a click in here isn't a click outside the composer that opened it.
    <div data-pen-name-dialog="" className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-t-2xl border border-app bg-surface shadow-2xl sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-app px-5 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-app">{title}</h2>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1.5 text-app-muted transition hover:text-app hover-bg-app disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
