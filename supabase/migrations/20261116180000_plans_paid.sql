-- Backwards compatible: yes. Adds nullable or defaulted columns to "Plan" and "PlanRequest", widens two checks
-- ("PlanRequest".status gains 'paying', "Payment".payment_type gains 'plan_payment'), adds three checks every existing
-- row passes and one switch row (off). Deployed apps never read the new columns.
--
-- Plans for the holidays, the business track's B2 (contract 10.2; Plans with businesses, its contract 4.2 and 5.6;
-- payments 02-payments.md sections 3, 4 and 8, decisions P8, P10, P12): a business's plan can have a price per spot,
-- paid when the guest joins.
--
--   Plan.price_cents, currency           the price of one spot (100 to 50000 cents); null is free
--   plan_price_needs_business            only a business's plan has a price (contract rule 2)
--   plan_price_in_person                 an online plan is never paid (P12)
--   PlanRequest.status 'paying'          the spot is held for 10 minutes while the card is confirmed; it counts as a
--                                        taken seat
--   PlanRequest money columns            as the Plans with businesses contract, section 4.2, writes them: who brought
--                                        the guest, new to the business, the payment, the price paid, the rate and its
--                                        basis, the refund deadline, what was refunded, the hold, the check-in
--   Payment.payment_type 'plan_payment'  a paid spot, as 'booking_payment' was added for scheduling
--   plans_paid                           the switch, read for the plan's host (the business), off
--
-- Deploy this migration before the backend that writes these columns.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS price_cents integer,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_price_range;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_price_range CHECK (price_cents IS NULL OR price_cents BETWEEN 100 AND 50000);
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_price_needs_business;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_price_needs_business CHECK (price_cents IS NULL OR business_user_id IS NOT NULL);
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_price_in_person;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_price_in_person CHECK (price_cents IS NULL OR place_kind <> 'online');

ALTER TABLE public."PlanRequest"
  ADD COLUMN IF NOT EXISTS brought_by_user_id uuid REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS new_to_business boolean,
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public."Payment"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_price_cents integer,
  ADD COLUMN IF NOT EXISTS paid_cents integer,
  ADD COLUMN IF NOT EXISTS fee_basis text,
  ADD COLUMN IF NOT EXISTS fee_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS refund_until timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE public."PlanRequest" DROP CONSTRAINT IF EXISTS plan_request_money_fields;
ALTER TABLE public."PlanRequest" ADD CONSTRAINT plan_request_money_fields CHECK (
  (fee_basis IS NULL OR fee_basis IN ('pantopus', 'own'))
  AND (fee_pct IS NULL OR fee_pct BETWEEN 0 AND 100)
  AND (unit_price_cents IS NULL OR unit_price_cents > 0)
  AND (paid_cents IS NULL OR paid_cents >= 0)
  AND refunded_cents >= 0);
CREATE INDEX IF NOT EXISTS plan_request_paying_hold ON public."PlanRequest" (hold_expires_at) WHERE status = 'paying';
CREATE INDEX IF NOT EXISTS plan_request_payment ON public."PlanRequest" (payment_id) WHERE payment_id IS NOT NULL;

ALTER TABLE public."PlanRequest" DROP CONSTRAINT "PlanRequest_status_check";
ALTER TABLE public."PlanRequest" ADD CONSTRAINT "PlanRequest_status_check" CHECK (status = ANY (ARRAY[
  'pending'::text, 'waitlisted'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text, 'left'::text,
  'removed'::text, 'expired'::text, 'paying'::text]));

ALTER TABLE public."Payment" DROP CONSTRAINT "Payment_payment_type_check";
ALTER TABLE public."Payment" ADD CONSTRAINT "Payment_payment_type_check" CHECK ((payment_type)::text = ANY (ARRAY[
  'gig_payment'::text, 'tip'::text, 'cancellation_fee'::text, 'booking_payment'::text, 'package_payment'::text,
  'plan_payment'::text]));

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_paid', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (B2 to B4): a verified business with its own enabled payout account can put a price on a spot of its in-person plan; guests pay when they join (10-minute hold), with a full refund until 24 hours before. Read for the plan''s host (the business). Needs plans_business. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
