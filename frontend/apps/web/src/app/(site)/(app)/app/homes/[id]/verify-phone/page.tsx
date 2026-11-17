'use client';

// Phone check (FASTVERIFY phase 3, drawings V2, V3 and F1): text a code to the person's mobile number, then ask
// the phone company's records whether the number is billed to this Home's address. A match makes the person
// Verified (B3 on /app/place?verified=1). Opened from the verify sheet's "Use my phone number" row; behind
// `home_fast_verify_phone` (the server's verify-options says whether the row is available).

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import { ChevronLeft, ChevronRight, Info, Lock, Camera, Mail, ShieldCheck } from 'lucide-react';
import { IconTile } from '@/components/archetypes/place';
import { useMe } from '@/lib/me';
import { myHomesQuery } from '@/lib/myHomes';
import { useVerifyOptions, invalidateVerifyOptions } from '@/components/place/fastVerify/useVerifyOptions';
import { FAST_VERIFY_ROWS, FAST_VERIFY_WORDS } from '@/components/place/fastVerify/fastVerifyWords';

const OFF_WORDS = "This way to verify isn't available. Verify by mail instead.";
const REASON_WORDS: Record<string, string> = {
  ONE_HOME: 'A fast check covers one home. Verify this one by mail.',
  LIMIT: 'Too many tries for now. Try again later, or verify another way.',
  UNAVAILABLE: "The phone check isn't available right now. Verify another way.",
};

/** The server's `{ code, error }` words, or the caller's fallback. */
function failure(error: unknown, fallback: string): { code: string; message: string } {
  const e = error as { code?: unknown; message?: unknown; data?: { code?: unknown; error?: unknown } } | null;
  const code = typeof e?.data?.code === 'string' ? e.data.code : typeof e?.code === 'string' ? e.code : '';
  const message = typeof e?.data?.error === 'string' && e.data.error.trim() ? e.data.error : fallback;
  return { code, message };
}

/** US numbers read "(360) 555-0142"; anything else as typed. */
function shownNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw.trim();
}
/** What the server gets: +1 and ten digits for a US number, else what was typed. */
function sentNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.trim();
}
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const primaryButton = 'w-full min-h-[52px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const fieldClass = 'mt-1.5 w-full min-h-12 rounded-xl border border-app-border bg-app-surface px-4 text-[17px] text-app-text placeholder:text-app-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500';

function CodeBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  const put = (i: number, typed: string) => {
    const clean = typed.replace(/\D/g, '');
    if (!clean) { onChange(value.slice(0, i) + value.slice(i + 1)); return; }
    const next = (value.slice(0, i) + clean + value.slice(i + clean.length)).slice(0, 6);
    onChange(next);
    refs.current[Math.min(i + clean.length, 5)]?.focus();
  };
  const key = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); onChange(value.slice(0, i - 1)); refs.current[i - 1]?.focus(); }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault(); onChange(text); refs.current[Math.min(text.length, 5)]?.focus();
  };
  return (
    <div className="flex justify-center gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d}
          onChange={(e) => put(i, e.target.value)}
          onKeyDown={(e) => key(i, e)}
          onPaste={paste}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of 6`}
          className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl border border-app-border bg-app-surface text-center text-[26px] font-semibold text-app-text focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
        />
      ))}
    </div>
  );
}

export default function VerifyPhonePage() {
  const { id: homeId } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const toPlace = search.get('return') === 'place';
  const verify = useVerifyOptions(homeId);
  const me = useMe();
  const homes = useQuery(myHomesQuery());
  const home = homes.data?.homes.find((h) => h.id === homeId) ?? null;
  const address = home?.address || 'this address';

  const [step, setStep] = useState<'number' | 'code' | 'no_match'>('number');
  const [phone, setPhone] = useState('');
  const [otherName, setOtherName] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (step !== 'code') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);
  const waitS = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const accountName = [me.data?.firstName, (me.data as { lastName?: string } | undefined)?.lastName].filter(Boolean).join(' ');
  const phoneOption = verify.data?.options.find((o) => o.id === 'phone') ?? null;
  const usable = !!verify.data && phoneOption?.available === true;
  const others = useMemo(
    () => (verify.data?.options ?? []).filter((o) => o.available && (o.id === 'document' || o.id === 'mail' || o.id === 'landlord')),
    [verify.data],
  );

  const leave = () => router.push(toPlace ? '/app/place' : `/app/homes/${homeId}/dashboard`);
  const back = () => {
    setError('');
    if (step === 'code') { setStep('number'); setCode(''); return; }
    router.back();
  };

  // The phone account holder's name when it isn't the person's ("Someone else's name"), sent on both calls.
  const holder = () => (otherName ? { account_first_name: first.trim(), account_last_name: last.trim() } : {});
  const sendCode = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const answer = await api.homeVerify.startPhoneCheck(homeId, { phone: sentNumber(phone), ...holder() });
      setResendAt(Date.now() + Math.max(0, Number(answer?.resend_after_s) || 30) * 1000);
      setNow(Date.now());
      setStep('code');
    } catch (e) {
      setError(failure(e, "The phone check isn't available right now. Verify another way.").message);
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async () => {
    if (busy || code.length !== 6) return;
    setBusy(true); setError('');
    try {
      const answer = await api.homeVerify.verifyPhoneCheck(homeId, { phone: sentNumber(phone), code, ...holder() });
      if (answer.result === 'verified') {
        await Promise.all([
          invalidateVerifyOptions(queryClient, homeId),
          queryClient.invalidateQueries({ queryKey: ['place'] }),
          queryClient.invalidateQueries({ queryKey: ['hub'] }),
        ]);
        router.replace(`/app/place?verified=1&home=${encodeURIComponent(homeId)}`);
        return;
      }
      if (answer.result === 'no_match') {
        void invalidateVerifyOptions(queryClient, homeId);
        setStep('no_match');
        return;
      }
      setCode('');
      const left = answer.tries_left;
      // No tries left: the code is used up or expired, so "Send again" right away.
      if (left === 0) setResendAt(0);
      setError(left === 0
        ? "That code can't be used any more. Send a new one."
        : typeof left === 'number'
          ? `That code didn't match. ${left === 1 ? '1 try left.' : `${left} tries left.`}`
          : "That code didn't match. Check it and try again.");
    } catch (e) {
      setError(failure(e, "The phone check isn't available right now. Verify another way.").message);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="grid grid-cols-[44px_1fr_44px] items-center">
      <button type="button" aria-label="Back" onClick={back} className="w-11 h-11 -ml-2 flex items-center justify-center rounded-full text-app-text hover:bg-app-hover">
        <ChevronLeft size={22} strokeWidth={2.25} />
      </button>
      <p className="text-center text-[17px] font-semibold text-app-text">Phone check</p>
      <span />
    </div>
  );
  const errorBox = error ? (
    <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">{error}</p>
  ) : null;

  if (verify.loading || (homes.isPending && !home)) {
    return <main className="mx-auto max-w-xl px-4 py-6">{header}<p role="status" className="mt-6 text-app-text-secondary">Loading…</p></main>;
  }

  if (!usable && step === 'number') {
    const words = (phoneOption?.reason && REASON_WORDS[phoneOption.reason]) || OFF_WORDS;
    return (
      <main className="mx-auto max-w-xl px-4 py-6 space-y-5 text-app-text">
        {header}
        <p role="status" className="rounded-2xl border border-app-border bg-app-surface p-5 text-[15px]">{words}</p>
        <Link href={`/app/homes/${homeId}/verify-postcard${toPlace ? '?return=place' : ''}`} className={`${primaryButton} flex items-center justify-center`}>
          {FAST_VERIFY_WORDS.mailMeACode}
        </Link>
      </main>
    );
  }

  if (step === 'no_match') {
    const rowWords: Record<string, { label: string; sub: string; icon: typeof Camera; href: string }> = {
      document: {
        // Read at once (drawing F1), or today's reviewed upload when the server says it isn't.
        ...(verify.data?.options.find((o) => o.id === 'document')?.fast === false
          ? { label: 'Upload a document', sub: 'A utility bill, lease, or ID. A person reviews it.' }
          : { label: FAST_VERIFY_ROWS.document.label, sub: 'About a minute.' }),
        icon: Camera, href: `/app/homes/${homeId}/verify-residency${toPlace ? '?return=place' : ''}`,
      },
      mail: { label: FAST_VERIFY_ROWS.mail.label, sub: 'Arrives in about a week.', icon: Mail, href: `/app/homes/${homeId}/verify-postcard${toPlace ? '?return=place' : ''}` },
      landlord: { label: FAST_VERIFY_ROWS.landlord.label, sub: FAST_VERIFY_ROWS.landlord.sub, icon: ShieldCheck, href: `/app/homes/${homeId}/verify-landlord${toPlace ? '?return=place' : ''}` },
    };
    return (
      <main className="mx-auto max-w-xl px-4 py-6 space-y-5 text-app-text" data-testid="phone-no-match">
        {header}
        <div>
          <h1 className="text-[26px] font-bold -tracking-[0.02em] leading-[32px]">We couldn&apos;t match that number</h1>
          <p className="mt-2 text-[15px] text-app-text-secondary">
            The phone company&apos;s records don&apos;t show <strong className="font-semibold text-app-text">{address}</strong> for {shownNumber(phone)}. That&apos;s common with family plans, prepaid phones and a recent move.
          </p>
        </div>
        {others.length ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-app-text-muted mb-2 px-0.5">Try another way</p>
            <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
              {others.map((o, i) => {
                const row = rowWords[o.id];
                return (
                  <Link key={o.id} href={row.href} className={`flex items-center gap-3 px-3.5 py-3 hover:bg-app-hover transition-colors ${i > 0 ? 'border-t border-app-border-subtle' : ''}`}>
                    <IconTile icon={row.icon} tone={o.id === 'document' ? 'sky' : 'muted'} size={34} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-semibold text-app-text">{row.label}</span>
                      <span className="block text-[12.5px] text-app-text-secondary mt-0.5">{row.sub}</span>
                    </span>
                    <ChevronRight size={18} strokeWidth={2.25} aria-hidden className="shrink-0 text-app-text-muted" />
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
        <p className="flex items-start gap-2 text-[13px] text-app-text-secondary"><Info size={15} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />Nothing changed. Your home tools still work.</p>
        <button type="button" onClick={leave} className="w-full min-h-[48px] rounded-xl text-primary-600 dark:text-primary-300 font-semibold hover:bg-app-hover">
          {FAST_VERIFY_WORDS.notNow}
        </button>
      </main>
    );
  }

  if (step === 'code') {
    return (
      <main className="mx-auto max-w-xl px-4 py-6 space-y-5 text-app-text">
        {header}
        <div>
          <h1 className="text-[26px] font-bold -tracking-[0.02em]">Enter the 6-digit code</h1>
          <p className="mt-2 text-[15px] text-app-text-secondary">We texted it to <strong className="font-semibold text-app-text">{shownNumber(phone)}</strong>.</p>
          <button type="button" onClick={back} className="mt-2 min-h-11 text-sm font-medium text-app-text underline-offset-2 hover:underline">Change number</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void checkCode(); }} className="space-y-4">
          <CodeBoxes value={code} onChange={(v) => { setCode(v); setError(''); }} disabled={busy} />
          <p className="text-center text-sm text-app-text-secondary">
            {waitS > 0 ? `Send again in ${mss(waitS)}` : (
              <button type="button" onClick={() => void sendCode()} disabled={busy} className="min-h-11 font-semibold text-primary-600 dark:text-primary-300 hover:underline">Send again</button>
            )}
          </p>
          {errorBox}
          <p className="flex items-start gap-2 rounded-xl bg-primary-50 dark:bg-primary-950/30 px-3.5 py-3 text-[13.5px] text-primary-800 dark:text-primary-200">
            <Info size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />Next we check this number against your home&apos;s address. It takes a few seconds.
          </p>
          <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>{busy ? 'Checking…' : 'Verify'}</button>
        </form>
      </main>
    );
  }

  const numberOk = phone.replace(/\D/g, '').length >= 10;
  const nameOk = !otherName || (first.trim() && last.trim());
  return (
    <main className="mx-auto max-w-xl px-4 py-6 space-y-5 text-app-text">
      {header}
      <div>
        <h1 className="text-[26px] font-bold -tracking-[0.02em] leading-[32px]">What&apos;s your mobile number?</h1>
        <p className="mt-2 text-[15px] text-app-text-secondary">
          We text you a code. Then we ask the phone company&apos;s records one thing: is this number billed to <strong className="font-semibold text-app-text">{address}</strong>?
        </p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (numberOk && nameOk) void sendCode(); }} className="space-y-4">
        <label className="block text-sm font-medium text-app-text-strong">
          Mobile number
          <input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }} className={fieldClass} />
        </label>
        <section aria-label="Name on the phone account" className="rounded-2xl border border-app-border bg-app-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-app-text-muted">Name on the phone account</p>
          {otherName ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm font-medium text-app-text-strong">First name
                <input value={first} autoComplete="off" maxLength={100} onChange={(e) => setFirst(e.target.value)} className={fieldClass} />
              </label>
              <label className="text-sm font-medium text-app-text-strong">Last name
                <input value={last} autoComplete="off" maxLength={100} onChange={(e) => setLast(e.target.value)} className={fieldClass} />
              </label>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[17px] text-app-text">{accountName || '—'}</span>
              <button type="button" onClick={() => setOtherName(true)} className="min-h-11 text-sm font-medium text-app-text underline-offset-2 hover:underline">Someone else&apos;s name</button>
            </div>
          )}
        </section>
        <p className="flex items-start gap-2 rounded-xl bg-primary-50 dark:bg-primary-950/30 px-3.5 py-3 text-[13.5px] text-primary-800 dark:text-primary-200">
          <Lock size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />We send your name, this address and your number to our phone-check service. It answers match or no match. We never see your phone records.
        </p>
        {errorBox}
        <button type="submit" disabled={busy || !numberOk || !nameOk} className={primaryButton}>{busy ? 'Sending…' : 'Text me a code'}</button>
        <p className="text-center text-xs text-app-text-secondary">We use your number for this check only. Message rates may apply.</p>
      </form>
    </main>
  );
}
