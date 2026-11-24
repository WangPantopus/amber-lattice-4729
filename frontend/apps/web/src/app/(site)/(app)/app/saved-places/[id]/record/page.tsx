'use client';

// "This home's public record" for an address the person saved (SPEC section 8): the `buyer` state at the saved point,
// from GET /api/saved-places/:id/record. No lookup is spent. Its claim goes to Add Home for the saved address, as the
// saved place's own "Set up this home" does.

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import * as api from '@pantopus/api';
import HomeRecordView from '@/components/homeRecord/HomeRecordView';
import { useBuyerActions } from '@/components/homeRecord/useBuyerActions';

export default function SavedPlaceRecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const record = useQuery({
    queryKey: ['saved-place', id, 'record'],
    queryFn: () => api.homeRecord.getSavedPlaceRecord(id),
    staleTime: 60_000,
    retry: 1,
  });
  const setUp = `/app/homes/new?savedPlace=${encodeURIComponent(id)}`;
  // A saved address has no save action; claiming it is setting it up as a Home.
  const claim = (url: string) => {
    if (url !== '/homes/claim-owner' && url !== '/homes/verify-address') return false;
    router.push(setUp);
    return true;
  };
  const buyer = useBuyerActions({ record: record.data, place: null, onClaim: (url) => { claim(url); } });

  return (
    <div className="mx-auto max-w-[560px] px-4 py-6" data-testid="saved-place-record-page">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/app/place?savedPlace=${encodeURIComponent(id)}`} className="inline-flex items-center gap-2 text-sm text-app-text-secondary hover:text-app-text-strong">
          <ArrowLeft className="h-4 w-4" />
          Place
        </Link>
        <span className="text-[15px] font-semibold text-app-text-strong">This home&apos;s public record</span>
        <span className="w-12" />
      </div>

      {record.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading this home's public record">
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-app-surface-sunken" />
          <div className="h-56 animate-pulse rounded-2xl bg-app-surface-sunken" />
          <div className="h-64 animate-pulse rounded-2xl bg-app-surface-sunken" />
        </div>
      ) : null}

      {record.isError ? (
        <div role="alert" className="rounded-2xl border border-app-border bg-app-surface px-5 py-4 text-sm text-app-text-secondary">
          <p className="font-semibold text-app-text">The record could not be loaded.</p>
          <button type="button" onClick={() => void record.refetch()} className="mt-3 rounded-lg border border-app-border px-3 py-2 font-semibold text-app-text">Try again</button>
        </div>
      ) : null}

      {buyer.problem ? <p role="alert" className="mb-3 rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text-secondary">{buyer.problem}</p> : null}
      {record.data ? <HomeRecordView record={record.data} onAppLink={claim} onAction={buyer.onAction} actionLabels={buyer.labels} /> : null}
    </div>
  );
}
