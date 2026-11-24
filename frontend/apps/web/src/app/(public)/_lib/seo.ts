// ─────────────────────────────────────────────────────────────────────────────
// Search tags and structured data for the public reading pages ((public)/**): the pillar pages, and the topic pages
// and guides that reuse this shell. Every page gets its own title, description, canonical link, robots line and share
// card; its share picture comes from the opengraph-image.tsx and twitter-image.tsx beside its page.tsx (see
// shareImage.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { IOS_APP_STORE_APP_ID } from '@pantopus/utils';

/** The address search engines are given for every page. */
export const SITE_URL = 'https://pantopus.com';

export interface PageTags {
  /** The page's own path, e.g. "/place". Its canonical link. */
  path: string;
  /** 60 characters or fewer, the search words first, ending "| Pantopus". */
  title: string;
  /** 140 to 160 characters: what the person gets. */
  description: string;
}

/** A public page's tags. `title.absolute` keeps a site-wide title template from adding "| Pantopus" twice. */
export function pageMetadata({ path, title, description }: PageTags): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url: path, siteName: 'Pantopus', locale: 'en_US', title, description },
    twitter: { card: 'summary_large_image', title, description },
    // Safari on an iPhone offers the app in its own banner above the page, as on the homepage.
    ...(IOS_APP_STORE_APP_ID ? { itunes: { appId: IOS_APP_STORE_APP_ID } } : {}),
  };
}

/** JSON for a <script type="application/ld+json">, with `<` escaped so no text in it can close the script. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export interface Crumb {
  name: string;
  path: string;
}

/** BreadcrumbList for Home › … › this page. */
export function breadcrumbLd(items: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === '/' ? '' : item.path}`,
    })),
  };
}

export interface Question {
  q: string;
  a: string;
}

/** FAQPage from the same questions the page draws, so the data never says something the page doesn't. */
export function faqLd(questions: Question[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
