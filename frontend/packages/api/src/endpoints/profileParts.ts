/**
 * The profile parts this app draws (CONTRACT "On by default, and what a phone can't show yet"), sent as
 * `X-Pantopus-Profile-Parts` on every /api/profile-page call: the server adds a `notice` to a person's own page only
 * for waiting things in a part not named here. Grows as the web draws more (Known for and doors in phase 3).
 * No imports: the edge runtime (the link picture) reads it too.
 */
export const PROFILE_PARTS_HEADER = 'X-Pantopus-Profile-Parts';
export const PROFILE_PARTS = 'pieces, credits, roles, circle, shelf';
