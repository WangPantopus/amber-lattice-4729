'use client';

// Today's two halves and the second one's page (founder decision 2026-11-14): "At home" is Today as it was;
// "Around you" lists local headlines, each the outlet's own with a link to the story at the outlet. Each headline is a
// post by the Pantopus curator account, drawn with the Pulse card: emoji reactions, Repost (or Repost with your words),
// replies in threads on its post panel, which opens at once from the card, and "Read at <outlet>" opening the story
// (components/feed/PostMetadata.tsx).
// Topics and scrolling back (founder, 2026-11-24): a row of chips over the page (All, Talked about, Events, Kids &
// schools, Sports, …; the server says which this place has), each a list that keeps loading as you scroll for as long
// as there are stories; under All the first page's sections are followed by every earlier story. A card people
// replied to shows who and the latest reply (PostCard draws `post.conversation`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ExternalLink, Home, Newspaper } from 'lucide-react';
import * as api from '@pantopus/api';
import type { AroundYou, AroundYouItem, AroundYouList } from '@pantopus/api';
import type { Post } from '@pantopus/types';
import { PostCard, PostDetailPanel } from '@/components/feed';
import { reactedPostPatch, reactionFieldsOf, serverReactionPatch } from '@/components/feed/PostReactions';
import { useRepostToggle } from '@/components/feed/repost';
import ReportModal from '@/components/ui/ReportModal';
import { toast } from '@/components/ui/toast-store';
import { patchPostInFeedCaches } from '@/hooks/useFeedData';
import {
  AROUND_ALL, aroundYouListQuery, dayLabel, hasAroundYouPosts, isAroundYouListData, listPosts, patchAroundYouList,
  patchAroundYouPost, seenAgo, type TodayHalf,
} from '@/lib/aroundYou';
import { useMe } from '@/lib/me';

const HALVES = [['home', 'At home', Home], ['around', 'Around you', Newspaper]] as const;

/** The big two-part switch under Today's title, drawn as Pulse draws List | Map. */
export function TodayHalfSwitch({ half, onChange }: { half: TodayHalf; onChange: (half: TodayHalf) => void }) {
  return (
    <div
      role="group"
      aria-label="Today"
      data-testid="todayHalfToggle"
      className="mb-5 flex gap-1 rounded-full border border-app bg-surface-muted p-1"
    >
      {HALVES.map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={half === key}
          data-testid={`todayHalfSegment_${key}`}
          className={`flex-1 h-10 rounded-full text-[15px] font-bold flex items-center justify-center gap-2 transition ${
            half === key ? 'bg-primary-600 text-white' : 'text-app-muted hover:text-app'
          }`}
        >
          <Icon className="w-[18px] h-[18px]" /> {label}
        </button>
      ))}
    </div>
  );
}

function ItemRow({ item, now }: { item: AroundYouItem; now: number | null }) {
  // A story says when it was first seen; a tip (no link) is not news and carries no time.
  const meta = [item.source, now === null || !item.url ? null : seenAgo(item.seen_at, now)].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className="block text-[15px] font-semibold leading-snug text-app-text">{item.title}</span>
      {meta ? <span className="mt-1 block text-xs text-app-text-secondary">{meta}</span> : null}
    </>
  );
  if (!item.url) {
    return <div className="px-4 py-3" data-testid="aroundYouItem">{body}</div>;
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="aroundYouItem"
      className="flex items-start gap-3 px-4 py-3 transition hover:bg-app-hover"
    >
      <span className="min-w-0 flex-1">{body}</span>
      <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-app-text-muted" aria-hidden />
    </a>
  );
}

const sectionHeading = 'mb-2 px-1 text-xs font-bold uppercase tracking-wider text-app-text-secondary';

/** The chips over the page: which list shows. Drawn as Pulse draws its filter chips. */
function ListChips({ lists, active, onChange }: {
  lists: AroundYouList[];
  active: string;
  onChange: (list: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Topics"
      data-testid="aroundYouLists"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide"
    >
      {lists.map((list) => (
        <button
          key={list.id}
          type="button"
          onClick={() => onChange(list.id)}
          aria-pressed={active === list.id}
          data-testid={`aroundYouList_${list.id}`}
          className={`flex-shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 ${
            active === list.id
              ? 'bg-primary-600 text-white shadow-md'
              : 'border border-app bg-surface text-app-muted hover-bg-app hover:shadow-sm'
          }`}
        >
          {list.title}
        </button>
      ))}
    </div>
  );
}

/** What an empty list says. */
function emptyListText(list: string): string {
  if (list === 'talked') return 'No one has replied or reacted yet. Open a story and be the first.';
  if (list === 'events') return 'No events on the calendars in the next week.';
  return 'Nothing here yet.';
}

/**
 * The headlines as posts, with what the Pulse feed gives a post: emoji reactions, Save, Report, and the post panel for
 * the reply threads. Changes go into every kept answer under Around you's key (`queryKey`: the first page and each
 * list read so far) and any feed or post page that holds the post.
 */
function AroundYouPosts({ data, queryKey, now }: { data: AroundYou; queryKey: QueryKey; now: number | null }) {
  const queryClient = useQueryClient();
  const currentUserId = useMe().data?.id;
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  // The panel was opened by Reply (or the reply preview): its reply box is ready to type in.
  const [replying, setReplying] = useState(false);
  const openPost = useCallback((postId: string) => { setReplying(false); setDetailPostId(postId); }, []);
  const openReply = useCallback((postId: string) => { setReplying(true); setDetailPostId(postId); }, []);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // One save toggle per post at a time: a second click while the first is in flight would undo it.
  const savingIds = useRef<Set<string>>(new Set());
  const lists = data.lists ?? [];
  const [chosen, setChosen] = useState<string>(AROUND_ALL);
  // A chip the place no longer offers (another place, a quieter week) falls back to All.
  const list = lists.some((entry) => entry.id === chosen) ? chosen : AROUND_ALL;
  const pagePosts = useMemo(() => data.sections.flatMap((section) => section.posts ?? []), [data.sections]);
  const shownIds = useMemo(() => new Set(pagePosts.map((post) => post.id)), [pagePosts]);
  // The list behind the first page: under All every earlier story, read only once the first page's end is near (most
  // opens never get there); under any other chip that chip's list.
  const [nearEnd, setNearEnd] = useState(false);
  const pageEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = pageEnd.current;
    if (nearEnd || !node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNearEnd(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNearEnd(true);
    }, { rootMargin: '1200px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [nearEnd, list]);
  const more = useInfiniteQuery({
    ...aroundYouListQuery(queryKey, list),
    enabled: lists.length > 0 && (list !== AROUND_ALL || nearEnd),
  });
  const morePosts = useMemo(
    () => listPosts(more.data, list === AROUND_ALL ? shownIds : undefined), [more.data, list, shownIds],
  );
  const posts = useMemo(() => [...pagePosts, ...morePosts], [pagePosts, morePosts]);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const find = useCallback((postId: string) => postsRef.current.find((post) => post.id === postId), []);

  // The page and every list kept under its key hold the post: each takes the change.
  const patchAround = useCallback((postId: string, changes: Partial<Post>) => {
    queryClient.setQueriesData<unknown>({ queryKey }, (prev: unknown) => {
      if (!prev) return prev;
      return isAroundYouListData(prev)
        ? patchAroundYouList(prev, postId, changes)
        : patchAroundYouPost(prev as AroundYou, postId, changes);
    });
  }, [queryClient, queryKey]);
  const patch = useCallback((postId: string, changes: Partial<Post>) => {
    patchAround(postId, changes);
    patchPostInFeedCaches(queryClient, postId, changes);
  }, [patchAround, queryClient]);
  const settle = (postId: string) => setBusyIds((prev) => {
    const next = new Set(prev);
    next.delete(postId);
    return next;
  });

  // The state the person chose goes with each request, so a re-send can't flip it back.
  const likeMutation = useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) => api.posts.toggleLike(postId, liked),
    onMutate: ({ postId }) => setBusyIds((prev) => new Set(prev).add(postId)),
    onSuccess: (res, { postId }) => patch(postId, { userHasLiked: res.liked, like_count: res.likeCount }),
    onError: () => toast.error("Couldn't update your reaction. Please try again."),
    onSettled: (_data, _err, { postId }) => settle(postId),
  });

  // An emoji: shown at once, the server's counts replace the guess, put back if refused.
  const reactMutation = useMutation({
    mutationFn: ({ postId, reaction }: { postId: string; reaction: string | null }) => api.posts.setReaction(postId, reaction),
    onMutate: ({ postId, reaction }) => {
      setBusyIds((prev) => new Set(prev).add(postId));
      const before = find(postId);
      if (!before) return undefined;
      patch(postId, reactedPostPatch(before, reaction));
      return { previous: reactionFieldsOf(before) };
    },
    onSuccess: (res, { postId }) => patch(postId, serverReactionPatch(res, find(postId)?.reactions)),
    onError: (_err, { postId }, context) => {
      if (context) patch(postId, context.previous);
      toast.error("Couldn't update your reaction. Please try again.");
    },
    onSettled: (_data, _err, { postId }) => settle(postId),
  });

  const saveMutation = useMutation({
    mutationFn: ({ postId, wantSaved }: { postId: string; wantSaved: boolean }) => api.posts.toggleSave(postId, wantSaved),
    onSuccess: (res, { postId }) => patch(postId, { userHasSaved: res.saved }),
    onError: () => toast.error('Failed to save post'),
  });

  // Repost or Undo repost from the card's chooser (its "Repost with your words" opens the Pulse composer on its own):
  // shown at once, put back if refused. A repost shows the post to the reposter's connections in Pulse.
  const { toggleRepost, repostingIds } = useRepostToggle({
    findPost: find,
    applyPatch: patchAround,
    onConfirmed: (postId, changes) => patchPostInFeedCaches(queryClient, postId, changes),
    showToast: (message) => toast.info(message),
  });

  const handleSave = (postId: string) => {
    if (savingIds.current.has(postId)) return;
    savingIds.current.add(postId);
    saveMutation.mutate({ postId, wantSaved: !(find(postId)?.userHasSaved ?? false) }, {
      onSettled: () => { savingIds.current.delete(postId); },
    });
  };

  // Keeps reading as the list's end comes into view, for as long as the server says there is more.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = more;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, morePosts.length]);

  const card = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      onLike={(postId) => likeMutation.mutate({ postId, liked: !(find(postId)?.userHasLiked ?? false) })}
      onReact={(postId, reaction) => { if (!busyIds.has(postId)) reactMutation.mutate({ postId, reaction }); }}
      onComment={openReply}
      onOpenDetail={openPost}
      onSave={handleSave}
      onRepost={currentUserId ? (postId, reposted) => { void toggleRepost(postId, reposted); } : undefined}
      isReposting={repostingIds.has(post.id)}
      onReport={setReportPostId}
      currentUserId={currentUserId}
      isLiking={busyIds.has(post.id)}
      showToast={(message) => toast.info(message)}
    />
  );

  // A list's stories under the day each was first seen; the coming events and what is talked about need no days.
  const dated = list !== 'events' && list !== 'talked' && now !== null;
  const byDay: { day: string; posts: Post[] }[] = [];
  for (const post of morePosts) {
    const day = dated ? dayLabel(post.created_at, now) : '';
    const last = byDay[byDay.length - 1];
    if (last && last.day === day) last.posts.push(post);
    else byDay.push({ day, posts: [post] });
  }
  const listTitle = lists.find((entry) => entry.id === list)?.title ?? '';
  const firstRead = more.isLoading;

  return (
    <>
      {lists.length > 1 ? <ListChips lists={lists} active={list} onChange={setChosen} /> : null}

      {list === AROUND_ALL ? data.sections.map((section) => (section.posts?.length ? (
        <section key={section.id} aria-label={section.title} data-testid={`aroundYouSection_${section.id}`}>
          <h2 className={sectionHeading}>{section.title}</h2>
          <div className="space-y-3">{section.posts.map(card)}</div>
        </section>
      ) : null)) : null}

      {list === AROUND_ALL ? <div ref={pageEnd} aria-hidden="true" /> : null}

      {/* The list behind the first page: the earlier stories under All, or the chosen chip's own list. */}
      {morePosts.length > 0 ? (
        <section
          aria-label={list === AROUND_ALL ? 'Earlier' : listTitle}
          data-testid={`aroundYouListPosts_${list}`}
          className="space-y-5"
        >
          {byDay.map((group, index) => (
            <div key={`${group.day}_${index}`}>
              {list === AROUND_ALL || group.day ? (
                <h2 className={sectionHeading}>
                  {list === AROUND_ALL ? (group.day ? `Earlier · ${group.day}` : 'Earlier') : group.day}
                </h2>
              ) : null}
              <div className="space-y-3">{group.posts.map(card)}</div>
            </div>
          ))}
        </section>
      ) : null}

      {list !== AROUND_ALL && !firstRead && !more.isError && morePosts.length === 0 ? (
        <p className="rounded-2xl border border-app bg-surface px-4 py-6 text-center text-sm text-app-text-secondary" data-testid="aroundYouListEmpty">
          {emptyListText(list)}
        </p>
      ) : null}
      {firstRead && list !== AROUND_ALL ? (
        <p className="px-1 text-sm text-app-text-secondary" role="status">Loading…</p>
      ) : null}
      {more.isError && morePosts.length === 0 && list !== AROUND_ALL ? (
        <p className="px-1 text-sm text-app-text-secondary" role="status">
          Couldn’t load this list.{' '}
          <button type="button" className="font-semibold text-app-link hover:underline" onClick={() => { void more.refetch(); }}>
            Try again
          </button>
        </p>
      ) : null}

      {/* The end of what is loaded: more comes by itself as this nears the screen, or by the button. */}
      {hasNextPage ? (
        <div ref={sentinel} className="flex justify-center py-2">
          <button
            type="button"
            onClick={() => { void fetchNextPage(); }}
            disabled={isFetchingNextPage}
            data-testid="aroundYouMore"
            className="rounded-xl border border-app bg-surface px-4 py-2 text-xs font-semibold text-app-muted transition hover-bg-app disabled:opacity-60"
          >
            {isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        </div>
      ) : null}
      {!hasNextPage && morePosts.length > 0 && more.data && more.data.pages.length > 1 ? (
        <p className="px-1 pb-2 text-center text-xs text-app-text-secondary" data-testid="aroundYouEnd">
          That’s everything so far.
        </p>
      ) : null}

      {/* The panel opens at once from the card's copy of the post, then reads the post and its replies. Reactions,
          saves, reposts and replies made in it show on the cards too. */}
      <PostDetailPanel
        postId={detailPostId}
        initialPost={detailPostId ? find(detailPostId) ?? null : null}
        open={!!detailPostId}
        onClose={() => setDetailPostId(null)}
        onPostChange={(postId, changes) => patch(postId, changes)}
        currentUserId={currentUserId}
        focusReply={replying}
      />

      <ReportModal
        open={!!reportPostId}
        onClose={() => setReportPostId(null)}
        onSubmit={async (reason, details) => {
          if (!reportPostId) return;
          await api.posts.reportPost(reportPostId, {
            reason: reason as 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other',
            details,
          });
          toast.success('Report submitted');
          setReportPostId(null);
        }}
        entityType="post"
      />
    </>
  );
}

/**
 * The Around you page: the headlines as posts, or, from a server before the posts, as the first build's rows. `now` is
 * null until the page has hydrated, so the server's HTML shows no clock-bound words. `queryKey` is the kept answer's.
 */
export function AroundYouPanel({ data, now, queryKey }: { data: AroundYou; now: number | null; queryKey: QueryKey }) {
  const asPosts = hasAroundYouPosts(data);
  return (
    <div className="space-y-5" data-testid="aroundYouPanel">
      {data.area ? (
        <p className="px-1 text-sm text-app-text-secondary">
          {asPosts
            ? `From local news outlets around ${data.area}. Each post links to the story where it was published.`
            : `From local news outlets around ${data.area}. Each headline opens the story where it was published.`}
        </p>
      ) : null}
      {asPosts ? <AroundYouPosts data={data} queryKey={queryKey} now={now} /> : data.sections.map((section) => (
        <section key={section.id} aria-label={section.title} data-testid={`aroundYouSection_${section.id}`}>
          <h2 className={sectionHeading}>{section.title}</h2>
          <div className="divide-y divide-app overflow-hidden rounded-2xl border border-app bg-surface">
            {section.items.map((item) => <ItemRow key={item.id} item={item} now={now} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
