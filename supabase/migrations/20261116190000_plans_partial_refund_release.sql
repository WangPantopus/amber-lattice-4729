-- Backwards compatible: yes. One new function; no table, column or existing function changes. Deployed code never calls it.
--
-- Plans for the holidays (B4 and B5, contract 10.4): paying out a plan payment that was refunded in part before its
-- payout (a group price that came back, a staff refund of part of a bill). The payout job and the shared functions
-- that credit a payee's wallet (reconcile_payment_wallet_release, wallet_credit) release only a payment with nothing
-- refunded, which is right for gigs, tips and invoices and stays so: neither is changed here. This function is the only
-- way such a plan payment reaches the business's wallet, and only a plan payment can reach it:
--
--   * payment_type 'plan_payment' and sold_type 'plan_spot' or 'plan_bill';
--   * payment_status 'refunded_partial', with something refunded and something left, no refund still in progress, no
--     open dispute, never transferred before, and its payout_after reached;
--   * its share re-priced by the backend for exactly the amount refunded (metadata.repriced_refunded_amount), so the
--     business is credited what the guest paid in the end less Pantopus's percent and its share of the card fee.
--
-- It credits the business's wallet through the same inner credit the shared one ends in (same idempotency key
-- 'gig_income:<payment id>', so a second call returns the first credit), and marks the payment transferred. Reachable
-- in production only while plans_paid or plans_pay_here is on for a business.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.plan_payment_release_after_partial_refund(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '5s'
AS $function$
DECLARE p public."Payment"; tx public."WalletTransaction";
BEGIN
 SELECT * INTO p FROM public."Payment" WHERE id=p_payment_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 IF p.payment_type IS DISTINCT FROM 'plan_payment' OR p.sold_type IS NULL OR p.sold_type NOT IN ('plan_spot','plan_bill') THEN
  RETURN jsonb_build_object('error','NOT_PLAN_PAYMENT'); END IF;
 -- Already paid out by this function: the same answer again.
 IF p.payment_status='transferred' AND p.transfer_status='wallet_credited' THEN
  SELECT * INTO tx FROM public."WalletTransaction" WHERE idempotency_key='gig_income:'||p.id;
  IF FOUND THEN RETURN jsonb_build_object('payment',to_jsonb(p),'transaction',to_jsonb(tx),'changed',false); END IF;
 END IF;
 IF p.payment_status IS DISTINCT FROM 'refunded_partial' THEN RETURN jsonb_build_object('error','NOT_REFUNDED_IN_PART'); END IF;
 IF coalesce(p.refunded_amount,0)<=0 OR p.refunded_amount>=p.amount_total THEN RETURN jsonb_build_object('error','NOT_REFUNDED_IN_PART'); END IF;
 IF p.transfer_completed_at IS NOT NULL OR p.stripe_transfer_id IS NOT NULL THEN RETURN jsonb_build_object('error','ALREADY_TRANSFERRED'); END IF;
 IF p.dispute_id IS NOT NULL AND p.dispute_status IS DISTINCT FROM 'won' THEN RETURN jsonb_build_object('error','DISPUTED'); END IF;
 IF EXISTS(SELECT FROM public."PaymentRefundRequest" WHERE payment_id=p.id AND status IN ('pending','requires_action'))
  OR EXISTS(SELECT FROM public."PaymentRefundReceipt" WHERE payment_id=p.id AND status IN ('pending','requires_action')) THEN
  RETURN jsonb_build_object('error','REFUND_IN_PROGRESS'); END IF;
 IF p.payout_after IS NULL OR p.payout_after>clock_timestamp() THEN RETURN jsonb_build_object('error','NOT_DUE'); END IF;
 IF (p.metadata->>'repriced_refunded_amount') IS DISTINCT FROM p.refunded_amount::text THEN
  RETURN jsonb_build_object('error','NOT_REPRICED'); END IF;
 IF p.amount_to_payee IS NULL OR p.amount_to_payee<=0 OR p.amount_to_payee>p.amount_total-p.refunded_amount THEN
  RETURN jsonb_build_object('error','BAD_AMOUNT'); END IF;
 tx:=public.wallet_credit_before_refund_fence(p.payee_id,p.amount_to_payee::bigint,'gig_income',
  CASE WHEN p.sold_type='plan_bill' THEN 'Plan bill paid' ELSE 'Plan spot paid' END,
  p.id,p.gig_id,p.payer_id,p.stripe_payment_intent_id,'gig_income:'||p.id,
  jsonb_build_object('refunded_cents',p.refunded_amount,'sold_type',p.sold_type));
 IF tx.payment_id IS DISTINCT FROM p.id OR tx.amount IS DISTINCT FROM p.amount_to_payee::bigint OR tx.user_id IS DISTINCT FROM p.payee_id THEN
  RAISE EXCEPTION 'Wallet income receipt does not match' USING ERRCODE='40001'; END IF;
 UPDATE public."Payment" SET payment_status='transferred',transfer_status='wallet_credited',
  transfer_completed_at=coalesce(transfer_completed_at,clock_timestamp()),updated_at=clock_timestamp()
  WHERE id=p.id RETURNING * INTO p;
 RETURN jsonb_build_object('payment',to_jsonb(p),'transaction',to_jsonb(tx),'changed',true);
END $function$;

COMMENT ON FUNCTION public.plan_payment_release_after_partial_refund(uuid) IS
  'Plans for the holidays (contract 10.4): pays out a plan_spot or plan_bill payment refunded in part, at its re-priced share. Nothing else reaches it.';

REVOKE ALL ON FUNCTION public.plan_payment_release_after_partial_refund(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plan_payment_release_after_partial_refund(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_payment_release_after_partial_refund(uuid) TO service_role;

COMMIT;
