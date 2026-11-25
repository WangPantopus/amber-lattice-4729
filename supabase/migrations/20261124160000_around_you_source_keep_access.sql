-- Backwards compatible: yes. Two nullable columns on seeder_sources; no existing row changes. Deployed backends and the
-- seeder Lambda never read them (the Lambda selects its own column list).
--
-- Around you, the everywhere layer (AROUNDFEEDS piece 2, November 24, 2026): a source's own keep window and whether
-- its stories need a subscription. Set by hand or by the source review page (/app/admin/sources); null keeps today's
-- behaviour.
--   keep_hours  how long a story from this source stays on Around you after it was last seen, in place of its
--               section's hours (a weekly paper: 168)
--   access      'free' or 'subscription': among stories first seen the same day, free outlets come first, and a
--               subscription outlet's link reads "Read at <outlet> (subscription)"
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.seeder_sources ADD COLUMN IF NOT EXISTS keep_hours integer;
ALTER TABLE public.seeder_sources ADD COLUMN IF NOT EXISTS access text;

ALTER TABLE public.seeder_sources DROP CONSTRAINT IF EXISTS seeder_sources_keep_hours_check;
ALTER TABLE public.seeder_sources ADD CONSTRAINT seeder_sources_keep_hours_check
  CHECK (keep_hours IS NULL OR keep_hours BETWEEN 1 AND 720);
ALTER TABLE public.seeder_sources DROP CONSTRAINT IF EXISTS seeder_sources_access_check;
ALTER TABLE public.seeder_sources ADD CONSTRAINT seeder_sources_access_check
  CHECK (access IS NULL OR access IN ('free', 'subscription'));
COMMIT;
