-- Backwards compatible: yes. Adds one new table that no client role can read and that nothing writes until the server
-- routes behind the `pulse_reinvented` switch do. No existing table, column, function or row changes.
--
-- Guess the spot (Pulse, reinvented, phase 0 step 8; the founder approved this table on 2026-11-27: "yes approve it
-- please build it"). A guess-the-spot Moment shows its picture without where it was taken; a person drops one pin, and
-- learns how far off it was. One row per person per Moment: the point they guessed and how far it was from the
-- Moment's answer, in metres. The point is kept only to count and check guesses: no reader, the author included, ever
-- gets another person's point. It goes with the Moment's Post row and with the person's account.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."MomentGuess" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public."Post"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  distance_m integer NOT NULL CHECK (distance_m >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT moment_guess_one_per_person UNIQUE (post_id, user_id)
);
CREATE INDEX moment_guess_by_user ON public."MomentGuess" (user_id, created_at DESC);

COMMENT ON TABLE public."MomentGuess" IS
  'Guess the spot: one guess per person per Moment (a Post with is_story). Only the server reads it; the guessed point is never shown to anyone.';
COMMENT ON COLUMN public."MomentGuess".distance_m IS
  'How far the guess was from the point everyone sees for the Moment, in metres, worked out by the server when guessed.';

ALTER TABLE public."MomentGuess" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."MomentGuess" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public."MomentGuess" TO service_role;

COMMIT;
