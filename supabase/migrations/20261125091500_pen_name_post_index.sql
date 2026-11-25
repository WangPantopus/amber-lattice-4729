-- Backwards compatible: yes. Adds one partial index; no column, constraint, policy or grant changes, and the current
-- backend never needs it.
--
-- Made-up names, Moments (docs/product/made-up-names/README.md): a made-up name's live Moments are read by the name's
-- id (GET /api/moments/people with a made-up name's id). Rows written under a made-up name carry
-- identity_context_type 'pen_name' and the name's id, and nothing else finds them by that id.
-- The index holds only those rows, so building it reads "Post" once and keeps almost nothing.
SET LOCAL lock_timeout = '5s';

CREATE INDEX post_pen_name_identity ON public."Post" (identity_context_id, created_at DESC)
  WHERE identity_context_type = 'pen_name';
