-- Backwards compatible: yes. Adds one nullable column to "User" (null for every existing row) and its check; no other
-- table, function, constraint or grant changes. Deployed apps and the current backend never read or write it.
--
-- A profile with sources, phase 1 (the founder approved the design on 2026-11-23; SPEC rule 4.11 allows an additive
-- column and no new table): the parts a person's main link shows. Null until the person first saves; then
-- { "v": 1, "parts": { "<part>": "anyone" | "members" | "connections", … }, "search_engines": bool, "saved_at": … }.
-- The backend checks the keys and values (services/profilePage/parts.js); the database keeps the object shape.
SET LOCAL lock_timeout='5s';

ALTER TABLE public."User" ADD COLUMN profile_share jsonb NULL
  CONSTRAINT user_profile_share_object CHECK (profile_share IS NULL OR jsonb_typeof(profile_share) = 'object');

COMMENT ON COLUMN public."User".profile_share IS
  'Profile link parts: null until first saved; then { v, parts: { part: anyone|members|connections }, search_engines, saved_at }.';
