-- Backwards compatible: yes. Widens one check and adds one partial unique index. No column, no table, no data change;
-- every existing row passes the wider check. Deployed apps never read the change.
--
-- Plans for the holidays (contract 6.9, the founder's go on November 15): a person who has the app answers the plan's
-- open link as themselves, and a browser answer follows its verified email into the app.
--
--   - Claiming the open link in the app makes an invitation row with channel 'open' that names the account and
--     carries no email.
--   - A browser answer whose address is an account's verified email becomes that account's: the row names the account,
--     keeps the address (one answer an address a plan) and drops the guest's name. That holds for a text invitation's
--     row answered in a browser too.
--
--   plan_invite_channel_fields         gains those shapes for 'open' and 'link' rows
--   plan_invite_open_one_per_account   one live open-link invitation an account a plan (two claims at once make one)
--
-- Deploy this migration before the backend that writes such rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_channel_fields;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_channel_fields CHECK (
  (channel = 'account' AND invitee_user_id IS NOT NULL AND email IS NULL AND token_hash IS NULL)
  OR (channel = 'email' AND email IS NOT NULL AND token_hash IS NOT NULL)
  OR (channel = 'link' AND token_hash IS NOT NULL AND (email IS NULL OR guest_name IS NOT NULL OR invitee_user_id IS NOT NULL))
  OR (channel = 'open' AND token_hash IS NULL AND (
    (email IS NOT NULL AND guest_name IS NOT NULL AND invitee_user_id IS NULL)
    OR (invitee_user_id IS NOT NULL AND guest_name IS NULL)
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_invite_open_one_per_account ON public."PlanInvite" (post_id, invitee_user_id)
  WHERE channel = 'open' AND invitee_user_id IS NOT NULL AND status <> 'cancelled';

COMMIT;
