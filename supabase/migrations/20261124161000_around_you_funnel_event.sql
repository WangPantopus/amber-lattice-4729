-- Backwards compatible: yes. No table, column or index changes; the funnel's type check is widened with one Around you
-- event (every existing row passes). Deployed backends never write it; the new backend writes it only after this
-- migration (the release applies migrations first).
--
-- Around you, the everywhere layer (AROUNDFEEDS piece 2, November 24, 2026): opens of Around you are counted.
--   around_you_opened  recorded by the server (services/aroundYouService.js) on a read that returns sections, at most
--                      once an hour per person (user: the reader; meta sections, rows, hand_made: whether the region
--                      was set up by hand). Counts only: no place, point, region or item.
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
    'around_you_opened'
  )
);
COMMIT;
