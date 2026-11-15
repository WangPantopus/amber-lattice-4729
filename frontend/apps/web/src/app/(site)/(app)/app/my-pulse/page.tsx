'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useKeptState } from '@/lib/keptState';
import * as api from '@pantopus/api';
import { getAuthToken } from '@pantopus/api';
import type { Post } from '@pantopus/types';
import { EditPostDialog, PostCard, PostDetailPanel } from '@/components/feed';
import { patchPostInFeedCaches, removePostFromFeedCaches } from '@/hooks/useFeedData';
import { reactedPostPatch, reactionFieldsOf, serverReactionPatch } from '@/components/feed/PostReactions';
import { mergePostPatch, useRepostToggle } from '@/components/feed/repost';
import {
  FEED_TOAST_ACTION_MS, FEED_TOAST_ACTION_TEST_ID, SAVED_TOAST, UNSAVED_TOAST,
} from '@/components/feed/feedToasts';
import { useProfilePin } from '@/hooks/useProfilePin';
import ReportModal from '@/components/ui/ReportModal';
import { toast } from '@/components/ui/toast-store';
import ErrorState from '@/components/ui/ErrorState';
import { Bookmark, Newspaper, Repeat2 } from 'lucide-react';
import { ListArchetype } from '@/components/archetypes';
import { fetchMe } from '@/lib/me';
import { FEED_POST_CREATED_EVENT } from '@/lib/feedComposerEvents';

const PAGE_SIZE = 50;

type PageCursor = { createdAt: string; id: string };
type Tab = 'mine' | 'saved' | 'reposts';
/** `?tab=saved` (a "Saved." toast's View) or `?tab=reposts` opens that tab. */
const tabFromParam = (value: string | null | undefined): Tab => (value === 'saved' || value === 'reposts' ? value : 'mine');
// Coming back shows the lists as they were left (contract §3); read again after a minute.
const LIST_FRESH_MS = 60 * 1000;

export default function MyPulsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  const queryClient = useQueryClient();
  const mine = useKeptState<{ posts: Post[]; nextCursor: PageCursor | null }>(['posts', 'mine'], LIST_FRESH_MS);
  const [posts, setPosts] = useState<Post[]>(mine.initial?.posts ?? []);
  const [loading, setLoading] = useState(!mine.initial);
  const [loadError, setLoadError] = useState(false);
  // Where the next (older) page starts; null once the server has no more.
  const [nextCursor, setNextCursor] = useState<PageCursor | null>(mine.initial?.nextCursor ?? null);
  const { keep: keepMine } = mine;
  const mineReadAt = useRef(mine.readAt);
  const skipFirstLoad = useRef(mine.fresh);
  const postsShown = useRef(posts.length > 0 || !!mine.initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  // Bumped by every first-page load so a page that lands later can't
  // append to the list that replaced it.
  const loadGeneration = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [me, setMe] = useState<Awaited<ReturnType<typeof api.users.getMyProfile>> | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>(() => tabFromParam(tabParam));
  // Opened again on another tab (View after a save, back and forward): that tab shows.
  useEffect(() => { setTab(tabFromParam(tabParam)); }, [tabParam]);
  // Saved posts page by offset over saves; the server says where the next page starts.
  const savedCopy = useKeptState<{ posts: Post[]; nextOffset: number | null }>(['posts', 'saved'], LIST_FRESH_MS);
  const [saved, setSaved] = useState<Post[]>(savedCopy.initial?.posts ?? []);
  const [savedLoading, setSavedLoading] = useState(!savedCopy.initial);
  const [savedLoadError, setSavedLoadError] = useState(false);
  const [savedNextOffset, setSavedNextOffset] = useState<number | null>(savedCopy.initial?.nextOffset ?? null);
  const { keep: keepSaved } = savedCopy;
  const savedReadAt = useRef(savedCopy.readAt);
  const savedShown = useRef(!!savedCopy.initial);
  const [savedLoadingMore, setSavedLoadingMore] = useState(false);
  const [savedLoadMoreFailed, setSavedLoadMoreFailed] = useState(false);
  const savedGeneration = useRef(0);
  // Reposts (GET /api/posts/reposts) page as Saved does: by offset over reposts, the server says where the next starts.
  const repostsCopy = useKeptState<{ posts: Post[]; nextOffset: number | null }>(['posts', 'reposts'], LIST_FRESH_MS);
  const [reposts, setReposts] = useState<Post[]>(repostsCopy.initial?.posts ?? []);
  const [repostsLoading, setRepostsLoading] = useState(!repostsCopy.initial);
  const [repostsLoadError, setRepostsLoadError] = useState(false);
  const [repostsNextOffset, setRepostsNextOffset] = useState<number | null>(repostsCopy.initial?.nextOffset ?? null);
  const { keep: keepReposts } = repostsCopy;
  const repostsReadAt = useRef(repostsCopy.readAt);
  const repostsShown = useRef(!!repostsCopy.initial);
  const [repostsLoadingMore, setRepostsLoadingMore] = useState(false);
  const [repostsLoadMoreFailed, setRepostsLoadMoreFailed] = useState(false);
  const repostsGeneration = useRef(0);

  // ── Fetch user ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const token = getAuthToken();
      if (!token) { router.push('/login'); return; }
      try {
        const u = await fetchMe();
        setUserId(u.id);
        setMe(u);
      } catch {
        router.push('/login');
      }
    })();
  }, [router]);

  // ── Fetch posts ──────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    if (!userId) return;
    const generation = ++loadGeneration.current;
    // A list already on screen refreshes quietly.
    if (!postsShown.current) setLoading(true);
    setLoadError(false);
    setLoadingMore(false);
    setLoadMoreFailed(false);
    try {
      const result = await api.posts.getUserPosts(userId, { limit: PAGE_SIZE });
      if (generation !== loadGeneration.current) return;
      mineReadAt.current = Date.now();
      postsShown.current = true;
      setPosts(result?.posts || []);
      setNextCursor(result?.pagination?.hasMore ? result.pagination.nextCursor : null);
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      console.error('Failed to load my posts:', err);
      // A failed refresh keeps the list on screen; a failed first load is not an empty history.
      if (postsShown.current) return;
      setPosts([]);
      setNextCursor(null);
      setLoadError(true);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // The kept list is fresh: the first read waits for the next visit.
    if (skipFirstLoad.current) { skipFirstLoad.current = false; return; }
    loadPosts();
  }, [loadPosts, userId]);
  useEffect(() => {
    const onCreated = () => { void loadPosts(); };
    window.addEventListener(FEED_POST_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(FEED_POST_CREATED_EVENT, onCreated);
  }, [loadPosts]);
  useEffect(() => {
    if (!loading && !loadError) keepMine({ posts, nextCursor }, mineReadAt.current);
  }, [posts, nextCursor, loading, loadError, keepMine]);

  const loadMore = useCallback(async () => {
    if (!userId || !nextCursor || loadingMore) return;
    const generation = loadGeneration.current;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const result = await api.posts.getUserPosts(userId, {
        limit: PAGE_SIZE,
        cursorCreatedAt: nextCursor.createdAt,
        cursorId: nextCursor.id,
      });
      if (generation !== loadGeneration.current) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(result?.posts || []).filter((p) => !seen.has(p.id))];
      });
      setNextCursor(result?.pagination?.hasMore ? result.pagination.nextCursor : null);
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      console.error('Failed to load more of my posts:', err);
      setLoadMoreFailed(true);
    } finally {
      if (generation === loadGeneration.current) setLoadingMore(false);
    }
  }, [userId, nextCursor, loadingMore]);

  // ── Fetch saved posts (the Saved tab) ───────────────────
  const loadSaved = useCallback(async () => {
    const generation = ++savedGeneration.current;
    // A list already on screen refreshes quietly.
    if (!savedShown.current) setSavedLoading(true);
    setSavedLoadError(false);
    setSavedLoadingMore(false);
    setSavedLoadMoreFailed(false);
    try {
      const result = await api.posts.getSavedPosts({ limit: PAGE_SIZE, offset: 0 });
      if (generation !== savedGeneration.current) return;
      savedReadAt.current = Date.now();
      savedShown.current = true;
      setSaved(result?.posts || []);
      setSavedNextOffset(result?.pagination?.hasMore ? result.pagination.nextOffset : null);
    } catch (err) {
      if (generation !== savedGeneration.current) return;
      console.error('Failed to load saved posts:', err);
      if (savedShown.current) return;
      setSaved([]);
      setSavedNextOffset(null);
      setSavedLoadError(true);
    } finally {
      if (generation === savedGeneration.current) setSavedLoading(false);
    }
  }, []);

  // Every visit to the tab re-reads it, so posts saved elsewhere since show up (quietly over the kept list).
  useEffect(() => { if (tab === 'saved') void loadSaved(); }, [tab, loadSaved]);
  useEffect(() => {
    if (!savedLoading && !savedLoadError && savedShown.current) keepSaved({ posts: saved, nextOffset: savedNextOffset }, savedReadAt.current);
  }, [saved, savedNextOffset, savedLoading, savedLoadError, keepSaved]);

  const loadMoreSaved = useCallback(async () => {
    if (savedNextOffset == null || savedLoadingMore) return;
    const generation = savedGeneration.current;
    setSavedLoadingMore(true);
    setSavedLoadMoreFailed(false);
    try {
      const result = await api.posts.getSavedPosts({ limit: PAGE_SIZE, offset: savedNextOffset });
      if (generation !== savedGeneration.current) return;
      setSaved((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(result?.posts || []).filter((p) => !seen.has(p.id))];
      });
      setSavedNextOffset(result?.pagination?.hasMore ? result.pagination.nextOffset : null);
    } catch (err) {
      if (generation !== savedGeneration.current) return;
      console.error('Failed to load more saved posts:', err);
      setSavedLoadMoreFailed(true);
    } finally {
      if (generation === savedGeneration.current) setSavedLoadingMore(false);
    }
  }, [savedNextOffset, savedLoadingMore]);

  // A page the visibility check (or Remove) left empty isn't the end of the list: read on.
  const savedReadingOn = saved.length === 0 && savedNextOffset != null && !savedLoadMoreFailed;
  useEffect(() => {
    if (tab === 'saved' && !savedLoading && savedReadingOn) void loadMoreSaved();
  }, [tab, savedLoading, savedReadingOn, loadMoreSaved]);

  // ── Fetch reposts (the Reposts tab), built as Saved is ──
  const loadReposts = useCallback(async () => {
    const generation = ++repostsGeneration.current;
    // A list already on screen refreshes quietly.
    if (!repostsShown.current) setRepostsLoading(true);
    setRepostsLoadError(false);
    setRepostsLoadingMore(false);
    setRepostsLoadMoreFailed(false);
    try {
      const result = await api.posts.getRepostedPosts({ limit: PAGE_SIZE, offset: 0 });
      if (generation !== repostsGeneration.current) return;
      repostsReadAt.current = Date.now();
      repostsShown.current = true;
      setReposts(result?.posts || []);
      setRepostsNextOffset(result?.pagination?.hasMore ? result.pagination.nextOffset : null);
    } catch (err) {
      if (generation !== repostsGeneration.current) return;
      // An older server has no Reposts list (404): the tab says it couldn't load, with Try again.
      console.error('Failed to load reposts:', err);
      if (repostsShown.current) return;
      setReposts([]);
      setRepostsNextOffset(null);
      setRepostsLoadError(true);
    } finally {
      if (generation === repostsGeneration.current) setRepostsLoading(false);
    }
  }, []);

  // Every visit to the tab re-reads it, so posts reposted elsewhere since show up (quietly over the kept list).
  useEffect(() => { if (tab === 'reposts') void loadReposts(); }, [tab, loadReposts]);
  useEffect(() => {
    if (!repostsLoading && !repostsLoadError && repostsShown.current) keepReposts({ posts: reposts, nextOffset: repostsNextOffset }, repostsReadAt.current);
  }, [reposts, repostsNextOffset, repostsLoading, repostsLoadError, keepReposts]);

  const loadMoreReposts = useCallback(async () => {
    if (repostsNextOffset == null || repostsLoadingMore) return;
    const generation = repostsGeneration.current;
    setRepostsLoadingMore(true);
    setRepostsLoadMoreFailed(false);
    try {
      const result = await api.posts.getRepostedPosts({ limit: PAGE_SIZE, offset: repostsNextOffset });
      if (generation !== repostsGeneration.current) return;
      setReposts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(result?.posts || []).filter((p) => !seen.has(p.id))];
      });
      setRepostsNextOffset(result?.pagination?.hasMore ? result.pagination.nextOffset : null);
    } catch (err) {
      if (generation !== repostsGeneration.current) return;
      console.error('Failed to load more reposts:', err);
      setRepostsLoadMoreFailed(true);
    } finally {
      if (generation === repostsGeneration.current) setRepostsLoadingMore(false);
    }
  }, [repostsNextOffset, repostsLoadingMore]);

  // A page the visibility check (or Undo repost) left empty isn't the end of the list: read on.
  const repostsReadingOn = reposts.length === 0 && repostsNextOffset != null && !repostsLoadMoreFailed;
  useEffect(() => {
    if (tab === 'reposts' && !repostsLoading && repostsReadingOn) void loadMoreReposts();
  }, [tab, repostsLoading, repostsReadingOn, loadMoreReposts]);

  // ── Post actions ─────────────────────────────────────────
  // The state the person chose goes with each request, so a re-send can't flip it back.
  const listedPost = (postId: string) => posts.find((p) => p.id === postId)
    ?? saved.find((p) => p.id === postId)
    ?? reposts.find((p) => p.id === postId);
  /** A change to a post shows in every tab that lists it. */
  const updateListed = useCallback((postId: string, change: (post: Post) => Post) => {
    const apply = (p: Post) => (p.id === postId ? change(p) : p);
    setPosts((prev) => prev.map(apply));
    setSaved((prev) => prev.map(apply));
    setReposts((prev) => prev.map(apply));
  }, []);

  const likeMutation = useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) => api.posts.toggleLike(postId, liked),
    onMutate: ({ postId }) => {
      setLikingIds((prev) => new Set(prev).add(postId));
    },
    onSuccess: (res, { postId }) => {
      // Any tab's card can be liked, so every list takes the result.
      updateListed(postId, (p) => ({ ...p, userHasLiked: res.liked, like_count: res.likeCount }));
      patchPostInFeedCaches(queryClient, postId, { userHasLiked: res.liked, like_count: res.likeCount });
    },
    onError: () => {
      toast.error("Couldn't update your reaction. Please try again.");
    },
    onSettled: (_data, _err, { postId }) => {
      setLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    },
  });

  const handleLike = (postId: string) => {
    likeMutation.mutate({ postId, liked: !(listedPost(postId)?.userHasLiked ?? false) });
  };

  // An emoji on any post but an event (whose Going is the like above): shown at once in both tabs, put back if refused.
  const reactMutation = useMutation({
    mutationFn: ({ postId, reaction }: { postId: string; reaction: string | null }) => api.posts.setReaction(postId, reaction),
    onMutate: ({ postId, reaction }) => {
      setLikingIds((prev) => new Set(prev).add(postId));
      const before = listedPost(postId);
      if (!before) return undefined;
      const patch = reactedPostPatch(before, reaction);
      updateListed(postId, (p) => ({ ...p, ...patch }));
      return { previous: reactionFieldsOf(before) };
    },
    onSuccess: (res, { postId }) => {
      const patch = serverReactionPatch(res, listedPost(postId)?.reactions);
      updateListed(postId, (p) => ({ ...p, ...patch }));
      patchPostInFeedCaches(queryClient, postId, patch);
    },
    onError: (_err, { postId }, context) => {
      if (context) updateListed(postId, (p) => ({ ...p, ...context.previous }));
      toast.error("Couldn't update your reaction. Please try again.");
    },
    onSettled: (_data, _err, { postId }) => {
      setLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    },
  });

  const handleReact = (postId: string, reaction: string | null) => {
    if (likingIds.has(postId)) return;
    reactMutation.mutate({ postId, reaction });
  };

  // A listed save that goes (unsaved, or its post deleted) moves every later save up one,
  // so the next page starts one earlier or Load more would skip a saved post.
  const dropFromSaved = (postId: string) => {
    if (!saved.some((p) => p.id === postId)) return;
    setSaved((prev) => prev.filter((p) => p.id !== postId));
    setSavedNextOffset((offset) => (offset == null ? offset : Math.max(0, offset - 1)));
  };
  // The same for a listed repost that goes (Undo repost, or its post deleted).
  const dropFromReposts = (postId: string) => {
    if (!reposts.some((p) => p.id === postId)) return;
    setReposts((prev) => prev.filter((p) => p.id !== postId));
    setRepostsNextOffset((offset) => (offset == null ? offset : Math.max(0, offset - 1)));
  };
  const dropFromRepostsRef = useRef(dropFromReposts);
  dropFromRepostsRef.current = dropFromReposts;

  // Repost or Undo repost (a card's chooser, or Undo repost on a Reposts row): shown at once in every tab, put back
  // if refused. An undone repost leaves the Reposts list; a new one shows there at the tab's next read.
  const { toggleRepost, repostingIds } = useRepostToggle({
    findPost: listedPost,
    applyPatch: (postId, patch) => updateListed(postId, (p) => mergePostPatch(p, patch)),
    onConfirmed: (postId, patch, reposted) => {
      patchPostInFeedCaches(queryClient, postId, patch);
      if (!reposted) dropFromRepostsRef.current(postId);
    },
    showToast: (message) => toast.info(message),
  });
  const handleRepost = (postId: string, reposted: boolean) => { void toggleRepost(postId, reposted); };
  const handleUndoRepostRow = (postId: string) => { void toggleRepost(postId, false); };

  // Pin to profile / Unpin from profile from a post's ⋯ menu; the list shows the new state once the server agrees.
  const profilePin = useProfilePin();
  const handleProfilePin = useCallback(async (post: Post, pin: boolean) => {
    if (!(await profilePin(post, pin))) return;
    updateListed(post.id, (p) => ({ ...p, profile_pinned: pin }));
  }, [profilePin, updateListed]);

  const handleDelete = async (postId: string) => {
    try {
      await api.posts.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      dropFromSaved(postId);
      dropFromReposts(postId);
      removePostFromFeedCaches(queryClient, postId);
      toast.success('Post deleted');
    } catch {
      toast.error('Failed to delete post');
    }
  };

  const saveMutation = useMutation({
    mutationFn: ({ postId, wantSaved }: { postId: string; wantSaved: boolean }) => api.posts.toggleSave(postId, wantSaved),
    onSuccess: (res, { postId }) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, userHasSaved: res.saved } : p,
        ),
      );
      setReposts((prev) => prev.map((p) => (p.id === postId ? { ...p, userHasSaved: res.saved } : p)));
      // Unsaving from the Saved tab takes the post off that list.
      if (res.saved) setSaved((prev) => prev.map((p) => (p.id === postId ? { ...p, userHasSaved: true } : p)));
      else dropFromSaved(postId);
      patchPostInFeedCaches(queryClient, postId, { userHasSaved: res.saved });
      // Say where it went: "View" shows the Saved tab.
      if (res.saved) {
        toast.success(SAVED_TOAST, FEED_TOAST_ACTION_MS, { label: 'View', onClick: () => setTab('saved'), testId: FEED_TOAST_ACTION_TEST_ID });
      } else {
        toast.info(UNSAVED_TOAST);
      }
    },
    onError: () => {
      toast.error('Failed to save post');
    },
  });

  // One toggle per post at a time: a second click while the first is in flight would undo it.
  const savingIds = useRef<Set<string>>(new Set());
  const handleSave = (postId: string) => {
    if (savingIds.current.has(postId)) return;
    savingIds.current.add(postId);
    saveMutation.mutate({ postId, wantSaved: !(listedPost(postId)?.userHasSaved ?? false) }, {
      onSettled: () => {
        savingIds.current.delete(postId);
      },
    });
  };

  const onSaved = tab === 'saved';
  const onReposts = tab === 'reposts';
  const shown = onSaved ? saved : onReposts ? reposts : posts;
  // A failed read past an emptied page is a failed load, not "nothing saved".
  const shownError = onSaved
    ? savedLoadError || (saved.length === 0 && savedLoadMoreFailed)
    : onReposts ? repostsLoadError || (reposts.length === 0 && repostsLoadMoreFailed) : loadError;
  const shownMore = onSaved ? savedNextOffset != null : onReposts ? repostsNextOffset != null : nextCursor != null;
  const shownLoadingMore = onSaved ? savedLoadingMore : onReposts ? repostsLoadingMore : loadingMore;
  const shownLoadMoreFailed = onSaved ? savedLoadMoreFailed : onReposts ? repostsLoadMoreFailed : loadMoreFailed;
  const loadMoreShown = () => { void (onSaved ? loadMoreSaved() : onReposts ? loadMoreReposts() : loadMore()); };
  const countLabel = onSaved
    ? `${shown.length}${shownMore ? '+' : ''} saved`
    : onReposts
      ? `${shown.length}${shownMore ? '+' : ''} ${shown.length === 1 && !shownMore ? 'repost' : 'reposts'}`
      : shownMore ? `${posts.length}+ posts` : `${posts.length} post${posts.length !== 1 ? 's' : ''}`;

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <ListArchetype<Post>
          title="My pulse"
          // No count when loading failed; while older posts are unloaded the
          // loaded count is a floor, not the total.
          subtitle={shownError ? undefined : countLabel}
          primaryAction={{
            label: 'Go to Pulse',
            onClick: () => router.push('/app/feed'),
          }}
          tabs={[
            { key: 'mine', label: 'My posts' },
            { key: 'saved', label: 'Saved' },
            { key: 'reposts', label: 'Reposts' },
          ]}
          activeTabKey={tab}
          onTabChange={(key) => setTab(key as Tab)}
          loading={onSaved ? savedLoading || savedReadingOn : onReposts ? repostsLoading || repostsReadingOn : loading}
          rows={shown}
          rowSpacing={4}
          keyExtractor={(post) => post.id}
          renderRow={(post) => (
            <PostCard
              // A Reposts row is yours: its line reads "You reposted" even from a server that left the line off.
              post={onReposts && !post.reposted_by ? { ...post, reposted_by: { names: ['You'], count: 1, viewer: true } } : post}
              onLike={handleLike}
              onReact={handleReact}
              onComment={(id) => setDetailPostId(id)}
              onOpenDetail={(id) => setDetailPostId(id)}
              onSave={handleSave}
              onDelete={handleDelete}
              onEdit={setEditingPost}
              onProfilePin={handleProfilePin}
              onReport={(id) => setReportPostId(id)}
              onRepost={handleRepost}
              isReposting={repostingIds.has(post.id)}
              onUndoRepostRow={onReposts ? handleUndoRepostRow : undefined}
              onSolved={(id) => {
                updateListed(id, (p) => ({ ...p, state: 'solved' }));
                patchPostInFeedCaches(queryClient, id, { state: 'solved' });
              }}
              currentUserId={userId || undefined}
              isLiking={likingIds.has(post.id)}
              showToast={(message) => toast.info(message)}
            />
          )}
          emptyState={onSaved ? {
            icon: Bookmark,
            headline: 'Nothing saved yet',
            subcopy: 'Save a post to keep it here.',
            tone: 'personal',
            ctaLabel: 'Go to Pulse',
            onCtaClick: () => router.push('/app/feed'),
          } : onReposts ? {
            icon: Repeat2,
            headline: 'No reposts yet',
            subcopy: 'Posts you repost show up here and on your profile.',
            tone: 'personal',
            ctaLabel: 'Go to Pulse',
            onCtaClick: () => router.push('/app/feed'),
          } : {
            icon: Newspaper,
            headline: 'No posts yet',
            subcopy: 'Share updates, questions, or recommendations with your community.',
            tone: 'personal',
            ctaLabel: 'Go to Pulse',
            onCtaClick: () => router.push('/app/feed'),
          }}
          renderEmpty={shownError ? () => (
            <div role="alert">
              <ErrorState
                message={onSaved
                  ? "We couldn't load your saved posts. Please try again."
                  : onReposts ? "We couldn't load your reposts. Please try again." : "We couldn't load your posts. Please try again."}
                onRetry={() => { void (onSaved ? loadSaved() : onReposts ? loadReposts() : loadPosts()); }}
              />
            </div>
          ) : undefined}
          renderFooter={(shownMore || shownLoadMoreFailed) && !shownError ? () => (
            <>
              {shownLoadMoreFailed && (
                <div role="alert" className="my-4 flex items-center justify-between gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text-strong">
                  <p>Couldn&apos;t load more {onSaved ? 'saved posts' : onReposts ? 'reposts' : 'posts'}.</p>
                  <button
                    type="button"
                    disabled={shownLoadingMore}
                    onClick={loadMoreShown}
                    className="font-semibold text-primary-600 hover:underline disabled:opacity-50"
                  >
                    Try again
                  </button>
                </div>
              )}
              {shownMore && !shownLoadMoreFailed && (
                <div className="text-center py-3">
                  <button
                    type="button"
                    onClick={loadMoreShown}
                    disabled={shownLoadingMore}
                    className="px-4 py-2 text-sm font-medium text-app-text-secondary hover:text-app-text hover:bg-app-hover rounded-lg transition disabled:opacity-50"
                  >
                    {shownLoadingMore ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          ) : undefined}
        />
      </div>

      {/* ── Post detail panel ───────────────────────────────── */}
      <PostDetailPanel
        postId={detailPostId}
        open={!!detailPostId}
        onClose={() => {
          // A post unsaved in the panel leaves the Saved list once the panel closes.
          if (detailPostId && saved.some((p) => p.id === detailPostId && !p.userHasSaved)) dropFromSaved(detailPostId);
          // As does a repost undone there, from the Reposts list.
          if (detailPostId && reposts.some((p) => p.id === detailPostId && !p.userHasReposted)) dropFromReposts(detailPostId);
          setDetailPostId(null);
        }}
        // Likes, saves, reposts, comments and shares made in the panel show on the cards too, and in the feed.
        onPostChange={(postId, patch) => {
          updateListed(postId, (p) => mergePostPatch(p, patch));
          patchPostInFeedCaches(queryClient, postId, patch);
        }}
        currentUserId={userId || undefined}
      />

      {/* ── Edit one of your posts ──────────────────────────── */}
      {editingPost && (
        <EditPostDialog
          post={editingPost}
          user={me}
          onClose={() => setEditingPost(null)}
          onSaved={(postId, changes) => {
            updateListed(postId, (p) => ({ ...p, ...changes }));
            patchPostInFeedCaches(queryClient, postId, changes);
            setEditingPost(null);
            toast.success('Post updated');
          }}
          onGone={(postId) => {
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            dropFromSaved(postId);
            dropFromReposts(postId);
            removePostFromFeedCaches(queryClient, postId);
            setEditingPost(null);
            toast.info('This post was deleted, so it can’t be edited.');
          }}
        />
      )}

      {/* ── Report modal ────────────────────────────────────── */}
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
    </div>
  );
}
