-- Backwards compatible: yes. One added nullable column, a check every existing row passes (no plan has a bring list
-- yet), one function only the server calls, and one feature flag that starts off. Deployed apps and the current
-- server never write the column; an app that doesn't know the bring list ignores the card's added `bring`.
--
-- Plans for the holidays, step H2 (the founder's go on 2026-11-15; docs/product/plans-holidays/03-build-contract.md,
-- section 7): the host lists what is needed and guests claim items, in the app or in a browser.
--
--   Plan.bring_list   one JSON value (K4): { rev, guests_can_add, items: [{ id, label, note, by, claim }] }, up to 30
--                     items. Null: no bring list. Never on a business's plan.
--   plan_bring_swap   writes the whole value only if its revision is still the one the server read
--                     (compare-and-set), and says whether it wrote. The server reads again and retries.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS bring_list jsonb;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_bring_list_shape;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_bring_list_shape CHECK (
  bring_list IS NULL
  OR (jsonb_typeof(bring_list) = 'object'
    AND jsonb_typeof(bring_list -> 'items') = 'array'
    AND jsonb_array_length(bring_list -> 'items') <= 30
    AND business_user_id IS NULL)
);

CREATE OR REPLACE FUNCTION public.plan_bring_swap(p_post_id uuid, p_expected_rev integer, p_list jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE "Plan"
     SET bring_list = p_list, updated_at = now()
   WHERE post_id = p_post_id
     AND COALESCE((bring_list ->> 'rev')::integer, 0) = p_expected_rev;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.plan_bring_swap(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_bring_swap(uuid, integer, jsonb) TO service_role;

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_bring_list', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (H2): the bring list. The host lists what is needed; guests claim items in the app or in a browser. Read for the plan''s host. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
