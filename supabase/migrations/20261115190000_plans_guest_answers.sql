-- Backwards compatible: yes. Added columns with defaults or nullable, checks widened so that every existing row still
-- passes, two checks added that every existing row passes (no plan has an open link or more than 30 spots yet, and no
-- invitation has a guest's answer), one feature flag that starts off and five funnel events. Deployed apps and the
-- current server never write the new columns or values, and the server leaves them out of every answer to an app that
-- doesn't send `guests=1`.
--
-- Plans for the holidays, step H1 (the founder's go on 2026-11-15; docs/product/plans-holidays/03-build-contract.md,
-- sections 4 to 6): a guest answers an invitation in a browser with no account, a private plan has room for up to 100,
-- and an answer counts adults and kids.
--
--   Plan.kids_welcome           guests say how many adults and how many kids.
--   Plan.open_invite_token      the open link's token, kept as given so the host can share the link again (K2). It
--                               lets someone answer; it never reads anything private. Null: no open link.
--   Plan.open_invite_ok_first   the host says yes to each answer from the open link before it sees anything private.
--   PlanInvite.guest_*          a guest without an account, saved on their invitation row (K1): the name they typed,
--                               adults and kids.
--   PlanInvite.guest_key_hashes the sha256 of each of the guest's keys (K3): one made when they answer and one for each
--                               email that carries their link. None replaces another; at most 6 (a seventh drops the
--                               oldest). Only a key reads the private parts, and all of them stop together when the
--                               host removes the guest.
--   PlanInvite.address_sent_at  when the email with the guest's link went.
--   PlanInvite.reminded_at      the one reminder (K6).
--   PlanInvite.changed_at       the plan's time or place changed after the guest was in ('time', 'place' or 'both'
--   PlanInvite.changed_reason   in changed_reason): their page says so, and their one email about a change goes once.
--   PlanInvite.guest_emails     how many emails this guest got for this plan: at most three (6.6).
--   PlanInvite.channel 'open'   a row made when someone answers from the open link.
--   PlanInvite.status 'maybe'   an answer of Maybe, from a guest or an invited account.
--   PlanRequest party_size and kids_count go to 10: a private plan takes bigger groups; the server keeps 4 for a
--                               public plan.
--
-- Deploy this migration before the backend that reads the columns.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS kids_welcome boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_invite_token text,
  ADD COLUMN IF NOT EXISTS open_invite_ok_first boolean NOT NULL DEFAULT false;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_open_invite_token_key;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_open_invite_token_key UNIQUE (open_invite_token);
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_open_invite_token_form;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_open_invite_token_form
  CHECK (open_invite_token IS NULL OR open_invite_token ~ '^[A-Za-z0-9_-]{43}$');

-- The inline check from 20261013060000_nearby_plans.sql, by its generated name: a private plan hosted by a person
-- has room for up to 100; every other plan stays at 30.
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS "Plan_spots_check";
ALTER TABLE public."Plan" ADD CONSTRAINT "Plan_spots_check" CHECK (
  spots BETWEEN 1 AND 30
  OR (audience = 'invited' AND business_user_id IS NULL AND spots BETWEEN 1 AND 100)
);

-- An open link only on a private plan hosted by a person, never a playdate.
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_open_invite_private;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_open_invite_private CHECK (
  open_invite_token IS NULL
  OR (audience = 'invited' AND business_user_id IS NULL AND kind <> 'playdate')
);

ALTER TABLE public."PlanInvite"
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_adults integer,
  ADD COLUMN IF NOT EXISTS guest_kids integer,
  ADD COLUMN IF NOT EXISTS guest_key_hashes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS address_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS changed_reason text,
  ADD COLUMN IF NOT EXISTS guest_emails integer NOT NULL DEFAULT 0;

ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_guest_name_length;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_guest_name_length
  CHECK (guest_name IS NULL OR char_length(guest_name) BETWEEN 1 AND 100);
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_guest_adults_range;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_guest_adults_range
  CHECK (guest_adults IS NULL OR guest_adults BETWEEN 1 AND 10);
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_guest_kids_range;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_guest_kids_range
  CHECK (guest_kids IS NULL OR guest_kids BETWEEN 0 AND 10);
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_guest_key_hashes_count;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_guest_key_hashes_count
  CHECK (cardinality(guest_key_hashes) <= 6);
-- The lookup by one key's hash.
CREATE INDEX IF NOT EXISTS plan_invite_guest_key_hashes_idx ON public."PlanInvite" USING gin (guest_key_hashes);
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_guest_emails_range;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_guest_emails_range CHECK (guest_emails BETWEEN 0 AND 20);
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_changed_reason_check;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_changed_reason_check
  CHECK (changed_reason IS NULL OR changed_reason IN ('time', 'place', 'both'));
-- A guest's answer is a whole: a name with its numbers, on a row no account holds; keys only on such a row.
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_guest_fields;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_guest_fields CHECK (
  (guest_name IS NULL) = (guest_adults IS NULL)
  AND (guest_name IS NULL) = (guest_kids IS NULL)
  AND (guest_name IS NULL OR invitee_user_id IS NULL)
  AND (cardinality(guest_key_hashes) = 0 OR invitee_user_id IS NULL)
);

-- The inline checks from 20261031190000_plan_invites.sql, by their generated names, widened.
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS "PlanInvite_channel_check";
ALTER TABLE public."PlanInvite" ADD CONSTRAINT "PlanInvite_channel_check"
  CHECK (channel IN ('account', 'email', 'link', 'open'));
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS "PlanInvite_status_check";
ALTER TABLE public."PlanInvite" ADD CONSTRAINT "PlanInvite_status_check"
  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'maybe'));
-- An open-link row is a guest's answer with the address they gave; a text invitation a guest answered may keep the
-- address they chose to give.
ALTER TABLE public."PlanInvite" DROP CONSTRAINT IF EXISTS plan_invite_channel_fields;
ALTER TABLE public."PlanInvite" ADD CONSTRAINT plan_invite_channel_fields CHECK (
  (channel = 'account' AND invitee_user_id IS NOT NULL AND email IS NULL AND token_hash IS NULL)
  OR (channel = 'email' AND email IS NOT NULL AND token_hash IS NOT NULL)
  OR (channel = 'link' AND token_hash IS NOT NULL AND (email IS NULL OR guest_name IS NOT NULL))
  OR (channel = 'open' AND email IS NOT NULL AND guest_name IS NOT NULL AND token_hash IS NULL AND invitee_user_id IS NULL)
);

-- Guests who are in, for seats and reminders.
CREATE INDEX IF NOT EXISTS plan_invite_guest_in_idx
  ON public."PlanInvite" (post_id) WHERE guest_name IS NOT NULL AND status = 'accepted';

-- The inline checks from 20261013060000_nearby_plans.sql, by their generated names, widened.
ALTER TABLE public."PlanRequest" DROP CONSTRAINT IF EXISTS "PlanRequest_party_size_check";
ALTER TABLE public."PlanRequest" ADD CONSTRAINT "PlanRequest_party_size_check"
  CHECK (party_size BETWEEN 1 AND 10);
ALTER TABLE public."PlanRequest" DROP CONSTRAINT IF EXISTS "PlanRequest_kids_count_check";
ALTER TABLE public."PlanRequest" ADD CONSTRAINT "PlanRequest_kids_count_check"
  CHECK (kids_count IS NULL OR kids_count BETWEEN 1 AND 10);

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_guest_answers', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (H1): guests answer an invitation in a browser with no account, the open link, adults and kids, Maybe, room for 100 on a private plan. Read for the plan''s host. Needs plans_private and plans_invites. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

-- Widened as 20261031190000_plan_invites.sql did, with the people track's events (H1 to H3).
ALTER TABLE public."FunnelEvent" DROP CONSTRAINT funnelevent_type_check;
ALTER TABLE public."FunnelEvent" ADD CONSTRAINT funnelevent_type_check CHECK (
  event_type IN (
    't0_preview_viewed', 't0_aha_viewed', 't0_share_clicked',
    't0_wall_viewed', 'register_started', 't1_account_created',
    'session_open', 'reminder_sent', 'reminder_action', 'suggestion_decision',
    'plan_viewed', 'plan_created', 'plan_requested', 'plan_accepted',
    'plan_attended', 'plan_hosted_again', 'plan_share_opened',
    'pulse_helpful_marked', 'pulse_follow',
    'plan_invited', 'plan_invite_joined',
    'plan_open_link_made', 'plan_guest_answered', 'plan_guest_let_in', 'plan_bring_claimed', 'plan_occasion_started'
  )
);
COMMIT;
