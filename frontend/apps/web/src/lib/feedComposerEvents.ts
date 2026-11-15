import type { Post } from '@pantopus/types';

export const FEED_COMPOSER_OPEN_EVENT = 'pantopus:feed-composer-open';
export const FEED_POST_CREATED_EVENT = 'pantopus:feed-post-created';
export const MAGIC_TASK_OPEN_EVENT = 'pantopus:magic-task-open';

/** What the Pulse composer opens with: a post to quote ("Repost with your words"), or a new post. */
export interface FeedComposerOpenDetail {
  quotedPost?: Post | null;
}

export function openFeedComposer(detail?: FeedComposerOpenDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<FeedComposerOpenDetail>(FEED_COMPOSER_OPEN_EVENT, { detail: detail ?? {} }));
}

/** "Repost with your words": the Pulse composer opens with this post shown under the text box (AppShell). */
export function openQuoteComposer(post: Post): void {
  openFeedComposer({ quotedPost: post });
}

export function openMagicTaskComposer(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MAGIC_TASK_OPEN_EVENT));
}

export function notifyFeedPostCreated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FEED_POST_CREATED_EVENT));
}
