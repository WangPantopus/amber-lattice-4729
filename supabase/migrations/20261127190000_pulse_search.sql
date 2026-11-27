-- Backwards compatible: yes. Adds one new table and two functions that no client role can read or run, and that nothing
-- uses until the server behind the `pulse_reinvented` switch does. No existing table, column, function, policy or row
-- changes.
--
-- Pulse, reinvented, phase 4 (coord CONTRACT 9a; "a search index", one of the tables the founder approved on
-- 2026-11-26): plain-word search over Pulse posts and Moments, for Ask the map and Atlas search. It only finds
-- candidates: every result is checked again by today's reads before it is shown. One row per post.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."PulseSearch" (
  post_id uuid PRIMARY KEY REFERENCES public."Post"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('moment', 'post')),
  -- Whose it is; null under a made-up name, so those words are never matched by any search by person.
  user_id uuid REFERENCES public."User"(id) ON DELETE CASCADE,
  -- From what every reader of it is shown (caption, shown place label, field card names, playable items' words ...).
  words tsvector NOT NULL,
  -- The point everyone sees; null with no place, for a live guess spot, an unopened relic, or a Moment at home.
  shown_lat double precision,
  shown_lng double precision,
  -- When it is shown as made, and when the row itself was made (the filling job reads on from the newest).
  at timestamp with time zone NOT NULL,
  made_at timestamp with time zone NOT NULL,
  -- A post, or a Moment kept as a post that stays; else when the Moment ends.
  stays boolean NOT NULL DEFAULT false,
  ends_at timestamp with time zone,
  -- A short hash of what the row was made from.
  source_key text NOT NULL,
  indexed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX pulse_search_words ON public."PulseSearch" USING gin (words);
CREATE INDEX pulse_search_at ON public."PulseSearch" (at DESC);
CREATE INDEX pulse_search_by_person ON public."PulseSearch" (user_id, at DESC);
CREATE INDEX pulse_search_shown ON public."PulseSearch" (shown_lat, shown_lng);
CREATE INDEX pulse_search_made ON public."PulseSearch" (made_at DESC);
CREATE INDEX pulse_search_indexed ON public."PulseSearch" (indexed_at);

COMMENT ON TABLE public."PulseSearch" IS
  'Pulse, reinvented: plain-word search index of Pulse posts and Moments (candidates only; results are checked again). Only the server reads it.';

ALTER TABLE public."PulseSearch" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."PulseSearch" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PulseSearch" TO service_role;

-- Writes rows (upsert by post_id), making `words` from the text the server sends. Answers how many it wrote.
CREATE FUNCTION public.pulse_search_put(p_rows jsonb)
RETURNS integer
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  WITH r AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS x(
      post_id uuid, kind text, user_id uuid, body text, shown_lat double precision, shown_lng double precision,
      at timestamp with time zone, made_at timestamp with time zone, stays boolean, ends_at timestamp with time zone,
      source_key text)
  ), up AS (
    INSERT INTO public."PulseSearch" AS s
      (post_id, kind, user_id, words, shown_lat, shown_lng, at, made_at, stays, ends_at, source_key, indexed_at)
    SELECT post_id, kind, user_id, to_tsvector('english', coalesce(body, '')), shown_lat, shown_lng, at, made_at,
      coalesce(stays, false), ends_at, source_key, now()
    FROM r
    ON CONFLICT (post_id) DO UPDATE SET
      kind = excluded.kind, user_id = excluded.user_id, words = excluded.words, shown_lat = excluded.shown_lat,
      shown_lng = excluded.shown_lng, at = excluded.at, made_at = excluded.made_at, stays = excluded.stays,
      ends_at = excluded.ends_at, source_key = excluded.source_key, indexed_at = now()
    RETURNING 1
  )
  SELECT count(*)::integer FROM up;
$$;

-- The candidates for `p_viewer`'s search. `p_groups` are to_tsquery expressions the server builds from letters and digits
-- only, one per word asked (with its close words). A Moment that ended (and doesn't stay) is a candidate only for its
-- author. Optional filters: a box on the shown point, the people, the posts, "made before" (paging), and the order
-- ('matched': most groups matched, then newest; 'newest').
CREATE FUNCTION public.pulse_search_candidates(
  p_viewer uuid,
  p_groups text[],
  p_south double precision DEFAULT NULL, p_west double precision DEFAULT NULL,
  p_north double precision DEFAULT NULL, p_east double precision DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL, p_post_ids uuid[] DEFAULT NULL,
  p_before timestamp with time zone DEFAULT NULL,
  p_order text DEFAULT 'matched', p_limit integer DEFAULT 200)
RETURNS TABLE (post_id uuid, kind text, at timestamp with time zone, groups integer[])
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT i::integer AS i, to_tsquery('english', g) AS tq FROM unnest(p_groups) WITH ORDINALITY AS u(g, i)
  ), anyq AS (
    SELECT to_tsquery('english', string_agg('(' || g || ')', ' | ')) AS tq FROM unnest(p_groups) AS u(g)
  )
  SELECT s.post_id, s.kind, s.at, m.groups
  FROM public."PulseSearch" s
  CROSS JOIN anyq
  CROSS JOIN LATERAL (SELECT array_agg(q.i ORDER BY q.i) AS groups FROM q WHERE s.words @@ q.tq) m
  WHERE s.words @@ anyq.tq
    AND (s.stays OR s.ends_at IS NULL OR s.ends_at > now() OR s.user_id = p_viewer)
    AND (p_south IS NULL OR (s.shown_lat BETWEEN p_south AND p_north AND s.shown_lng BETWEEN p_west AND p_east))
    AND (p_user_ids IS NULL OR s.user_id = ANY (p_user_ids))
    AND (p_post_ids IS NULL OR s.post_id = ANY (p_post_ids))
    AND (p_before IS NULL OR s.at < p_before)
  ORDER BY CASE WHEN p_order = 'newest' THEN 0 ELSE coalesce(cardinality(m.groups), 0) END DESC, s.at DESC
  LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.pulse_search_put(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pulse_search_candidates(uuid, text[], double precision, double precision, double precision,
  double precision, uuid[], uuid[], timestamp with time zone, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pulse_search_put(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pulse_search_candidates(uuid, text[], double precision, double precision, double precision,
  double precision, uuid[], uuid[], timestamp with time zone, text, integer) TO service_role;

COMMIT;
