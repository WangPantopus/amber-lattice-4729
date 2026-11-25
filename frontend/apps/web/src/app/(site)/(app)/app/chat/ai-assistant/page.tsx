'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AIChatContext } from '@pantopus/types';
import { AIAssistantView } from '@/components/ai-assistant';
import { navigateChatPath } from '@/hooks/useChatOfflineShell';
import PrerenderSuspense from '@/components/first-content/PrerenderSuspense';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The screen the assistant was opened from: Place's Ask for one of their homes (`?surface=place&home_id=`) or one of
 * their saved addresses (`?surface=place&saved_place_id=`). Ids only; the server checks they are the person's own.
 */
function askedFrom(params: URLSearchParams | null): AIChatContext | null {
  if (params?.get('surface') !== 'place') return null;
  const homeId = params.get('home_id');
  const savedPlaceId = params.get('saved_place_id');
  if (homeId && UUID.test(homeId)) return { surface: 'place', home_id: homeId };
  if (savedPlaceId && UUID.test(savedPlaceId)) return { surface: 'place', saved_place_id: savedPlaceId };
  return null;
}

function AssistantRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params?.toString() ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the query string, not the params object
  const context = useMemo(() => askedFrom(params), [query]);
  return (
    <>
      <h1 className="sr-only">Pantopus Assistant</h1>
      {/* On a phone the thread scrolls inside the window, its composer at the bottom, as in a person's chat. */}
      <div className="max-md:h-[calc(100dvh-3.5rem)] max-md:min-h-0 max-md:flex-1">
        <AIAssistantView context={context} onBack={() => navigateChatPath('/app/chat', router.push)} />
      </div>
    </>
  );
}

export default function AIAssistantPage() {
  return (
    <PrerenderSuspense fallback={<h1 className="sr-only">Pantopus Assistant</h1>}>
      <AssistantRoute />
    </PrerenderSuspense>
  );
}
