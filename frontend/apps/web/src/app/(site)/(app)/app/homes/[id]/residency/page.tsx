'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useResidencyProgress } from '@/components/homes/useResidencyProgress';
import { residencyRequestLabel, residencyReviewLabel } from '@/components/homes/residencyProgressModel';
import { residencyNextStep } from '@/components/homes/residencyGuidance';

export default function ResidencyStatusPage() {
  const { id: homeId } = useParams<{ id: string }>();
  const { progress, loading, error, refresh } = useResidencyProgress(homeId);
  const next = progress ? residencyNextStep(progress, homeId) : null;
  return <main className="mx-auto max-w-lg px-4 py-6 pb-28">
    <Link href="/app/homes" className="inline-block rounded-lg py-2 text-sm font-semibold text-app-text-secondary">← My Homes</Link>
    <h1 className="mt-3 text-2xl font-semibold text-app-text">Residency status</h1>
    {loading ? <p role="status" className="mt-6 text-app-text-secondary">Checking your current status…</p>
      : error ? <div role="alert" className="mt-6 rounded-xl border border-app-border p-5">
        <p className="text-app-text">{error}</p>
        <button type="button" onClick={() => void refresh()} className="mt-4 rounded-lg border border-app-border px-4 py-2 font-semibold">Retry</button>
      </div> : progress && next && <div className="mt-6 space-y-5">
        {progress.request && <section className="rounded-xl border border-app-border bg-app-surface p-5" aria-label="Your saved request">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-text-secondary">Your request</p>
          <p className="mt-2 break-words text-lg font-semibold text-app-text">{residencyRequestLabel(progress.request)}</p>
          <p className="mt-3 text-sm text-app-text-secondary">{residencyReviewLabel(progress.request.status)}</p>
          {progress.request.created_at && <p className="mt-1 text-sm text-app-text-secondary">Submitted {new Date(progress.request.created_at).toLocaleDateString()}</p>}
        </section>}
        <section className="rounded-xl border border-app-border bg-app-surface p-5" aria-label="Current next step">
          <h2 className="text-lg font-semibold text-app-text">{next.title}</h2>
          <p className="mt-2 text-sm leading-6 text-app-text-secondary">{next.body}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {next.actions.map(action => <Link key={action.label} href={action.href}
              className={action.primary ? 'rounded-lg bg-app-text px-4 py-2 font-semibold text-app-surface' : 'rounded-lg border border-app-border px-4 py-2 font-semibold text-app-text'}>{action.label}</Link>)}
            <button type="button" onClick={() => void refresh()} className="rounded-lg border border-app-border px-4 py-2 font-semibold text-app-text">Refresh status</button>
          </div>
        </section>
        {progress.current_access === 'private_setup' && <section className="rounded-xl border border-app-border p-5">
          <h2 className="font-semibold text-app-text">Your private tasks are available</h2>
          <p className="mt-2 text-sm text-app-text-secondary">You can organize your own tasks while verification is pending.</p>
          <Link href={`/app/homes/${homeId}/tasks`} className="mt-3 inline-block rounded-lg border border-app-border px-4 py-2 font-semibold">Home tasks</Link>
        </section>}
      </div>}
  </main>;
}
