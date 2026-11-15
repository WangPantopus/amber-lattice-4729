-- Backwards compatible: yes. One added column with a default, one check widened so that every existing row
-- still passes, and one feature flag. Deployed apps and the current server never write the new column, and
-- every plan already posted reads 'nearby', which is how all of them behave today.
--
-- Private plans (the founder's go on 2026-11-14): a person hosts a plan only the people they invite can see.
--
--   Plan.audience           'nearby': on the map and the list for people nearby, who ask to join (every plan
--                           until now). 'invited': private. Only its host, the people invited and the people
--                           in or waiting can read it, anywhere; the server leaves it out of every list, pin,
--                           suggestion and notice for anyone else, whatever the flag below says.
--   Plan.guests_can_invite  already there for a business's plan ("Bring a friend"). A private plan may set it
--                           too: each person the host invited may invite one more.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'nearby';

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_audience_check;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_audience_check
  CHECK (audience IN ('nearby', 'invited'));

-- A business's plan is never private: it is at the business's own public address.
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_private_is_a_persons;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_private_is_a_persons
  CHECK (audience = 'nearby' OR business_user_id IS NULL);

-- The business-only fields stay empty on a person's plan, except "Bring a friend" on a private one.
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_business_fields;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_business_fields
  CHECK (business_user_id IS NOT NULL
    OR (posted_by_user_id IS NULL AND business_location_id IS NULL AND label IS NULL
      AND (NOT guests_can_invite OR audience = 'invited')));

-- The lists and the map read open public plans; a person's own private plans are read by id.
CREATE INDEX IF NOT EXISTS plan_private_host_idx
  ON public."Plan" (host_user_id, status) WHERE audience = 'invited';

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES
  ('plans_private', true, true, ARRAY[]::uuid[],
   'Private plans: a host posts a plan only the people they invite can see. On, as Plans is; an off switch for posting new private plans. A private plan already posted stays private either way. Needs the plans and plans_invites flags.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
