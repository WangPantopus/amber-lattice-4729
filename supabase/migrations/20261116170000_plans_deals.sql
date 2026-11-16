-- Backwards compatible: yes. Adds one column to "Plan" and two to "PlanRequest" (nullable), one check, one switch row
-- (off) and widens the funnel's type check. Every existing row passes; deployed apps never read the new columns.
--
-- Plans for the holidays, the business track's B1 (contract section 9, docs/product/plans-holidays/03-build-contract.md):
-- a business's plan can carry one deal. In this step the deal is "something free" (a free appetizer for the table),
-- for everyone who joins or for a group once enough people are in by a deadline. No money moves.
--
--   Plan.deal                  the deal as one JSON value (scope, kind, item, group_size, group_by, if_short, state,
--                              settled_at); null on a plan with none
--   plan_deal_needs_business   only a business's plan carries one (contract rule 2: a person's plan never takes a
--                              price, a deal, a tip or a check)
--   PlanRequest.deal_used_at   when staff marked the guest's "something free" used (it can't be undone)
--   PlanRequest.deal_cents     what a deal took off for this guest (the money kinds, later steps)
--   plans_deals                the switch, read for the plan's host, off until the founder turns it on
--
-- The funnel gains the business track's events at once (contract 15), so later steps add no widening of their own.
--
-- Deploy this migration before the backend that writes these columns.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan" ADD COLUMN IF NOT EXISTS deal jsonb;
ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_deal_needs_business;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_deal_needs_business
  CHECK (deal IS NULL OR (business_user_id IS NOT NULL AND jsonb_typeof(deal) = 'object'));

ALTER TABLE public."PlanRequest"
  ADD COLUMN IF NOT EXISTS deal_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS deal_cents integer;
ALTER TABLE public."PlanRequest" DROP CONSTRAINT IF EXISTS plan_request_deal_cents;
ALTER TABLE public."PlanRequest" ADD CONSTRAINT plan_request_deal_cents CHECK (deal_cents IS NULL OR deal_cents >= 0);

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES ('plans_deals', false, false, ARRAY[]::uuid[],
  'Plans for the holidays (B1): a business''s plan can carry one deal, "something free" for everyone or for a group once enough people are in by a deadline; staff mark it used. Read for the plan''s host (the business). Needs plans_business. Off until the founder turns it on.')
ON CONFLICT (flag_name) DO NOTHING;

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
    'plan_open_link_made', 'plan_guest_answered', 'plan_guest_let_in', 'plan_bring_claimed', 'plan_occasion_started',
    'plan_deal_set', 'plan_deal_unlocked', 'plan_deal_short', 'plan_paid', 'plan_check_sent', 'plan_check_paid',
    'plan_tip_paid'
  )
);
COMMIT;
