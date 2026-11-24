import type { MetadataRoute } from 'next';
import { API_BASE_URL } from '@pantopus/utils';
import { GUIDE_PAGES } from '@/lib/site/guidePages';
import { PILLAR_PAGES } from '@/lib/site/pillarPages';

// The pages search engines may read, at the address every page's canonical link uses. robots.ts points to this file
// in production only; staging and local builds tell search engines to stay out, whatever is listed here.
//
// The county pages come from the backend's list (backend/services/countyGuide), kept an hour, so a release is listed
// within the hour. Built per request so a backend that can't answer leaves the county pages out of one answer only.
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://pantopus.com';

// Public pages anyone can read, signed in or not (robots.ts keeps the private paths out).
const PUBLIC_PAGES = ['/', '/start', '/tax-check', '/cards', '/about', '/about/data-sources', '/contact', '/privacy', '/terms', '/child-safety'];

type GuideIndex = { states: { slug: string }[]; counties: { state: string; slug: string }[] };

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
    ];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [
    ...PUBLIC_PAGES,
    ...PILLAR_PAGES.map((page) => page.path),
    ...GUIDE_PAGES.map((page) => page.path),
    ...(await countyPages()),
  ];
  // A page listed twice (a pillar page also named in PUBLIC_PAGES) is listed once.
  return [...new Set(pages)].map((path) => ({ url: `${SITE_URL}${path}` }));
}
