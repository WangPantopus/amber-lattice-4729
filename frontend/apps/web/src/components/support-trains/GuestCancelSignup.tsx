'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type GuestSignup = {
  reservation_id: string;
  support_train_id: string;
  title: string;
  status: string;
  slot_date: string | null;
  slot_label: string | null;
  slot_time: string | null;
  can_cancel: boolean;
};

const BASE = '/api/activities/support-trains/guest-signups';

function dateLabel(value: string | null): string {
  if (!value) return 'Your date';
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** A guest's own Support Train signup, opened from their email: what it is, and a button to cancel it. */
export default function GuestCancelSignup({ reservationId, signature }: { reservationId: string; signature: string }) {
  const [signup, setSignup] = useState<GuestSignup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!reservationId || !signature) {
      setLoadError('This link is incomplete. Open it again from your email.');
      return;
    }
    fetch(`${BASE}/${encodeURIComponent(reservationId)}?s=${encodeURIComponent(signature)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) setLoadError(body?.message || 'Couldn’t open this sign-up. Please try again.');
        else setSignup(body);
      })
      .catch(() => alive && setLoadError('Couldn’t reach Pantopus. Check your connection and try again.'));
    return () => {
      alive = false;
    };
  }, [reservationId, signature]);

  async function cancel() {
    if (cancelling) return;
    setCancelling(true);
    setActionError(null);
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(reservationId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s: signature }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(body?.message || 'Couldn’t cancel your sign-up. Please try again.');
        return;
      }
      setSignup(body);
      setJustCancelled(true);
    } catch {
      setActionError('Couldn’t reach Pantopus. Check your connection and try again.');
    } finally {
      setCancelling(false);
    }
  }

  const cancelled = signup?.status === 'canceled';
  const when = signup ? [signup.slot_label, dateLabel(signup.slot_date)].filter(Boolean).join(' · ') : '';

  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 text-sm font-semibold text-app hover:opacity-80">
          Pantopus
        </Link>
        <section className="rounded-3xl border border-app bg-surface p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-app-text-secondary">Support Train sign-up</p>
          {loadError ? (
            <>
              <h1 className="mt-3 text-2xl font-semibold text-app">This link doesn’t open a sign-up</h1>
              <p className="mt-3 text-sm leading-6 text-app-text-secondary">{loadError}</p>
            </>
          ) : !signup ? (
            <p className="mt-3 text-sm text-app-text-secondary">Loading your sign-up…</p>
          ) : (
            <>
              <h1 className="mt-3 text-2xl font-semibold text-app">
                {cancelled ? (justCancelled ? 'Your sign-up is cancelled' : 'This sign-up was cancelled') : 'Cancel your sign-up?'}
              </h1>
              <div className="mt-5 rounded-2xl border border-app bg-surface-muted px-4 py-4">
                <p className="text-base font-semibold text-app">{signup.title}</p>
                <p className="mt-1 text-sm text-app-text-secondary">
                  {[when, signup.slot_time].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p className="mt-4 text-sm leading-6 text-app-text-secondary">
                {cancelled
                  ? 'The date is open again for someone else, and the organizer has been told. Thank you for letting them know.'
                  : signup.can_cancel
                    ? 'The date opens again for someone else, and the organizer is told you can’t make it.'
                    : signup.status === 'reserved'
                      ? 'This date has already passed, so there is nothing to cancel.'
                      : 'This help was already delivered, so the sign-up stays on the train.'}
              </p>
              {actionError ? (
                <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                  {actionError}
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {!cancelled && signup.can_cancel ? (
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={cancelling}
                    className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {cancelling ? 'Cancelling…' : 'Cancel my sign-up'}
                  </button>
                ) : null}
                <Link
                  href={`/support-trains/${encodeURIComponent(signup.support_train_id)}`}
                  className="rounded-full border border-app px-5 py-2.5 text-center text-sm font-semibold text-app hover:bg-surface-muted"
                >
                  {cancelled ? 'See the Support Train' : 'Keep my sign-up'}
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
