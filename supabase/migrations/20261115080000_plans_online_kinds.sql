-- Backwards compatible: yes. One added nullable column, four checks widened so that every existing row still
-- passes, two checks added that every existing row passes (no plan is online yet, so online_link is empty on
-- all of them), and two feature flags. Deployed apps and the current server never write the new column, the new
-- place kind or the new kinds, and the server leaves such a plan out of every answer to an app that doesn't say
-- it can draw one (`more=1`).
--
-- Online plans and four new kinds (the founder's go on 2026-11-14):
--
--   Plan.place_kind     'online' joins 'public' and 'home': a plan people join with a link (a video call, a game
--                       server). Its place point is the host's own area (their home, else where they were when
--                       they posted), so a public online plan is listed for people near the host; a private one
--                       posted with neither stores 0, 0 and is in no list or map box.
--   Plan.online_link    the https link people join with, set exactly when the plan is online. Only the host and
--                       the people in read it, never a card, a notice or the share page.
--   Plan.kind           food_drinks, game_night, outdoors and something_else join the five kinds.
--
-- A business's plan stays at the business's own address (plan_business_public), so it is never online.
--
-- Deploy this migration before the backend that writes the column and the new values.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS online_link text;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_online_link_length;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_online_link_length
  CHECK (online_link IS NULL OR char_length(online_link) <= 300);

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_online_has_link;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_online_has_link
  CHECK ((place_kind = 'online') = (online_link IS NOT NULL));

-- The inline column check from 20261013060000_nearby_plans.sql, by its generated name.
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS "Plan_place_kind_check";
ALTER TABLE public."Plan" ADD CONSTRAINT "Plan_place_kind_check"
  CHECK (place_kind IN ('public', 'home', 'online'));

-- A study group meets in a public place or online, never at a home (20261017072642_plans_study_group.sql).
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_study_group_public;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_study_group_public
  CHECK (kind <> 'study_group' OR place_kind IN ('public', 'online'));

-- Widened as in 20261017072642_plans_study_group.sql.
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS "Plan_kind_check";
ALTER TABLE public."Plan" ADD CONSTRAINT "Plan_kind_check"
  CHECK (kind IN ('watch_party', 'playdate', 'pickup_game', 'walk_coffee', 'study_group',
    'food_drinks', 'game_night', 'outdoors', 'something_else'));

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES
  ('plans_online', true, true, ARRAY[]::uuid[],
   'Online plans: a host posts a plan people join with a link, shown to people near the host. On, as Plans is; an off switch for posting new online plans (or moving one online). A plan already online stays online either way. Only apps that send more=1 see online plans. Needs the plans flag.'),
  ('plans_kinds', true, true, ARRAY[]::uuid[],
   'Four more plan kinds: food and drinks, game night, outdoors and something else. On, as Plans is; an off switch for posting new plans of these kinds. A plan already posted stays as it is. Only apps that send more=1 see them. Needs the plans flag.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
