-- Backwards compatible: yes. Adds one table, "BusinessCustomer", and one function that writes it. No existing table,
-- column, check or row changes; deployed backends and apps never read either.
--
-- The business graph's shared piece 3, the customer record (docs/product/business-graph/02-shared-pieces-contract.md
-- section 4). The founder approved this table on November 11; it is the one new table of the business track.
--
-- One row a business and a person it has dealt with: when and how they first met (written once, never rewritten),
-- the latest dealing, and what the person has paid the business, counted again from "Payment" on every write so a
-- repeated call never counts a sale twice and a full refund takes it back out.
--
--   - Both links cascade, so deleting either account removes the rows; the account-deletion lists need no entry.
--     No link to a home.
--   - Row security on and no grant to anon or authenticated: only the server reads and writes it, as
--     "AppealPacketPurchase" is set up.
--   - record_business_contact is the one writer. A person who has blocked the business, or whom it has blocked,
--     gets no new row (an existing one is left as it was).
--
-- Deploy this migration before the backend that calls record_business_contact.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public."BusinessCustomer" (
  business_user_id   uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  first_met_at       timestamptz NOT NULL,
  first_feature      text NOT NULL CHECK (first_feature IN ('invoice', 'plan', 'booking', 'task')),
  first_way_in       text,
  first_basis        text NOT NULL CHECK (first_basis IN ('pantopus', 'own')),
  brought_by_user_id uuid REFERENCES public."User"(id) ON DELETE SET NULL,
  last_activity_at   timestamptz NOT NULL,
  last_feature       text NOT NULL CHECK (last_feature IN ('invoice', 'plan', 'booking', 'task')),
  paid_count         integer NOT NULL DEFAULT 0,
  paid_cents         bigint  NOT NULL DEFAULT 0,
  first_paid_at      timestamptz,
  last_paid_at       timestamptz,
  hidden_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_user_id, user_id),
  CHECK (business_user_id <> user_id)
);
CREATE INDEX business_customer_user ON public."BusinessCustomer" (user_id);
CREATE INDEX business_customer_recent ON public."BusinessCustomer" (business_user_id, last_activity_at DESC);
ALTER TABLE public."BusinessCustomer" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BusinessCustomer" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."BusinessCustomer" TO service_role;

-- What a person has paid a business: its captured payments from them (paid to the business, or to its owner's wallet
-- for the business when it had no payout account of its own), less what was refunded; a full refund leaves none.
CREATE OR REPLACE FUNCTION public.recount_business_customer(p_business_user_id uuid, p_user_id uuid)
RETURNS public."BusinessCustomer" LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r public."BusinessCustomer";
BEGIN
  WITH paid AS (
    SELECT amount_total - coalesce(refunded_amount, 0) AS cents, coalesce(captured_at, payment_succeeded_at, created_at) AS at
    FROM public."Payment"
    WHERE payer_id = p_user_id
      AND (payee_id = p_business_user_id OR metadata->>'business_user_id' = p_business_user_id::text)
      AND payment_status IN ('captured_hold', 'transfer_scheduled', 'transfer_pending', 'transferred', 'refunded_partial')
      AND amount_total - coalesce(refunded_amount, 0) > 0
  )
  UPDATE public."BusinessCustomer" c SET
    paid_count = (SELECT count(*) FROM paid),
    paid_cents = (SELECT coalesce(sum(cents), 0) FROM paid),
    first_paid_at = (SELECT min(at) FROM paid),
    last_paid_at = (SELECT max(at) FROM paid),
    updated_at = now()
  WHERE c.business_user_id = p_business_user_id AND c.user_id = p_user_id
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.record_business_contact(
  p_business_user_id uuid, p_user_id uuid, p_feature text, p_way_in text, p_basis text,
  p_brought_by_user_id uuid, p_at timestamptz)
RETURNS public."BusinessCustomer" LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r public."BusinessCustomer"; at_time timestamptz := coalesce(p_at, now());
BEGIN
  IF p_business_user_id IS NULL OR p_user_id IS NULL OR p_business_user_id = p_user_id THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."BusinessCustomer" WHERE business_user_id = p_business_user_id AND user_id = p_user_id)
    AND EXISTS (SELECT 1 FROM public."UserBlock"
      WHERE (blocker_user_id = p_user_id AND blocked_user_id = p_business_user_id)
         OR (blocker_user_id = p_business_user_id AND blocked_user_id = p_user_id)) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public."BusinessCustomer" (business_user_id, user_id, first_met_at, first_feature, first_way_in,
    first_basis, brought_by_user_id, last_activity_at, last_feature)
  VALUES (p_business_user_id, p_user_id, at_time, p_feature, p_way_in, coalesce(p_basis, 'own'),
    p_brought_by_user_id, at_time, p_feature)
  ON CONFLICT (business_user_id, user_id) DO UPDATE SET
    last_activity_at = greatest(public."BusinessCustomer".last_activity_at, EXCLUDED.last_activity_at),
    last_feature = CASE WHEN EXCLUDED.last_activity_at >= public."BusinessCustomer".last_activity_at
      THEN EXCLUDED.last_feature ELSE public."BusinessCustomer".last_feature END,
    updated_at = now();
  r := public.recount_business_customer(p_business_user_id, p_user_id);
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.recount_business_customer(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_business_contact(uuid, uuid, text, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recount_business_customer(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_business_contact(uuid, uuid, text, text, text, uuid, timestamptz) TO service_role;

COMMIT;
