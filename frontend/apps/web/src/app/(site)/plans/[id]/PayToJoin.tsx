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
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import PlanPayment, { paymentError, PlanPaymentReturn } from '@/components/plans/PlanPayment';
import { detailPath, fieldClass } from '@/components/plans/PlansWorkspace';
import { ages } from '@/components/plans/PlanKindFields';

export type BookingPlan = Pick<plans.Detail, 'kind' | 'kids_welcome' | 'is_full'> & {
  viewer: Pick<plans.Detail['viewer'], 'request_status'>;
  my_request?: Pick<NonNullable<plans.Detail['my_request']>, 'party_size' | 'kids_count'> | null;
};
type Hold = {
  payment: plans.PlanPayment;
  holdUntil: string | null;
  spotsText?: string;
  eachText?: string;
  groupText?: string;
};
const BUTTON =
  'flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-[15px] font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60';
const SECONDARY =
  'flex h-12 w-full items-center justify-center rounded-xl border border-app-border px-4 text-[15px] font-semibold text-app-text transition hover:bg-app-hover disabled:opacity-60';

function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** An .ics file for "Add to calendar", built here from the plan's own times and place. */
function calendarHref({
  title,
  startsAt,
  endsAt,
  place,
}: {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  place: string;
}): string | null {
  if (!startsAt) return null;
  const stamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const escape = (text: string) => text.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pantopus//Plans//EN',
    'BEGIN:VEVENT',
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt || startsAt)}`,
    `SUMMARY:${escape(title)}`,
    `LOCATION:${escape(place)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

export default function PayToJoin({
  planId,
  signedIn,
  joinNow,
  priceText,
  refundText,
  returnPath,
  title,
  startsAt,
  endsAt,
  place,
  paid: paidAtLoad,
  waiting,
  plan,
  gps,
  onChanged,
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
  paid: plans.PaidSpot | null;
  plan?: BookingPlan;
  gps?: plans.GPS;
  onChanged?: () => void;
  waiting: boolean;
}) {
  const [hold, setHold] = useState<Hold | null>(null);
  const [paid, setPaid] = useState<plans.PaidSpot | null>(paidAtLoad);
  const [state, setState] = useState<'idle' | 'holding' | 'waitlisted' | 'late' | 'refunded'>(
    waiting ? 'waitlisted' : 'idle',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState(plan?.my_request?.party_size || 1);
  const [kids, setKids] = useState(plan?.my_request?.kids_count ?? (plan?.kind === 'playdate' ? 1 : 0));
  const [ageBands, setAgeBands] = useState<string[]>([]);
  const [staying, setStaying] = useState(false);
  const [sendLink, setSendLink] = useState(false);
  const [linkSpots, setLinkSpots] = useState(2);
  const input: plans.Booking = sendLink
    ? { for: 'link', spots: linkSpots, gps }
    : {
        party_size: party,
        gps,
        kids_count: plan?.kids_welcome || plan?.kind === 'playdate' ? kids : undefined,
        kids_age_bands: plan?.kind === 'playdate' ? ageBands : undefined,
        stays_with_kids: plan?.kind === 'playdate' ? staying : undefined,
      };
  const base = useQuery({
    queryKey: ['plans', 'quote', planId, party, kids],
    queryFn: () => plans.quoteSpot(planId, { party_size: party, kids_count: kids || undefined }),
    enabled: signedIn && !paid && !waiting && state !== 'refunded',
    retry: false,
  });
  const links = useQuery({
    queryKey: ['plans', 'link-quote', planId, linkSpots],
    queryFn: () => plans.quoteSpot(planId, { for: 'link', spots: linkSpots }),
    enabled: signedIn && sendLink,
    retry: false,
  });
  const quote = sendLink ? links : base;
  const started = useRef(false);
  // Once the card is accepted the server decides (in, or the money back); the hold's end no longer matters here.
  const accepted = useRef(false);

  // The spot is held for 10 minutes: a form left open past that starts again (07-screens P1).
  useEffect(() => {
    if (state !== 'holding' || !hold?.holdUntil) return undefined;
    const ms = new Date(hold.holdUntil).getTime() - Date.now();
    if (Number.isNaN(ms)) return undefined;
    const timer = setTimeout(
      () => {
        if (!accepted.current) setState('late');
      },
      Math.max(0, ms),
    );
    return () => clearTimeout(timer);
  }, [state, hold]);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // No `via`: who brought the person is the server's to work out (the business's own invitation, link or a follow;
      // otherwise Pantopus, as for a friend's share).
      const result = await plans.holdSpot(planId, input);
      if (result?.payment?.client_secret) {
        accepted.current = false;
        const quoted = result.payment.amount_text === quote.data?.total_text ? quote.data : undefined;
        setHold({
          payment: result.payment,
          holdUntil: result.request?.hold_expires_at || null,
          spotsText: result.payment.spots_text ?? quoted?.spots_text,
          eachText: result.payment.each_text ?? quoted?.each_text,
          groupText: quoted?.group?.text,
        });
        setState('holding');
      } else if (result?.request?.status === 'waitlisted') {
        setState('waitlisted');
        onChanged?.();
      } else if (result?.plan?.paid) {
        setPaid(result.plan.paid);
        onChanged?.();
      }
    } catch (err) {
      setMessage(paymentError(err).message);
    } finally {
      setBusy(false);
    }
  };

  // Back from sign-in with ?join=1: straight to paying.
  useEffect(() => {
    if (
      signedIn &&
      joinNow &&
      !paidAtLoad &&
      !waiting &&
      !started.current &&
      !new URLSearchParams(window.location.search).has('plan_payment') &&
      plan?.kind !== 'playdate'
    ) {
      started.current = true;
      void join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, joinNow]);

  const recovery =
    !onChanged && signedIn ? (
      <PlanPaymentReturn
        id={planId}
        onComplete={() => {
          void plans
            .detail(planId)
            .then((p) => setPaid(p.paid ?? null))
            .catch(() => undefined);
        }}
      />
    ) : null;
  if (paid) {
    const calendar = calendarHref({ title, startsAt, endsAt, place });
    return (
      <section
        aria-label="You're in"
        className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4"
      >
        {recovery}
        <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">You&apos;re in</p>
        <p className="text-sm leading-5 text-app-text-strong">{place}</p>
        <p className="text-sm font-semibold leading-5 text-app-text">{paid.text}</p>
        {calendar ? (
          <a href={calendar} download="plan.ics" className={SECONDARY}>
            Add to calendar
          </a>
        ) : null}
        <Link className={SECONDARY} href={detailPath(planId)}>
          Open plan and chat
        </Link>
        {paid.receipt?.link && (
          <Link href={paid.receipt.link} className={SECONDARY}>
            View receipt
          </Link>
        )}
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
    return (
      <p className="text-sm leading-5 text-app-text-secondary">
        It&apos;s full right now. You&apos;re on the waitlist, and nothing is charged to wait.
      </p>
    );
  }

  if (state === 'refunded') {
    return (
      <p role="alert" className="text-sm leading-5 text-app-text">
        {message}
      </p>
    );
  }

  if (state === 'late') {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm leading-5 text-app-text">
          That took a while. Start again.
        </p>
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={() => {
            setHold(null);
            setState('idle');
            void join();
          }}
        >
          Join for {priceText}
        </button>
      </div>
    );
  }

  if (state === 'holding' && hold) {
    const until = timeOf(hold.holdUntil);
    return (
      <section
        aria-label="Paying for a spot"
        className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4"
      >
        <div className="flex items-center justify-between text-sm leading-5 text-app-text">
          <span>{hold.spotsText || 'Booking'}</span>
          <span className="[font-variant-numeric:tabular-nums]">{hold.eachText}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-app-text-secondary">You pay today</span>
          <span className="text-2xl font-semibold text-app-text [font-variant-numeric:tabular-nums]">
            {hold.payment.amount_text}
          </span>
        </div>
        {hold.groupText && <p>{hold.groupText}</p>}
        {refundText ? <p className="text-sm leading-5 text-app-text-secondary">{refundText}</p> : null}
        {until ? (
          <p className="text-xs leading-4 text-app-text-secondary">Your spot is held until {until}.</p>
        ) : null}
        <PlanPayment
          id={planId}
          target="spot"
          payment={hold.payment}
          onComplete={(text) => {
            setPaid({ text });
            onChanged?.();
            void plans
              .detail(planId)
              .then((p) => setPaid(p.paid ?? { text }))
              .catch(() => undefined);
          }}
          onAccepted={() => {
            accepted.current = true;
          }}
          onClosed={(text) => {
            setMessage(text);
            setState('refunded');
            onChanged?.();
          }}
        />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {recovery}
      {plan && plan.viewer.request_status !== 'paying' && (
        <>
          {base.data?.group_pay && base.data.group_pay.max_spots >= 2 && (
            <label className="block text-sm">
              {base.data.group_pay.title}
              <select
                className={fieldClass}
                value={sendLink ? 'link' : 'party'}
                onChange={(e) => setSendLink(e.target.value === 'link')}
              >
                {base.data.group_pay.for.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sendLink ? (
            <label className="block text-sm">
              Spots to book
              <input
                className={fieldClass}
                type="number"
                min={2}
                max={base.data?.group_pay?.max_spots}
                value={linkSpots}
                onChange={(e) => setLinkSpots(Number(e.target.value))}
              />
            </label>
          ) : (
            <>
              {plan.kind !== 'playdate' && (
                <label className="block text-sm">
                  Party size, including you
                  <select
                    className={fieldClass}
                    value={party}
                    onChange={(e) => setParty(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              {(plan.kind === 'playdate' || plan.kids_welcome) && (
                <label className="block text-sm">
                  Kids
                  <input
                    type="number"
                    className={fieldClass}
                    min={plan.kind === 'playdate' ? 1 : 0}
                    max={8}
                    value={kids}
                    onChange={(e) => setKids(Number(e.target.value))}
                  />
                </label>
              )}
              {plan.kind === 'playdate' && (
                <fieldset className="space-y-1">
                  <legend>Kids’ ages</legend>
                  {Object.entries(ages).map(([key, name]) => (
                    <label key={key} className="mr-3">
                      <input
                        type="checkbox"
                        checked={ageBands.includes(key)}
                        onChange={(e) =>
                          setAgeBands(
                            e.target.checked ? [...ageBands, key] : ageBands.filter((v) => v !== key),
                          )
                        }
                      />{' '}
                      {name}
                    </label>
                  ))}
                  <label className="block">
                    <input type="checkbox" checked={staying} onChange={(e) => setStaying(e.target.checked)} />{' '}
                    I’ll stay with my kids.
                  </label>
                </fieldset>
              )}
            </>
          )}
        </>
      )}
      {quote.data?.group && <p>{quote.data.group.text}</p>}
      {quote.data && (
        <p>
          {quote.data.spots_text} · {quote.data.each_text}
        </p>
      )}
      {quote.isError && <p role="alert">{paymentError(quote.error).message}</p>}
      <button
        type="button"
        className={BUTTON}
        disabled={
          busy ||
          (plan?.kind === 'playdate' &&
            plan.viewer.request_status !== 'paying' &&
            (!ageBands.length || !staying)) ||
          (!plan?.is_full && plan?.viewer.request_status !== 'paying' && !quote.data)
        }
        onClick={() => void join()}
      >
        {busy
          ? 'Holding your spot…'
          : plan?.viewer.request_status === 'paying'
            ? 'Continue payment'
            : plan?.is_full
              ? 'Join waitlist'
              : `Join for ${quote.data?.total_text || priceText}`}
      </button>
      {refundText && <p className="text-center text-xs leading-4 text-app-text-secondary">{refundText}</p>}
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
