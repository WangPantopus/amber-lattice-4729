'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, X, Info, AlertTriangle } from 'lucide-react';
import type { ToastItem, ToastVariant } from './toast-store';

// ─── Variant config ──────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, { bg: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-green-700 text-white',
    icon: <Check className="w-4 h-4" />,
  },
  error: {
    bg: 'bg-red-600 text-white',
    icon: <X className="w-4 h-4" />,
  },
  info: {
    bg: 'bg-primary-600 text-white',
    icon: <Info className="w-4 h-4" />,
  },
  warning: {
    bg: 'bg-amber-500 text-app-text',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
};

// ─── Toast component ─────────────────────────────────────────

export default function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const { bg, icon } = VARIANT_STYLES[toast.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Slide-in on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, toast.duration);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.duration, onDismiss]);

  // Pause on hover (and, for a toast with a button, while the keyboard is on it)
  const handleMouseEnter = () => clearTimeout(timerRef.current);
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, 1000);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={toast.action ? handleMouseEnter : undefined}
      onBlur={toast.action ? handleMouseLeave : undefined}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg max-w-sm w-full
        transition-all duration-200 ease-out
        ${visible && !exiting ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}
        ${bg}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <p className="flex-1 text-sm font-medium min-w-0">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          data-testid={toast.action.testId}
          onClick={() => {
            const { onClick } = toast.action!;
            setExiting(true);
            setTimeout(() => onDismiss(toast.id), 200);
            onClick();
          }}
          className="flex-shrink-0 rounded-lg px-2 py-0.5 text-sm font-semibold underline-offset-2 hover:underline hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setExiting(true);
          setTimeout(() => onDismiss(toast.id), 200);
        }}
        className="flex-shrink-0 p-0.5 opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
