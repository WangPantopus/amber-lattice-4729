-- Backwards compatible: yes. One added nullable column (no existing row has a value; a short-length check every row
-- passes) and one feature flag that starts off. Deployed apps and the current server never write the column; an app
-- that doesn't know it reads an invitation row as before.
--
-- Plans for the holidays, the extras: the same people again (the founder's go on 2026-11-15 and 2026-11-16;
-- docs/product/plans-holidays/08-extras.md, section 6). The host invites everyone who came to one of their past
-- plans in one tap: a person on Pantopus by account, a guest who gave an email by email.
--
--   PlanInvite.known_name   an email invitation made this way keeps the guest's name from the earlier plan. The host's
--                           list shows that name and never the address, which the host never typed.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."PlanInvite"
  ADD COLUMN IF NOT EXISTS known_name text;

ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_known_name_length;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_known_name_length CHECK (
  known_name IS NULL OR (char_length(known_name) BETWEEN 1 AND 100 AND channel = 'email')
);

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_same_people', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (extras): the same people again. The host invites everyone who came to one of their past plans, on Pantopus or by email, in one tap. Read for the host. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
