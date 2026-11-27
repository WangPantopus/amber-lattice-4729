-- Backwards compatible: yes. Adds one new table that no client role can read and that nothing writes until the server
-- routes behind the `pulse_reinvented` switch do. No existing table, column, function, policy or row changes, so no
-- read of today's answers anything new.
--
-- Pulse, reinvented, phase 1 (coord CONTRACT 6d; approved by the lead for the founder on 2026-11-27, BRIEF 7.9): what
-- the Studio adds to a Pulse post its author made there: the stamps they placed, the values the server filled for them
-- (nobody can type a value), and whether it shows in Explore. One row per such post, keyed by the post and deleted with
-- it. It is its own table, not a column on "Post" (today's reads that select every column would gain a key) and not
-- post_metadata (today's answers pass that on as stored).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."PostStudio" (
  post_id uuid PRIMARY KEY REFERENCES public."Post"(id) ON DELETE CASCADE,
  studio jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public."PostStudio" IS
  'Pulse, reinvented: what the Studio added to a post ({ v, stamps, stamp_values, at_home, explore }). Written and read only by the server routes behind the pulse_reinvented switch.';

ALTER TABLE public."PostStudio" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."PostStudio" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public."PostStudio" TO service_role;

COMMIT;
