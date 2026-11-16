-- Backwards compatible: yes. Adds six nullable columns and two checks to "Payment", one index, and fills the new
-- columns on rows that already exist. No existing column, check or value changes; every deployed backend and app
-- ignores the new columns.
--
-- The business graph's shared piece 4, the sale and the fee (docs/product/business-graph/02-shared-pieces-contract.md
-- section 5, approved by the founder on November 11), as Plans for the holidays changes it (its contract, section 10.1,
-- accepted November 15): every payment can say what was sold, at which rate and why, and when its payout may go.
--
--   sold_type     what was sold: task, tip, invoice, plan_spot, booking, package, cancellation_fee, plan_bill, plan_tip
--   sold_id       the thing's own id (the invoice, the plan request, the booking)
--   fee_pct       the rate that applied, saved when the payment is made
--   fee_basis     why that rate: 'pantopus' (Pantopus brought the customer, today's rate) or 'own'
--   tip_cents     the part of the amount that is a tip
--   payout_after  the earliest the payout may be sent; null keeps today's 48 hours after the charge
--
-- The fill: an invoice payment from the invoice id in its metadata, a booking from booking_id, a package from its
-- package id, a task, a tip and a cancellation fee from gig_id. Every existing payment was priced at the 'pantopus'
-- basis. fee_pct stays empty on old rows: the rate is not stored anywhere exact. Rows the fill can't place (a Support
-- Train gift, a catalog donation) stay empty. Only the new columns are written, so no payment's terms change; the
-- freeze triggers compare named terms only. The filled rows' updated_at moves to now (the table's own trigger), which
-- only delays the payment-ops "stuck for 10 or 30 minutes" lists by that long, once.
--
-- Deploy this migration before the backend that writes and reads these columns.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Payment"
  ADD COLUMN IF NOT EXISTS sold_type text,
  ADD COLUMN IF NOT EXISTS sold_id uuid,
  ADD COLUMN IF NOT EXISTS fee_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS fee_basis text,
  ADD COLUMN IF NOT EXISTS tip_cents integer,
  ADD COLUMN IF NOT EXISTS payout_after timestamptz;

ALTER TABLE public."Payment" DROP CONSTRAINT IF EXISTS payment_sold_type_check;
ALTER TABLE public."Payment" ADD CONSTRAINT payment_sold_type_check CHECK (sold_type IS NULL OR sold_type IN
  ('task', 'tip', 'invoice', 'plan_spot', 'booking', 'package', 'cancellation_fee', 'plan_bill', 'plan_tip'));
ALTER TABLE public."Payment" DROP CONSTRAINT IF EXISTS payment_sale_fee_fields;
ALTER TABLE public."Payment" ADD CONSTRAINT payment_sale_fee_fields CHECK (
  (fee_basis IS NULL OR fee_basis IN ('pantopus', 'own'))
  AND (fee_pct IS NULL OR fee_pct BETWEEN 0 AND 100)
  AND (tip_cents IS NULL OR tip_cents >= 0));

-- The statement reads a business's sales by the day they were paid.
CREATE INDEX IF NOT EXISTS idx_payment_payee_succeeded ON public."Payment" (payee_id, payment_succeeded_at);

UPDATE public."Payment" SET sold_type = 'invoice', fee_basis = 'pantopus',
  sold_id = CASE WHEN metadata->>'invoice_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (metadata->>'invoice_id')::uuid END
WHERE sold_type IS NULL AND payment_type = 'gig_payment' AND metadata->>'type' = 'invoice_payment';

UPDATE public."Payment" SET sold_type = 'booking', fee_basis = 'pantopus', sold_id = booking_id
WHERE sold_type IS NULL AND payment_type = 'booking_payment';

UPDATE public."Payment" SET sold_type = 'package', fee_basis = 'pantopus',
  sold_id = CASE WHEN metadata->>'package_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (metadata->>'package_id')::uuid END
WHERE sold_type IS NULL AND payment_type = 'package_payment';

UPDATE public."Payment" SET sold_type = 'tip', fee_basis = 'pantopus', sold_id = gig_id
WHERE sold_type IS NULL AND payment_type = 'tip';

UPDATE public."Payment" SET sold_type = 'cancellation_fee', fee_basis = 'pantopus', sold_id = gig_id
WHERE sold_type IS NULL AND payment_type = 'cancellation_fee';

UPDATE public."Payment" SET sold_type = 'task', fee_basis = 'pantopus', sold_id = gig_id
WHERE sold_type IS NULL AND payment_type = 'gig_payment' AND gig_id IS NOT NULL
  AND metadata->>'type' IS DISTINCT FROM 'invoice_payment';

COMMIT;
