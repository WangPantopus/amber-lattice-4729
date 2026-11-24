-- Backwards compatible: yes. Four nullable columns, no default, no data change; every existing row reads as before.
-- Deployed backends and the seeder Lambda never read them; the fetcher and the feeds job keep reading active rows only.
--
-- Around you everywhere layer, piece 4 (November 24, 2026): sources for a new county. The source finder
-- (backend/services/aroundYou/sourceFinder.js) proposes a county's own news and event sources as inactive rows, and a
-- reviewer approves or rejects each on /app/admin/sources.
--   seeder_config.sources_checked_at  when the finder last looked for this region's sources (the feeds job hands a
--                                     region whose value is empty, once)
--   seeder_sources.review_state       proposed / approved / rejected (empty for rows made before the finder)
--   seeder_sources.proposed_by        finder / hand
--   seeder_sources.check_note         what the server's own check found, as JSON: items, items in the last 7 days,
--                                     items naming the city or county, three sample titles, whether a story page
--                                     asked for a subscription, or why the address was not proposed
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.seeder_config ADD COLUMN IF NOT EXISTS sources_checked_at timestamp with time zone;

ALTER TABLE public.seeder_sources ADD COLUMN IF NOT EXISTS review_state text;
ALTER TABLE public.seeder_sources ADD COLUMN IF NOT EXISTS proposed_by text;
ALTER TABLE public.seeder_sources ADD COLUMN IF NOT EXISTS check_note text;

ALTER TABLE public.seeder_sources DROP CONSTRAINT IF EXISTS seeder_sources_review_state_check;
ALTER TABLE public.seeder_sources ADD CONSTRAINT seeder_sources_review_state_check
  CHECK (review_state IS NULL OR review_state IN ('proposed', 'approved', 'rejected'));
ALTER TABLE public.seeder_sources DROP CONSTRAINT IF EXISTS seeder_sources_proposed_by_check;
ALTER TABLE public.seeder_sources ADD CONSTRAINT seeder_sources_proposed_by_check
  CHECK (proposed_by IS NULL OR proposed_by IN ('finder', 'hand'));

COMMIT;
