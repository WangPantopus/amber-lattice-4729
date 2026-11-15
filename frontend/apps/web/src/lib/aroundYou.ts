// Around you: Today's second half (founder decision 2026-11-14). Local headlines for the place Today shows, each the
// outlet's own headline with a link to the story at the outlet. The server answers `available: false` while the
// feature is off or the area has nothing, and Today then shows no switch.
import * as api from '@pantopus/api';
import type { AroundYou } from '@pantopus/api';
import { queryKeys } from '@/lib/query-keys';

/** Which half of Today shows. */
export type TodayHalf = 'home' | 'around';

/**
 * Around you for the hub's place, or for the kept area's city when Today shows one. `account` keeps one person's
 * answer from the next on a shared browser.
 */
export function aroundYouQuery(account: string | null, area: { latitude: number; longitude: number } | null) {
  return {
    queryKey: queryKeys.aroundYou(account, area?.latitude ?? null, area?.longitude ?? null),
    queryFn: (): Promise<AroundYou> => (area
      ? api.savedPlaces.getAreaAround({ latitude: area.latitude, longitude: area.longitude })
      : api.hub.getHubAround()),
    // The fetcher adds stories every two hours; the server keeps its answer five minutes.
    staleTime: 300_000,
    retry: 1,
  };
}

/** "3 hr ago", "Yesterday", "2 days ago": how long since Pantopus first saw the story. */
export function seenAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return minutes < 2 ? 'Just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
