-- Backwards compatible: yes. One added nullable column, a check every existing row passes (no plan has photos yet), the
-- extras' compare-and-set function taught one more column (its body otherwise as before), and one feature flag that
-- starts off. Deployed apps and the current server never read or write the column.
--
-- Plans for the holidays, the extras: photos afterwards (the founder's go on 2026-11-15 and 2026-11-16;
-- docs/product/plans-holidays/08-extras.md, section 5). After a plan ends the people who came keep its photos on the
-- plan, in the private bucket Moments use (never at a public address), read through links signed for minutes.
--
--   Plan.photos   { rev, items: [{ id, by, key, thumb_key, w, h, at }], notice_sent_at }, at most 200 items. The keys
--                 name files in the private bucket; no address of a file is stored. Never on a business's plan.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS photos jsonb;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_photos_shape;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_photos_shape CHECK (
  photos IS NULL
  OR (jsonb_typeof(photos) = 'object'
    AND jsonb_typeof(photos -> 'items') = 'array'
    AND jsonb_array_length(photos -> 'items') <= 200
    AND business_user_id IS NULL)
);

CREATE OR REPLACE FUNCTION public.plan_extra_swap(p_post_id uuid, p_column text, p_expected_rev integer, p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  written integer;
BEGIN
  IF p_column IS NULL OR p_column NOT IN ('chip_in', 'date_options', 'gift', 'photos') THEN
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
VALUES ('plans_photos', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (extras): photos afterwards. The people who came keep a plan''s photos on it, in the private Moments bucket. Off wherever no private bucket is set. Read for the plan''s host. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
