'use client';

// Reposts on a Pulse card (PULSEREPOST contract §1–§2): the "reposted" line, the in-place update after Repost or
// Undo repost, and the toggle every list shares (the feed, My posts, a profile, the post panel and page).

import { useCallback, useRef, useState } from 'react';
import * as api from '@pantopus/api';
import type { Post, QuotedPost } from '@pantopus/types';
import { REPOSTED_TOAST, REPOST_FAILED_TOAST, REPOST_REMOVED_TOAST } from './feedToasts';

type RepostedBy = Post['reposted_by'];

/** The names a row's `reposted_by` carries, read leniently (a field this build doesn't expect never breaks a card). */
function repostedNames(repostedBy: RepostedBy): string[] {
  return Array.isArray(repostedBy?.names) ? repostedBy.names.filter((name): name is string => typeof name === 'string' && name.length > 0) : [];
}

function viewerReposted(repostedBy: RepostedBy): boolean {
  return repostedBy?.viewer === true || repostedNames(repostedBy)[0] === 'You';
}

/**
 * "You reposted", "You and Ben C. reposted", "Ben C. and 2 others reposted": who reposted the post, the latest first
 * (`count - 1` others past the first name). Null draws no line.
 */
export function repostedByText(repostedBy: RepostedBy): string | null {
  const names = repostedNames(repostedBy);
  const count = typeof repostedBy?.count === 'number' ? repostedBy.count : names.length;
  const first = names[0];
  if (!first || count < 1) return null;
  if (count === 1) return `${first} reposted`;
  const second = names[1];
  if (count === 2 && second) return `${first} and ${second} reposted`;
  const others = count - 1;
  return `${first} and ${others} ${others === 1 ? 'other' : 'others'} reposted`;
}

/**
 * The line after the viewer reposts (or undoes it) from a card: "You" joins at the front, or leaves (`count - 1`; no
 * names left, no line). Applying it twice changes nothing.
 */
export function withViewerRepost(repostedBy: RepostedBy, reposted: boolean): RepostedBy {
  const names = repostedNames(repostedBy);
  const count = typeof repostedBy?.count === 'number' ? repostedBy.count : names.length;
  if (reposted) {
    if (viewerReposted(repostedBy)) return repostedBy;
    return { names: ['You', ...names].slice(0, 2), count: Math.max(count, 0) + 1, viewer: true };
  }
  if (!viewerReposted(repostedBy)) return repostedBy;
  const rest = names[0] === 'You' ? names.slice(1) : names;
  const left = count - 1;
  return rest.length === 0 || left < 1 ? null : { names: rest, count: left, viewer: false };
}

/**
 * A change to a listed post. A repost's change (`userHasReposted` without a `reposted_by` of its own) also puts "You"
 * on that post's own line, so each list keeps the other names it was given.
 */
export function mergePostPatch(post: Post, patch: Partial<Post>): Post {
  const next = { ...post, ...patch };
  if (typeof patch.userHasReposted === 'boolean' && !('reposted_by' in patch)) {
    next.reposted_by = withViewerRepost(post.reposted_by, patch.userHasReposted);
  }
  return next;
}

/** A quote post's original as a card draws it: the post, "This post isn't available.", or nothing (leniently read). */
export type QuotedPostState = { kind: 'post'; post: Post } | { kind: 'unavailable' };

export function readQuotedPost(raw: Post['quoted_post'] | unknown): QuotedPostState | null {
  if (!raw || typeof raw !== 'object') return null;
  const quoted = raw as Partial<QuotedPost>;
  if (quoted.available === false) return { kind: 'unavailable' };
  const post = quoted.available === true ? quoted.post : undefined;
  if (post && typeof post === 'object' && typeof post.id === 'string' && post.id) return { kind: 'post', post };
  return null;
}

/** The fields a repost changes, as they were: what a refused repost puts back. */
function repostFieldsOf(post: Post): Partial<Post> {
  return {
    userHasReposted: Boolean(post.userHasReposted),
    share_count: post.share_count ?? 0,
    // A copy that never had the line (the post page's own read) leaves each list's line to the toggle above.
    ...(post.reposted_by !== undefined ? { reposted_by: post.reposted_by } : {}),
  };
}

interface UseRepostToggleOptions {
  /** The post as the list shows it now. */
  findPost: (postId: string) => Post | undefined;
  /** Shows a change on this screen's copy (merge it with mergePostPatch): at once, confirmed, or put back. */
  applyPatch: (postId: string, patch: Partial<Post>) => void;
  /** After the server agreed: the change for the other lists (patchPostInFeedCaches), and anything list-specific. */
  onConfirmed?: (postId: string, patch: Partial<Post>, reposted: boolean) => void;
  showToast: (message: string) => void;
}

/**
 * Repost or Undo repost (POST /api/posts/:id/share). The card changes at once (↻ turns green, the count and the line
 * gain "You") and stays where it is; a refusal puts it back and says so. One request per post at a time.
 */
export function useRepostToggle(options: UseRepostToggleOptions) {
  const latest = useRef(options);
  latest.current = options;
  const pending = useRef(new Set<string>());
  const [repostingIds, setRepostingIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggleRepost = useCallback(async (postId: string, reposted: boolean): Promise<boolean> => {
    if (pending.current.has(postId)) return false;
    const before = latest.current.findPost(postId);
    if (!before) return false;
    pending.current.add(postId);
    setRepostingIds(new Set(pending.current));
    const previous = repostFieldsOf(before);
    const wasReposted = Boolean(before.userHasReposted);
    const shownCount = Math.max(0, (before.share_count ?? 0) + (reposted === wasReposted ? 0 : reposted ? 1 : -1));
    latest.current.applyPatch(postId, { userHasReposted: reposted, share_count: shownCount });
    try {
      const res = await api.posts.repostPost(postId, reposted);
      const confirmed: Partial<Post> = {
        userHasReposted: Boolean(res.reposted),
        share_count: typeof res.shareCount === 'number' ? res.shareCount : shownCount,
      };
      latest.current.applyPatch(postId, confirmed);
      latest.current.onConfirmed?.(postId, confirmed, Boolean(res.reposted));
      latest.current.showToast(res.reposted ? REPOSTED_TOAST : REPOST_REMOVED_TOAST);
      return true;
    } catch {
      latest.current.applyPatch(postId, previous);
      latest.current.showToast(REPOST_FAILED_TOAST);
      return false;
    } finally {
      pending.current.delete(postId);
      setRepostingIds(new Set(pending.current));
    }
  }, []);

  return { toggleRepost, repostingIds };
}
