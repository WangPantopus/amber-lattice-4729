'use client';

// Today's two halves and the second one's page (founder decision 2026-11-14): "At home" is Today as it was;
// "Around you" lists local headlines, each the outlet's own with a link to the story at the outlet. Each headline is a
// post by the Pantopus curator account, drawn with the Pulse card: emoji reactions, Repost (or Repost with your words),
// replies in threads on its post panel, which opens at once from the card, and "Read at <outlet>" opening the story
// (components/feed/PostMetadata.tsx).
import { useRef, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ExternalLink, Home, Newspaper } from 'lucide-react';
import * as api from '@pantopus/api';
import type { AroundYou, AroundYouItem } from '@pantopus/api';
import type { Post } from '@pantopus/types';
import { PostCard, PostDetailPanel } from '@/components/feed';
import { reactedPostPatch, reactionFieldsOf, serverReactionPatch } from '@/components/feed/PostReactions';
import { useRepostToggle } from '@/components/feed/repost';
import ReportModal from '@/components/ui/ReportModal';
import { toast } from '@/components/ui/toast-store';
import { patchPostInFeedCaches } from '@/hooks/useFeedData';
import { hasAroundYouPosts, patchAroundYouPost, seenAgo, type TodayHalf } from '@/lib/aroundYou';
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

/**
 * The headlines as posts, with what the Pulse feed gives a post: emoji reactions, Save, Report, and the post panel for
 * the reply threads. Changes go into Around you's kept answer (`queryKey`) and any feed or post page that holds the post.
 */
function AroundYouPosts({ data, queryKey }: { data: AroundYou; queryKey: QueryKey }) {
  const queryClient = useQueryClient();
  const currentUserId = useMe().data?.id;
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // One save toggle per post at a time: a second click while the first is in flight would undo it.
  const savingIds = useRef<Set<string>>(new Set());
  const posts = data.sections.flatMap((section) => section.posts ?? []);
  const find = (postId: string) => posts.find((post) => post.id === postId);

  const patch = (postId: string, changes: Partial<Post>) => {
    queryClient.setQueryData<AroundYou>(queryKey, (prev) => (prev ? patchAroundYouPost(prev, postId, changes) : prev));
    patchPostInFeedCaches(queryClient, postId, changes);
  };
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
    applyPatch: (postId, changes) => queryClient.setQueryData<AroundYou>(
      queryKey, (prev) => (prev ? patchAroundYouPost(prev, postId, changes) : prev),
    ),
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

  return (
    <>
      {data.sections.map((section) => (section.posts?.length ? (
        <section key={section.id} aria-label={section.title} data-testid={`aroundYouSection_${section.id}`}>
          <h2 className={sectionHeading}>{section.title}</h2>
          <div className="space-y-3">
            {section.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={(postId) => likeMutation.mutate({ postId, liked: !(find(postId)?.userHasLiked ?? false) })}
                onReact={(postId, reaction) => { if (!busyIds.has(postId)) reactMutation.mutate({ postId, reaction }); }}
                onComment={setDetailPostId}
                onOpenDetail={setDetailPostId}
                onSave={handleSave}
                onRepost={currentUserId ? (postId, reposted) => { void toggleRepost(postId, reposted); } : undefined}
                isReposting={repostingIds.has(post.id)}
                onReport={setReportPostId}
                currentUserId={currentUserId}
                isLiking={busyIds.has(post.id)}
                showToast={(message) => toast.info(message)}
              />
            ))}
          </div>
        </section>
      ) : null))}

      {/* The panel opens at once from the card's copy of the post, then reads the post and its replies. Reactions,
          saves, reposts and replies made in it show on the cards too. */}
      <PostDetailPanel
        postId={detailPostId}
        initialPost={detailPostId ? find(detailPostId) ?? null : null}
        open={!!detailPostId}
        onClose={() => setDetailPostId(null)}
        onPostChange={(postId, changes) => patch(postId, changes)}
        currentUserId={currentUserId}
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
      {asPosts ? <AroundYouPosts data={data} queryKey={queryKey} /> : data.sections.map((section) => (
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
