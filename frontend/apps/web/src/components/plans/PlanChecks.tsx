'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { buttonClass, fieldClass, secondaryClass } from './PlansWorkspace';
import { cents } from './PlanBusinessFields';
import PlanPayment, { paymentError } from './PlanPayment';

function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="text-sm text-red-700">
      {paymentError(error).message}
    </p>
  ) : null;
}

function CheckGuest({
  id,
  row,
  deal,
  canRefund,
}: {
  id: string;
  row: plans.CheckRow;
  deal: boolean;
  canRefund: boolean;
}) {
  const client = useQueryClient();
  const [edit, setEdit] = useState<'send' | 'refund' | null>(null);
  const [full, setFull] = useState(true);
  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      setEdit(null);
      await client.invalidateQueries({ queryKey: ['plans', 'checks', id] });
    },
    retry: false,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (edit === 'refund' && row.check) {
      const checkId = row.check.id;
      action.mutate(() => plans.refundCheck(id, checkId, full ? undefined : cents(data.get('amount'))));
    } else if (edit === 'send') {
      action.mutate(() =>
        plans.sendCheck(id, row.request_id, cents(data.get('amount')), cents(data.get('excluded'))),
      );
    }
  }
  const remaining = row.check ? (row.check.total_cents - row.check.refunded_cents) / 100 : 0;
  return (
    <li className="space-y-2 border-t border-app py-3">
      <p className="font-semibold">
        {row.name} <span className="text-sm font-normal">{row.brought_by_text}</span>
      </p>
      {row.check && (
        <p>
          {row.check.state_text} · {row.check.text}
          {row.check.refunded_cents ? ' · $' + (row.check.refunded_cents / 100).toFixed(2) + ' refunded' : ''}
        </p>
      )}
      {!edit && (
        <div className="flex gap-2">
          {row.state !== 'sent' && (
            <button
              className={secondaryClass}
              onClick={() => {
                action.reset();
                setEdit('send');
              }}
            >
              Send check
            </button>
          )}
          {row.state === 'paid' && canRefund && remaining > 0 && (
            <button
              className={secondaryClass}
              onClick={() => {
                action.reset();
                setFull(true);
                setEdit('refund');
              }}
            >
              Refund check
            </button>
          )}
        </div>
      )}
      {edit && (
        <form onSubmit={submit} className="space-y-2">
          {edit === 'refund' && (
            <label className="block text-sm">
              Refund amount
              <select
                className={fieldClass}
                value={full ? 'full' : 'partial'}
                onChange={(e) => setFull(e.target.value === 'full')}
              >
                <option value="full">Full remaining amount · ${remaining.toFixed(2)}</option>
                <option value="partial">Partial refund</option>
              </select>
            </label>
          )}
          {(edit === 'send' || !full) && (
            <label className="block text-sm">
              {edit === 'send' ? 'Check amount in dollars' : 'Dollars to refund'}
              <input
                className={fieldClass}
                name="amount"
                type="number"
                min={edit === 'send' ? 1 : 0.5}
                max={edit === 'send' ? 2000 : remaining}
                step="0.01"
                required
              />
            </label>
          )}
          {edit === 'send' && deal && (
            <label className="block text-sm">
              Amount excluded from the deal
              <input
                className={fieldClass}
                name="excluded"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
              />
            </label>
          )}
          <button className={buttonClass} disabled={action.isPending}>
            {edit === 'send' ? 'Send to ' + row.name : 'Confirm refund'}
          </button>{' '}
          <button
            className={secondaryClass}
            type="button"
            disabled={action.isPending}
            onClick={() => setEdit(null)}
          >
            Cancel
          </button>
          <ErrorMessage error={action.error} />
        </form>
      )}
    </li>
  );
}

function StaffChecks({ id }: { id: string }) {
  const list = useQuery({
    queryKey: ['plans', 'checks', id],
    queryFn: () => plans.staffChecks(id),
    refetchInterval: 10_000,
    retry: false,
  });
  return (
    <>
      <ErrorMessage error={list.error} />
      {list.isPending && <p role="status">Loading guest checks…</p>}
      {list.data && (
        <>
          <p>
            {[list.data.totals.in_text, list.data.totals.paid_text, list.data.totals.tips_text].join(' · ')}
          </p>
          <ul>
            {list.data.rows.map((row) => (
              <CheckGuest
                id={id}
                row={row}
                key={row.request_id}
                deal={list.data.deal_on_bill}
                canRefund={Date.parse(list.data.refund_until) > Date.now()}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function OpenCheck({ id, check, onChange }: { id: string; check: plans.Check; onChange: () => void }) {
  const [tip, setTip] = useState('0'),
    [custom, setCustom] = useState('');
  const selected = tip === 'custom' ? cents(custom) : Number(tip);
  const valid =
    Number.isFinite(selected) &&
    selected >= 0 &&
    selected <= check.amount_cents &&
    (tip !== 'custom' || !!custom);
  const quote = useQuery({
    queryKey: ['plans', 'check-quote', id, check.id, selected],
    queryFn: () => plans.quoteCheck(id, check.id, selected),
    enabled: valid && selected > 0,
    retry: false,
  });
  const checkout = useMutation({ mutationFn: () => plans.payCheck(id, check.id, selected), retry: false });
  const shown = checkout.data?.check || (selected ? quote.data?.check : check);
  return (
    <div className="space-y-3">
      <p className="font-medium">{check.heading}</p>
      {check.tips_on && !checkout.data && (
        <fieldset disabled={checkout.isPending} className="space-y-2">
          <legend className="font-medium">Tip</legend>
          <div className="flex flex-wrap gap-3">
            {[{ label: 'No tip', tip_cents: 0, tip_text: '' }, ...(check.tip_choices || [])].map((v) => (
              <label key={v.label}>
                <input
                  type="radio"
                  name="check-tip"
                  checked={tip === String(v.tip_cents)}
                  onChange={() => setTip(String(v.tip_cents))}
                />{' '}
                {[v.label, v.tip_text].filter(Boolean).join(' · ')}
              </label>
            ))}
            <label>
              <input
                type="radio"
                name="check-tip"
                checked={tip === 'custom'}
                onChange={() => setTip('custom')}
              />{' '}
              Other amount
            </label>
          </div>
          {tip === 'custom' && (
            <label className="block text-sm">
              Tip amount in dollars
              <input
                className={fieldClass}
                type="number"
                min="0"
                max={check.amount_cents / 100}
                step="0.01"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </label>
          )}
          {check.tip_base_text && <p className="text-sm">{check.tip_base_text}</p>}
        </fieldset>
      )}
      {shown && (
        <dl>
          {shown.lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-3">
              <dt>{l.label}</dt>
              <dd>{l.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {check.tips_on && check.note_text && <p className="text-sm text-app-muted">{check.note_text}</p>}
      <ErrorMessage error={checkout.error || quote.error} />
      {checkout.data ? (
        <PlanPayment id={id} target={check.id} payment={checkout.data.payment} onComplete={onChange} />
      ) : (
        <button
          className={buttonClass}
          disabled={!valid || !shown || checkout.isPending}
          onClick={() => checkout.mutate()}
        >
          Continue to payment
        </button>
      )}
    </div>
  );
}

function GuestCheck({ id }: { id: string }) {
  const client = useQueryClient();
  const [another, setAnother] = useState(false);
  const key = ['plans', 'my-check', id];
  const mine = useQuery({
    queryKey: key,
    queryFn: () => plans.myCheck(id),
    refetchInterval: 10_000,
    retry: false,
  });
  const create = useMutation({
    mutationFn: (amount: number) => plans.startCheck(id, amount),
    onSuccess: (result) => {
      client.setQueryData(key, { ...mine.data, check: result.check });
      setAnother(false);
      void mine.refetch();
    },
    retry: false,
  });
  const check = mine.data?.check;
  return (
    <div className="space-y-3">
      <ErrorMessage error={mine.error || create.error} />
      {mine.isPending && <p role="status">Loading your check…</p>}
      {check?.state === 'open' ? (
        <OpenCheck key={check.id} id={id} check={check} onChange={() => void mine.refetch()} />
      ) : (
        <>
          {check && (
            <div className="space-y-1">
              <p className="font-semibold">{check.paid_total_text}</p>
              <p>{[check.paid_text, check.method_text].filter(Boolean).join(' · ')}</p>
              {check.refunded_text && <p>{check.refunded_text}</p>}
              {check.receipt?.link && (
                <Link className="text-primary-700" href={check.receipt.link}>
                  View receipt
                </Link>
              )}
            </div>
          )}
          {mine.data?.can_start &&
            (!check || another ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate(cents(new FormData(e.currentTarget).get('amount')));
                }}
              >
                <label className="block text-sm">
                  Your check amount in dollars
                  <input
                    className={fieldClass}
                    name="amount"
                    type="number"
                    min="1"
                    max="2000"
                    step="0.01"
                    required
                  />
                </label>
                <button className={secondaryClass} disabled={create.isPending}>
                  Review check
                </button>
              </form>
            ) : (
              <button className={secondaryClass} onClick={() => setAnother(true)}>
                Start another check
              </button>
            ))}
          {!check && mine.data && !mine.data.can_start && <p>The business will send your check here.</p>}
        </>
      )}
    </div>
  );
}

export function PlanChecks({ plan }: { plan: plans.Detail }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="space-y-3 border-t border-app pt-4">
      <button className={secondaryClass} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {plan.viewer.role === 'host' ? 'Guest checks and refunds' : plan.pay_here?.text}
      </button>
      {expanded && (plan.viewer.role === 'host' ? <StaffChecks id={plan.id} /> : <GuestCheck id={plan.id} />)}
    </section>
  );
}

export function TipLater({ plan, onComplete }: { plan: plans.Detail; onComplete: () => void }) {
  const [value, setValue] = useState(''),
    [custom, setCustom] = useState(''),
    [message, setMessage] = useState('');
  const amount = value === 'custom' ? cents(custom) : Number(value);
  const start = useMutation({ mutationFn: () => plans.startTip(plan.id, amount), retry: false });
  if (message) return <p role="status">{message}</p>;
  if (!plan.tip_later) return null;
  return (
    <section className="space-y-3 border-t border-app pt-4">
      <h3 className="font-semibold">Leave a tip for {plan.business?.name}?</h3>
      {start.data ? (
        <PlanPayment
          id={plan.id}
          payment={start.data.payment}
          target="tip"
          onComplete={(text) => {
            setMessage(text);
            onComplete();
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {plan.tip_later?.choices.map((choice) => (
              <label key={choice.label}>
                <input
                  name="late-tip"
                  type="radio"
                  checked={value === String(choice.tip_cents)}
                  onChange={() => setValue(String(choice.tip_cents))}
                />{' '}
                {choice.label} · {choice.tip_text}
              </label>
            ))}
            <label>
              <input
                type="radio"
                name="late-tip"
                checked={value === 'custom'}
                onChange={() => setValue('custom')}
              />{' '}
              Other amount
            </label>
          </div>
          {value === 'custom' && (
            <label className="block text-sm">
              Tip amount in dollars
              <input
                className={fieldClass}
                type="number"
                min="1"
                step="0.01"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </label>
          )}
          <button
            className={buttonClass}
            disabled={amount < 100 || start.isPending}
            onClick={() => start.mutate()}
          >
            Review tip
          </button>
        </>
      )}
      <ErrorMessage error={start.error} />
    </section>
  );
}
