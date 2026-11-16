'use client';

// Paying to join a business's plan from its web page (Plans for the holidays B3, 07-screens P2, contract 10.3).
// Shown only when the server sends the plan's price with its words (`price.text`), which it does while the business
// has `plans_paid`. "Join for $18" opens the web's shipped sign-in and comes back here with `?join=1`; signed in, it
// holds the spot (POST /api/plans/:id/requests, the same route the apps call), shows P1's lines and the payment
// company's web payment form (card, Apple Pay, Google Pay), and lets the person in only once the server confirms the
// payment (…/requests/mine/confirm). Every amount and line is the server's. No payment without an account. A hold
// that runs out before the card is accepted says "That took a while. Start again."; a payment that went through after
// the plan filled (409 full) or stopped taking people (409 ended) shows the server's words: the money is on its way back.

import { useEffect, useRef, useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import * as api from '@pantopus/api';
import StripeProvider from '@/components/payments/StripeProvider';

type Paid = { text: string; leave_text?: string | null; leave_back_cents?: number; receipt?: { link: string } | null };
type Payment = { payment_id: string; amount_cents: number; amount_text: string; client_secret: string };
type Hold = { payment: Payment; holdUntil: string | null };

const BUTTON = 'flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-[15px] font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60';
const SECONDARY = 'flex h-12 w-full items-center justify-center rounded-xl border border-app-border px-4 text-[15px] font-semibold text-app-text transition hover:bg-app-hover disabled:opacity-60';

function errorOf(err: unknown): { code: string | null; message: string } {
  const e = err as { data?: { error?: string; message?: string }; code?: string; message?: string };
  return {
    code: e?.data?.error || (typeof e?.code === 'string' ? e.code : null),
    message: e?.data?.message || e?.message || 'Something went wrong. Please try again.',
  };
}

function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** An .ics file for "Add to calendar", built here from the plan's own times and place. */
function calendarHref({ title, startsAt, endsAt, place }: { title: string; startsAt: string | null; endsAt: string | null; place: string }): string | null {
  if (!startsAt) return null;
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (text: string) => text.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pantopus//Plans//EN', 'BEGIN:VEVENT',
    `DTSTART:${stamp(startsAt)}`, `DTEND:${stamp(endsAt || startsAt)}`, `SUMMARY:${escape(title)}`, `LOCATION:${escape(place)}`,
    'END:VEVENT', 'END:VCALENDAR'];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

function PayForm({ planId, amountText, onPaid, onAccepted, onRefunded }: {
  planId: string;
  amountText: string;
  onPaid: (paid: Paid) => void;
  onAccepted: () => void;
  onRefunded: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Set once the card is accepted: a retry repeats only the confirm, never a second payment.
  const [accepted, setAccepted] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (processing) return;
    if (!stripe || !elements) {
      setMessage('Payment is still loading. Please wait a moment.');
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      if (!accepted) {
        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: `${window.location.origin}${window.location.pathname}?join=1` },
          redirect: 'if_required',
        });
        if (error) {
          setMessage(error.message || 'Your card was not charged. Please try again.');
          return;
        }
        setAccepted(true);
        onAccepted();
      }
      const plan = await api.post(`/api/plans/${encodeURIComponent(planId)}/requests/mine/confirm?biz=1`, {});
      if (plan?.paid) onPaid(plan.paid as Paid);
      else setMessage("This payment hasn't gone through yet. Please try again in a moment.");
    } catch (err) {
      const { code, message: text } = errorOf(err);
      if (code === 'full' || code === 'ended') onRefunded(text);
      else setMessage(text);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {accepted ? <p className="text-sm text-app-text">Your card was accepted.</p> : <PaymentElement options={{ wallets: { applePay: 'auto', googlePay: 'auto' } }} />}
      {message ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{message}</p> : null}
      <button type="submit" disabled={processing || !stripe} className={BUTTON}>
        {processing ? 'Paying…' : accepted ? 'Try again' : `Pay ${amountText}`}
      </button>
    </form>
  );
}

export default function PayToJoin({
  planId, signedIn, joinNow, priceText, refundText, returnPath, title, startsAt, endsAt, place, paid: paidAtLoad, waiting,
}: {
  planId: string;
  signedIn: boolean;
  joinNow: boolean;
  priceText: string;
  refundText: string | null;
  returnPath: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  place: string;
  paid: Paid | null;
  waiting: boolean;
}) {
  const [hold, setHold] = useState<Hold | null>(null);
  const [paid, setPaid] = useState<Paid | null>(paidAtLoad);
  const [state, setState] = useState<'idle' | 'holding' | 'waitlisted' | 'late' | 'refunded'>(waiting ? 'waitlisted' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  // Once the card is accepted the server decides (in, or the money back); the hold's end no longer matters here.
  const accepted = useRef(false);

  // The spot is held for 10 minutes: a form left open past that starts again (07-screens P1).
  useEffect(() => {
    if (state !== 'holding' || !hold?.holdUntil) return undefined;
    const ms = new Date(hold.holdUntil).getTime() - Date.now();
    if (Number.isNaN(ms)) return undefined;
    const timer = setTimeout(() => { if (!accepted.current) setState('late'); }, Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [state, hold]);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // No `via`: who brought the person is the server's to work out (the business's own invitation, link or a follow;
      // otherwise Pantopus, as for a friend's share).
      const result = await api.post(`/api/plans/${encodeURIComponent(planId)}/requests?biz=1`, { party_size: 1 });
      if (result?.payment?.client_secret) {
        accepted.current = false;
        setHold({ payment: result.payment as Payment, holdUntil: result.request?.hold_expires_at || null });
        setState('holding');
      } else if (result?.request?.status === 'waitlisted') {
        setState('waitlisted');
      } else if (result?.plan?.paid) {
        setPaid(result.plan.paid as Paid);
      }
    } catch (err) {
      setMessage(errorOf(err).message);
    } finally {
      setBusy(false);
    }
  };

  // Back from sign-in with ?join=1: straight to paying.
  useEffect(() => {
    if (signedIn && joinNow && !paidAtLoad && !waiting && !started.current) {
      started.current = true;
      void join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, joinNow]);

  if (paid) {
    const calendar = calendarHref({ title, startsAt, endsAt, place });
    return (
      <section aria-label="You're in" className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4">
        <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">You&apos;re in</p>
        <p className="text-sm leading-5 text-app-text-strong">{place}</p>
        <p className="text-sm font-semibold leading-5 text-app-text">{paid.text}</p>
        {calendar ? <a href={calendar} download="plan.ics" className={SECONDARY}>Add to calendar</a> : null}
        <p className="text-sm leading-5 text-app-text-secondary">Get the app for the chat and your receipt.</p>
      </section>
    );
  }

  // Sign-in returns only to /app/ addresses: /app/plans/:id/join sends the person on to this page with ?join=1. The
  // plan-link page comes back to itself through the same stop only for a business's plan, which never has one.
  const signInReturn = returnPath.startsWith('/plans/') ? `/app${returnPath}/join` : `${returnPath}?join=1`;
  if (!signedIn) {
    return (
      <a href={`/login?redirectTo=${encodeURIComponent(signInReturn)}`} className={BUTTON}>
        Join for {priceText}
      </a>
    );
  }

  if (state === 'waitlisted') {
    return <p className="text-sm leading-5 text-app-text-secondary">It&apos;s full right now. You&apos;re on the waitlist, and nothing is charged to wait.</p>;
  }

  if (state === 'refunded') {
    return <p role="alert" className="text-sm leading-5 text-app-text">{message}</p>;
  }

  if (state === 'late') {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm leading-5 text-app-text">That took a while. Start again.</p>
        <button type="button" className={BUTTON} disabled={busy} onClick={() => { setHold(null); setState('idle'); void join(); }}>
          Join for {priceText}
        </button>
      </div>
    );
  }

  if (state === 'holding' && hold) {
    const until = timeOf(hold.holdUntil);
    return (
      <section aria-label="Paying for a spot" className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4">
        <div className="flex items-center justify-between text-sm leading-5 text-app-text">
          <span>1 spot</span>
          <span className="[font-variant-numeric:tabular-nums]">{priceText}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-app-text-secondary">You pay today</span>
          <span className="text-2xl font-semibold text-app-text [font-variant-numeric:tabular-nums]">{hold.payment.amount_text}</span>
        </div>
        {refundText ? <p className="text-sm leading-5 text-app-text-secondary">{refundText}</p> : null}
        {until ? <p className="text-xs leading-4 text-app-text-secondary">Your spot is held until {until}.</p> : null}
        <StripeProvider clientSecret={hold.payment.client_secret}>
          <PayForm
            planId={planId}
            amountText={hold.payment.amount_text}
            onPaid={setPaid}
            onAccepted={() => { accepted.current = true; }}
            onRefunded={(text) => { setMessage(text); setState('refunded'); }}
          />
        </StripeProvider>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className={BUTTON} disabled={busy} onClick={() => void join()}>
        {busy ? 'Holding your spot…' : `Join for ${priceText}`}
      </button>
      {refundText ? <p className="text-center text-xs leading-4 text-app-text-secondary">{refundText}</p> : null}
      {message ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{message}</p> : null}
    </div>
  );
}
