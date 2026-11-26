-- Wave 1 payment safety hardening:
--   1. Restrict payer self-refunds in reserve_payment_refund to genuine gig payments.
--   2. Add StripeWebhookEvent.locked_until for atomic concurrent-redelivery leasing.
--   3. Serialize group-pay spot claims and unused-spot settlement under a row lock
--      on the buyer's PlanRequest (claim_plan_group_spot, settle_plan_group_spots).
--   4. Atomically record confirmed Support Train gift fund contributions and totals
--      (record_support_train_contribution_succeeded).
--
-- Backwards compatible: yes. Adds one nullable column (locked_until) and three new
-- service-only RPC functions; replaces reserve_payment_refund with the same signature
-- and keeps admin/policy refund flows unchanged.

SET LOCAL lock_timeout = '5s';

-- 1. Webhook processing lease column (metadata-only add).
ALTER TABLE public."StripeWebhookEvent"
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 2. Restrict payer self-refunds to genuine gig payments (policy/admin modes unchanged).
CREATE OR REPLACE FUNCTION public.reserve_payment_refund(
  p_payment_id uuid,
  p_request_key text,
  p_actor_id uuid,
  p_actor_mode text,
  p_amount integer,
  p_reason text,
  p_description text,
  p_expected jsonb,
  p_operation text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  r public."GigStopRequest";
  d jsonb;
BEGIN
  IF p_actor_mode = 'payer' AND EXISTS (
    SELECT 1 FROM public."Payment"
    WHERE id = p_payment_id
      AND (
        payment_type IS DISTINCT FROM 'gig_payment'
        OR gig_id IS NULL
        OR (sold_type IS NOT NULL AND sold_type <> 'task')
        OR coalesce(metadata->>'type', '') IN ('invoice_payment', 'listing_offer_checkout', 'support_train_gift_fund')
      )
  ) THEN
    RETURN jsonb_build_object('error', 'SUPPORT_REQUIRED', 'reason', 'PAYMENT_TYPE_NOT_SELF_REFUNDABLE');
  END IF;

  IF p_actor_mode = 'payer' AND EXISTS (
    SELECT 1 FROM public."Payment"
    WHERE id = p_payment_id AND metadata->'gig_fee'->>'state' = 'captured'
  ) THEN
    RETURN jsonb_build_object('error', 'SUPPORT_REQUIRED', 'reason', 'GIG_FEE');
  END IF;

  SELECT * INTO r FROM public."GigStopRequest"
  WHERE payment_id = p_payment_id AND state <> 'completed';
  IF FOUND THEN
    d := public.check_gig_stop_current(r.id, p_actor_id);
    IF d ? 'error' THEN RETURN d; END IF;
    IF r.id::text IS DISTINCT FROM p_request_key
      OR r.financial_action <> 'refund'
      OR r.state <> 'pending'
      OR p_actor_mode IS DISTINCT FROM 'policy'
      OR p_operation IS DISTINCT FROM 'refund'
      OR p_amount IS NOT NULL
      OR p_reason IS DISTINCT FROM 'requested_by_customer'
      OR p_description IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'STOP_REQUEST_CHANGED');
    END IF;
  END IF;

  RETURN public.reserve_payment_refund_before_stop_fence(
    p_payment_id, p_request_key, p_actor_id, p_actor_mode,
    p_amount, p_reason, p_description, p_expected, p_operation
  );
END $$;

REVOKE ALL ON FUNCTION public.reserve_payment_refund(uuid, text, uuid, text, integer, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_payment_refund(uuid, text, uuid, text, integer, text, text, jsonb, text) TO service_role;

-- 3. Atomic group-pay spot claim and unused-spot settlement (serialized on buyer row lock).
CREATE OR REPLACE FUNCTION public.claim_plan_group_spot(
  p_post_id uuid,
  p_buyer_request_id uuid,
  p_token text,
  p_user_id uuid,
  p_way_in text,
  p_room integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  v_buyer public."PlanRequest";
  v_mine public."PlanRequest";
  v_claimed integer;
  v_now timestamptz := now();
  v_saved public."PlanRequest";
BEGIN
  IF p_token IS NULL OR p_room IS NULL OR p_room <= 0 THEN
    RETURN jsonb_build_object('error', 'spots_taken');
  END IF;

  -- Lock the buyer's request row so concurrent claims and settle_plan_group_spots serialize.
  SELECT * INTO v_buyer
  FROM public."PlanRequest"
  WHERE id = p_buyer_request_id AND post_id = p_post_id
  FOR UPDATE;

  IF NOT FOUND OR v_buyer.status <> 'accepted' OR v_buyer.spots_token IS NULL OR v_buyer.spots_token <> p_token THEN
    RETURN jsonb_build_object('error', 'link_stopped');
  END IF;

  SELECT * INTO v_mine
  FROM public."PlanRequest"
  WHERE post_id = p_post_id AND user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_mine.status IN ('pending', 'waitlisted', 'accepted', 'paying') THEN
      RETURN jsonb_build_object('error', 'already_in');
    END IF;
    IF v_mine.status = 'removed' THEN
      RETURN jsonb_build_object('error', 'removed');
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_claimed
  FROM public."PlanRequest"
  WHERE post_id = p_post_id
    AND paid_by_request_id = p_buyer_request_id
    AND status = 'accepted';

  IF v_claimed >= p_room THEN
    RETURN jsonb_build_object('error', 'spots_taken');
  END IF;

  IF v_mine.id IS NOT NULL THEN
    UPDATE public."PlanRequest"
    SET
      status = 'accepted',
      decided_by = 'rule',
      decided_at = v_now,
      party_size = 1,
      kids_count = NULL,
      distance_band = NULL,
      paid_by_request_id = p_buyer_request_id,
      spots_bought = NULL,
      spots_token = NULL,
      way_in = p_way_in,
      unit_price_cents = NULL,
      payment_id = NULL,
      paid_cents = NULL,
      refunded_cents = 0,
      refund_until = NULL,
      hold_expires_at = NULL,
      queued_at = v_now,
      reconfirm_requested_at = NULL,
      reconfirmed = NULL,
      reconfirm_reason = NULL,
      on_my_way_at = NULL,
      updated_at = v_now
    WHERE id = v_mine.id
      AND status IN ('withdrawn', 'left', 'expired', 'declined')
    RETURNING * INTO v_saved;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'already_in');
    END IF;
  ELSE
    INSERT INTO public."PlanRequest" (
      post_id, user_id, status, decided_by, decided_at, party_size,
      kids_count, distance_band, paid_by_request_id, spots_bought, spots_token,
      way_in, unit_price_cents, payment_id, paid_cents, refunded_cents,
      refund_until, hold_expires_at, queued_at, reconfirm_requested_at,
      reconfirmed, reconfirm_reason, on_my_way_at, ask_count, created_at, updated_at
    ) VALUES (
      p_post_id, p_user_id, 'accepted', 'rule', v_now, 1,
      NULL, NULL, p_buyer_request_id, NULL, NULL,
      p_way_in, NULL, NULL, NULL, 0,
      NULL, NULL, v_now, NULL,
      NULL, NULL, NULL, 1, v_now, v_now
    )
    RETURNING * INTO v_saved;
  END IF;

  RETURN jsonb_build_object('request', to_jsonb(v_saved));
END $$;

REVOKE ALL ON FUNCTION public.claim_plan_group_spot(uuid, uuid, text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_plan_group_spot(uuid, uuid, text, uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_plan_group_spots(
  p_post_id uuid,
  p_buyer_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  v_buyer public."PlanRequest";
  v_claimed integer;
BEGIN
  SELECT * INTO v_buyer
  FROM public."PlanRequest"
  WHERE id = p_buyer_request_id AND post_id = p_post_id
  FOR UPDATE;

  IF NOT FOUND OR v_buyer.spots_token IS NULL THEN
    RETURN jsonb_build_object('stopped', false, 'claimed', 0);
  END IF;

  UPDATE public."PlanRequest"
  SET spots_token = NULL, updated_at = now()
  WHERE id = p_buyer_request_id;

  SELECT count(*)::integer INTO v_claimed
  FROM public."PlanRequest"
  WHERE post_id = p_post_id
    AND paid_by_request_id = p_buyer_request_id
    AND status = 'accepted';

  RETURN jsonb_build_object('stopped', true, 'claimed', v_claimed);
END $$;

REVOKE ALL ON FUNCTION public.settle_plan_group_spots(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_plan_group_spots(uuid, uuid) TO service_role;

-- 4. Atomic Support Train gift fund confirmation (idempotent total increment on pending -> succeeded).
CREATE OR REPLACE FUNCTION public.record_support_train_contribution_succeeded(
  p_contribution_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  v_contrib public."SupportTrainFundContribution";
BEGIN
  SELECT * INTO v_contrib
  FROM public."SupportTrainFundContribution"
  WHERE id = p_contribution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('transitioned', false, 'reason', 'not_found');
  END IF;

  IF v_contrib.payment_status <> 'pending' THEN
    RETURN jsonb_build_object('transitioned', false, 'reason', 'already_processed', 'status', v_contrib.payment_status);
  END IF;

  UPDATE public."SupportTrainFundContribution"
  SET payment_status = 'succeeded'
  WHERE id = v_contrib.id;

  UPDATE public."SupportTrainFund"
  SET total_amount = total_amount + v_contrib.amount,
      updated_at = now()
  WHERE id = v_contrib.support_train_fund_id;

  RETURN jsonb_build_object(
    'transitioned', true,
    'contribution', to_jsonb(v_contrib)
  );
END $$;

REVOKE ALL ON FUNCTION public.record_support_train_contribution_succeeded(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_support_train_contribution_succeeded(uuid) TO service_role;
