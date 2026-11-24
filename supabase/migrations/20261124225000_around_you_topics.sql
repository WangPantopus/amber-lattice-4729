-- Backwards compatible: yes. Two nullable columns and data rows. Deployed backends and the seeder Lambda never name the
-- new columns (they select and insert by column), so they keep working; the Lambda reads the new rss rows on its
-- next run.
--
-- Around you's topics and history (founder, November 24, 2026).
--   seeder_sources.topic            a source that is about one thing (an outlet's sports feed, a school district's
--                                   news): its stories carry that topic, and stay off the first page's Headlines
--                                   (they are in the topic's list and under Earlier).
--   seeder_content_queue.outlet_tags  the outlet's own labels for a story ("Schools", "Prep Sports", "Vancouver City
--                                   Council"), read from the outlet's feed by the backend's hourly job
--                                   (services/aroundYou/feeds/outletTags.js). Null: not looked at yet.
-- New sources, each read by hand that day:
--   rss:columbian_sports   The Columbian's sports feed (25 items: prep scoreboards, local college players, outdoors).
--                          Metered like the paper: subscription.
--   rss:vbj                Vancouver Business Journal (10 items over two weeks, so its stories stay 168 hours; its
--                          legal notices are left out by their label and their title).
--   rss:washougal_schools  Washougal School District's news (snow routes, school consolidation); stays 168 hours.
--   rss:wweek              Willamette Week for Portland (6 items, free).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.seeder_sources ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.seeder_sources DROP CONSTRAINT IF EXISTS seeder_sources_topic_check;
ALTER TABLE public.seeder_sources ADD CONSTRAINT seeder_sources_topic_check
  CHECK (topic IS NULL OR topic IN ('events', 'kids', 'sports', 'government', 'business', 'safety'));

ALTER TABLE public.seeder_content_queue ADD COLUMN IF NOT EXISTS outlet_tags text[];

INSERT INTO public.seeder_sources
  (source_id, source_type, url, category, display_name, region, active, priority, access, keep_hours, topic)
SELECT v.source_id, 'rss', v.url, v.category, v.display_name, v.region, true, 3, v.access, v.keep_hours, v.topic
  FROM (VALUES
    ('rss:columbian_sports', 'https://www.columbian.com/news/sports/feed/', 'local_news', 'The Columbian',
     'clark_county', 'subscription', NULL::integer, 'sports'),
    ('rss:vbj', 'https://www.vbjusa.com/feed/', 'local_news', 'Vancouver Business Journal',
     'clark_county', NULL, 168, 'business'),
    ('rss:washougal_schools', 'https://www.washougal.k12.wa.us/feed/', 'community_resource',
     'Washougal School District', 'clark_county', 'free', 168, 'kids'),
    ('rss:wweek', 'https://www.wweek.com/arc/outboundfeeds/rss/?outputType=xml', 'local_news', 'Willamette Week',
     'portland_metro', 'free', NULL::integer, NULL)
  ) AS v (source_id, url, category, display_name, region, access, keep_hours, topic)
 WHERE EXISTS (SELECT 1 FROM public.seeder_config c WHERE c.region = v.region)
ON CONFLICT (source_id, region) DO NOTHING;
COMMIT;
