-- Backwards compatible: yes. Adds one new table that no client role can read and that nothing writes until the server
-- routes behind the `pulse_reinvented` switch do. No existing table, column, function, policy or row changes.
--
-- Pulse, reinvented, phase 3 (coord CONTRACT 8b; approved by the lead for the founder on 2026-11-27, BRIEF 7.9): pins on
-- a Moment's picture. A pin is a reply people can see (a "PostComment" row, so report and remove stay Pulse's own) plus
-- one row here, keyed by that reply: what kind of pin it is and where on the picture it sits. It goes with the reply and
-- with the post.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."PostPin" (
  reply_id uuid PRIMARY KEY REFERENCES public."PostComment"(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public."Post"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reaction', 'voice', 'cutout')),
  x real NOT NULL CHECK (x >= 0 AND x <= 1),
  y real NOT NULL CHECK (y >= 0 AND y <= 1),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(detail::text) <= 2048),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX post_pin_by_post ON public."PostPin" (post_id, created_at);

COMMENT ON TABLE public."PostPin" IS
  'Pulse, reinvented: a pin on a Moment''s picture (a reaction, a voice bubble or a cutout), one row per reply. Only the server reads it.';

ALTER TABLE public."PostPin" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."PostPin" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PostPin" TO service_role;

COMMIT;
