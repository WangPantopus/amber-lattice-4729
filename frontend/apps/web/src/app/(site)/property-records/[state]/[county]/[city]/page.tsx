// ─────────────────────────────────────────────────────────────────────────────
// /property-records/<state>/<county>/<city>: one city's page. Only what is the city's own: its building permits and
// zoning offices, read on the city's own site, and the Census's figures for the city. The county's offices, hazards
// and records stay on the county page, linked once. Static, built on first visit and rebuilt about daily from the
// backend's answer (backend/services/countyGuide/cities.js). No page per address, and no address in any link here.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, SiteFooter, SiteNav, linkClass } from '../../../_components/Chrome';
import CountyLookup from '../../../_components/CountyLookup';
import { Homes, OfficeRows, Questions, Section, faqLd } from '../../../_components/CountyParts';
import { SITE_URL, cityPage, cityPath, countyPath, jsonLd, statePath, type GuideCityPage } from '../../../_lib/guide';

export const revalidate = 86400;
export const dynamicParams = true;

// Built on first visit, not at deploy: the backend decides which pages exist.
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ state: string; county: string; city: string }> };

function words(page: GuideCityPage) {
  const { city, state } = page;
  return {
    title: `${city.name}, ${state.abbr} property records`,
    description: `${city.name}, ${state.name}: the city's own building permit and zoning offices, and what public records say about homes there, with every source named.`,
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { state, county, city } = await params;
  const page = await cityPage(state, county, city);
  if (!page) return {};
  const { title, description } = words(page);
  const path = cityPath(page.state.slug, page.county.slug, page.city.slug);
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

/** The one link back: the county keeps the deeds, the tax roll and the area's federal records. */
function CountyRecords({ page }: { page: GuideCityPage }) {
  const { city, county, state } = page;
  return (
    <Section id="county" title={`${city.name}'s property records`}>
      <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed">
        {city.other_counties
          ? `Most of ${city.name} is in ${county.in_name}, which keeps the deeds, the tax roll and the property search for homes there; parts of the city are in other counties, whose own offices hold those homes' records.`
          : `${county.name} keeps the deeds, the tax roll and the property search for homes in ${city.name}.`}{' '}
        Its offices, the area&apos;s federal hazard ratings and what Pantopus holds there are on its page.
      </p>
      <Link href={countyPath(state.slug, county.slug)} className={`mt-2 inline-block font-medium ${linkClass}`}>
        {county.name}, {state.abbr} property records
      </Link>
    </Section>
  );
}

function OtherCities({ page }: { page: GuideCityPage }) {
  if (!page.others.length) return null;
  return (
    <Section id="others" title={`Other cities in ${page.county.in_name}`}>
      <ul className="flex flex-wrap gap-2">
        {page.others.map((other) => (
          <li key={other.slug}>
            <Link href={cityPath(page.state.slug, page.county.slug, other.slug)} className="inline-flex rounded-full border border-app-border-subtle px-3 py-1.5 text-sm text-app-text dark:text-white hover:border-primary-300">
              {other.name}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default async function CityPage({ params }: Params) {
  const { state, county, city } = await params;
  const page = await cityPage(state, county, city);
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
            { name: page.city.name, path: cityPath(page.state.slug, page.county.slug, page.city.slug) },
          ]}
        />
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-app-text dark:text-white leading-tight tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-base sm:text-lg text-app-text-secondary dark:text-app-text-muted leading-relaxed">
          {page.city.name}&apos;s own building permit and zoning offices, and what public records say about homes in{' '}
          {page.city.name}, {page.state.name}.
        </p>
        <CountyLookup fips={page.city.geoid} inName={page.city.name} kind="city" />
        <Section id="offices" title={`${page.city.name}'s own offices`}>
          <OfficeRows rows={page.offices.rows} />
        </Section>
        <Homes page={page} />
        <Questions questions={page.questions} />
        <CountyRecords page={page} />
        <OtherCities page={page} />
        {page.questions.length ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd(page.questions)) }} />
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
