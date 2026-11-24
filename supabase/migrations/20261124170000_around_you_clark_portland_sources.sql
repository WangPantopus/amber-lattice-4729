-- Backwards compatible: yes. Data only: seeder_sources rows for the Clark County and Portland regions, each statement
-- conditional on its row or region existing (the regions exist only where the curator setup script ran). Deployed
-- backends read these rows already; the seeder Lambda reads the rss rows on its next run and skips 'ical' rows with a
-- log line (the backend's feeds job reads those).
--
-- Around you, the everywhere layer (AROUNDFEEDS piece 3, November 24, 2026). Checked by hand that day:
--   rss:columbian          The Columbian's local feed (25 of 25 local; the whole-site feed was mostly wire stories).
--                          Its stories are metered (isAccessibleForFree false): subscription.
--   rss:camas_washougal    the Post-Record is a weekly: its stories stay 168 hours. Metered too: subscription.
--   rss:city_vancouver     the City of Vancouver's news feed (10 items), active again. Free.
--   rss:clark_county_today Clark County Today, free. Its live feed is /feed/rss.xml (50 items); /feed/ stopped in
--                          September.
--   rss:state_wa           Washington State Standard for Clark County; rss:state_or the Oregon Capital Chronicle for
--                          Portland (States Newsroom, free, 100 items each). Around you shows them as "Across <State>".
--   rss:opb_news, rss:city_portland  free. KGW and OregonLive refuse automated readers, so their access is left unset.
--   ical:camas_library     Camas Public Library's calendar file; ical:downtown_camas the Downtown Camas Association's;
--   ical:washougal_community  the City of Washougal's Community Events calendar. Each answered with events in the
--                          next 7 days. (The City of Vancouver publishes no calendar file.)
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE public.seeder_sources
   SET url = 'https://www.columbian.com/news/local/feed/', access = 'subscription'
 WHERE source_id = 'rss:columbian';

UPDATE public.seeder_sources
   SET keep_hours = 168, access = 'subscription'
 WHERE source_id = 'rss:camas_washougal';

UPDATE public.seeder_sources SET access = 'free' WHERE source_id IN ('rss:opb_news', 'rss:city_portland');

INSERT INTO public.seeder_sources (source_id, source_type, url, category, display_name, region, active, priority, access)
SELECT v.source_id, v.source_type, v.url, v.category, v.display_name, v.region, true, 2, v.access
  FROM (VALUES
    ('rss:city_vancouver', 'rss', 'https://www.cityofvancouver.us/feed/', 'community_resource', 'City of Vancouver',
     'clark_county', 'free'),
    ('rss:clark_county_today', 'rss', 'https://clarkcountytoday.com/feed/rss.xml', 'local_news', 'Clark County Today',
     'clark_county', 'free'),
    ('rss:state_wa', 'rss', 'https://washingtonstatestandard.com/feed/', 'local_news', 'Washington State Standard',
     'clark_county', 'free'),
    ('rss:state_or', 'rss', 'https://oregoncapitalchronicle.com/feed/', 'local_news', 'Oregon Capital Chronicle',
     'portland_metro', 'free'),
    ('ical:camas_library', 'ical', 'https://camaspl.librarycalendar.com/events/feed/ical', 'event',
     'Camas Public Library', 'clark_county', 'free'),
    ('ical:downtown_camas', 'ical', 'https://www.downtowncamas.com/events/?ical=1', 'event',
     'Downtown Camas Association', 'clark_county', 'free'),
    ('ical:washougal_community', 'ical',
     'https://www.cityofwashougal.us/common/modules/iCalendar/iCalendar.aspx?catID=27&feed=calendar', 'event',
     'City of Washougal', 'clark_county', 'free')
  ) AS v (source_id, source_type, url, category, display_name, region, access)
 WHERE EXISTS (SELECT 1 FROM public.seeder_config c WHERE c.region = v.region)
ON CONFLICT (source_id, region) DO UPDATE
   SET active = true, url = EXCLUDED.url, access = EXCLUDED.access;
COMMIT;
