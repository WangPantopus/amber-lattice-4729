-- Backwards compatible: yes. Keep filed proof in the existing private bucket.
-- Ordinary review stops serving attachments once a claim closes, including on old app versions.
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.authorize_home_claim_evidence(p_home_id uuid,p_claim_id uuid,p_actor_id uuid,
  p_operation text,p_platform_admin boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='5s' AS $$
DECLARE c public."HomeOwnershipClaim"%ROWTYPE; h public."Home"%ROWTYPE; o public."HomeOccupancy"%ROWTYPE;
  v_now timestamptz; v_reviewer boolean;
BEGIN
  IF p_actor_id IS NULL OR p_platform_admin IS NULL OR p_operation IS NULL OR p_operation NOT IN ('upload','read','verify','retire') THEN
    RETURN '{"ok":false,"code":"CLAIM_EVIDENCE_INVALID","status":400}'::jsonb; END IF;
  IF NOT public.lock_home_claim_scope(p_home_id) THEN RETURN '{"ok":false,"code":"HOME_NOT_FOUND","status":404}'::jsonb; END IF;
  SELECT * INTO c FROM public."HomeOwnershipClaim" WHERE id=p_claim_id AND home_id=p_home_id;
  IF NOT FOUND THEN RETURN '{"ok":false,"code":"CLAIM_NOT_FOUND","status":404}'::jsonb; END IF;
  SELECT * INTO h FROM public."Home" WHERE id=p_home_id;
  IF h.home_status IN ('merged','archived') OR h.security_state IN ('frozen','frozen_silent','disputed') THEN
    RETURN '{"ok":false,"code":"CLAIM_EVIDENCE_DENIED","status":403}'::jsonb; END IF;
  IF c.state='disputed' OR c.claim_phase_v2='challenged' OR c.challenge_state='challenged' OR c.routing_classification='challenge_claim' THEN
    RETURN '{"ok":false,"code":"CLAIM_CHALLENGE_REVIEW_REQUIRED","status":409}'::jsonb; END IF;
  v_now:=clock_timestamp();
  IF NOT public.home_claim_is_active(c) OR c.expires_at<=v_now THEN
    IF p_operation='read' THEN RETURN '{"ok":false,"code":"CLAIM_NOT_FOUND","status":404}'::jsonb; END IF;
    RETURN '{"ok":false,"code":"CLAIM_NOT_ELIGIBLE","status":409}'::jsonb;
  END IF;
  v_reviewer:=c.claimant_user_id<>p_actor_id AND public.home_claim_review_authority(p_home_id,p_actor_id,p_platform_admin);
  IF (p_operation IN ('upload','retire') AND (p_actor_id<>c.claimant_user_id OR p_platform_admin))
    OR (p_operation='verify' AND NOT coalesce(v_reviewer,false))
    OR (p_operation='read' AND p_actor_id<>c.claimant_user_id AND NOT coalesce(v_reviewer,false)) THEN
    RETURN '{"ok":false,"code":"CLAIM_EVIDENCE_DENIED","status":403}'::jsonb; END IF;
  IF p_actor_id=c.claimant_user_id THEN
    -- Existing explicit membership/history restrictions cannot be restored by
    -- a personal upload. No occupancy is required for a genuine first claim.
    SELECT * INTO o FROM public."HomeOccupancy" WHERE home_id=p_home_id AND user_id=p_actor_id;
    v_now:=clock_timestamp();
    IF o.id IS NOT NULL AND (o.is_active IS DISTINCT FROM true OR coalesce(o.role_base,public.home_invite_role(o.role)) IS NULL
      OR o.verification_status IS NULL OR o.verification_status NOT IN ('verified','unverified','pending','pending_doc','pending_postcard','pending_approval','provisional_bootstrap')
      OR (o.verification_status<>'verified' AND o.verified_at IS NOT NULL) OR o.start_at>v_now OR o.end_at<=v_now
      OR o.access_start_at>v_now OR o.access_end_at<=v_now) THEN
      RETURN '{"ok":false,"code":"CLAIM_EVIDENCE_DENIED","status":403}'::jsonb; END IF;
    IF EXISTS(SELECT FROM public."HomeOwner" WHERE home_id=p_home_id AND subject_type='user' AND subject_id=p_actor_id
      AND owner_status IN ('revoked','disputed')) THEN RETURN '{"ok":false,"code":"CLAIM_EVIDENCE_DENIED","status":403}'::jsonb; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'home_id',p_home_id,'claim_id',p_claim_id,'claimant_id',c.claimant_user_id,
    'review_token',public.home_claim_review_snapshot(c),'can_verify',coalesce(v_reviewer,false));
END $$;

CREATE OR REPLACE FUNCTION public.get_home_claim_review(p_home_id uuid,p_claim_id uuid,p_actor_id uuid,p_platform_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='5s' AS $$
DECLARE c public."HomeOwnershipClaim"%ROWTYPE; h uuid; v_evidence jsonb; v_home jsonb; v_user jsonb;
BEGIN
  SELECT home_id INTO h FROM public."HomeOwnershipClaim" WHERE id=p_claim_id;
  IF h IS NULL OR (p_home_id IS NOT NULL AND p_home_id<>h) THEN RETURN '{"ok":false,"code":"CLAIM_NOT_FOUND","status":404}'::jsonb; END IF;
  IF NOT public.lock_home_claim_scope(h) THEN RETURN '{"ok":false,"code":"HOME_NOT_FOUND","status":404}'::jsonb; END IF;
  SELECT * INTO c FROM public."HomeOwnershipClaim" WHERE id=p_claim_id AND home_id=h;
  IF NOT FOUND THEN RETURN '{"ok":false,"code":"CLAIM_NOT_FOUND","status":404}'::jsonb; END IF;
  IF public.home_claim_review_authority(h,p_actor_id,p_platform_admin) IS DISTINCT FROM true THEN
    RETURN '{"ok":false,"code":"CLAIM_REVIEW_DENIED","status":403}'::jsonb; END IF;
  IF NOT public.home_claim_is_active(c) OR c.expires_at<=clock_timestamp() THEN
    IF NOT p_platform_admin THEN RETURN '{"ok":false,"code":"CLAIM_NOT_FOUND","status":404}'::jsonb; END IF;
    v_evidence:='[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(CASE WHEN i.id IS NOT NULL THEN public.home_claim_evidence_projection(i) ELSE jsonb_build_object('id',e.id,'evidence_type',e.evidence_type,'provider',e.provider,
      'status',e.status,'created_at',e.created_at,'storage_ref',NULL,'file_url',NULL,'file_name',NULL,
      'file_size',NULL,'mime_type',NULL,'available',false,'availability_code',
        CASE WHEN e.storage_ref IS NOT NULL OR e.metadata ? 'file_url' THEN 'CLAIM_EVIDENCE_PRIVATE_REUPLOAD_REQUIRED'
          ELSE 'CLAIM_EVIDENCE_METADATA_ONLY' END,
      'eligible_for_review',public.home_claim_review_verified_evidence(e)) END ORDER BY e.created_at DESC,e.id),'[]')
      INTO v_evidence FROM public."HomeVerificationEvidence" e LEFT JOIN public."HomeClaimEvidenceIntent" i
        ON i.id=e.private_upload_id AND i.id=e.id AND i.original_claim_id=e.claim_id WHERE e.claim_id=p_claim_id;
  END IF;
  SELECT jsonb_build_object('id',id,'address',address,'city',city,'state',state,'zipcode',zipcode,'name',name,
    'home_type',home_type,'security_state',security_state,'tenure_mode',tenure_mode) INTO v_home FROM public."Home" WHERE id=h;
  SELECT jsonb_build_object('id',id,'username',username,'name',name,'email',email,'created_at',created_at,
    'profile_picture_url',profile_picture_url) INTO v_user FROM public."User" WHERE id=c.claimant_user_id;
  RETURN jsonb_build_object('ok',true,'homeId',h,'claimId',p_claim_id,
    'claim',to_jsonb(c)||jsonb_build_object('review_token',public.home_claim_review_snapshot(c),'evidence',v_evidence),
    'home',v_home,'claimant',v_user,'evidence',v_evidence);
END $$;

REVOKE ALL ON FUNCTION public.authorize_home_claim_evidence(uuid,uuid,uuid,text,boolean),
  public.get_home_claim_review(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_home_claim_evidence(uuid,uuid,uuid,text,boolean),
  public.get_home_claim_review(uuid,uuid,uuid,boolean) TO service_role;
