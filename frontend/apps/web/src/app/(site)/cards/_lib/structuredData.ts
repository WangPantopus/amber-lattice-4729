// ============================================================
// Structured data for the Christmas card pages (SEO build, SPEC §5): what search engines read about /cards, each
// collection and each card. Data only: the pages print it in a <script type="application/ld+json"> and draw nothing
// new. Built from the same answer the page draws (fetchPublicCardDesigns), at the same address the page's canonical
// link uses (APP_WEB_URL), so it never names a card or a collection the page doesn't show.
// ============================================================

import { APP_WEB_URL } from '@pantopus/utils';
import type { PublicCardDesigns } from '@/lib/publicShare';

type Design = PublicCardDesigns['designs'][number];
type Collection = NonNullable<PublicCardDesigns['collections']>[number];

const abs = (path: string) => `${APP_WEB_URL}${path}`;

const PUBLISHER = { '@type': 'Organization', name: 'Pantopus', url: abs('/') };

/** JSON for a <script type="application/ld+json">, with `<` escaped so no caption can close the script. */
export function cardsJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** The cards in the order /cards draws them: shelf by shelf while the shelves are on, else the designs' order. */
export function cardsInPageOrder(designs: Design[], collections: Collection[], shelves: boolean): Design[] {
  if (!shelves) return designs;
  const byId = new Map(designs.map((d) => [d.id, d]));
  return collections.flatMap((c) => c.designs.flatMap((id) => byId.get(id) ?? []));
}

/** An ItemList of cards, each to its own page: /cards, or one collection. */
export function cardListLd({ name, path, designs }: { name: string; path: string; designs: Design[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: abs(path),
    numberOfItems: designs.length,
    itemListElement: designs.map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/cards/${d.slug}`),
      name: d.caption,
    })),
  };
}

/** What one card is: a Christmas card by Pantopus, its picture, and the collection it belongs to. */
export function cardLd({ design, collection, shelves }: { design: Design; collection: Collection | null; shelves: boolean }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: design.caption,
    description: 'A Christmas card you can send on Pantopus. It arrives with their morning mail, and they open it like real mail.',
    url: abs(`/cards/${design.slug}`),
    image: abs(`/holiday-cards/${design.id}.jpg`),
    thumbnailUrl: abs(`/holiday-cards/${design.id}-thumb.jpg`),
    genre: 'Christmas card',
    inLanguage: 'en',
    publisher: PUBLISHER,
    ...(collection
      ? {
          isPartOf: {
            '@type': 'Collection',
            name: collection.name,
            // A collection has a page of its own only while the shelves are on.
            ...(shelves && collection.slug ? { url: abs(`/cards/collection/${collection.slug}`) } : {}),
          },
        }
      : {}),
  };
}

/** The collection a card is in, by the collections' own lists. */
export function collectionOf(design: Design, collections: Collection[]): Collection | null {
  return collections.find((c) => c.designs.includes(design.id)) ?? null;
}
