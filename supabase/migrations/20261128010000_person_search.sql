-- Backwards compatible: yes. Adds one new table, two indexes on "Relationship", functions that no client role can run,
-- and triggers that keep the new table in step with the tables it is made from. No existing column, row, policy or
-- function changes, and the deployed server neither reads nor writes any of it.
--
-- People search (the founder approved the table on 2026-11-27). GET /api/users/search and the profile search answered
-- from `ILIKE '%word%'` over "LocalProfile" and "User": every keystroke read both tables whole, the best 160 by
-- username were cut before anyone was ranked, and one search took 14 calls. "PersonSearch" holds one row per account
-- that can be found at all, with the words it may be found by and nothing else, so a search is one indexed call.
--
-- It only finds candidates. The server checks each one again against today's tables (blocks, search visibility,
-- private profiles, unpublished businesses) before it is shown, so a row that is out of step can cost a result but
-- never show someone who chose not to be found.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- The text a search compares: lowercase, accents removed ("José" and "jose" are the same word), ß æ œ ø đ ł ı spelled
-- out, runs of spaces made one. Used for the stored words and for what the person typed.
CREATE FUNCTION public.person_search_fold(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT btrim(regexp_replace(
    translate(
      replace(replace(replace(
        normalize(regexp_replace(normalize(lower(coalesce(p_text, '')), NFD), '[̀-ͯ]', '', 'g'), NFC),
        U&'\00DF', 'ss'), U&'\00E6', 'ae'), U&'\0153', 'oe'),
      U&'\00F8\0111\0142\0131', 'odli'),
    '\s+', ' ', 'g'));
$$;

-- True for a username the server made up (backend/utils/personalUsername.js): user_ plus 12 or 20 hex characters, or
-- the first part of the account's email address plus _ and six hex characters (accounts made before October 7, 2026).
-- A made-up username says nothing about the person, or shows the start of their email address, so it is never a word
-- anyone is found by.
CREATE FUNCTION public.person_search_made_up(p_handle text, p_email text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(
    btrim(p_handle) ~ '^user_([0-9a-f]{12}|[0-9a-f]{20})$'
    OR (btrim(p_handle) ~ '_[0-9a-f]{6}$'
      AND lower(left(btrim(p_handle), char_length(btrim(p_handle)) - 7)) = lower(coalesce(nullif(
        left(regexp_replace(split_part(coalesce(p_email, ''), '@', 1), '[^a-zA-Z0-9_]', '', 'g'), 20), ''), 'user'))),
    false);
$$;

-- Every two letters that stand side by side in the words, for finding a two-letter piece inside a word ("小明" in
-- "王小明"): the three-letter index below cannot answer that.
CREATE FUNCTION public.person_search_bigrams(p_words text)
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT x.g), '{}')
  FROM (
    SELECT substr(p_words, i, 2) AS g
    FROM generate_series(1, greatest(char_length(coalesce(p_words, '')) - 1, 0)) AS i
  ) x
  WHERE position(' ' IN x.g) = 0;
$$;

CREATE TABLE public."PersonSearch" (
  user_id uuid PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE,
  -- The curator account has a row so the profile search still finds it; search for someone to message leaves it out.
  kind text NOT NULL CHECK (kind IN ('person', 'business', 'curator')),
  -- Who may find them: everyone, or only their connections. Someone nobody may find has no row.
  audience text NOT NULL CHECK (audience IN ('everyone', 'connections')),
  -- The username they chose and the name they are shown by, folded, for "is exactly" and "starts with".
  handle text COLLATE "C",
  name text COLLATE "C",
  -- Everything they may be found by, folded: the shown name, the chosen username, the tagline, the place they show,
  -- and their real name only when they turned on "findable by name".
  words text NOT NULL,
  lexemes tsvector NOT NULL,
  refreshed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX person_search_name ON public."PersonSearch" (name, user_id);
CREATE INDEX person_search_handle ON public."PersonSearch" (handle, user_id);
CREATE INDEX person_search_lexemes ON public."PersonSearch" USING gin (lexemes);
CREATE INDEX person_search_words ON public."PersonSearch" USING gin (words gin_trgm_ops);
CREATE INDEX person_search_bigrams ON public."PersonSearch" USING gin (public.person_search_bigrams(words));

COMMENT ON TABLE public."PersonSearch" IS
  'People search index: one row per account that can be found, with the words it may be found by (candidates only; the server checks every result again). Kept in step by person_search_refresh. Only the server reads it.';

ALTER TABLE public."PersonSearch" ENABLE ROW LEVEL SECURITY;
-- No policy: apps never read it directly. Only the server's own role does.
REVOKE ALL ON TABLE public."PersonSearch" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PersonSearch" TO service_role;

-- A search starts from the searcher's own connections and blocks; "Relationship" had no index by either person.
CREATE INDEX IF NOT EXISTS relationship_requester ON public."Relationship" (requester_id);
CREATE INDEX IF NOT EXISTS relationship_addressee ON public."Relationship" (addressee_id);

-- Makes one account's row again from the tables it comes from, or removes it when the account can't be found:
-- a system account, a private profile, search visibility "nobody", a business that isn't published (or a closed
-- one), or nothing to find it by. Mirrors routes/users.js (GET /search) and utils/visibilityPolicy.js.
CREATE FUNCTION public.person_search_refresh(p_user_id uuid, p_one_at_a_time boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  u record;
  l record;
  v_has_profile boolean;
  v_search_visibility text;
  v_findable_by_name boolean := false;
  v_has_business boolean;
  v_published boolean;
  v_kind text;
  v_audience text := 'everyone';
  v_handle text;
  v_name text;
  v_words text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  -- One at a time per account, so two changes made at once (a new name and a new privacy choice) can't leave the row
  -- made from only one of them. The first fill below runs while nothing else can write, and skips the lock: one lock
  -- per account, all held to the end of that one transaction, would not fit.
  IF p_one_at_a_time THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('person_search:' || p_user_id::text, 0));
  END IF;

  SELECT x.email, x.username, x.name, x.first_name, x.middle_name, x.last_name, x.account_type, x.profile_visibility
    INTO u
    FROM "User" x WHERE x.id = p_user_id;
  IF NOT FOUND THEN
    DELETE FROM "PersonSearch" s WHERE s.user_id = p_user_id;
    RETURN;
  END IF;

  SELECT x.handle, x.display_name, x.tagline, x.public_city, x.public_state, x.public_neighborhood,
         x.show_neighborhood, x.profile_visibility, x.search_visibility
    INTO l
    FROM "LocalProfile" x WHERE x.user_id = p_user_id;
  v_has_profile := FOUND;

  SELECT x.search_visibility::text, x.findable_by_name
    INTO v_search_visibility, v_findable_by_name
    FROM "UserPrivacySettings" x WHERE x.user_id = p_user_id;

  SELECT x.is_published INTO v_published FROM "BusinessProfile" x WHERE x.business_user_id = p_user_id;
  v_has_business := FOUND;

  IF coalesce(u.account_type, 'individual') = 'system'
    OR coalesce(u.profile_visibility, 'public') = 'private'
    OR coalesce(v_search_visibility, 'everyone') = 'nobody'
    OR (coalesce(u.account_type, 'individual') = 'business' AND v_published IS NOT TRUE)
    OR (coalesce(u.account_type, 'individual') <> 'business' AND v_has_business)
    OR (v_has_profile AND (coalesce(l.search_visibility, 'everyone') = 'nobody'
      OR coalesce(l.profile_visibility, 'public') = 'private'))
  THEN
    DELETE FROM "PersonSearch" s WHERE s.user_id = p_user_id;
    RETURN;
  END IF;

  v_kind := CASE coalesce(u.account_type, 'individual')
    WHEN 'business' THEN 'business' WHEN 'curator' THEN 'curator' ELSE 'person' END;
  IF coalesce(v_search_visibility, 'everyone') = 'mutuals'
    OR (v_has_profile AND (coalesce(l.search_visibility, 'everyone') = 'mutuals'
      OR coalesce(l.profile_visibility, 'public') IN ('connections', 'followers')))
  THEN
    v_audience := 'connections';
  END IF;

  IF v_has_profile THEN
    -- The Local Profile is what everyone sees, so it is what they are found by.
    v_handle := CASE WHEN person_search_made_up(l.handle, u.email) THEN NULL ELSE nullif(btrim(l.handle), '') END;
    v_name := CASE
      WHEN person_search_made_up(l.display_name, u.email) OR btrim(l.display_name) = 'Pantopus member' THEN NULL
      ELSE nullif(btrim(l.display_name), '') END;
    v_words := concat_ws(' ', v_name, v_handle, l.tagline,
      CASE WHEN l.show_neighborhood IS TRUE
        THEN concat_ws(' ', l.public_city, l.public_state, l.public_neighborhood) END,
      -- The account's own name only when the person turned on "findable by name".
      CASE WHEN v_findable_by_name IS TRUE
        THEN concat_ws(' ', u.name, u.first_name, u.middle_name, u.last_name) END);
  ELSE
    -- No Local Profile yet: every screen shows the account's name (identityProfiles.displayNameFromUser).
    v_handle := CASE WHEN person_search_made_up(u.username, u.email) THEN NULL ELSE nullif(btrim(u.username), '') END;
    v_name := coalesce(nullif(btrim(u.name), ''),
      nullif(btrim(concat_ws(' ', nullif(btrim(u.first_name), ''), nullif(btrim(u.middle_name), ''),
        nullif(btrim(u.last_name), ''))), ''));
    v_words := concat_ws(' ', v_name, v_handle);
  END IF;

  v_words := person_search_fold(v_words);
  IF v_words = '' THEN
    DELETE FROM "PersonSearch" s WHERE s.user_id = p_user_id;
    RETURN;
  END IF;
  v_handle := nullif(person_search_fold(v_handle), '');
  v_name := nullif(person_search_fold(v_name), '');

  INSERT INTO "PersonSearch" AS s (user_id, kind, audience, handle, name, words, lexemes, refreshed_at)
  VALUES (p_user_id, v_kind, v_audience, v_handle, v_name, v_words, to_tsvector('simple', v_words), now())
  ON CONFLICT (user_id) DO UPDATE SET
    kind = excluded.kind, audience = excluded.audience, handle = excluded.handle, name = excluded.name,
    words = excluded.words, lexemes = excluded.lexemes, refreshed_at = excluded.refreshed_at
  WHERE (s.kind, s.audience, s.handle, s.name, s.words)
    IS DISTINCT FROM (excluded.kind, excluded.audience, excluded.handle, excluded.name, excluded.words);
END;
$$;

-- Runs after a change to an account, its Local Profile, its privacy settings or its business profile. TG_ARGV[0] is
-- the column that holds the account's id. A refresh that fails never fails the person's own change: their row is
-- removed instead, so the worst case is someone missing from search, never someone findable against their settings.
CREATE FUNCTION public.person_search_touch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[] := '{}'::uuid[];
  v_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_ids := v_ids || ((to_jsonb(OLD) ->> TG_ARGV[0])::uuid);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_ids := v_ids || ((to_jsonb(NEW) ->> TG_ARGV[0])::uuid);
  END IF;
  FOR v_id IN SELECT DISTINCT x.id FROM unnest(v_ids) AS x(id) WHERE x.id IS NOT NULL LOOP
    BEGIN
      PERFORM public.person_search_refresh(v_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'person_search_refresh(%) failed: % (%)', v_id, SQLERRM, SQLSTATE;
      DELETE FROM "PersonSearch" s WHERE s.user_id = v_id;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER person_search_touch
  AFTER INSERT OR UPDATE OF email, username, name, first_name, middle_name, last_name, account_type, profile_visibility
  ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.person_search_touch('id');
CREATE TRIGGER person_search_touch
  AFTER INSERT OR UPDATE OR DELETE ON public."LocalProfile"
  FOR EACH ROW EXECUTE FUNCTION public.person_search_touch('user_id');
CREATE TRIGGER person_search_touch
  AFTER INSERT OR UPDATE OR DELETE ON public."UserPrivacySettings"
  FOR EACH ROW EXECUTE FUNCTION public.person_search_touch('user_id');
CREATE TRIGGER person_search_touch
  AFTER INSERT OR DELETE OR UPDATE OF business_user_id, is_published ON public."BusinessProfile"
  FOR EACH ROW EXECUTE FUNCTION public.person_search_touch('business_user_id');

-- The candidates for `p_viewer`'s search, best first, at most `p_limit` (1 to 60). `p_kind`: 'people', 'business',
-- 'all' (both) or 'profiles' (both and the curator account, for the profile search). Never the searcher, anyone who
-- blocked them or whom they blocked, or someone only connections may find unless they are connected.
--
-- tier 0  the username or the shown name is exactly what was typed
-- tier 1  the shown name, then the username, starts with it
-- tier 2  every word typed starts a word of theirs ("smi" finds "Anna Smith")
-- tier 3  every word typed appears somewhere in theirs
-- tier 4  close spellings of words of four letters or more ("smiht" finds "Smith"), only when tiers 0 to 3 found no one
--
-- Within a tier the searcher's connections come first, then by name. Each tier is read from an index with its own
-- limit, and a later tier is read only while there is room left, so a common name costs no more than a rare one.
-- Tiers 2 to 4 look at a bounded number of matches (see v_caps), so for a very common word they are a fair sample
-- in name order, not the first in name order of every match.
--
-- It writes nothing. It is not marked STABLE only because it sets pg_trgm's "how close" for its own transaction.
CREATE FUNCTION public.person_search(
  p_viewer uuid,
  p_query text,
  p_kind text DEFAULT 'all',
  p_limit integer DEFAULT 20)
RETURNS TABLE (person_id uuid, tier integer, is_connected boolean, ord integer)
LANGUAGE plpgsql
-- pg_trgm's functions and operators are found in whichever of these it is installed in.
SET search_path = public, extensions, pg_temp
-- PostgREST gives a call this long (it applies a function's own statement_timeout to the call's transaction).
SET statement_timeout = '3s'
AS $$
DECLARE
  v_q text := public.person_search_fold(regexp_replace(coalesce(p_query, ''), '^[\s@]+', ''));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 60);
  v_tokens text[];
  v_tok text;
  v_one text;
  v_connected uuid[] := '{}'::uuid[];
  v_hidden uuid[] := '{}'::uuid[];
  v_found uuid[] := '{}'::uuid[];
  v_kind_sql text := '';
  v_prefix text;
  v_tsq tsquery;
  v_substring text := 'true';
  v_fuzzy text := 'true';
  v_plain text;
  v_substring_plain text := 'true';
  v_fuzzy_plain text := 'true';
  v_has_long boolean := false;
  v_preds text[];
  v_orders text[];
  v_tiers integer[];
  v_caps integer[];
  v_sql text;
  v_conn_ids uuid[] := '{}'::uuid[];
  v_conn_tiers integer[] := '{}'::integer[];
  v_n integer := 0;
  v_id uuid;
BEGIN
  IF p_viewer IS NULL OR char_length(v_q) < 2 THEN
    RETURN;
  END IF;
  v_tokens := (string_to_array(v_q, ' '))[1:6];
  IF p_kind = 'people' THEN
    v_kind_sql := ' AND s.kind = ''person''';
  ELSIF p_kind = 'business' THEN
    v_kind_sql := ' AND s.kind = ''business''';
  ELSIF p_kind = 'profiles' THEN
    v_kind_sql := '';
  ELSE
    v_kind_sql := ' AND s.kind <> ''curator''';
  END IF;

  -- The searcher's connections, and everyone hidden from them: a block either way (utils/visibilityPolicy.js
  -- loadUserSearchAccess), and themself.
  SELECT coalesce(array_agg(x.peer) FILTER (WHERE x.status = 'accepted'), '{}'),
         coalesce(array_agg(x.peer) FILTER (WHERE x.status = 'blocked'), '{}')
    INTO v_connected, v_hidden
    FROM (
      SELECT CASE WHEN r.requester_id = p_viewer THEN r.addressee_id ELSE r.requester_id END AS peer,
             r.status::text AS status
      FROM "Relationship" r
      WHERE r.requester_id = p_viewer OR r.addressee_id = p_viewer
    ) x;
  v_hidden := v_hidden || p_viewer
    || coalesce((SELECT array_agg(b.blocked_user_id) FROM "UserProfileBlock" b
        WHERE b.user_id = p_viewer AND b.block_scope IN ('full', 'search_only')), '{}')
    || coalesce((SELECT array_agg(b.user_id) FROM "UserProfileBlock" b
        WHERE b.blocked_user_id = p_viewer AND b.block_scope IN ('full', 'search_only')), '{}')
    || coalesce((SELECT array_agg(b.blocker_user_id) FROM "UserBlock" b WHERE b.blocked_user_id = p_viewer), '{}');

  v_prefix := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- The words as the word index splits them, each as "starts with".
  BEGIN
    SELECT to_tsquery('simple', string_agg(
        '''' || replace(replace(x.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & '))
      INTO v_tsq
      FROM unnest(to_tsvector('simple', v_q)) AS x;
  EXCEPTION WHEN OTHERS THEN
    v_tsq := NULL;
  END;

  FOREACH v_tok IN ARRAY v_tokens LOOP
    IF char_length(v_tok) >= 3 THEN
      v_one := format('s.words LIKE %L',
        '%' || replace(replace(replace(v_tok, '\', '\\'), '%', '\%'), '_', '\_') || '%');
    ELSIF char_length(v_tok) = 2 THEN
      v_one := format('public.person_search_bigrams(s.words) @> ARRAY[%L]::text[]', v_tok);
    ELSE
      v_one := format('position(%L IN s.words) > 0', v_tok);
    END IF;
    -- The same test without an index, for the searcher's own connections: they are read by id, a few hundred at most.
    v_plain := format('position(%L IN s.words) > 0', v_tok);
    v_substring := v_substring || ' AND ' || v_one;
    v_substring_plain := v_substring_plain || ' AND ' || v_plain;
    IF char_length(v_tok) >= 4 THEN
      v_has_long := true;
      v_fuzzy := v_fuzzy || format(' AND (%s OR %L <%% s.words)', v_one, v_tok);
      v_fuzzy_plain := v_fuzzy_plain || format(' AND (%s OR %L <%% s.words)', v_plain, v_tok);
    ELSE
      v_fuzzy := v_fuzzy || ' AND ' || v_one;
      v_fuzzy_plain := v_fuzzy_plain || ' AND ' || v_plain;
    END IF;
  END LOOP;

  IF v_has_long THEN
    -- How close a "close spelling" is, for this search only (the setting lasts until this transaction ends). The
    -- first line makes sure pg_trgm is loaded, so the setting is one the database knows.
    PERFORM word_similarity('a', 'a');
    PERFORM set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  END IF;

  v_preds := ARRAY[
    format('(s.name = %L OR s.handle = %L)', v_q, v_q),
    format('s.name LIKE %L', v_prefix),
    format('s.handle LIKE %L', v_prefix),
    CASE WHEN v_tsq IS NULL THEN 'false' ELSE format('s.lexemes @@ %L::tsquery', v_tsq::text) END,
    v_substring,
    CASE WHEN v_has_long THEN v_fuzzy ELSE 'false' END];
  v_tiers := ARRAY[0, 1, 1, 2, 3, 4];
  -- "Is exactly" and "starts with" read their index in name order and stop at the limit. The other tiers have no
  -- such order, so each looks at no more than this many matches before sorting them: the work per search stays
  -- bounded however common the word is.
  v_caps := ARRAY[0, 0, 0, 2000, 2000, 400];
  v_orders := ARRAY[
    's.name NULLS LAST, s.user_id',
    's.name, s.user_id',
    's.handle, s.user_id',
    's.name NULLS LAST, s.user_id',
    's.name NULLS LAST, s.user_id',
    format('word_similarity(%L, s.words) DESC, s.name NULLS LAST, s.user_id', v_q)];

  -- The searcher's own connections who match, each with its tier. They may be found whatever their audience.
  IF cardinality(v_connected) > 0 THEN
    EXECUTE format(
      'SELECT coalesce(array_agg(m.user_id ORDER BY m.t, m.name NULLS LAST, m.user_id), ''{}''),
              coalesce(array_agg(m.t ORDER BY m.t, m.name NULLS LAST, m.user_id), ''{}'')
       FROM (
         SELECT s.user_id, s.name,
           CASE WHEN %1$s THEN 0 WHEN %2$s OR %3$s THEN 1 WHEN %4$s THEN 2 WHEN %5$s THEN 3 WHEN %6$s THEN 4 END AS t
         FROM "PersonSearch" s
         WHERE s.user_id = ANY ($1) AND s.user_id <> ALL ($2)%7$s
       ) m
       WHERE m.t IS NOT NULL',
      v_preds[1], v_preds[2], v_preds[3], v_preds[4], v_substring_plain,
      CASE WHEN v_has_long THEN v_fuzzy_plain ELSE 'false' END, v_kind_sql)
      INTO v_conn_ids, v_conn_tiers
      USING v_connected, v_hidden;
  END IF;

  v_hidden := v_hidden || v_connected;
  FOR v_i IN 1..6 LOOP
    EXIT WHEN v_n >= v_limit;
    CONTINUE WHEN v_preds[v_i] = 'false';
    -- Close spellings only when nothing else matched (a typo), so they never crowd a real match.
    CONTINUE WHEN v_i = 6 AND v_n > 0;

    -- Connections of this tier first (once per tier: the username step of tier 1 has none left).
    IF v_i <> 3 THEN
      FOR v_j IN 1..cardinality(v_conn_ids) LOOP
        EXIT WHEN v_n >= v_limit;
        IF v_conn_tiers[v_j] = v_tiers[v_i] THEN
          v_n := v_n + 1;
          person_id := v_conn_ids[v_j]; tier := v_tiers[v_i]; is_connected := true; ord := v_n;
          RETURN NEXT;
        END IF;
      END LOOP;
    END IF;
    EXIT WHEN v_n >= v_limit;

    v_sql := format(
      'FROM "PersonSearch" s
       WHERE %s AND s.audience = ''everyone'' AND s.user_id <> ALL ($1) AND s.user_id <> ALL ($2)%s',
      v_preds[v_i], v_kind_sql);
    IF v_caps[v_i] > 0 THEN
      v_sql := format('SELECT s.user_id FROM (SELECT s.user_id, s.name, s.handle, s.words %s LIMIT %s) s ORDER BY %s LIMIT $3',
        v_sql, v_caps[v_i], v_orders[v_i]);
    ELSE
      v_sql := format('SELECT s.user_id %s ORDER BY %s LIMIT $3', v_sql, v_orders[v_i]);
    END IF;
    FOR v_id IN EXECUTE v_sql USING v_hidden, v_found, v_limit - v_n
    LOOP
      v_found := v_found || v_id;
      v_n := v_n + 1;
      person_id := v_id; tier := v_tiers[v_i]; is_connected := false; ord := v_n;
      RETURN NEXT;
    END LOOP;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.person_search_fold(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.person_search_made_up(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.person_search_bigrams(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.person_search_refresh(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.person_search_touch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.person_search(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.person_search_fold(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.person_search_made_up(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.person_search_bigrams(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.person_search_refresh(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.person_search(uuid, text, text, integer) TO service_role;

-- Every account that exists today. Creating the triggers above locked the four tables against writes until this
-- transaction ends, so nothing can change under the fill.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT u.id FROM public."User" u LOOP
    PERFORM public.person_search_refresh(r.id, false);
  END LOOP;
END;
$$;

COMMIT;
