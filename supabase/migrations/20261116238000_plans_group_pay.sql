-- Backwards compatible: yes. Three added nullable columns on PlanRequest, checks every existing row passes (all three
-- are null on every row), two partial indexes, and one feature flag that starts off. Deployed apps and the current
-- server never read or write the columns.
--
-- Plans for the holidays, the extras: one person pays for the group (the founder's go on 2026-11-15 and 2026-11-16;
-- docs/product/plans-holidays/08-extras.md, section 7; contract 10.2 and 10.4). On a business's paid plan an organizer
-- buys several spots in one payment, takes one, and sends one link; the first people to open it are in, paid for.
--
--   PlanRequest.spots_bought        the buyer's spots, all paid in one payment (2 to 100; the server keeps it within
--                                   the plan's room). Null on every other request.
--   PlanRequest.spots_token         the buyer's link's secret, kept as given (as Plan.open_invite_token is). Cleared
--                                   when the link stops: at refund_until, when the buyer gives the spots back, or
--                                   leaves.
--   PlanRequest.paid_by_request_id  on a claimer's request: the buyer's request that paid for the spot.
--
-- No new table. Deploy this migration before the backend that reads the columns.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."PlanRequest"
  ADD COLUMN IF NOT EXISTS spots_bought integer,
  ADD COLUMN IF NOT EXISTS spots_token text,
  ADD COLUMN IF NOT EXISTS paid_by_request_id uuid REFERENCES public."PlanRequest"(id) ON DELETE SET NULL;

ALTER TABLE public."PlanRequest" DROP CONSTRAINT IF EXISTS plan_request_spots_bought_range;
ALTER TABLE public."PlanRequest" ADD CONSTRAINT plan_request_spots_bought_range
  CHECK (spots_bought IS NULL OR spots_bought BETWEEN 2 AND 100);

ALTER TABLE public."PlanRequest" DROP CONSTRAINT IF EXISTS plan_request_spots_token_shape;
ALTER TABLE public."PlanRequest" ADD CONSTRAINT plan_request_spots_token_shape
  CHECK (spots_token IS NULL OR (spots_bought IS NOT NULL AND length(spots_token) BETWEEN 20 AND 200));

ALTER TABLE public."PlanRequest" DROP CONSTRAINT IF EXISTS plan_request_paid_by_other;
ALTER TABLE public."PlanRequest" ADD CONSTRAINT plan_request_paid_by_other
  CHECK (paid_by_request_id IS NULL OR (paid_by_request_id <> id AND spots_bought IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS plan_request_spots_token_key
  ON public."PlanRequest" (spots_token) WHERE spots_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS plan_request_paid_by_idx
  ON public."PlanRequest" (paid_by_request_id) WHERE paid_by_request_id IS NOT NULL;

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_group_pay', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (extras): one person pays for the group. On a business''s paid plan an organizer buys several spots in one payment and sends one link; spots nobody takes are refunded at the refund deadline. Read for the plan''s host (the business). Needs plans_paid. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
