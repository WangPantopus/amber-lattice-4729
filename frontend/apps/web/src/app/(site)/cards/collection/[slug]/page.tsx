// ============================================================
// /cards/collection/[slug] — one collection of Christmas cards (card shelves
// SPEC Part D, server key card_shelves): its name, its line, its parts where it
// has them, and all its cards; "All the cards" goes back to /cards. Public and
// indexable, with the collection's name and line as its title and description
// and its opening card's link preview. "Not found" while Christmas cards or the
// shelves are off, or for a name that isn't a collection's. ?ref= is the invite
// code of whoever shared it, kept for sign-up.
// ============================================================

import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { APP_WEB_URL } from '@pantopus/utils';
import { PublicCardsTrouble, PublicCollectionPage } from '@/components/mailbox/cards/PublicCards';
import { cardsStoreLink, fetchPublicCardDesigns, getStoreDownloadCta, publicShelvesOn, shareRefFrom, storePlatform } from '@/lib/publicShare';
import type { PublicCardsStore } from '@/components/mailbox/cards/PublicCards';
import { cardListLd, cardsInPageOrder, cardsJsonLd } from '../../_lib/structuredData';

// Rendered on every request, as /cards is: the switch lives on the server.
export const dynamic = 'force-dynamic';

type CollectionPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string | string[] }>;
};

async function collectionFor(slug: string) {
  const { data, status } = await fetchPublicCardDesigns();
  const collection = data && publicShelvesOn(data) ? (data.collections ?? []).find((c) => c.slug === slug) ?? null : null;
  return { data, status, collection };
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data, collection } = await collectionFor(slug);
  if (!data || !collection) return { metadataBase: new URL(APP_WEB_URL), title: 'Christmas cards on Pantopus', robots: { index: false, follow: true } };
  const title = `${collection.name}: Christmas cards on Pantopus`;
  const description = collection.line || 'Christmas cards you can send on Pantopus.';
  const url = `/cards/collection/${collection.slug}`;
  const pick = data.designs.find((d) => d.id === collection.pick) ?? data.designs.find((d) => d.id === collection.designs[0]);
  const image = pick ? { url: `/holiday-cards/share/${pick.id}-link.jpg`, width: 1200, height: 630, alt: `A Christmas card: ${pick.caption}` } : null;
  return {
    metadataBase: new URL(APP_WEB_URL),
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url, siteName: 'Pantopus', title, description, ...(image ? { images: [image] } : {}) },
    twitter: { card: 'summary_large_image', title, description, ...(image ? { images: [image.url] } : {}) },
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#171e2d' };

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const { slug } = await params;
  const { data, status, collection } = await collectionFor(slug);
  if (!collection) {
    // Not a collection's name, or cards or the shelves are off. Anything else: the server didn't answer.
    if (status === 200 || status === 404) notFound();
    return <PublicCardsTrouble />;
  }
  const inviteCode = shareRefFrom((await searchParams).ref);
  const store = await phoneStore('/app/mailbox/cards', inviteCode);
  const designs = cardsInPageOrder(data?.designs ?? [], [collection], true);
  return (
    <>
      <PublicCollectionPage collection={collection} designs={data?.designs ?? []} inviteCode={inviteCode} store={store} />
      {/* For search engines, the collection's cards in its order (data only; nothing drawn). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: cardsJsonLd(cardListLd({ name: `${collection.name}: Christmas cards on Pantopus`, path: `/cards/collection/${collection.slug}`, designs })),
        }}
      />
    </>
  );
}

/**
 * On a phone, the store button that carries the sending flow (`path`) through the install, or the join link of the
 * code in `ref` when it is a creator's code (`cardsStoreLink`); null anywhere else.
 */
async function phoneStore(path: string, ref: string | null): Promise<PublicCardsStore | null> {
  const userAgent = (await headers()).get('user-agent') || '';
  const platform = storePlatform(userAgent);
  if (!platform) return null;
  const carried = await cardsStoreLink(path, ref);
  const cta = getStoreDownloadCta(userAgent, carried.path);
  return cta ? { href: cta.href, copyPath: cta.copyPath ?? null, platform, ...(carried.joins ? { joins: true } : {}) } : null;
}
