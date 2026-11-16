-- Backwards compatible: yes. One added nullable column, a check every existing row passes (no plan has one yet), the
-- extras' compare-and-set function taught one more column (its body otherwise as before), and one feature flag that
-- starts off. Deployed apps and the current server never write the column; a plan still picking its date reaches only
-- an app that sends `extras=1`.
--
-- Plans for the holidays, the extras: find a date (the founder's go on 2026-11-15 and 2026-11-16;
-- docs/product/plans-holidays/08-extras.md, section 2). The host offers two to five times, everyone invited ticks the
-- ones that work, the host picks one and the people who ticked it are in.
--
--   Plan.date_options  { rev, options: [{ id, starts_at, ends_at }], ticks: { key: [ids] }, numbers: { key: {...} },
--                      answered: { key: when }, picked: null | id }. Null: a plan with a set date. Never on a
--                      business's plan, never on a repeating one.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS date_options jsonb;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_date_options_shape;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_date_options_shape CHECK (
  date_options IS NULL
  OR (jsonb_typeof(date_options) = 'object'
    AND jsonb_typeof(date_options -> 'options') = 'array'
    AND jsonb_array_length(date_options -> 'options') BETWEEN 2 AND 5
    AND business_user_id IS NULL
    AND repeat IS NULL)
);

CREATE OR REPLACE FUNCTION public.plan_extra_swap(p_post_id uuid, p_column text, p_expected_rev integer, p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  written integer;
BEGIN
  IF p_column IS NULL OR p_column NOT IN ('chip_in', 'date_options') THEN
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
VALUES ('plans_find_date', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (extras): find a date. The host offers two to five times, the invited tick what works, the host picks one and those who ticked it are in. Read for the plan''s host. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
