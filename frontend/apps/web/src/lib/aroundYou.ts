// Around you: Today's second half (founder decision 2026-11-14). Local headlines for the place Today shows, each the
// outlet's own headline with a link to the story at the outlet. The server answers `available: false` while the
// feature is off or the area has nothing, and Today then shows no switch.
import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import type { AroundYou, AroundYouListPage } from '@pantopus/api';
import type { Post } from '@pantopus/types';
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

/** The list every Around you page opens on: its sections, then every earlier story. */
export const AROUND_ALL = 'all';

/**
 * One of Around you's lists behind the first page (a topic, "Talked about", or under 'all' the earlier stories), read
 * a page at a time for as long as there are any. `pageKey` is the first page's key (aroundYouQuery), which names the
 * account and the area; the list's own key sits under it, so one change reaches the page and its lists.
 */
export function aroundYouListQuery(pageKey: QueryKey, list: string) {
  const [, , , latitude, longitude] = pageKey as ReturnType<typeof queryKeys.aroundYou>;
  return {
    queryKey: [...pageKey, 'list', list] as const,
    queryFn: ({ pageParam }: { pageParam: string | null }): Promise<AroundYouListPage> => (
      latitude !== null && longitude !== null
        ? api.savedPlaces.getAreaAroundList({ latitude, longitude }, { list, before: pageParam })
        : api.hub.getHubAroundList({ list, before: pageParam })),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AroundYouListPage) => last.next,
    staleTime: 300_000,
    retry: 1,
  };
}

/** A list's posts, each once (a story that arrives between two reads can come back on the next page). */
export function listPosts(data: InfiniteData<AroundYouListPage> | undefined, skip?: ReadonlySet<string>): Post[] {
  const seen = new Set<string>(skip);
  const posts: Post[] = [];
  for (const page of data?.pages ?? []) {
    for (const post of page.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      posts.push(post);
    }
  }
  return posts;
}

/** A kept list with one of its posts changed. */
export function patchAroundYouList(
  data: InfiniteData<AroundYouListPage>, postId: string, changes: Partial<Post>,
): InfiniteData<AroundYouListPage> {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page, posts: page.posts.map((post) => (post.id === postId ? { ...post, ...changes } : post)),
    })),
  };
}

/** Whether a kept answer under the page's key is a list's pages (not the first page itself). */
export function isAroundYouListData(data: unknown): data is InfiniteData<AroundYouListPage> {
  return Boolean(data) && Array.isArray((data as { pages?: unknown }).pages);
}

/** "Today", "Yesterday", "Sunday, Nov 22": the day a story was first seen, for the lists' day headings. */
export function dayLabel(iso: string, now: number): string {
  const day = new Date(iso);
  if (Number.isNaN(day.getTime())) return '';
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(new Date(now)) - start(day)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
    ...(day.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** The page with one of its posts changed (a reaction, a save, a reply count from the post panel). */
export function patchAroundYouPost(page: AroundYou, postId: string, changes: Partial<Post>): AroundYou {
  return {
    ...page,
    sections: page.sections.map((section) => (section.posts
      ? { ...section, posts: section.posts.map((post) => (post.id === postId ? { ...post, ...changes } : post)) }
      : section)),
  };
}

/** Whether the server sent the items as posts (servers before the posts send only the rows). */
export function hasAroundYouPosts(page: AroundYou): boolean {
  return page.sections.some((section) => Array.isArray(section.posts));
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
