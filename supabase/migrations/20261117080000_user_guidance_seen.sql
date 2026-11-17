-- Backwards compatible: yes. Adds one column to "User" (an empty map by default, so every existing row is valid); no
-- other table, index, function, trigger, policy or grant changes. Deployed apps and the current backend never read or
-- write it.
--
-- Guidance cards for new users (the founder approved this one field on the users table on 2026-11-16; no new table).
-- Which cards a person has closed, kept on their account so a card closed on the phone stays closed on the web:
--   { "<card id>": { "times": <int >= 1>, "last_at": "<ISO time>" } }
-- The backend checks the ids and writes the map (POST /api/users/guidance/shown and /reset); the database keeps the
-- value. No index and no backfill.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS guidance_seen jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
