// The Home profile's way into "Your home's record" (/app/homes/<id>/record). Anyone who can open the Home's dashboard
// or its verification screen sees it; the server decides what the record shows them.

import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';

export default function HomeRecordEntry({ homeId, className = '' }: { homeId: string; className?: string }) {
  return (
    <Link
      href={`/app/homes/${homeId}/record`}
      className={`flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3 shadow-sm hover:bg-app-hover ${className}`}
      data-testid="home-dashboard-record"
    >
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-app-home-bg text-app-home"><FileText className="h-5 w-5" /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold text-app-text">Your home&apos;s record</span>
        <span className="text-[13px] text-app-text-secondary">What the county&apos;s records and federal maps hold for this home</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-app-text-secondary" aria-hidden="true" />
    </Link>
  );
}
