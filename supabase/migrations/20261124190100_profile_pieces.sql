-- Backwards compatible: yes. Adds columns to "UserPortfolio" (each nullable or with a constant default, so every
-- existing row is valid and reads as before), two partial unique indexes on the new source columns, and one nullable
-- column to "User". No existing column, constraint, policy or grant changes. The current backend and the store apps
-- never read or write them.
--
-- A profile with sources, phase 2A (the founder: "Yes, start phase 2", 2026-11-24; SPEC "Phase 2: Work"): a piece is a
-- UserPortfolio row. Its kind (did, built, owns), when it started, its city and state (never an address), what
-- Pantopus saw it from (a paid job the person did, or a plan they hosted; one piece a job or plan), who sees it (never
-- wider than the person's Work part), its link cards, and whether it is a draft. "Tools she brings" is one short line
-- on the person. The API checks every value; the database keeps the shapes.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."UserPortfolio"
  ADD COLUMN piece_kind text CHECK (piece_kind IS NULL OR piece_kind IN ('did', 'built', 'owns')),
  ADD COLUMN started_on date,
  ADD COLUMN place_city text CHECK (place_city IS NULL OR char_length(place_city) <= 80),
  ADD COLUMN place_state text CHECK (place_state IS NULL OR char_length(place_state) <= 40),
  ADD COLUMN source_gig_id uuid REFERENCES public."Gig"(id) ON DELETE SET NULL,
  ADD COLUMN source_plan_id uuid REFERENCES public."Plan"(post_id) ON DELETE SET NULL,
  ADD COLUMN audience text NOT NULL DEFAULT 'anyone' CHECK (audience IN ('anyone', 'members', 'connections')),
  ADD COLUMN links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links) = 'array'),
  ADD COLUMN is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN owner_role text CHECK (owner_role IS NULL OR char_length(owner_role) <= 40);

CREATE UNIQUE INDEX user_portfolio_source_gig ON public."UserPortfolio" (source_gig_id) WHERE source_gig_id IS NOT NULL;
CREATE UNIQUE INDEX user_portfolio_source_plan ON public."UserPortfolio" (source_plan_id) WHERE source_plan_id IS NOT NULL;

ALTER TABLE public."User"
  ADD COLUMN profile_tools text CHECK (profile_tools IS NULL OR char_length(profile_tools) <= 140);

COMMENT ON COLUMN public."UserPortfolio".source_gig_id IS 'The paid job this piece was started from (Seen while it stays completed and paid).';
COMMENT ON COLUMN public."UserPortfolio".audience IS 'Who sees the piece: anyone, members or connections; never wider than the Work part.';
COMMENT ON COLUMN public."User".profile_tools IS 'Work tab "Tools she brings": one Said line, at most 140 characters.';
