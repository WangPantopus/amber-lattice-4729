-- Backwards compatible: yes. Adds one new table that no client role can read and that nothing writes until the server
-- routes behind the `pulse_reinvented` switch do. No existing table, column, function or row changes.
--
-- Each person's answer on a playable post (Pulse, reinvented, phase 2; the founder approved this table on 2026-11-27:
-- "yes also in the future please approve it for me"). One table for a poll vote, a slider value, a board position, a
-- question-box answer and a guess-and-reveal try: one row per person per playable item on a post (a Moment or a Pulse
-- post). The server decides what each reader may see of others' answers (coord CONTRACT 7a). It goes with the post's
-- row and with the person's account.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."PostAnswer" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public."Post"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  item text NOT NULL CHECK (item ~ '^[a-z0-9_-]{1,40}$'),
  kind text NOT NULL CHECK (kind IN ('poll', 'slider', 'board', 'question', 'guess')),
  value jsonb NOT NULL CHECK (octet_length(value::text) <= 2048),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_answer_one_per_person UNIQUE (post_id, item, user_id)
);
CREATE INDEX post_answer_by_user ON public."PostAnswer" (user_id, created_at DESC);

COMMENT ON TABLE public."PostAnswer" IS
  'Pulse, reinvented: one answer per person per playable item on a post (poll, slider, board, question, guess). Only the server reads it.';
COMMENT ON COLUMN public."PostAnswer".item IS
  'The playable item''s key on the post (the post''s own list of its playable items names it).';

ALTER TABLE public."PostAnswer" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."PostAnswer" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PostAnswer" TO service_role;

COMMIT;
