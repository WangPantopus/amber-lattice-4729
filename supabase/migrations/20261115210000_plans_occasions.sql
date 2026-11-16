-- Backwards compatible: yes. One added nullable column, a check every existing row passes (no plan has an occasion
-- yet), and one feature flag that starts off. An app that doesn't know occasions reads such a plan as its kind (a
-- Thanksgiving dinner is a Food & drinks plan) and ignores the card's added `occasion`.
--
-- Plans for the holidays, step H3 (the founder's go on 2026-11-15; docs/product/plans-holidays/03-build-contract.md,
-- section 8): an occasion starts a plan with the usual things filled in. Occasions are starts, not kinds (H1).
--
--   Plan.occasion   the occasion's key from the server's fixed list (services/plans/planOccasions.js), as
--                   plan_label_form shapes a label. Null on an ordinary plan.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS occasion text;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_occasion_form;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_occasion_form
  CHECK (occasion IS NULL OR occasion ~ '^[a-z][a-z_]{0,39}$');

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_occasions', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (H3): occasions (Thanksgiving dinner, Friendsgiving, Holiday party, Gift exchange, New Year''s Eve, Birthday) start a plan with the usual things filled in; the server lists the ones in season. Needs plans_kinds. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
