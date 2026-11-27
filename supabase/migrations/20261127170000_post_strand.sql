-- Backwards compatible: yes. Adds one new table that no client role can read and that nothing writes until the server's
-- job behind the `pulse_reinvented` switch does. No existing table, column, function, policy or row changes.
--
-- Pulse, reinvented, phase 3 (coord CONTRACT 8c; "a record of strands", one of the tables the founder approved on
-- 2026-11-26): "Dana went because of you". A row says that the follower marked Want to go on the source's post and later
-- posted from there. Told to the source's author only; it goes with either post and with either person.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."PostStrand" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('went')),
  source_post_id uuid NOT NULL REFERENCES public."Post"(id) ON DELETE CASCADE,
  source_user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  follower_user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  follower_post_id uuid NOT NULL REFERENCES public."Post"(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  seen_at timestamp with time zone,
  -- The follower took it back: the source's author no longer sees it, and the job never makes it again.
  taken_back_at timestamp with time zone,
  CHECK (source_user_id <> follower_user_id),
  UNIQUE (source_post_id, follower_user_id, kind)
);
CREATE INDEX post_strand_by_source_user ON public."PostStrand" (source_user_id, created_at DESC);
CREATE INDEX post_strand_by_follower ON public."PostStrand" (follower_user_id, created_at DESC);
CREATE INDEX post_strand_by_follower_post ON public."PostStrand" (follower_post_id);

COMMENT ON TABLE public."PostStrand" IS
  'Pulse, reinvented: a strand ("went because of you"), told to the source post''s author only. Only the server reads it.';

ALTER TABLE public."PostStrand" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."PostStrand" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PostStrand" TO service_role;

COMMIT;
