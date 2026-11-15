-- Backwards compatible: yes. No table, column, index or policy changes: one new trigger function and one new BEFORE
-- INSERT trigger on Mail. Mail that isn't a Christmas card to a person is untouched, and so is every card already
-- stored (nothing is checked or changed in existing rows). A backend from before this change answers a refused second
-- card as "couldn't send your card just now" (503) instead of the new sentence; nothing is stored either way.
--
-- One Christmas card from a sender to the same person for one morning (the same delivered_at). The server checks this
-- before it stores a card (routes/mailbox.js cardForSameMorning), but several sends at once could all pass that check
-- before any of them was stored, so with digital stamps one sender's 50 cards in 24 hours could still land in one
-- mailbox. The rule is decided here, under the lock a personal send already takes for its sender and recipient
-- (lock_personal_mail_pair, 20261103053000), so sends at once are decided one after another. A card taken back no
-- longer has a recipient and doesn't count; a retry of the same send (the same row id) is left to the primary key.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.admit_one_card_per_morning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.sender_user_id IS NULL OR NEW.recipient_user_id IS NULL OR NEW.delivered_at IS NULL
    OR NEW.tags IS NULL OR NOT ('holiday_card' = ANY (NEW.tags)) THEN
    RETURN NEW;
  END IF;
  PERFORM public.lock_personal_mail_pair(NEW.sender_user_id, NEW.recipient_user_id);
  IF EXISTS (SELECT 1 FROM public."Mail" m
    WHERE m.recipient_user_id = NEW.recipient_user_id AND m.delivered_at = NEW.delivered_at AND m.deleted_at IS NULL
      AND m.sender_user_id = NEW.sender_user_id AND 'holiday_card' = ANY (m.tags) AND m.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'CARD_SAME_MORNING' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.admit_one_card_per_morning() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER admit_one_card_per_morning
BEFORE INSERT ON public."Mail"
FOR EACH ROW EXECUTE FUNCTION public.admit_one_card_per_morning();

COMMIT;
