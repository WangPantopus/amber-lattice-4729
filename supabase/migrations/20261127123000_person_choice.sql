-- Backwards compatible: yes. Adds one new table that no client role can read and that nothing writes until the server
-- routes behind the `pulse_reinvented` switch do. No existing table, column, function, policy or row changes.
--
-- Pulse, reinvented (coord CONTRACT 7d; approved by the lead for the founder on 2026-11-27, BRIEF 7.9): a person's own
-- choices in the new screens, one row per person per choice. The first is "Pantopus AI" (on unless the person turned it
-- off: no field card made for them, no photo of theirs sent to the model). Later phases keep their own per-person choices
-- here too. Goes with the person's account.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."PersonChoice" (
  user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice ~ '^[a-z0-9_]{1,40}$'),
  value jsonb NOT NULL CHECK (octet_length(value::text) <= 2048),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, choice)
);

COMMENT ON TABLE public."PersonChoice" IS
  'Pulse, reinvented: a person''s own choices in the new screens (e.g. pantopus_ai), one row per person per choice. Only the server reads it.';

ALTER TABLE public."PersonChoice" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."PersonChoice" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PersonChoice" TO service_role;

COMMIT;
