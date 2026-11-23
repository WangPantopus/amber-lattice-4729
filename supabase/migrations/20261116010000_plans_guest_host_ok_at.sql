-- Backwards compatible: yes. One added nullable column, no default, no backfill. Deployed apps never read it.
--
-- Plans for the holidays (H1, contract 6.8): when a plan that takes answers moves to the host's home, guests without
-- an account who came by the open link and are in go back to waiting for the host's yes, unless the host already let
-- them in by hand. "Let in before" means the host's own yes and nothing else, so it is recorded here.
--
--   PlanInvite.host_ok_at   when the host let this guest in by hand (POST /api/plans/:id/invites/:inviteId/ok).
--                           Null: the host has not.
--
-- Deploy this migration before the backend that writes the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."PlanInvite"
  ADD COLUMN IF NOT EXISTS host_ok_at timestamptz;

COMMENT ON COLUMN public."PlanInvite".host_ok_at IS
  'When the host let this guest in by hand (contract 6.8). Null: the host has not.';

COMMIT;
