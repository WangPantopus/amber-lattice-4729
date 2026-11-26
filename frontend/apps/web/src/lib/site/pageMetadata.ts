import type { Metadata } from 'next';
import { shareCards } from './shareCards';

const SITE_URL = 'https://pantopus.com';

/** A page's share picture: its own card from src/lib/site when it has one, else the homepage's. */
export function shareImage(path: string) {
  const card = shareCards()[path];
  return card
    ? { url: `/api/og/page?path=${encodeURIComponent(path)}`, width: 1200, height: 630, alt: card.line ? `${card.heading} ${card.line}` : card.heading }
    : { url: '/api/og/home', width: 1200, height: 630, alt: 'The Earth at night with its city lights, under the words “Real people. Real places. Right now.”' };
}

/**
 * The tags of a public page search engines may read: its own title ("<title> | Pantopus", the search words first),
 * description, canonical link, robots and share card. The share picture is /api/og/page?path=<path> when the page has a
 * card in src/lib/site (shareCards.ts, or `share` in pillarPages.ts / guidePages.ts), else the homepage's.
 */
export function publicPageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  const fullTitle = `${title} | Pantopus`;
  const image = shareImage(path);
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url: path, siteName: 'Pantopus', title: fullTitle, description, images: [image] },
    twitter: { card: 'summary_large_image', title: fullTitle, description, images: [image.url] },
  };
}

/**
 * The tags of a page search engines should not list (a password reset, an email confirmation): its own title, so a
 * browser tab and a history entry say what it is, and no indexing.
 */
export function unlistedPageMetadata(title: string): Metadata {
  return { title: { absolute: `${title} | Pantopus` }, robots: { index: false, follow: true } };
}
