-- Backwards compatible: yes. Adds two functions that only the server's own role may run. No table, column, policy, row
-- or existing function changes.
--
-- Writes sent at the same moment must not lose each other (coord, LEAD-3 2026-11-27 05:50). A Moment's kept values live
-- in "Post".post_metadata.moment and a Studio post's in "PostStudio".studio, and the server wrote each by reading the
-- row and writing the whole value back, so two writes at once (a voice and a place sound, a sound while the picture
-- check finishes) kept only the last. These functions write only the keys they are given, against the row as it is when
-- they run: each locks the row first (a write at the same moment waits there, then reads the other's change), checks
-- its conditions on it, and writes. `moment_same` / `p_same` let a writer that worked a value out from the one it read (a map of field cards, a
-- list of dots) say "only if it still holds what I read", so it can read again and work it out again.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- A Moment: merge `p_moment` into post_metadata.moment, set the listed columns, under the listed conditions. Returns the
-- updated row, or nothing when the Moment isn't there or a condition doesn't hold.
--   p_columns: any of content, audience, story_expires_at
--   p_expect:  unarchived (archived_at is null), moderation_state (equals), moment_null (keys that must be null or
--              absent), moment_same (key -> the value it must still hold; absent and null are the same)
CREATE OR REPLACE FUNCTION public.moment_metadata_update(
  p_id uuid,
  p_moment jsonb,
  p_columns jsonb DEFAULT '{}'::jsonb,
  p_expect jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public."Post"
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  cur public."Post"%ROWTYPE;
  kept jsonb;
BEGIN
  -- The row as it is now, locked until this write ends: a write at the same moment waits here, then reads ours.
  SELECT * INTO cur FROM public."Post" WHERE id = p_id AND is_story FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  kept := COALESCE(cur.post_metadata->'moment', '{}'::jsonb);
  IF p_expect ? 'unarchived' AND cur.archived_at IS NOT NULL THEN RETURN; END IF;
  IF p_expect ? 'moderation_state' AND cur.moderation_state IS DISTINCT FROM p_expect->>'moderation_state' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_expect->'moment_null', '[]'::jsonb)) AS k(key)
             WHERE kept->>k.key IS NOT NULL) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p_expect->'moment_same', '{}'::jsonb)) AS s(key, value)
             WHERE COALESCE(kept->s.key, 'null'::jsonb) IS DISTINCT FROM s.value) THEN RETURN; END IF;
  RETURN QUERY
  UPDATE public."Post" p SET
    post_metadata = jsonb_set(COALESCE(p.post_metadata, '{}'::jsonb), '{moment}', kept || COALESCE(p_moment, '{}'::jsonb)),
    content = CASE WHEN p_columns ? 'content' THEN p_columns->>'content' ELSE p.content END,
    audience = CASE WHEN p_columns ? 'audience' THEN (p_columns->>'audience')::public.post_audience ELSE p.audience END,
    story_expires_at = CASE WHEN p_columns ? 'story_expires_at'
      THEN (p_columns->>'story_expires_at')::timestamptz ELSE p.story_expires_at END
  WHERE p.id = p_id
  RETURNING p.*;
END;
$$;

-- A Studio post (Pulse, reinvented): merge `p_studio` into "PostStudio".studio, only if each key of `p_same` still holds
-- that value (absent and null are the same). Returns the updated row, or nothing.
CREATE OR REPLACE FUNCTION public.post_studio_update(
  p_post_id uuid,
  p_studio jsonb,
  p_same jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public."PostStudio"
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  kept jsonb;
BEGIN
  SELECT COALESCE(studio, '{}'::jsonb) INTO kept FROM public."PostStudio" WHERE post_id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p_same, '{}'::jsonb)) AS k(key, value)
             WHERE COALESCE(kept->k.key, 'null'::jsonb) IS DISTINCT FROM k.value) THEN RETURN; END IF;
  RETURN QUERY
  UPDATE public."PostStudio" s SET studio = kept || COALESCE(p_studio, '{}'::jsonb)
  WHERE s.post_id = p_post_id
  RETURNING s.*;
END;
$$;

COMMENT ON FUNCTION public.moment_metadata_update(uuid, jsonb, jsonb, jsonb) IS
  'Merges keys into a Moment''s post_metadata.moment in one statement, so writes at the same moment keep each other. Server role only.';
COMMENT ON FUNCTION public.post_studio_update(uuid, jsonb, jsonb) IS
  'Pulse, reinvented: merges keys into a Studio post''s kept value in one statement. Server role only.';

REVOKE ALL ON FUNCTION public.moment_metadata_update(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_studio_update(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moment_metadata_update(uuid, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_studio_update(uuid, jsonb, jsonb) TO service_role;

COMMIT;
