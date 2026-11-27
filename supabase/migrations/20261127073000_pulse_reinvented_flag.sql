-- Backwards compatible: yes. Adds an off flag ignored by deployed apps; no table or column changes.
-- Pulse, reinvented (approved by the founder on 2026-11-26): the one switch for the whole new direction. Off, every
-- screen, request and answer is today's; on for a person, the apps draw the new screens beside today's and the server
-- answers their new fields and routes. The apps read it from GET /api/feature-flags/pulse_reinvented, the server per
-- person (momentStore.flagOnFor). Off for everyone until the founder turns it on (chosen accounts first) from the admin
-- flag route, which answers 404 for a flag without a row.
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('pulse_reinvented', false, false, ARRAY[]::uuid[],
  'Pulse, reinvented: the Studio camera, stamps, the 15-minute edit and the five signals, beside today''s screens. Off puts everything back as it is today. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
