// What Pulse's toasts say after a save, a repost, a hide or "Not helpful here", and their one action button
// ("View", "Undo"), as on iOS and Android (PULSEREPOST contract §1, §5–§7, §10).

/** A toast's one button: "View" opens where the post went, "Undo" puts it back. */
export interface FeedToastAction {
  label: string;
  onClick: () => void;
}

/** Pulse's toasts as the feed, the post panel and the post page show them: the words, and an optional action. */
export type ShowFeedToast = (message: string, action?: FeedToastAction) => void;

/** The action button's data-testid, the id iOS and Android give it. */
export const FEED_TOAST_ACTION_TEST_ID = 'pulseFeedToastAction';
/** A toast with a button stays longer than the plain 3 seconds, so there's time to reach it. */
export const FEED_TOAST_ACTION_MS = 6000;

export const SAVED_TOAST = 'Saved.';
export const UNSAVED_TOAST = 'Removed from Saved.';
/** "View" after a save: My posts on its Saved tab. */
export const SAVED_POSTS_PATH = '/app/my-pulse?tab=saved';

export const REPOSTED_TOAST = "Reposted. Your connections see it, and it's on your profile.";
export const REPOST_REMOVED_TOAST = 'Repost removed.';
export const REPOST_FAILED_TOAST = 'Failed to update repost';

export const HIDDEN_TOAST = 'Post hidden.';
export const NOT_HELPFUL_HIDDEN_TOAST = "Thanks. You won't see this post again.";
/** An older server flags the post without hiding it: the card stays. */
export const NOT_HELPFUL_KEPT_TOAST = 'Thanks for telling us.';
export const UNDO_FAILED_TOAST = "Couldn't undo. Try again.";
