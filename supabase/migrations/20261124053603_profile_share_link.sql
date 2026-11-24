-- Backwards compatible: yes. Adds one table, "ProfileShareLink", and one function that counts its opens. No existing
-- table, function, constraint or grant changes. Deployed apps and the current backend never read or write them.
--
-- A profile with sources, phase 1: links for one purpose (the founder approved this table on 2026-11-23, SPEC item
-- 9.1). One row is one link a person made to share chosen parts of their profile (board 21): its name for the owner,
-- its key (long and random, the link's only credential; the backend never logs it), the parts it shows, an optional
-- last day, whether it is switched off, and how often it was opened and the last day, never who (item 9.6). Clients
-- never reach the table: the API reads and writes it as the server.
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."ProfileShareLink" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  key text NOT NULL CHECK (char_length(key) >= 32),
  parts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parts) = 'object'),
  ends_on date,
  switched_off_at timestamptz,
  opens integer NOT NULL DEFAULT 0 CHECK (opens >= 0),
  last_opened_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profile_share_link_key ON public."ProfileShareLink" (key);
CREATE INDEX profile_share_link_user ON public."ProfileShareLink" (user_id, created_at DESC);
ALTER TABLE public."ProfileShareLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ProfileShareLink" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."ProfileShareLink" TO service_role;

COMMENT ON TABLE public."ProfileShareLink" IS
  'Links for one purpose: chosen parts of a person''s profile behind a long random key; opens counted, never who.';

-- One more open of a link, on a Pacific day: adds one to the count and moves the last day forward. Nothing else.
CREATE OR REPLACE FUNCTION public.profile_share_link_opened(p_link_id uuid, p_day date)
RETURNS void
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public."ProfileShareLink"
     SET opens = opens + 1,
         last_opened_on = GREATEST(COALESCE(last_opened_on, p_day), p_day)
   WHERE id = p_link_id;
$$;

REVOKE ALL ON FUNCTION public.profile_share_link_opened(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_share_link_opened(uuid, date) TO service_role;
