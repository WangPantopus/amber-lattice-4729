// ─────────────────────────────────────────────────────────────────────────────
// /property-records/<state>/<county>: one county's page. Its own offices, what public records say about homes there
// and the questions people ask, each answered with the office that holds the answer; a part with nothing real for
// the county is left out. Static, built on first visit and rebuilt about daily from the backend's answer
// (backend/services/countyGuide), so a visit costs the backend nothing. No page per address, ever, and no address in
// any link here.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, SiteFooter, SiteNav, linkClass } from '../../_components/Chrome';
import { SITE_URL, countyPage, countyPath, jsonLd, statePath, type GuideCountyPage } from '../../_lib/guide';

export const revalidate = 86400;
export const dynamicParams = true;

// Built on first visit, not at deploy: the backend decides which pages exist.
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ state: string; county: string }> };

function words(page: GuideCountyPage) {
  const { county, state } = page;
  const title = `${county.name}, ${state.abbr} property records`;
  const description = page.town_records
    ? `Where the towns of ${county.in_name}, ${state.name}, keep their property records, and what public records say about homes there, with every source named.`
    : `${county.name}, ${state.name}: the ${state.unit}'s own property offices and what public records say about homes there, with every source named.`;
  return { title, description };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { state, county } = await params;
  const page = await countyPage(state, county);
  if (!page) return {};
  const { title, description } = words(page);
  const path = countyPath(page.state.slug, page.county.slug);
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

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="mt-10">
      <h2 id={`${id}-title`} className="text-xl font-bold text-app-text dark:text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Offices({ page }: { page: GuideCountyPage }) {
  const { rows, towns } = page.offices;
  if (!rows.length && !towns.length) return null;
  return (
    <Section id="offices" title={page.town_records ? `Where records are kept in ${page.county.in_name}` : `${page.county.name}'s own offices`}>
      {page.town_records ? (
        <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed">
          In {page.state.name}, each city and town keeps its own property records.
        </p>
      ) : null}
      {rows.length ? (
        <ul className="mt-2 divide-y divide-app-border-subtle rounded-2xl border border-app-border-subtle bg-app-surface">
          {rows.map((row) => (
            <li key={`${row.id}:${row.url}`} className="px-4 py-3.5">
              <p className="font-semibold text-app-text dark:text-white">{row.title}</p>
              {row.office ? <p className="text-sm text-app-text-secondary dark:text-app-text-muted">{row.office}</p> : null}
              {row.line ? <p className="mt-1 text-sm text-app-text-secondary dark:text-app-text-muted">{row.line}</p> : null}
              <a href={row.url} target="_blank" rel="noopener noreferrer nofollow" className={`mt-1 inline-block text-sm font-medium ${linkClass}`}>
                {row.host || 'Open the office’s page'}
              </a>
              {row.from ? <p className="mt-1 text-xs text-app-text-muted">{row.from}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {towns.length ? (
        <>
          <h3 className="mt-5 font-semibold text-app-text dark:text-white">Each town&apos;s property cards</h3>
          <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {towns.map((town) => (
              <li key={town.name}>
                <a href={town.url} target="_blank" rel="noopener noreferrer nofollow" className={`text-sm ${linkClass}`}>{town.name}</a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-app-text-muted">From Connecticut&apos;s 2026 Parcel and CAMA Data on data.ct.gov.</p>
        </>
      ) : null}
    </Section>
  );
}

function Questions({ page }: { page: GuideCountyPage }) {
  if (!page.questions.length) return null;
  return (
    <Section id="questions" title="Questions people ask">
      <div className="divide-y divide-app-border-subtle rounded-2xl border border-app-border-subtle bg-app-surface">
        {page.questions.map((item) => (
          <div key={item.id} className="px-4 py-3.5">
            <h3 className="font-semibold text-app-text dark:text-white">{item.q}</h3>
            <p className="mt-1 text-app-text-secondary dark:text-app-text-muted leading-relaxed">{item.a}</p>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className={`mt-1 inline-block text-sm ${linkClass}`}>
                {item.office ? `Open ${item.office}'s page` : 'Open the office’s page'}
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function NextTo({ page }: { page: GuideCountyPage }) {
  return (
    <Section id="near" title={`Next to ${page.county.in_name}`}>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link href={statePath(page.state.slug)} className="inline-flex rounded-full border border-app-border-subtle px-3 py-1.5 text-sm font-medium text-app-text dark:text-white hover:border-primary-300">
            All of {page.state.name}
          </Link>
        </li>
        {page.near.map((near) => (
          <li key={`${near.state_slug}/${near.slug}`}>
            <Link href={countyPath(near.state_slug, near.slug)} className="inline-flex rounded-full border border-app-border-subtle px-3 py-1.5 text-sm text-app-text dark:text-white hover:border-primary-300">
              {near.name}{near.state_abbr !== page.state.abbr ? `, ${near.state_abbr}` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function faqLd(page: GuideCountyPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.questions.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export default async function CountyPage({ params }: Params) {
  const { state, county } = await params;
  const page = await countyPage(state, county);
  if (!page) notFound();
  const { title } = words(page);
  return (
    <div className="min-h-screen bg-app-surface">
      <SiteNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <Breadcrumb
          items={[
            { name: 'Property records', path: '/property-records' },
            { name: page.state.name, path: statePath(page.state.slug) },
            { name: page.county.name, path: countyPath(page.state.slug, page.county.slug) },
          ]}
        />
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-app-text dark:text-white leading-tight tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-base sm:text-lg text-app-text-secondary dark:text-app-text-muted leading-relaxed">
          {page.town_records
            ? `Where the towns of ${page.county.in_name}, ${page.state.name}, keep their property records, and what public records say about homes there.`
            : `${page.county.name}'s own offices, and what public records say about homes in ${page.county.in_name}, ${page.state.name}.`}
        </p>
        <Offices page={page} />
        <Questions page={page} />
        <NextTo page={page} />
        {page.questions.length ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd(page)) }} />
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
