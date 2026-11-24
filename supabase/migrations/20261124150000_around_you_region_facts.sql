-- Backwards compatible: yes. Three nullable columns on seeder_config and a wider type check on seeder_sources (every
-- existing row passes). Deployed backends and the seeder Lambda never read the new columns; the Lambda's registry skips
-- a source type it does not know ('ical') with a log line.
--
-- Around you, the everywhere layer (AROUNDFEEDS piece 1, November 24, 2026). The backend worker's hourly feeds job
-- (backend/jobs/aroundYouFeeds.js) fills a region's state and county once, from the county lookup the Place page
-- already uses (the Census geocoder, asked with the region's centre rounded to two decimals), and reads public feeds
-- for them: wildfires, federal disaster declarations, state road projects and calendar files. Calendar files are
-- seeder_sources rows of the new type 'ical', read by the job, not by the Lambda.
--   state        two-letter postal code of the region's centre
--   county_fips  five-digit county code (state + county)
--   county_name  the county's name as HUD writes it ("Clark County", "Miami-Dade County")
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.seeder_config ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.seeder_config ADD COLUMN IF NOT EXISTS county_fips text;
ALTER TABLE public.seeder_config ADD COLUMN IF NOT EXISTS county_name text;

ALTER TABLE public.seeder_sources DROP CONSTRAINT IF EXISTS seeder_sources_source_type_check;
ALTER TABLE public.seeder_sources ADD CONSTRAINT seeder_sources_source_type_check CHECK (
  source_type = ANY (ARRAY[
    'rss'::text, 'seasonal'::text, 'google_news'::text, 'nws_alerts'::text, 'air_quality'::text,
    'usgs_earthquakes'::text, 'on_this_day'::text, 'ical'::text
  ])
);
COMMIT;
