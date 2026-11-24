// ─────────────────────────────────────────────────────────────────────────────
// Search tags and structured data for the public reading pages ((public)/**): the pillar pages, and the topic pages
// and guides that reuse this shell. Every page gets its own title, description, canonical link, robots line and share
// card. The tags come from the site's one helper, publicPageMetadata (src/lib/site/pageMetadata.ts), without its
// picture: each page's share picture comes from the opengraph-image.tsx and twitter-image.tsx beside its page.tsx (see
// shareImage.tsx), and Next uses those files only when the page's metadata names no picture of its own.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { IOS_APP_STORE_APP_ID } from '@pantopus/utils';
import { publicPageMetadata } from '@/lib/site/pageMetadata';

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

const SUFFIX = ' | Pantopus';

/**
 * A public page's tags: publicPageMetadata's, with the title exactly as the page gives it (these titles already end
 * "| Pantopus"), the page's language, and Safari's app banner as on the homepage. Its picture is left out on purpose:
 * a picture named here would replace the page's own opengraph-image and twitter-image files.
 */
export function pageMetadata({ path, title, description }: PageTags): Metadata {
  const tags = publicPageMetadata({ path, title: title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title, description });
  const { images: _ogPicture, ...openGraph } = tags.openGraph ?? {};
  const { images: _twitterPicture, ...twitter } = tags.twitter ?? {};
  return {
    ...tags,
    title: { absolute: title },
    openGraph: { ...openGraph, locale: 'en_US', title },
    twitter: { ...twitter, title },
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
