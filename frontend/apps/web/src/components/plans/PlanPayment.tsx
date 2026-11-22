'use client';

import { useEffect, useRef, useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { plans } from '@pantopus/api';
import StripeProvider from '@/components/payments/StripeProvider';
import { usePaymentRedirectCleanup } from '@/hooks/usePaymentRedirectCleanup';
import { buttonClass, secondaryClass } from './PlansWorkspace';

export function paymentError(error: unknown) {
  const e = error as { data?: { error?: string; message?: string }; code?: string; message?: string };
  return {
    code: e?.data?.error || e?.code,
    message: e?.data?.message || e?.message || 'Couldn’t check this payment. Try again.',
  };
}

function returnUrl(target?: string) {
  const url = new URL(window.location.pathname, window.location.origin);
  if (target) url.searchParams.set('plan_payment', target);
  return url;
}

export async function finishPayment(id: string, target: string) {
  if (target === 'spot') {
    const result = await plans.confirmSpot(id);
    if (!result.paid) throw new Error('Your payment is still being confirmed.');
    return result.paid.text;
  }
  if (target === 'tip') return (await plans.confirmTip(id)).text;
  const { check } = await plans.confirmCheck(id, target);
  if (check.state === 'open') throw new Error('Your payment is still being confirmed.');
  return check.paid_total_text || check.total_text;
}

// Redirects and reloads resume only server confirmation. The URL holds the operation, never a payment credential.
export function PlanPaymentReturn({ id, onComplete }: { id: string; onComplete: () => void }) {
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  usePaymentRedirectCleanup();
  async function resume(value: string) {
    setBusy(true);
    try {
      const status = await finishPayment(id, value);
      window.history.replaceState(window.history.state, '', returnUrl());
      setTarget('');
      setMessage(status);
      onComplete();
    } catch (error) {
      setMessage(paymentError(error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('plan_payment');
    if (
      !started.current &&
      value &&
      /^(spot|tip|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value)
    ) {
      started.current = true;
      setTarget(value);
      void resume(value);
    }
    // The return is processed once per mounted plan, independently of parent refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!target && !message) return null;
  return (
    <div className="space-y-2 rounded-xl bg-surface-muted p-3">
      <p role="status">{busy ? 'Confirming your payment…' : message}</p>
      {target && !busy && (
        <div className="flex gap-2">
          <button className={secondaryClass} onClick={() => void resume(target)}>
            Check payment again
          </button>
          <button
            className={secondaryClass}
            onClick={() => {
              window.history.replaceState(window.history.state, '', returnUrl());
              setTarget('');
              setMessage('');
              onComplete();
            }}
          >
            Back to plan
          </button>
        </div>
      )}
    </div>
  );
}

interface FormProps {
  id: string;
  target: string;
  payment: plans.PlanPayment;
  onComplete: (text: string) => void;
  onAccepted?: () => void;
  onClosed?: (text: string) => void;
}

function PaymentForm({ id, target, payment, onComplete, onAccepted, onClosed }: FormProps) {
  const stripe = useStripe(),
    elements = useElements();
  const [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !stripe || !elements) return;
        setBusy(true);
        setMessage('');
        try {
          if (!accepted) {
            const url = returnUrl(target);
            const { error } = await stripe.confirmPayment({
              elements,
              confirmParams: { return_url: url.href },
              redirect: 'if_required',
            });
            if (error) {
              setMessage(error.message || 'Check your payment details and try again.');
              return;
            }
            setAccepted(true);
            onAccepted?.();
            window.history.replaceState(window.history.state, '', url);
          }
          const status = await finishPayment(id, target);
          window.history.replaceState(window.history.state, '', returnUrl());
          onComplete(status);
        } catch (error) {
          const problem = paymentError(error);
          if (onClosed && (problem.code === 'full' || problem.code === 'ended')) {
            window.history.replaceState(window.history.state, '', returnUrl());
            onClosed(problem.message);
          } else setMessage(problem.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {accepted ? (
        <p>Your card was accepted.</p>
      ) : (
        <PaymentElement options={{ wallets: { applePay: 'auto', googlePay: 'auto' } }} />
      )}
      {message && <p role="alert">{message}</p>}
      <button className={buttonClass} disabled={busy || !stripe || !elements}>
        {busy ? 'Confirming…' : accepted ? 'Check payment again' : 'Pay ' + payment.amount_text}
      </button>
    </form>
  );
}

export default function PlanPayment(props: FormProps) {
  return (
    <StripeProvider
      key={props.payment.client_secret}
      clientSecret={props.payment.client_secret}
      publishableKey={props.payment.publishable_key}
    >
      <PaymentForm {...props} />
    </StripeProvider>
  );
}
