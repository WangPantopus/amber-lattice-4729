-- Backwards compatible: yes. Two added nullable columns, a check every existing row passes (no plan has one yet), two
-- functions only the server calls, the extras' compare-and-set function taught one more column (its body otherwise as
-- before), and one feature flag that starts off. Deployed apps and the current server never read or write them.
--
-- Plans for the holidays, the extras: gift exchange (the founder's go on 2026-11-15 and 2026-11-16;
-- docs/product/plans-holidays/08-extras.md, section 4). People who are in may join; on the draw each gets one name;
-- nobody sees who drew whom, not the host and not Pantopus's screens.
--
--   Plan.gift         { rev, budget_cents, draw_at, state: 'open' | 'drawn', people: [{ who, wish, at }], … }.
--   Plan.gift_pairs   { "<giver key>": "<receiver key>" }, written only by plan_gift_draw. The server never selects
--                     it; plan_gift_mine answers one person's own receiver, for that person's own card.
--
-- Deploy this migration before the backend that reads the columns.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS gift jsonb,
  ADD COLUMN IF NOT EXISTS gift_pairs jsonb;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_gift_shape;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_gift_shape CHECK (
  (gift IS NULL AND gift_pairs IS NULL)
  OR (gift IS NOT NULL
    AND jsonb_typeof(gift) = 'object'
    AND jsonb_typeof(gift -> 'people') = 'array'
    AND gift ->> 'state' IN ('open', 'drawn')
    AND (gift_pairs IS NULL OR jsonb_typeof(gift_pairs) = 'object')
    AND business_user_id IS NULL)
);

-- The draw (and calling it off): the gift and its pairs in one write, only if the gift's revision is still the one read.
CREATE OR REPLACE FUNCTION public.plan_gift_draw(p_post_id uuid, p_expected_rev integer, p_gift jsonb, p_pairs jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE "Plan"
     SET gift = p_gift, gift_pairs = p_pairs, updated_at = now()
   WHERE post_id = p_post_id
     AND COALESCE((gift ->> 'rev')::integer, 0) = p_expected_rev;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.plan_gift_draw(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_gift_draw(uuid, integer, jsonb, jsonb) TO service_role;

-- One person's own receiver: the only read of gift_pairs.
CREATE OR REPLACE FUNCTION public.plan_gift_mine(p_post_id uuid, p_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gift_pairs ->> p_key FROM "Plan" WHERE post_id = p_post_id AND gift ->> 'state' = 'drawn';
$$;
REVOKE ALL ON FUNCTION public.plan_gift_mine(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_gift_mine(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.plan_extra_swap(p_post_id uuid, p_column text, p_expected_rev integer, p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  written integer;
BEGIN
  IF p_column IS NULL OR p_column NOT IN ('chip_in', 'date_options', 'gift') THEN
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
VALUES ('plans_gift_exchange', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (extras): gift exchange. People who are in join; each draws one name; nobody sees who drew whom. Read for the plan''s host. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
