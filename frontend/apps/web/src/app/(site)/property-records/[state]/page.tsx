// ─────────────────────────────────────────────────────────────────────────────
// /property-records/<state>: the state's counties that have a page. Static, built on first visit and rebuilt hourly
// from the backend's answer (backend/services/countyGuide); an unknown state is a 404.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, SiteFooter, SiteNav } from '../_components/Chrome';
import { SITE_URL, countyPath, statePage, statePath } from '../_lib/guide';

// Rebuilt within the hour of a release, so a newly released county is listed (the backend answer is cached too).
export const revalidate = 3600;
export const dynamicParams = true;

// Built on first visit, not at deploy: the backend decides which pages exist.
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ state: string }> };

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { state } = await params;
  const page = await statePage(state);
  if (!page) return {};
  const title = `${page.state.name} property records by ${page.state.unit}`;
  const description = page.state.town_records
    ? `Where ${page.state.name}'s towns keep their property records, and what public records say about homes in each ${page.state.unit}, with every source named.`
    : `Find each ${page.state.name} ${page.state.unit}'s own property offices and what public records say about homes there, with every source named.`;
  const path = statePath(page.state.slug);
  return {
    metadataBase: new URL(SITE_URL),
    title: `${title} | Pantopus`,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url: path, siteName: 'Pantopus', title, description },
    twitter: { card: 'summary', title, description },
  };
}

export default async function StatePage({ params }: Params) {
  const { state } = await params;
  const page = await statePage(state);
  if (!page) notFound();
  const path = statePath(page.state.slug);
  return (
    <div className="min-h-screen bg-app-surface">
      <SiteNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <Breadcrumb items={[{ name: 'Property records', path: '/property-records' }, { name: page.state.name, path }]} />
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-app-text dark:text-white leading-tight tracking-tight">
          {page.state.name} property records by {page.state.unit}
        </h1>
        <p className="mt-3 text-base sm:text-lg text-app-text-secondary dark:text-app-text-muted leading-relaxed">
          {page.state.town_records
            ? `In ${page.state.name}, each town keeps its own property records. Pick a ${page.state.unit} for its towns' offices and what public records say about homes there.`
            : `Pick a ${page.state.unit} for its own offices and what public records say about homes there.`}
        </p>
        <h2 className="mt-10 text-xl font-bold text-app-text dark:text-white">{capitalized(page.state.units)}</h2>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {page.counties.map((county) => (
            <li key={county.slug}>
              <Link
                href={countyPath(page.state.slug, county.slug)}
                className="flex items-center justify-between gap-3 rounded-xl border border-app-border-subtle bg-app-surface px-4 py-3 hover:border-primary-300 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition"
              >
                <span className="font-semibold text-app-text dark:text-white">{county.name}</span>
                {county.live ? (
                  <span className="shrink-0 rounded-full bg-app-success-bg px-2 py-0.5 text-xs font-medium text-app-success">
                    County records in Pantopus
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
