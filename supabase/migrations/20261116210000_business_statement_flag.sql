-- Backwards compatible: yes. One switch row (off); no table or column changes.
--
-- The business graph's statement (its shared contract 5.4), built by Plans for the holidays B6 (contract 11.5):
-- GET /api/businesses/:businessId/statement?month=YYYY-MM for staff with finance.view, read for the business. No screen
-- reads it in this build.
BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('business_statement', false, false, ARRAY[]::uuid[],
  'The business statement (business graph shared piece 5.4): a month of sales, refunds, Pantopus''s fee, the card fee, tips with their card fee, what deals took off, who brought each customer and the payouts. Read for the business; staff with finance.view. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
