'use client';

// "Your home's record" for a person's Home: the server picks what they see from their standing on it (its confirmed
// owner sees everything, anyone else in the household or with a claim sees the open part and what verifying opens) and
// draws it as blocks (components/homeRecord/HomeRecordView.tsx). Reached from the Home dashboard and the app link
// /homes/<id>/record.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import * as api from '@pantopus/api';
import HomeRecordView from '@/components/homeRecord/HomeRecordView';

// The API client rejects with `{ statusCode, code, message }`.
function statusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? status : null;
}

export default function HomeRecordPage() {
  const { id: homeId } = useParams<{ id: string }>();
  const record = useQuery({
    queryKey: ['home', homeId, 'record'],
    queryFn: () => api.homeRecord.getHomeRecord(homeId),
    staleTime: 60_000,
    retry: (count, error) => statusOf(error) !== 404 && count < 2,
  });

  return (
    <div className="mx-auto max-w-[560px] px-4 py-6" data-testid="home-record-page">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/app/homes/${homeId}/dashboard`} className="inline-flex items-center gap-2 text-sm text-app-text-secondary hover:text-app-text-strong">
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
        <span className="text-[15px] font-semibold text-app-text-strong">Your home&apos;s record</span>
        <span className="w-12" />
      </div>

      {record.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your home's record">
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-app-surface-sunken" />
          <div className="h-56 animate-pulse rounded-2xl bg-app-surface-sunken" />
          <div className="h-28 animate-pulse rounded-2xl bg-app-surface-sunken" />
          <div className="h-64 animate-pulse rounded-2xl bg-app-surface-sunken" />
        </div>
      ) : null}

      {record.isError ? (
        <div role="alert" className="rounded-2xl border border-app-border bg-app-surface px-5 py-4 text-sm text-app-text-secondary">
          <p className="font-semibold text-app-text">
            {statusOf(record.error) === 404 ? 'This home’s record isn’t yours to open.' : 'The record could not be loaded.'}
          </p>
          {statusOf(record.error) === 404 ? (
            <Link href="/app/homes" className="mt-3 inline-block font-semibold text-app-link">Your homes</Link>
          ) : (
            <button type="button" onClick={() => void record.refetch()} className="mt-3 rounded-lg border border-app-border px-3 py-2 font-semibold text-app-text">Try again</button>
          )}
        </div>
      ) : null}

      {record.data ? <HomeRecordView record={record.data} /> : null}
    </div>
  );
}
