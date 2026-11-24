// ─────────────────────────────────────────────────────────────────────────────
// /property-records: every state with county pages, the way in for search engines and people.
// Static, rebuilt about daily from the backend's list (backend/services/countyGuide).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, SiteFooter, SiteNav } from './_components/Chrome';
import { SITE_URL, guideIndex, statePath } from './_lib/guide';

export const revalidate = 86400;

const TITLE = 'Property records by state and county';
const DESCRIPTION =
  "Find each county's own property offices, the federal hazard ratings for the area and a lookup for any U.S. home, with every source named.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${TITLE} | Pantopus`,
  description: DESCRIPTION,
  alternates: { canonical: '/property-records' },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', url: '/property-records', siteName: 'Pantopus', title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export default async function PropertyRecordsIndex() {
  const index = await guideIndex();
  if (!index?.states.length) notFound();
  return (
    <div className="min-h-screen bg-app-surface">
      <SiteNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <Breadcrumb items={[{ name: 'Property records', path: '/property-records' }]} />
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-app-text dark:text-white leading-tight tracking-tight">
          {TITLE}
        </h1>
        <p className="mt-3 text-base sm:text-lg text-app-text-secondary dark:text-app-text-muted leading-relaxed">
          Each county page lists the county&apos;s own offices and what public records say about homes there, with each
          source named.
        </p>
        <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {index.states.map((state) => (
            <li key={state.slug}>
              <Link
                href={statePath(state.slug)}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-app-border-subtle bg-app-surface px-4 py-3 hover:border-primary-300 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition"
              >
                <span className="font-semibold text-app-text dark:text-white">{state.name}</span>
                <span className="text-sm text-app-text-muted">
                  {state.counties.toLocaleString('en-US')} {state.counties === 1 ? state.unit : state.units}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
