-- Backwards compatible: yes. Adds one table, "ProfileTie", and one function that says whether two people have a block
-- of any kind between them. No existing table, function, constraint or grant changes. Deployed apps and the current
-- backend never read or write them.
--
-- A profile with sources, phase 2B (the founder approved this table on 2026-11-23, SPEC item 9.1): one row is one tie
-- between a person and another party. Kinds now: a credit on one of the person's pieces ("Who was on it") and a role
-- (a job or a school); known_for, handshake and card come in later phases, so the shape is set once. The party is a
-- person or a business on Pantopus, or a name the person typed (at most 60 characters). A person on Pantopus is asked
-- and signs; until then only the person and the one asked see it. Whether the party's name may show on pages opened
-- without signing in is the party's choice (name_on_links, off). Clients never reach the table: the API reads and
-- writes it as the server.
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."ProfileTie" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('credit', 'role', 'known_for', 'handshake', 'card')),
  user_id uuid NOT NULL CONSTRAINT "ProfileTie_user_id_fkey" REFERENCES public."User"(id) ON DELETE CASCADE,
  party_user_id uuid CONSTRAINT "ProfileTie_party_user_id_fkey" REFERENCES public."User"(id) ON DELETE CASCADE,
  party_name text CHECK (party_name IS NULL OR char_length(btrim(party_name)) BETWEEN 1 AND 60),
  -- Removing a piece ends its credits.
  piece_id uuid CONSTRAINT "ProfileTie_piece_id_fkey" REFERENCES public."UserPortfolio"(id) ON DELETE CASCADE,
  role text CHECK (role IS NULL OR char_length(role) <= 40),
  relation text CHECK (relation IS NULL OR relation IN ('with', 'led', 'learned_from', 'for', 'worked', 'learned')),
  from_month date,
  to_month date,
  status text NOT NULL CHECK (status IN ('said', 'asked', 'signed', 'declined', 'removed')),
  asked_by uuid CONSTRAINT "ProfileTie_asked_by_fkey" REFERENCES public."User"(id) ON DELETE SET NULL,
  asked_at timestamptz,
  signed_by uuid CONSTRAINT "ProfileTie_signed_by_fkey" REFERENCES public."User"(id) ON DELETE SET NULL,
  signed_at timestamptz,
  removed_by uuid CONSTRAINT "ProfileTie_removed_by_fkey" REFERENCES public."User"(id) ON DELETE SET NULL,
  removed_at timestamptz,
  -- The party's two choices at signing: the piece on their own Work too (on), their name on pages opened by a link (off).
  show_on_party_work boolean NOT NULL DEFAULT true,
  name_on_links boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_tie_one_party CHECK ((party_user_id IS NOT NULL) <> (party_name IS NOT NULL)),
  CONSTRAINT profile_tie_not_self CHECK (party_user_id IS NULL OR party_user_id <> user_id),
  CONSTRAINT profile_tie_credit_piece CHECK (kind <> 'credit' OR piece_id IS NOT NULL),
  -- A typed name is the person's own words: never asked, never signed.
  CONSTRAINT profile_tie_typed_said CHECK (party_user_id IS NOT NULL OR status IN ('said', 'removed'))
);

CREATE INDEX profile_tie_user_kind ON public."ProfileTie" (user_id, kind);
CREATE INDEX profile_tie_party_status ON public."ProfileTie" (party_user_id, status) WHERE party_user_id IS NOT NULL;
CREATE INDEX profile_tie_piece ON public."ProfileTie" (piece_id) WHERE piece_id IS NOT NULL;
CREATE INDEX profile_tie_asked_by ON public."ProfileTie" (asked_by, asked_at) WHERE asked_by IS NOT NULL;
-- One credit a person on a piece.
CREATE UNIQUE INDEX profile_tie_piece_party ON public."ProfileTie" (piece_id, party_user_id)
  WHERE kind = 'credit' AND party_user_id IS NOT NULL;

ALTER TABLE public."ProfileTie" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ProfileTie" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."ProfileTie" TO service_role;

COMMENT ON TABLE public."ProfileTie" IS
  'Ties between a person and another party (credits on pieces, roles): asked, signed or said; server only.';

-- A block of any kind between two people, either way: Block in the app (Relationship), a personal block (UserBlock),
-- a profile block of any scope (UserProfileBlock). The profile reads count each as a block. Every name is
-- schema-qualified (it runs as its caller, the service role only); each lookup uses an index: Relationship's pair
-- index, and UserBlock's and UserProfileBlock's pair keys.
CREATE OR REPLACE FUNCTION public.profile_tie_blocked(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public."Relationship" r
             WHERE LEAST(r.requester_id, r.addressee_id) = LEAST(p_a, p_b)
               AND GREATEST(r.requester_id, r.addressee_id) = GREATEST(p_a, p_b)
               AND r.status::text = 'blocked')
    OR EXISTS (SELECT 1 FROM public."UserBlock" ub WHERE ub.blocker_user_id = p_a AND ub.blocked_user_id = p_b)
    OR EXISTS (SELECT 1 FROM public."UserBlock" ub WHERE ub.blocker_user_id = p_b AND ub.blocked_user_id = p_a)
    OR EXISTS (SELECT 1 FROM public."UserProfileBlock" pb WHERE pb.user_id = p_a AND pb.blocked_user_id = p_b)
    OR EXISTS (SELECT 1 FROM public."UserProfileBlock" pb WHERE pb.user_id = p_b AND pb.blocked_user_id = p_a));
$$;

REVOKE ALL ON FUNCTION public.profile_tie_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_tie_blocked(uuid, uuid) TO service_role;
