-- Backwards compatible: yes. Adds an off flag ignored by deployed apps; no table or column changes.
-- The Sky, phase A (approximate places; the founder accepted the design and the phase A build contract on 2026-11-14):
-- with this flag on for a person, a Moment or Pulse post they make floats over an area holding at least 100 homes
-- unless they pin it at a public place by name, a post made at home is always an area, and a floating post keeps only
-- its area's point. The server reads it per person (the author when a post is made, the caller on the Moments place
-- preview); the apps follow what the server answers, so no app build carries a key for it. Off for everyone until the
-- founder turns it on from the admin flag route, which answers 404 for a flag without a row. While it is off, every
-- answer and rule is today's.
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('sky_places', false, false, ARRAY[]::uuid[],
  'The Sky, approximate places: posts float over an area of at least 100 homes unless pinned at a public place; at home always an area; share a Moment later. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
