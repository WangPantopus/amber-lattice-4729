-- Backwards compatible: yes. Adds one new table that no client role can read and that nothing writes until the server
-- routes behind the `pulse_reinvented` switch do. No existing table, column, function, policy or row changes.
--
-- Pulse, reinvented, phase 3 (coord CONTRACT 8d; "circles", one of the tables the founder approved on 2026-11-26): a
-- circle of 2 to 8 close people, and its weekly magazine (made on read, nothing stored). A person is in a circle only
-- by their own yes. One row per circle; its members are listed in the row.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."Circle" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  -- [{ "user_id", "state": "invited" | "in", "at" }], the owner first.
  members jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(members) = 'array' AND jsonb_array_length(members) <= 8),
  -- Everyone listed in `members`, for "the circles I am in".
  member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  -- The day of the week its magazine comes (0 Sunday to 6 Saturday, Pacific).
  week_day smallint NOT NULL CHECK (week_day BETWEEN 0 AND 6),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX circle_by_member ON public."Circle" USING gin (member_ids);
CREATE INDEX circle_by_owner ON public."Circle" (owner_id);

COMMENT ON TABLE public."Circle" IS
  'Pulse, reinvented: a circle of 2 to 8 close people (members by their own yes). Only the server reads it.';

ALTER TABLE public."Circle" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."Circle" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Circle" TO service_role;

COMMIT;
