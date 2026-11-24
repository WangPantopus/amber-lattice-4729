// ─────────────────────────────────────────────────────────────────────────────
// The county pages' data: the backend's public answers (backend/routes/countyGuide.js), read on the server only and
// kept a day, so a visit costs the backend nothing. No cookie, header or query is read, so each page is static.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { API_BASE_URL } from '@pantopus/utils';

/** The address search engines are given for every page (the site's other pages use it too). */
export const SITE_URL = 'https://pantopus.com';

const API = API_BASE_URL.replace(/\/+$/, '');
const DAY_S = 86400;
// The lists (the index, a state's counties, the sitemap) follow a release within the hour; a county's own page is kept a day.
export const LIST_S = 3600;

export type GuideState = { slug: string; name: string; abbr: string; unit: string; units: string };

export type GuideIndex = {
  v: 1;
  states: (GuideState & { counties: number; live: number })[];
  counties: { state: string; slug: string }[];
  cities?: { state: string; county: string; slug: string }[];
};

export type GuideStatePage = {
  v: 1;
  state: GuideState & { town_records: boolean };
  counties: { slug: string; name: string; live: boolean }[];
};

export type GuideOffice = {
  id: string;
  title: string;
  office: string | null;
  url: string;
  host: string | null;
  line?: string;
  from: string | null;
};

export type GuideQuestion = { id: string; q: string; a: string; office?: string | null; url?: string };

export type GuideCountyPage = {
  v: 1;
  built: string;
  state: GuideState;
  county: { fips: string; slug: string; name: string; in_name: string; census_name: string };
  live: boolean;
  town_records: boolean;
  offices: { rows: GuideOffice[]; towns: { name: string; url: string; host: string | null }[] };
  /** Only where the county's records are live: the county's file, its date and its records, rounded down. */
  holds?: { publisher: string; dataset: string | null; as_of: string; records: number | null; municipal?: boolean } | null;
  hazards?: { version: string | null; read: string | null; rows: { label: string; level: number; word: string }[]; source: string; url: string } | null;
  disasters?: {
    total: number;
    first: string | null;
    read: string | null;
    items: { number: number; date: string; type: string | null; kind: string | null; incident: string | null; id: string }[];
    source: string;
    url: string;
    notice: string;
  } | null;
  radon?: { zone: 1 | 2 | 3; source: string; url: string } | null;
  flood_cost?: { median: number; p25: number | null; p75: number | null; months: number; read: string | null; source: string; notice: string } | null;
  exemption?: { label: string; filing: string; note: string; source_name: string; source_url: string; read: string } | null;
  appeal?: { note: string; source: { name: string; url: string }; read: string } | null;
  // `*_open`: the median falls in the survey's open-ended lowest ('below') or highest ('above') interval, and the
  // number is that interval's edge ("1939 or earlier"), not a year or value of its own.
  homes?: {
    median_year_built: number | null;
    median_year_built_open?: 'below' | 'above' | null;
    median_value: number | null;
    median_value_open?: 'below' | 'above' | null;
    survey: string;
    source: string;
    url: string;
  } | null;
  questions: GuideQuestion[];
  /** The county's cities that have a page. */
  cities?: { slug: string; name: string }[];
  near: { slug: string; name: string; state_slug: string; state_abbr: string }[];
};

/** A city's page: only the city's own offices (read on its own site) and the Census's figures; the rest is its county's. */
export type GuideCityPage = {
  v: 1;
  built: string;
  state: GuideState;
  county: GuideCountyPage['county'];
  city: { geoid: string; slug: string; name: string; other_counties: boolean };
  offices: { rows: GuideOffice[] };
  homes?: GuideCountyPage['homes'];
  questions: GuideQuestion[];
  /** The county's other cities that have a page. */
  others: { slug: string; name: string }[];
};

/** "$522,900". */
export const dollars = (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`;

async function get<T>(path: string, revalidate: number = DAY_S): Promise<T | null> {
  const res = await fetch(`${API}/api/public/county-guide${path}`, {
    next: { revalidate },
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  // Anything else unanswered is thrown, so a page rebuilt while the backend is down keeps its last copy.
  if (!res.ok) throw new Error(`county guide ${res.status}`);
  return (await res.json()) as T;
}

const SLUG = /^[a-z0-9-]{1,80}$/;

export const guideIndex = cache(() => get<GuideIndex>('', LIST_S));

export const statePage = cache((state: string) => (SLUG.test(state) ? get<GuideStatePage>(`/${state}`, LIST_S) : Promise.resolve(null)));

export const countyPage = cache((state: string, county: string) =>
  SLUG.test(state) && SLUG.test(county) ? get<GuideCountyPage>(`/${state}/${county}`) : Promise.resolve(null));

export const cityPage = cache((state: string, county: string, city: string) =>
  SLUG.test(state) && SLUG.test(county) && SLUG.test(city) ? get<GuideCityPage>(`/${state}/${county}/${city}`) : Promise.resolve(null));

export const statePath = (state: string) => `/property-records/${state}`;
export const countyPath = (state: string, county: string) => `/property-records/${state}/${county}`;
export const cityPath = (state: string, county: string, city: string) => `/property-records/${state}/${county}/${city}`;

/** "November 17, 2026" from "2026-11-17". */
export function dateWords(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const at = new Date(`${iso}T12:00:00Z`);
  return at.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** A JSON-LD block's text, safe inside a script element. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** The breadcrumb's structured data: Property records › State › County. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
