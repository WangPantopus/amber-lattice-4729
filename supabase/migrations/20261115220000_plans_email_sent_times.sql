-- Backwards compatible: yes. One added column with a default, and a check every existing row passes. Deployed apps
-- never read it.
--
-- Plans for the holidays (H1, a follow-up to 20261115190000_plans_guest_answers): every email after an invitation's
-- first one (a guest's You're in, reminder, change or cancellation, their link sent again, and Remind's invitation
-- again) counts against the five emails an address may get a day from every host together (contract 6.6). The row's
-- single time columns can't count several emails of one day, so each such email's time is kept here.
--
--   PlanInvite.email_sent_times   when each email after the invitation's first went, newest last, at most 20.
--
-- Deploy this migration before the backend that writes the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."PlanInvite"
  ADD COLUMN IF NOT EXISTS email_sent_times timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[];

ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_email_sent_times_count;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_email_sent_times_count
  CHECK (cardinality(email_sent_times) <= 20);

COMMIT;
