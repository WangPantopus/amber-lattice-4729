-- Backwards compatible: yes. One added nullable column, a check every existing row passes (no plan has a chip in
-- yet), one function only the server calls, and one feature flag that starts off. Deployed apps and the current
-- server never write the column; an app that doesn't know chip in reads a plan as before (the card carries it only to
-- an app that sends `extras=1`).
--
-- Plans for the holidays, the extras: chip in (the founder's go on 2026-11-15 and 2026-11-16;
-- docs/product/plans-holidays/08-extras.md, sections 1 and 3). The host suggests an amount and gives their own Venmo,
-- PayPal or Cash App link; a guest pays the host there and marks it. No money moves through Pantopus.
--
--   Plan.chip_in      one JSON value: { rev, amount_cents, note, link, paid: { "p:<user id>" | "g:<invite id>": "…" } }.
--                     Null: no chip in. Never on a business's plan.
--   plan_extra_swap   writes one extra's whole value only if its revision is still the one the server read
--                     (compare-and-set), and says whether it wrote, as plan_bring_swap does for the bring list. It
--                     takes the column's name, from a fixed list that later extras' migrations extend.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS chip_in jsonb;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_chip_in_shape;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_chip_in_shape CHECK (
  chip_in IS NULL
  OR (jsonb_typeof(chip_in) = 'object'
    AND jsonb_typeof(chip_in -> 'amount_cents') = 'number'
    AND (chip_in ->> 'amount_cents')::numeric BETWEEN 100 AND 50000
    AND business_user_id IS NULL)
);

CREATE OR REPLACE FUNCTION public.plan_extra_swap(p_post_id uuid, p_column text, p_expected_rev integer, p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  written integer;
BEGIN
  IF p_column IS NULL OR p_column NOT IN ('chip_in') THEN
    RAISE EXCEPTION 'plan_extra_swap: % is not a plan extra', p_column USING ERRCODE = '22023';
  END IF;
  EXECUTE format(
    'UPDATE "Plan" SET %1$I = $1, updated_at = now() WHERE post_id = $2 AND COALESCE((%1$I ->> ''rev'')::integer, 0) = $3',
    p_column)
  USING p_value, p_post_id, p_expected_rev;
  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.plan_extra_swap(uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_extra_swap(uuid, text, integer, jsonb) TO service_role;

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_chip_in', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (extras): chip in. The host suggests an amount and a Venmo, PayPal or Cash App link; guests pay the host there and mark it. No money moves through Pantopus. Read for the plan''s host. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
