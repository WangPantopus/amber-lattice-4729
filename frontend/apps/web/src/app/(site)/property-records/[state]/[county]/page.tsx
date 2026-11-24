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
import CountyLookup from '../../_components/CountyLookup';
import { Holds, Homes, Land, OfficeRows, Owning, Questions, Section, faqLd } from '../../_components/CountyParts';
import { SITE_URL, cityPath, countyPage, countyPath, jsonLd, statePath, type GuideCountyPage } from '../../_lib/guide';

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
      <OfficeRows rows={rows} />
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

/** The county's cities that have a page of their own: their permit and zoning offices. */
function Cities({ page }: { page: GuideCountyPage }) {
  if (!page.cities?.length) return null;
  return (
    <Section id="cities" title={`Cities in ${page.county.in_name}`}>
      <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed">
        Building permits and zoning are a city&apos;s own. These cities&apos; offices were read on their own sites.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {page.cities.map((city) => (
          <li key={city.slug}>
            <Link href={cityPath(page.state.slug, page.county.slug, city.slug)} className="inline-flex rounded-full border border-app-border-subtle px-3 py-1.5 text-sm font-medium text-app-text dark:text-white hover:border-primary-300">
              {city.name}
            </Link>
          </li>
        ))}
      </ul>
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
        <CountyLookup fips={page.county.fips} inName={page.county.in_name} />
        <Offices page={page} />
        <Holds page={page} />
        <Land page={page} />
        <Owning page={page} />
        <Homes page={page} />
        <Questions questions={page.questions} />
        <Cities page={page} />
        <NextTo page={page} />
        {page.questions.length ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd(page.questions)) }} />
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
