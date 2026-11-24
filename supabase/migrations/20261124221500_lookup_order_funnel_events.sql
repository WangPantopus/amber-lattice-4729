-- Backwards compatible: yes. No table, column or index changes; the funnel's type check is widened with three lookup
-- events (every existing row passes). Deployed backends never accept them; the new backend accepts them only after
-- this migration (the release applies migrations first).
--
-- The lookup's new order (LOOKUPORDER, November 24, 2026): three steps of the signed-out lookup are counted. All three
-- are browser or app beacons (POST /api/public/funnel-events), like the other t0_* events: no user, an anonymous id,
-- and meta.layout (v1 | v2, the order the page was drawn in) plus the visitor's ?r= code. Counts only: no address,
-- place or point.
--   t0_record_opened  "See this home's full record" tapped on the lookup
--   t0_ask_opened     the Ask Pantopus row opened
--   t0_end_reached    the closed group at the end of the lookup came into view
BEGIN;
SET LOCAL lock_timeout = '5s';

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
    'plan_tip_paid',
    'card_sent', 'card_taken_back', 'card_page_seen', 'card_code_sent', 'card_claimed', 'card_reply_sent',
    'card_passed_on',
    'around_you_opened',
    't0_record_opened', 't0_ask_opened', 't0_end_reached'
  )
);
COMMIT;
