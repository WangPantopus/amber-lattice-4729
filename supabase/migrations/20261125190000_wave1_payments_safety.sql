-- Wave 1 payment safety hardening:
--   1. Add StripeWebhookEvent.locked_until for atomic concurrent-redelivery leasing.
--   2. Add PlanRequest.deal_check_id: the check that holds the guest's single-use deal while its
--      payment is confirmed, so two discounted checks paid at once can't both be captured
--      (services/plans/planChecks.js finalize). No foreign key: it is only compared with a check's id.
--   3. Serialize group-pay spot claims and unused-spot settlement under a row lock
--      on the buyer's PlanRequest (claim_plan_group_spot, settle_plan_group_spots).
--   4. Atomically record confirmed Support Train gift fund contributions and totals
--      (record_support_train_contribution_succeeded).
--
-- Backwards compatible: yes. Adds two nullable columns (locked_until, deal_check_id) and three new
-- service-only RPC functions. Code that doesn't know the columns leaves them null.

SET LOCAL lock_timeout = '5s';

-- 1. Webhook processing lease column (metadata-only add).
ALTER TABLE public."StripeWebhookEvent"
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 2. The check holding a guest's deal (metadata-only add).
ALTER TABLE public."PlanRequest"
  ADD COLUMN IF NOT EXISTS deal_check_id uuid;

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
