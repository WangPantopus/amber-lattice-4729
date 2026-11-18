-- Backwards compatible: yes. Added nullable or defaulted columns, two checks that every existing row meets, one switch
-- row (off). Deployed code never reads the new columns.
--
-- Plans for the holidays (B5, contract 11.1): the bill at the place. A check is a BusinessInvoice tied to a plan and a
-- guest's place in it; the guest pays it in the app with the plan's deal and a tip, and it never shows as an ordinary
-- invoice (Wallet's received invoices, a bill in Mail) and can't be paid through the invoice routes.
--
--   BusinessInvoice.plan_post_id     the plan (null: an ordinary invoice)
--   BusinessInvoice.plan_request_id  the guest's place in it
--   BusinessInvoice.no_deal_cents    the part of the amount the deal does not cover (K7: alcohol), 0 by default
--   BusinessInvoice.discount_cents   what the deal took off, written when the check is paid
--   BusinessInvoice.tip_cents        the tip, written when the check is paid
--   BusinessInvoice.started_by       'business' (staff sent it) or 'guest' (the guest typed their own total)
--   Plan.pay_here                    guests can pay their bill here (needs a business)
--   Plan.tips_on                     the check asks for a tip (needs a business)
--   FeatureFlag plans_pay_here       off until the founder turns it on (gate: the accountant's answer on sales tax)
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."BusinessInvoice"
  ADD COLUMN IF NOT EXISTS plan_post_id uuid REFERENCES public."Post"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_request_id uuid REFERENCES public."PlanRequest"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_deal_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_by text;

ALTER TABLE public."BusinessInvoice" DROP CONSTRAINT IF EXISTS business_invoice_check_fields;
ALTER TABLE public."BusinessInvoice" ADD CONSTRAINT business_invoice_check_fields CHECK (
  no_deal_cents >= 0 AND discount_cents >= 0 AND tip_cents >= 0
  AND (started_by IS NULL OR started_by IN ('business', 'guest'))
  AND (plan_post_id IS NOT NULL OR (plan_request_id IS NULL AND started_by IS NULL AND no_deal_cents = 0 AND discount_cents = 0 AND tip_cents = 0))
);

CREATE INDEX IF NOT EXISTS business_invoice_plan_idx ON public."BusinessInvoice" (plan_post_id, plan_request_id) WHERE plan_post_id IS NOT NULL;

COMMENT ON COLUMN public."BusinessInvoice".plan_post_id IS 'Plans for the holidays (B5): the plan this check belongs to; null for an ordinary invoice.';
COMMENT ON COLUMN public."BusinessInvoice".plan_request_id IS 'B5: the guest''s place in the plan.';
COMMENT ON COLUMN public."BusinessInvoice".no_deal_cents IS 'B5: the part of the amount the deal does not cover (K7).';
COMMENT ON COLUMN public."BusinessInvoice".discount_cents IS 'B5: what the plan''s deal took off, written when paid.';
COMMENT ON COLUMN public."BusinessInvoice".tip_cents IS 'B5: the tip, written when paid.';
COMMENT ON COLUMN public."BusinessInvoice".started_by IS 'B5: business (staff sent it) or guest (the guest typed their total).';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS pay_here boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tips_on boolean NOT NULL DEFAULT false;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_pay_here_needs_business;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_pay_here_needs_business CHECK ((NOT pay_here AND NOT tips_on) OR business_user_id IS NOT NULL);

COMMENT ON COLUMN public."Plan".pay_here IS 'Plans for the holidays (B5): guests can pay their bill at the place in the app. A business''s plan only.';
COMMENT ON COLUMN public."Plan".tips_on IS 'B5: the check asks for a tip. A business''s plan only.';

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_pay_here', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (B5, B6): a business''s guests pay their bill at the place in the app (a check with the plan''s deal and a tip), and tip after a paid plan. Read for the plan''s host (the business). Needs plans_business. Off until the founder turns it on, after the accountant''s answer on Washington sales tax.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
