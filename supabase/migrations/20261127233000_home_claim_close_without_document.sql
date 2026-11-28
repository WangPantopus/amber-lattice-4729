-- Backwards compatible: yes. Adds one service-only function; no table, column, constraint or data change.
-- Deployed apps and the current backend never call it.
--
-- A home claim filed with no document stayed open for good. Adding a Home as its owner files one that way, and
-- nothing closed it: it sat in the review queue with nothing a reviewer could decide. The founder's decision
-- (2026-11-27): a claim that gets no document within 30 days closes, and the claimant is told. The backend's hourly
-- job (jobs/claimDocumentReminders.js) picks the candidates and sends the notice; this function closes one of them
-- under the Home's claim lock, with every test repeated inside it, so a document that arrives at the same moment
-- keeps the claim open.
--
--   close_home_claim_without_document  ends an open claim the person filed themself that has had no document, and
--                                      has no upload in progress, for p_min_age_days. After Request info the days
--                                      count from the request, so the claimant gets the full time to answer it.
--
-- It changes what a claimant's own withdrawal changes (mutate_home_claim_review, 'withdraw'): the claim, which
-- becomes revoked / expired / expired_no_evidence (the terminal reason the schema already has for this), the
-- claim's pending merge invitation, and the Home's resolution state, recomputed. It writes one audit row. The
-- Home, its members and its owner records are untouched, and the person can file again.
--
-- Left alone: a co-owner invitation (invite, vouch: someone else opened it, and an ownership transfer rides on
-- one), a claim that needs the dispute flow, a Home that is frozen or disputed, and any claim that has a document.
-- An identity check is not a document.
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.close_home_claim_without_document(p_claim_id uuid,p_min_age_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='5s' AS $$
DECLARE h uuid; c public."HomeOwnershipClaim"%ROWTYPE; v_home public."Home"%ROWTYPE; v_now timestamptz;
  v_since timestamptz; v_result jsonb;
BEGIN
  IF p_claim_id IS NULL OR p_min_age_days IS NULL OR p_min_age_days<1 OR p_min_age_days>3650 THEN
    RETURN '{"ok":false,"code":"CLAIM_REVIEW_INVALID","status":400}'::jsonb; END IF;
  SELECT home_id INTO h FROM public."HomeOwnershipClaim" WHERE id=p_claim_id;
  IF h IS NULL OR NOT public.lock_home_claim_scope(h) THEN
    RETURN '{"ok":false,"code":"CLAIM_NOT_FOUND","status":404}'::jsonb; END IF;
  SELECT * INTO c FROM public."HomeOwnershipClaim" WHERE id=p_claim_id AND home_id=h;
  IF NOT FOUND THEN RETURN '{"ok":false,"code":"CLAIM_NOT_FOUND","status":404}'::jsonb; END IF;
  SELECT * INTO v_home FROM public."Home" WHERE id=h;
  v_now:=clock_timestamp();
  v_result:=jsonb_build_object('ok',true,'homeId',h,'claimId',p_claim_id,'claimantId',c.claimant_user_id,
    'claimType',c.claim_type);
  -- Closed this way before: a repeated call acknowledges it and changes nothing.
  IF c.state='revoked' AND c.claim_phase_v2='expired' AND c.terminal_reason='expired_no_evidence' THEN
    RETURN v_result||'{"closed":true,"replayed":true}'::jsonb; END IF;
  v_since:=CASE WHEN c.state='needs_more_info' AND c.reviewed_at IS NOT NULL
    THEN greatest(c.created_at,c.reviewed_at) ELSE c.created_at END;
  IF NOT public.home_claim_is_active(c) OR c.expires_at<=v_now
    OR c.state NOT IN ('submitted','pending_review','pending_challenge_window','needs_more_info')
    OR c.method IN ('invite','vouch')
    OR c.claim_phase_v2='challenged' OR c.challenge_state='challenged' OR c.routing_classification='challenge_claim'
    OR v_home.security_state IN ('frozen','frozen_silent','disputed')
    OR v_since>v_now-make_interval(days=>p_min_age_days)
    OR EXISTS(SELECT FROM public."HomeVerificationEvidence" e WHERE e.claim_id=p_claim_id AND e.evidence_type<>'idv')
    OR EXISTS(SELECT FROM public."HomeClaimEvidenceIntent" i WHERE i.claim_id=p_claim_id AND i.state='reserved') THEN
    RETURN v_result||'{"closed":false,"replayed":false}'::jsonb; END IF;
  UPDATE public."HomeOwnershipClaim" SET state='revoked',claim_phase_v2='expired',terminal_reason='expired_no_evidence',
    updated_at=v_now WHERE id=p_claim_id;
  UPDATE public."HomeInvite" SET status='revoked' WHERE home_id=h AND proposed_preset_key='claim_merge:'||p_claim_id
    AND invitee_user_id=c.claimant_user_id AND status='pending';
  PERFORM public.reconcile_home_claim_review(h);
  INSERT INTO public."HomeAuditLog"(home_id,actor_user_id,action,target_type,target_id,metadata)
    VALUES(h,NULL,'OWNERSHIP_CLAIM_EXPIRED','HomeOwnershipClaim',p_claim_id,
      jsonb_build_object('reason','no_document','min_age_days',p_min_age_days,'claim_type',c.claim_type,
        'previous_state',c.state,'filed_at',c.created_at,'retained_evidence',true));
  RETURN v_result||'{"closed":true,"replayed":false}'::jsonb;
END $$;

REVOKE ALL ON FUNCTION public.close_home_claim_without_document(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_home_claim_without_document(uuid,integer) TO service_role;
