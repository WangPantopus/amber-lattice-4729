-- Backwards compatible: yes. Adds the mute kind 'note_sender_block' and a trigger on "UserBlock" that turns a row an
-- older server writes for "block this note's sender" (reason 'neighbor_message') into a row of that kind instead. The
-- older server's request still succeeds; nothing else changes for any other block. The rows already written move in
-- 20261125091326_note_sender_blocks_move.sql, which runs after this one (a new enum value can't be used in the
-- transaction that adds it).
--
-- Why: a note to an address carries no sender name, and "block this sender" was recorded as an ordinary "UserBlock".
-- Everything that reads "UserBlock" (feeds, replies, chats, follows, Moments, listings, and here in the database the
-- mail and card admission and withdrawal) then hid or refused the sender under their own name, so the person who
-- blocked could work out who sent the note. A note-sender block now stops that sender's notes and nothing else
-- (backend/services/blockService.js, NOTE_SENDER_BLOCK), the way made-up names keep their blocks apart
-- (20261125083000_pen_names.sql, section 7).
SET LOCAL lock_timeout = '5s';

ALTER TYPE public.muted_entity_type ADD VALUE IF NOT EXISTS 'note_sender_block';

-- Runs before the other BEFORE INSERT triggers on "UserBlock" (they fire in name order) and skips the row, so a
-- note-sender block never withdraws mail or takes part in any block check.
CREATE FUNCTION public.note_sender_block_kept_apart()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.reason IS DISTINCT FROM 'neighbor_message' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public."PostMute" (user_id, muted_entity_type, muted_entity_id)
  VALUES (NEW.blocker_user_id, 'note_sender_block', NEW.blocked_user_id::text)
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.note_sender_block_kept_apart() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER note_sender_block_kept_apart
BEFORE INSERT ON public."UserBlock"
FOR EACH ROW EXECUTE FUNCTION public.note_sender_block_kept_apart();
