import type { MetadataRoute } from 'next';
import { API_BASE_URL } from '@pantopus/utils';

// The pages search engines may read, at the address every page's canonical link uses. robots.ts points to this file
// in production only; staging and local builds tell search engines to stay out, whatever is listed here.
//
// The county and city pages come from the backend's list (backend/services/countyGuide), kept an hour, so a release is listed
// within the hour. Built per request so a backend that can't answer leaves the county pages out of one answer only.
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://pantopus.com';

// Public pages anyone can read, signed in or not (robots.ts keeps the private paths out).
const PUBLIC_PAGES = ['/', '/start', '/tax-check', '/cards', '/about', '/about/data-sources', '/contact', '/privacy', '/terms', '/child-safety'];

type GuideIndex = {
  states: { slug: string }[];
  counties: { state: string; slug: string }[];
  cities?: { state: string; county: string; slug: string }[];
};

async function countyPages(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL.replace(/\/+$/, '')}/api/public/county-guide`, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const index = (await res.json()) as GuideIndex;
    if (!index?.states?.length) return [];
    return [
      '/property-records',
      ...index.states.map((state) => `/property-records/${state.slug}`),
      ...index.counties.map((county) => `/property-records/${county.state}/${county.slug}`),
      ...(index.cities || []).map((city) => `/property-records/${city.state}/${city.county}/${city.slug}`),
    ];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [...PUBLIC_PAGES, ...(await countyPages())];
  return pages.map((path) => ({ url: `${SITE_URL}${path}` }));
}
