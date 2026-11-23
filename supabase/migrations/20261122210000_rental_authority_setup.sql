-- Backwards compatible: yes. Existing authorities and lease requests remain valid.
-- A property owner's verified title, or their explicit delegation, grants rental
-- authority. This does not change residence, home ownership, or household roles.
ALTER TABLE public."HomeAuthority" ADD COLUMN granting_owner_id uuid
  REFERENCES public."HomeOwner"(id) ON DELETE SET NULL;
CREATE INDEX home_authority_granting_owner ON public."HomeAuthority"(granting_owner_id)
  WHERE granting_owner_id IS NOT NULL;

CREATE FUNCTION public.retire_owner_rental_authorities() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_status = 'verified' AND (OLD.home_id, OLD.subject_type, OLD.subject_id)
      IS NOT DISTINCT FROM (NEW.home_id, NEW.subject_type, NEW.subject_id) THEN RETURN NEW; END IF;
  END IF;
  UPDATE public."HomeAuthority" SET status = 'revoked', updated_at = now()
    WHERE granting_owner_id = OLD.id AND status = 'verified';
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER retire_owner_rental_authorities BEFORE DELETE OR UPDATE OF owner_status, home_id, subject_type, subject_id
  ON public."HomeOwner" FOR EACH ROW EXECUTE FUNCTION public.retire_owner_rental_authorities();

CREATE FUNCTION public.rental_setup_subjects(p_actor uuid)
RETURNS TABLE(subject_type public.subject_type, subject_id uuid, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT 'user'::public.subject_type, u.id, 'Myself'::text FROM public."User" u WHERE u.id = p_actor
  UNION ALL
  SELECT 'business'::public.subject_type, b.id, coalesce(nullif(b.name,''), b.username)
    FROM public."BusinessTeam" t JOIN public."User" b ON b.id = t.business_user_id
    WHERE t.user_id = p_actor AND t.is_active AND t.role_base IN ('owner','admin')
$$;

CREATE FUNCTION public.get_rental_authority_setup(p_actor uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH subjects AS (SELECT * FROM public.rental_setup_subjects(p_actor)),
  owned AS (
    SELECT o.home_id, o.subject_type, o.subject_id, h.address, h.address2, h.city, h.state
      FROM public."HomeOwner" o JOIN subjects s USING (subject_type, subject_id)
      JOIN public."Home" h ON h.id = o.home_id
      WHERE o.owner_status = 'verified' AND h.home_status = 'active' AND h.security_state NOT IN ('frozen','frozen_silent')
  ), managers AS (
    SELECT a.id, a.home_id, a.subject_type, a.status, u.username, u.name
      FROM public."HomeAuthority" a JOIN public."User" u ON u.id = a.subject_id
      WHERE a.home_id IN (SELECT home_id FROM owned) AND a.role = 'manager' AND a.added_via = 'owner_delegation'
        AND a.status IN ('pending','verified')
  )
  SELECT jsonb_build_object('subjects',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.subject_type,s.label) FROM subjects s),'[]'),
    'owned',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.address) FROM owned o),'[]'),
    'managers',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.username) FROM managers m),'[]'))
$$;

CREATE FUNCTION public.manage_rental_authority(p_home uuid, p_actor uuid, p_action text,
  p_subject_type public.subject_type DEFAULT NULL, p_subject_id uuid DEFAULT NULL, p_authority uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET lock_timeout = '5s' AS $$
DECLARE
  a public."HomeAuthority"%ROWTYPE;
  o public."HomeOwner"%ROWTYPE;
  desired_status text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('enable','request','approve','decline','revoke') THEN
    RAISE EXCEPTION 'Invalid rental action' USING ERRCODE = '22023';
  END IF;
  PERFORM id FROM public."Home" WHERE id = p_home AND home_status = 'active'
    AND security_state NOT IN ('frozen','frozen_silent') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property unavailable' USING ERRCODE = '42501'; END IF;
  PERFORM id FROM public."BusinessTeam" WHERE user_id = p_actor AND is_active AND role_base IN ('owner','admin') FOR SHARE;
  IF p_action IN ('enable','request') AND NOT EXISTS (SELECT FROM public.rental_setup_subjects(p_actor) s
    WHERE s.subject_type = p_subject_type AND s.subject_id = p_subject_id) THEN
    RAISE EXCEPTION 'Account unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_action <> 'request' THEN
    SELECT owner.* INTO o FROM public."HomeOwner" owner JOIN public.rental_setup_subjects(p_actor) s USING (subject_type,subject_id)
      WHERE owner.owner_status = 'verified' AND owner.home_id = p_home AND (p_action <> 'enable'
        OR (owner.subject_type = p_subject_type AND owner.subject_id = p_subject_id))
      ORDER BY owner.is_primary_owner DESC, owner.id LIMIT 1 FOR SHARE OF owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified owner required' USING ERRCODE = '42501'; END IF;
  END IF;
  IF p_action IN ('enable','request') THEN
    SELECT * INTO a FROM public."HomeAuthority" WHERE home_id = p_home AND subject_id = p_subject_id
      AND subject_type = p_subject_type AND status <> 'revoked' ORDER BY (status = 'verified') DESC, id LIMIT 1 FOR UPDATE;
    IF (a.status = 'verified' AND (p_action = 'request' OR a.role = 'owner'))
      OR (p_action = 'request' AND a.status = 'pending' AND a.added_via = 'owner_delegation') THEN
      RETURN jsonb_build_object('id',a.id,'status',a.status,'home_id',a.home_id);
    END IF;
    desired_status := CASE WHEN p_action = 'enable' THEN 'verified' ELSE 'pending' END;
    IF a.id IS NULL THEN
      INSERT INTO public."HomeAuthority"(home_id,subject_type,subject_id,role,status,verification_tier,added_via,granting_owner_id)
        VALUES(p_home,p_subject_type,p_subject_id,CASE WHEN p_action = 'enable' THEN 'owner' ELSE 'manager' END,
          desired_status,coalesce(o.verification_tier,'weak'),CASE WHEN p_action = 'enable' THEN 'claim' ELSE 'owner_delegation' END,o.id)
        RETURNING * INTO a;
    ELSIF p_action = 'request' THEN
      UPDATE public."HomeAuthority" SET role = 'manager', added_via = 'owner_delegation', updated_at = now()
        WHERE id = a.id RETURNING * INTO a;
    ELSE
      UPDATE public."HomeAuthority" SET role = 'owner', status = 'verified', verification_tier = o.verification_tier,
        granting_owner_id = o.id, added_via = 'claim', updated_at = now() WHERE id = a.id RETURNING * INTO a;
    END IF;
  ELSE
    SELECT * INTO a FROM public."HomeAuthority" WHERE id = p_authority AND home_id = p_home
      AND added_via = 'owner_delegation' AND role = 'manager' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE = '42501'; END IF;
    desired_status := CASE WHEN p_action = 'approve' THEN 'verified' ELSE 'revoked' END;
    IF a.status = desired_status THEN RETURN jsonb_build_object('id',a.id,'status',a.status,'home_id',a.home_id); END IF;
    IF (p_action = 'revoke' AND a.status <> 'verified') OR (p_action <> 'revoke' AND a.status <> 'pending') THEN
      RAISE EXCEPTION 'Request changed' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public."HomeAuthority" SET status = desired_status, verification_tier = o.verification_tier,
      granting_owner_id = o.id, updated_at = now() WHERE id = a.id RETURNING * INTO a;
  END IF;
  INSERT INTO public."HomeAuditLog"(home_id,actor_user_id,action,target_type,target_id,metadata)
    VALUES(p_home,p_actor,'RENTAL_AUTHORITY_' || upper(p_action),'HomeAuthority',a.id,jsonb_build_object('role',a.role,'status',a.status));
  RETURN jsonb_build_object('id',a.id,'status',a.status,'home_id',a.home_id);
END
$$;

REVOKE ALL ON FUNCTION public.retire_owner_rental_authorities(), public.rental_setup_subjects(uuid),
  public.get_rental_authority_setup(uuid), public.manage_rental_authority(uuid,uuid,text,public.subject_type,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rental_authority_setup(uuid), public.manage_rental_authority(uuid,uuid,text,public.subject_type,uuid,uuid)
  TO service_role;
