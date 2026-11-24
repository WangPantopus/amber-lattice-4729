'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import * as api from '@pantopus/api';
import type { Post } from '@pantopus/types';
import { chosenUsername } from '@pantopus/utils';
import PostsTab from '@/components/profile/public/tabs/PostsTab';
import { secondaryButton } from '@/components/profile/public/profileButtons';
import { firstWord, joinedRecently } from '@/components/profile/public/ProfileHeader';
import ErrorState from '@/components/ui/ErrorState';
import { authPageHref } from '@/lib/auth-utils';
import { fetchMe } from '@/lib/me';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE = 20;

type Person = { id: string; name: string | null; username: string | null; createdAt: string | null };

/**
 * A person's posts (the profile with sources opens them from "Posts in Pulse"): today's Posts tab on a page of its own,
 * with the same reads and the same rules. A signed-out visitor reads no posts and is asked to sign in.
 */
export default function PersonPostsClient({ username }: { username: string }) {
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'failed'>('loading');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsFailed, setPostsFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const round = useRef(0);

  const loadPosts = useCallback(async (id: string) => {
    const mine = ++round.current;
    setPostsLoading(true);
    setPostsFailed(false);
    try {
      const res = await api.posts.getUserPosts(id, { limit: PAGE, include_reposts: true });
      if (mine !== round.current) return;
      setPosts(res.posts || []);
      setHasMore(Boolean(res.pagination?.hasMore));
      setCursor(res.pagination?.nextCursor ?? null);
    } catch {
      if (mine === round.current) setPostsFailed(true);
    } finally {
      if (mine === round.current) setPostsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    const token = api.getAuthToken();
    setSignedIn(Boolean(token));
    try {
      const [me, profile] = await Promise.all([
        token ? fetchMe().catch(() => null) : Promise.resolve(null),
        UUID.test(username) ? api.users.getProfileById(username) : api.users.getProfileByUsername(username),
      ]);
      const p = profile as unknown as Record<string, unknown>;
      const id = String(p.id ?? '');
      const handle = p.usernameIsGenerated ? null : chosenUsername(String(p.username ?? ''));
      const name = (typeof p.name === 'string' && p.name) || [p.firstName, p.lastName].filter(Boolean).join(' ') || handle || null;
      // Your own posts are managed in My Pulse.
      if (me?.id && String(me.id) === id) { router.replace('/app/my-pulse'); return; }
      setViewerId(me?.id ? String(me.id) : null);
      setPerson({ id, name, username: handle, createdAt: (p.created_at as string) || (p.createdAt as string) || null });
      setState('ready');
      if (token) void loadPosts(id);
    } catch (err) {
      const status = (err as { statusCode?: number } | null)?.statusCode;
      setState(status === 403 || status === 404 ? 'gone' : 'failed');
    }
  }, [username, loadPosts, router]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    const last = posts[posts.length - 1];
    if (!person || !last || moreLoading) return;
    const mine = round.current;
    setMoreLoading(true);
    try {
      const from = cursor ?? { createdAt: last.created_at, id: last.id };
      const res = await api.posts.getUserPosts(person.id, { limit: PAGE, cursorCreatedAt: from.createdAt, cursorId: from.id, include_reposts: true });
      if (mine !== round.current) return;
      setPosts((prev) => [...prev, ...(res.posts || []).filter((post) => !prev.some((p) => p.id === post.id && p.reposted_at === post.reposted_at))]);
      setHasMore(Boolean(res.pagination?.hasMore));
      setCursor(res.pagination?.nextCursor ?? null);
    } finally {
      setMoreLoading(false);
    }
  };

  const profilePath = `/${encodeURIComponent(username)}`;
  const name = person?.name || 'This person';
  const first = person?.name ? firstWord(person.name) : null;

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-20" role="status">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" aria-hidden="true" />
        <span className="sr-only">Loading posts…</span>
      </div>
    );
  }
  if (state === 'failed') {
    return <ErrorState title="Couldn't load these posts" message="Check your connection and try again." onRetry={() => void load()} />;
  }
  if (state === 'gone' || !person) {
    return (
      <div className="py-20 px-5 text-center">
        <h1 className="text-2xl font-bold text-app">Posts unavailable</h1>
        <p className="mt-2 text-app-secondary">This profile isn&apos;t here.</p>
      </div>
    );
  }

  return (
    <div className="bg-app min-h-screen">
      <div className="mx-auto w-full max-w-2xl px-5 pt-2 pb-10">
        <div className="flex items-center gap-1 h-12 -mx-2 mb-1">
          <button type="button" onClick={() => router.push(profilePath)} aria-label={`Back to ${name}'s profile`} className="w-11 h-11 rounded-full flex items-center justify-center text-app hover-bg-app">
            <ChevronLeft aria-hidden="true" className="w-[1.625rem] h-[1.625rem]" strokeWidth={2.25} />
          </button>
          <h1 className="min-w-0 flex-1 text-[1.0625rem] leading-[1.375rem] font-semibold text-app [overflow-wrap:anywhere]">
            {first ? `${first}'s posts` : 'Posts'}
          </h1>
        </div>
        <PostsTab
          posts={signedIn ? posts : []}
          onPostsChange={(update) => setPosts(update)}
          loading={signedIn && postsLoading && posts.length === 0}
          failed={postsFailed}
          onRetry={() => void loadPosts(person.id)}
          firstName={first}
          currentUserId={viewerId ?? undefined}
          signedOut={!signedIn}
          onSignIn={() => router.push(authPageHref('/login', `${profilePath}/posts`))}
          justJoined={joinedRecently(person.createdAt)}
          authorColorSeed={person.id}
        />
        {signedIn && hasMore && posts.length > 0 ? (
          <button type="button" onClick={() => void loadMore()} disabled={moreLoading} className={`mt-3 w-full ${secondaryButton}`}>
            {moreLoading ? 'Loading…' : 'Show more posts'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
