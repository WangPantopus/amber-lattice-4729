'use client';

// The lookup's record page: reads the looked-up address from the lookup's own device-local preview (by its opaque id)
// and draws the server's answer: `lookup` signed out, `buyer` signed in (the public half opened, SPEC section 8), or the
// person's own Home's record (`member` or `owner`) when the address is theirs. Its
// claim buttons carry the same preview on: signed in, to Place, which adds the Home at that address; signed out, to
// sign-up, which keeps it. "Create a free account" and "Sign in" come back to this page.

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import * as api from '@pantopus/api';
import HomeRecordView from '@/components/homeRecord/HomeRecordView';
import { useBuyerActions } from '@/components/homeRecord/useBuyerActions';
import { readPendingPlace } from '@/components/place/pendingPlace';
import { isDailyLookupLimit, lookupLimitMessage } from '@/components/place/lookupLimit';
import { authPageHref } from '@/lib/auth-utils';

// The page's name by the answer's state: a person who looks up their own Home gets its record (`member` or `owner`).
function pageName(state: string | undefined): string {
  if (state === 'buyer') return 'This home\u2019s public record';
  if (state === 'owner' || state === 'member') return 'Your home\u2019s record';
  return 'This home\u2019s record';
}

// The id-less claim links in the lookup state (no Home exists yet).
const LOOKUP_LINKS = new Set(['/homes/claim-owner', '/homes/verify-address']);

function Record() {
  const router = useRouter();
  const previewId = useSearchParams().get('preview') || '';
  // Read on the device only, after the first render: storage doesn't exist on the server.
  const [draft, setDraft] = useState<ReturnType<typeof readPendingPlace> | undefined>(undefined);
  useEffect(() => { setDraft(readPendingPlace(previewId)); }, [previewId]);
  const address = draft === undefined ? undefined : draft?.label ?? null;
  const signedIn = api.hasActiveSession();

  const record = useQuery({
    // Signing in changes the answer (`lookup` to `buyer`), so the key names which.
    queryKey: ['public-home-record', address, signedIn],
    queryFn: () => api.homeRecord.getPublicHomeRecord(address as string),
    enabled: typeof address === 'string',
    staleTime: 5 * 60_000,
    retry: (count, error) => !isDailyLookupLimit(error) && count < 1,
  });

  const continueWith = (url: string) => {
    // An account opens the public record: sign-up and sign-in come back to the same record inside the app.
    const here = `/app/place/record?preview=${previewId}`;
    if (url === '/auth/sign-up') { router.push(authPageHref('/register', here)); return true; }
    if (url === '/auth/sign-in') { router.push(authPageHref('/login', here)); return true; }
    if (!LOOKUP_LINKS.has(url)) return false;
    const next = `/app/place?preview=${previewId}`;
    router.push(signedIn ? next : authPageHref('/register', next));
    return true;
  };
  const buyer = useBuyerActions({
    record: record.data,
    place: draft ? { label: draft.label, latitude: draft.latitude, longitude: draft.longitude, city: draft.city, state: draft.state } : null,
    onClaim: (url) => { continueWith(url); },
  });

  return (
    <main className="min-h-screen bg-app-bg">
      <div className="mx-auto w-full max-w-[560px] px-4 py-4" data-testid="lookup-record-page">
        <div className="mb-4 flex h-11 items-center justify-between">
          <button type="button" onClick={() => router.back()} aria-label="Back" className="-ml-3 flex h-11 w-11 items-center justify-center text-app-text">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold text-app-text-strong">{pageName(record.data?.state)}</span>
          <span className="w-8" />
        </div>

        {address === null ? (
          <div className="rounded-2xl border border-app-border bg-app-surface px-5 py-4 text-sm text-app-text-secondary">
            <p className="font-semibold text-app-text">Look up the address again to see its record.</p>
            <Link href="/start" className="mt-3 inline-block font-semibold text-app-link">Look up an address</Link>
          </div>
        ) : null}

        {address && record.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading this home's record">
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-app-surface-sunken" />
            <div className="h-56 animate-pulse rounded-2xl bg-app-surface-sunken" />
            <div className="h-28 animate-pulse rounded-2xl bg-app-surface-sunken" />
            <div className="h-64 animate-pulse rounded-2xl bg-app-surface-sunken" />
          </div>
        ) : null}

        {record.isError ? (
          <div role="alert" className="rounded-2xl border border-app-border bg-app-surface px-5 py-4 text-sm text-app-text-secondary">
            <p className="font-semibold text-app-text">{lookupLimitMessage(record.error) ?? 'The record could not be loaded.'}</p>
            {!isDailyLookupLimit(record.error) ? (
              <button type="button" onClick={() => void record.refetch()} className="mt-3 rounded-lg border border-app-border px-3 py-2 font-semibold text-app-text">Try again</button>
            ) : null}
          </div>
        ) : null}

        {buyer.problem ? <p role="alert" className="mb-3 rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text-secondary">{buyer.problem}</p> : null}
        {record.data ? <HomeRecordView record={record.data} onAppLink={continueWith} onAction={buyer.onAction} actionLabels={buyer.labels} /> : null}
      </div>
    </main>
  );
}

export default function LookupRecord() {
  return <Suspense fallback={null}><Record /></Suspense>;
}
