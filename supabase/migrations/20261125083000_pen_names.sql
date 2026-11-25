-- Backwards compatible: yes. Adds one system account, nullable columns, one new table that no client or server role
-- can read, functions only the server may call, two triggers that act only on made-up-name rows, and two values on an
-- enum. Four existing rules change, each wider than before, so every row and every statement the current backend and
-- the store apps write stays valid: "User".account_type also allows 'system'; "AudienceIdentity".user_id may be empty
-- (only on the new kind of row, by a new check); and the reply rate limit counts a made-up name's replies by that name
-- (for every other reply it counts exactly as before). "UserPostingCooldown".restriction_level also allows 'suspended'.
--
-- Made-up names (the founder: "yes, right, let's go", 2026-11-25; the design is the Claude Doc "Made-up names: posting
-- without your name", the build contract docs/product/made-up-names/README.md). A person may write a post or a reply
-- under one made-up name. In code that name is a "pen name".
--   * The row is saved under one Pantopus system account, with identity_context_type 'pen_name' and the pen name's id.
--     The account that wrote it is nowhere on the row.
--   * Which account wrote it is kept only in "PenNameOwner". No role the API or the server's ordinary reads use holds
--     any privilege on that table: it is read and written through the functions below and nothing else.
--   * A pen name is a row of "AudienceIdentity" (the table that already holds each person's made-up handle) with
--     kind 'pen_name' and no user_id; its owner is a "PenNameOwner" row too.
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------------------------------------------
-- 1. The system account every made-up-name row is saved under.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE public."User" DROP CONSTRAINT "User_account_type_check";
ALTER TABLE public."User" ADD CONSTRAINT "User_account_type_check"
  CHECK ((account_type)::text = ANY (ARRAY['individual'::text, 'business'::text, 'curator'::text, 'system'::text]));

-- Its address can never receive mail (.invalid, RFC 2606). Nobody signs in as it: there is no auth user behind it.
INSERT INTO public."User" (id, email, username, name, first_name, account_type, verified, profile_visibility)
VALUES ('5ea1ed00-0000-4000-8000-000000000001', 'pen-names@pantopus.invalid', 'someone_nearby', 'Someone nearby',
        'Someone', 'system', false, 'private')
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.pen_name_system_account() RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT '5ea1ed00-0000-4000-8000-000000000001'::uuid $$;
COMMENT ON FUNCTION public.pen_name_system_account() IS 'The account every made-up-name post and reply is saved under.';

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Pen names, in the table that already holds made-up handles.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE public."AudienceIdentity"
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN kind text NOT NULL DEFAULT 'audience' CHECK (kind IN ('audience', 'pen_name')),
  ADD COLUMN name_key text CHECK (name_key IS NULL OR char_length(name_key) BETWEEN 2 AND 64),
  ADD COLUMN lineage_id uuid,
  ADD COLUMN retired_at timestamp with time zone;

-- An audience handle keeps its account, as before. A pen name never carries one.
ALTER TABLE public."AudienceIdentity" ADD CONSTRAINT "AudienceIdentity_kind_shape" CHECK (
  (kind = 'audience' AND user_id IS NOT NULL)
  OR (kind = 'pen_name' AND user_id IS NULL AND public_persona_id IS NULL
      AND name_key IS NOT NULL AND lineage_id IS NOT NULL AND display_name IS NOT NULL)
);

-- A name is taken for good, retired ones included: old posts keep their name and nobody else may write under it.
CREATE UNIQUE INDEX audience_identity_pen_name_key ON public."AudienceIdentity" (name_key) WHERE kind = 'pen_name';
CREATE INDEX audience_identity_pen_name_lineage ON public."AudienceIdentity" (lineage_id) WHERE kind = 'pen_name';

COMMENT ON COLUMN public."AudienceIdentity".kind IS 'audience: a handle around Beacons, with its account. pen_name: a made-up name for posts and replies, with no account on the row.';
COMMENT ON COLUMN public."AudienceIdentity".name_key IS 'A pen name folded for comparison (letters and digits, lower case): unique for good.';
COMMENT ON COLUMN public."AudienceIdentity".lineage_id IS 'The same value on every pen name one account has had. Never sent to an app.';

-- ---------------------------------------------------------------------------------------------------------------
-- 3. A reply may be written under a pen name too.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE public."PostComment"
  ADD COLUMN identity_context_type text,
  ADD COLUMN identity_context_id uuid;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Who wrote it. The only record that ties a made-up name, or anything written under one, to an account.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public."PenNameOwner" (
  content_kind text NOT NULL CHECK (content_kind IN ('pen_name', 'post', 'comment')),
  content_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL REFERENCES public."AudienceIdentity"(id) ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "PenNameOwner_pkey" PRIMARY KEY (content_kind, content_id)
);
CREATE INDEX pen_name_owner_by_owner ON public."PenNameOwner" (owner_user_id, content_kind, created_at DESC);
CREATE INDEX pen_name_owner_by_identity ON public."PenNameOwner" (identity_id);

ALTER TABLE public."PenNameOwner" ENABLE ROW LEVEL SECURITY;
-- No policy and no privilege for anyone, the server's own role included: only the functions below reach it.
REVOKE ALL ON TABLE public."PenNameOwner" FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public."PenNameOwner" IS 'Which account owns a pen name, or wrote a post or reply under one. Read and written only through the pen_name_* functions.';

-- ---------------------------------------------------------------------------------------------------------------
-- 5. The functions. All SECURITY DEFINER, and only the server may call them.
-- ---------------------------------------------------------------------------------------------------------------

-- The account's pen name in use, or NULL.
CREATE FUNCTION public.pen_name_current(p_owner uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.content_id
  FROM public."PenNameOwner" o
  JOIN public."AudienceIdentity" i ON i.id = o.content_id
  WHERE o.content_kind = 'pen_name' AND o.owner_user_id = p_owner
    AND i.kind = 'pen_name' AND i.status = 'active'
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

-- Takes a pen name for an account. p_replace: give up the one in use first. A name nothing was written under is
-- removed and its words freed; one that was used is retired and kept, and may be replaced only p_min_days after it
-- was taken. Raises PEN_NAME_EXISTS, PEN_NAME_TOO_SOON, or a unique violation when the name is taken.
CREATE FUNCTION public.pen_name_take(
  p_owner uuid, p_name text, p_name_key text, p_handle text, p_avatar_url text, p_source text,
  p_replace boolean, p_min_days integer
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_id uuid;
  current_taken timestamp with time zone;
  lineage uuid;
  new_id uuid := gen_random_uuid();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('pen-name-owner:' || p_owner::text, 0));

  SELECT o.content_id, o.created_at INTO current_id, current_taken
  FROM public."PenNameOwner" o
  JOIN public."AudienceIdentity" i ON i.id = o.content_id
  WHERE o.content_kind = 'pen_name' AND o.owner_user_id = p_owner AND i.kind = 'pen_name' AND i.status = 'active'
  ORDER BY o.created_at DESC
  LIMIT 1;

  -- Every name an account has had shares one lineage, so a block on one follows the account to the next.
  SELECT i.lineage_id INTO lineage
  FROM public."PenNameOwner" o
  JOIN public."AudienceIdentity" i ON i.id = o.content_id
  WHERE o.content_kind = 'pen_name' AND o.owner_user_id = p_owner
  ORDER BY o.created_at ASC
  LIMIT 1;
  IF lineage IS NULL THEN lineage := gen_random_uuid(); END IF;

  IF current_id IS NOT NULL THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'PEN_NAME_EXISTS' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public."PenNameOwner"
               WHERE identity_id = current_id AND content_kind IN ('post', 'comment')) THEN
      IF current_taken > now() - make_interval(days => p_min_days) THEN
        RAISE EXCEPTION 'PEN_NAME_TOO_SOON' USING ERRCODE = 'P0001';
      END IF;
      UPDATE public."AudienceIdentity" SET status = 'disabled', retired_at = now() WHERE id = current_id;
    ELSE
      DELETE FROM public."PenNameOwner" WHERE content_kind = 'pen_name' AND content_id = current_id;
      DELETE FROM public."AudienceIdentity" WHERE id = current_id;
    END IF;
  END IF;

  INSERT INTO public."AudienceIdentity"
    (id, user_id, handle, handle_normalized, display_name, avatar_url, status, source, kind, name_key, lineage_id)
  VALUES
    (new_id, NULL, p_handle, lower(p_handle), p_name, p_avatar_url, 'active', p_source, 'pen_name', p_name_key, lineage);
  INSERT INTO public."PenNameOwner" (content_kind, content_id, owner_user_id, identity_id)
  VALUES ('pen_name', new_id, p_owner, new_id);
  RETURN new_id;
END;
$$;

-- Records who is about to write a post or a reply under their pen name. The row it belongs to is saved next, and the
-- guard below refuses that row unless this record is there. Calling it again for the same row and owner changes nothing.
CREATE FUNCTION public.pen_name_seal(p_kind text, p_content_id uuid, p_owner uuid, p_identity uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_owner uuid;
BEGIN
  IF p_kind NOT IN ('post', 'comment') THEN
    RAISE EXCEPTION 'PEN_NAME_KIND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."PenNameOwner" o
    JOIN public."AudienceIdentity" i ON i.id = o.content_id
    WHERE o.content_kind = 'pen_name' AND o.content_id = p_identity AND o.owner_user_id = p_owner
      AND i.kind = 'pen_name' AND i.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PEN_NAME_NOT_YOURS' USING ERRCODE = 'P0001';
  END IF;
  SELECT owner_user_id INTO existing_owner FROM public."PenNameOwner"
  WHERE content_kind = p_kind AND content_id = p_content_id;
  IF existing_owner IS NOT NULL THEN
    IF existing_owner <> p_owner THEN
      RAISE EXCEPTION 'PEN_NAME_SEALED' USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public."PenNameOwner" (content_kind, content_id, owner_user_id, identity_id)
  VALUES (p_kind, p_content_id, p_owner, p_identity);
END;
$$;

-- Takes back a record whose row was never saved (the insert after it failed).
CREATE FUNCTION public.pen_name_unseal(p_kind text, p_content_id uuid, p_owner uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_kind = 'post' AND EXISTS (SELECT 1 FROM public."Post" WHERE id = p_content_id) THEN RETURN; END IF;
  IF p_kind = 'comment' AND EXISTS (SELECT 1 FROM public."PostComment" WHERE id = p_content_id) THEN RETURN; END IF;
  DELETE FROM public."PenNameOwner"
  WHERE content_kind = p_kind AND content_id = p_content_id AND owner_user_id = p_owner
    AND content_kind IN ('post', 'comment');
END;
$$;

-- Which of these rows this account wrote. It answers about the asking account only.
CREATE FUNCTION public.pen_name_mine(p_owner uuid, p_kind text, p_ids uuid[]) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT content_id FROM public."PenNameOwner"
  WHERE content_kind = p_kind AND owner_user_id = p_owner AND content_id = ANY (p_ids);
$$;

-- The account that wrote a row: for a notice to its writer, and for a member of staff (who is logged by the caller).
CREATE FUNCTION public.pen_name_owner(p_kind text, p_content_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT owner_user_id FROM public."PenNameOwner" WHERE content_kind = p_kind AND content_id = p_content_id;
$$;

-- The account's own made-up-name rows, newest first.
CREATE FUNCTION public.pen_name_owned(p_owner uuid, p_kind text, p_before timestamp with time zone, p_limit integer)
RETURNS TABLE (content_id uuid, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.content_id, o.created_at FROM public."PenNameOwner" o
  WHERE o.content_kind = p_kind AND o.owner_user_id = p_owner
    AND (p_before IS NULL OR o.created_at < p_before)
  ORDER BY o.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

-- How many the account wrote since a time: its daily limits.
CREATE FUNCTION public.pen_name_count(p_owner uuid, p_kind text, p_since timestamp with time zone) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::integer FROM public."PenNameOwner"
  WHERE content_kind = p_kind AND owner_user_id = p_owner AND created_at >= p_since;
$$;

-- The voice the account already has in a conversation: 'pen_name', 'named' or NULL. One voice per conversation.
CREATE FUNCTION public.pen_name_voice(p_owner uuid, p_post uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public."Post" p WHERE p.id = p_post AND p.user_id = p_owner)
      OR EXISTS (SELECT 1 FROM public."PostComment" c
                 WHERE c.post_id = p_post AND c.user_id = p_owner AND c.is_deleted IS NOT TRUE) THEN 'named'
    WHEN EXISTS (SELECT 1 FROM public."PenNameOwner" o
                 WHERE o.content_kind = 'post' AND o.content_id = p_post AND o.owner_user_id = p_owner)
      OR EXISTS (SELECT 1 FROM public."PenNameOwner" o
                 JOIN public."PostComment" c ON c.id = o.content_id
                 WHERE o.content_kind = 'comment' AND o.owner_user_id = p_owner
                   AND c.post_id = p_post AND c.is_deleted IS NOT TRUE) THEN 'pen_name'
    ELSE NULL
  END;
$$;

-- Which of these people blocked a pen name of this account. A block on a made-up name stops the account behind it
-- from reaching the person under any name; the person who blocked is never told which account that is.
CREATE FUNCTION public.pen_name_blocked_by(p_owner uuid, p_blockers uuid[]) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT m.user_id
  FROM public."PostMute" m
  JOIN public."AudienceIdentity" blocked ON blocked.id::text = m.muted_entity_id AND blocked.kind = 'pen_name'
  WHERE m.user_id = ANY (p_blockers)
    AND m.muted_entity_type::text = 'pen_name_block'
    AND blocked.lineage_id IN (
      SELECT i.lineage_id FROM public."PenNameOwner" o
      JOIN public."AudienceIdentity" i ON i.id = o.content_id
      WHERE o.content_kind = 'pen_name' AND o.owner_user_id = p_owner
    );
$$;

REVOKE ALL ON FUNCTION public.pen_name_current(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_take(uuid, text, text, text, text, text, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_seal(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_unseal(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_mine(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_owner(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_owned(uuid, text, timestamp with time zone, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_count(uuid, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_voice(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pen_name_blocked_by(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pen_name_current(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_take(uuid, text, text, text, text, text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_seal(text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_unseal(text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_mine(uuid, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_owner(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_owned(uuid, text, timestamp with time zone, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_count(uuid, text, timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_voice(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pen_name_blocked_by(uuid, uuid[]) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. The guard: a made-up-name row is saved under the system account, with its owner recorded first, and its name
--    can never be put on or taken off a row afterwards.
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.pen_name_content_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.identity_context_type IS NOT DISTINCT FROM 'pen_name')
        IS DISTINCT FROM (NEW.identity_context_type IS NOT DISTINCT FROM 'pen_name')
      OR (NEW.identity_context_type IS NOT DISTINCT FROM 'pen_name'
          AND (NEW.identity_context_id IS DISTINCT FROM OLD.identity_context_id
               OR NEW.user_id IS DISTINCT FROM OLD.user_id)) THEN
      RAISE EXCEPTION 'PEN_NAME_FIXED' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.identity_context_type IS NOT DISTINCT FROM 'pen_name' THEN
    IF NEW.user_id IS DISTINCT FROM public.pen_name_system_account()
      OR NOT EXISTS (SELECT 1 FROM public."PenNameOwner" o
                     WHERE o.content_kind = TG_ARGV[0] AND o.content_id = NEW.id
                       AND o.identity_id = NEW.identity_context_id) THEN
      RAISE EXCEPTION 'PEN_NAME_UNSEALED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pen_name_content_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pen_name_content_guard() TO service_role;

CREATE TRIGGER pen_name_post_guard_insert BEFORE INSERT ON public."Post"
  FOR EACH ROW EXECUTE FUNCTION public.pen_name_content_guard('post');
CREATE TRIGGER pen_name_post_guard_update BEFORE UPDATE OF identity_context_type, identity_context_id, user_id
  ON public."Post" FOR EACH ROW EXECUTE FUNCTION public.pen_name_content_guard('post');
CREATE TRIGGER pen_name_comment_guard_insert BEFORE INSERT ON public."PostComment"
  FOR EACH ROW EXECUTE FUNCTION public.pen_name_content_guard('comment');
CREATE TRIGGER pen_name_comment_guard_update BEFORE UPDATE OF identity_context_type, identity_context_id, user_id
  ON public."PostComment" FOR EACH ROW EXECUTE FUNCTION public.pen_name_content_guard('comment');

-- When an account is deleted its "PenNameOwner" rows go with it (the cascade above), and what they stood for goes too,
-- in the same transaction: its made-up-name posts are deleted as its named posts are, its made-up-name replies become
-- the same empty placeholders named replies become (pulse_scrub_deleted_author_replies), and its name is retired.
CREATE FUNCTION public.pen_name_owner_removed() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.content_kind = 'post' THEN
    DELETE FROM public."Post" WHERE id = OLD.content_id AND identity_context_type = 'pen_name';
  ELSIF OLD.content_kind = 'comment' THEN
    UPDATE public."PostComment"
    SET comment = '', is_deleted = true, is_edited = false, edited_at = NULL,
        mentioned_business_ids = '{}'::uuid[], like_count = 0,
        moderation_state = 'live', moderation_rule = NULL
    WHERE id = OLD.content_id AND identity_context_type = 'pen_name';
  ELSIF OLD.content_kind = 'pen_name' THEN
    UPDATE public."AudienceIdentity" SET status = 'disabled', retired_at = COALESCE(retired_at, now())
    WHERE id = OLD.content_id AND kind = 'pen_name';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.pen_name_owner_removed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pen_name_owner_removed() TO service_role;
CREATE TRIGGER pen_name_owner_removed AFTER DELETE ON public."PenNameOwner"
  FOR EACH ROW EXECUTE FUNCTION public.pen_name_owner_removed();

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Mutes and blocks of a made-up name live in the mute table, never in "UserBlock": a row there would hide the
--    person's named posts as well, and so say who is behind the name.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TYPE public.muted_entity_type ADD VALUE IF NOT EXISTS 'pen_name';
ALTER TYPE public.muted_entity_type ADD VALUE IF NOT EXISTS 'pen_name_block';

-- ---------------------------------------------------------------------------------------------------------------
-- 8. The reply rate limit (five a minute on one post) counts a made-up name's replies by that name. Every made-up-name
--    reply is saved under the one system account, so counting by account would make all of them share those five.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_post_comment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  under_pen_name boolean := NEW.identity_context_type IS NOT DISTINCT FROM 'pen_name';
  writer text := CASE WHEN NEW.identity_context_type IS NOT DISTINCT FROM 'pen_name'
                      THEN 'pen:' || NEW.identity_context_id::text ELSE NEW.user_id::text END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'post-comment:' || NEW.post_id::text || ':' || writer, 0));

  -- INSERT ... ON CONFLICT runs BEFORE INSERT triggers even for a retry.
  -- The route verifies that the saved draft's author, post and content match.
  IF EXISTS (SELECT 1 FROM public."PostComment" WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM public."PostComment"
      WHERE post_id = NEW.post_id AND user_id = NEW.user_id
        AND (NOT under_pen_name
             OR (identity_context_type = 'pen_name' AND identity_context_id = NEW.identity_context_id))
        AND created_at >= clock_timestamp() - interval '60 seconds') >= 5 THEN
    RAISE EXCEPTION 'POST_COMMENT_RATE_LIMIT' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_post_comment_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_post_comment_rate_limit() TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 9. A standing penalty on made-up names is a "UserPostingCooldown" row with surface 'pen_name' and this level.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE public."UserPostingCooldown" DROP CONSTRAINT "UserPostingCooldown_restriction_level_check";
ALTER TABLE public."UserPostingCooldown" ADD CONSTRAINT "UserPostingCooldown_restriction_level_check"
  CHECK ((restriction_level)::text = ANY (ARRAY['warning'::text, 'template_only'::text, 'reduced_radius'::text,
                                                'cooldown_1h'::text, 'cooldown_24h'::text, 'suspended'::text]));
