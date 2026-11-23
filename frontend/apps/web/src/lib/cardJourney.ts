// A travelling card's journey for its public page (server key card_travel; docs/product/travelling-card-2026-11-21,
// Part 5). Its own file, imported only by the journey page: the 60-second keep uses next/cache, which other pages that
// read lib/publicShare (and their tests) shouldn't load.

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import type { CardJourney } from '@pantopus/api';
import { fetchPublicJson, type PublicFetchResult } from './publicShare';

/**
 * The journey (404 while the feature is off or there is no such journey). Towns and dates only. Kept 60 seconds per
 * journey on the web's servers, so a journey shared widely is read from the API about once a minute, whatever the
 * page's own rendering; a failed read (5xx, no answer) isn't kept.
 */
const readCardJourney = unstable_cache(async (id: string): Promise<PublicFetchResult<CardJourney>> => {
  const result = await fetchPublicJson<{ journey: CardJourney }>(`/api/mailbox/cards/journeys/${encodeURIComponent(id)}`, { noStore: true });
  if (!result.data && result.status !== 404) throw new Error(`journey read ${result.status}`);
  return { data: result.data?.journey ?? null, status: result.status };
}, ['card-journey-v1'], { revalidate: 60 });

export const fetchCardJourney = cache(async (id: string): Promise<PublicFetchResult<CardJourney>> => (
  readCardJourney(id).catch(() => ({ data: null, status: 500 }))
));
