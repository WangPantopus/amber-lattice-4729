-- Backwards compatible: yes. No table, column or index changes; the funnel's type check is widened with seven card
-- events (every existing row passes). Deployed backends never write them; the new backend writes them only after this
-- migration (the release applies migrations first).
--
-- December card push, piece B (November 24, 2026): the Christmas card loop is counted. All seven are recorded by the
-- server (routes/mailbox.js), never posted by a browser or an app, and carry counts only: no name, address, note,
-- picture, or id of a card or of the person it went to.
--   card_sent        a card stored by POST /cards or /cards/batch (user: the sender; meta via, list_size, stamp, travels)
--   card_taken_back  the sender took it back (meta via)
--   card_page_seen   a card's link page was read, signed out (no user; meta via, sealed; link-preview robots count too)
--   card_code_sent   a sign-in code went out from a card's page (no user; meta via)
--   card_claimed     someone took a card by email or link (user: the claimer; meta via, new_account, after)
--   card_reply_sent  the person a card went to wrote back (user: the replier)
--   card_passed_on   a travelling card was passed on (user: the passer; meta to 1 or 2, via)
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
    'card_passed_on'
  )
);
COMMIT;
