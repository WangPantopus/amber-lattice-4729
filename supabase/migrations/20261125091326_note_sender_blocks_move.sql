-- Backwards compatible: yes. Moves every "block this note's sender" row (UserBlock.reason 'neighbor_message') into
-- "PostMute" as kind 'note_sender_block' (added in 20261125091325_note_sender_blocks.sql, which must run first). No
-- table or column changes. An older server still answers every request; while it serves, it doesn't read the moved
-- rows, so a blocked sender's note could reach the person again until the newer server is live (the deploy applies
-- migrations just before it rolls the server out).
--
-- Each moved row keeps its id, so the blocked list's "anonymous:<id>" handle a person already holds still unblocks.
SET LOCAL lock_timeout = '5s';

-- 1. A person who blocked the note's sender and later blocked that same account by name: the name block found the note
--    block's row and was kept as it (the routes ignore a duplicate), so the row stands for both. It stays in
--    "UserBlock" as the block by name, and the note block is recorded beside it.
WITH named AS (
  UPDATE public."UserBlock" b
  SET reason = NULL
  WHERE b.reason = 'neighbor_message'
    AND EXISTS (
      SELECT 1 FROM public."IdentityAuditLog" l
      WHERE l.action = 'user.blocked'
        AND l.actor_user_id = b.blocker_user_id
        AND l.target_user_id = b.blocked_user_id
        AND l.created_at >= b.created_at
    )
  RETURNING b.blocker_user_id, b.blocked_user_id, b.created_at
)
INSERT INTO public."PostMute" (user_id, muted_entity_type, muted_entity_id, created_at)
SELECT blocker_user_id, 'note_sender_block', blocked_user_id::text, created_at FROM named
ON CONFLICT DO NOTHING;

-- 2. Every other note-sender block leaves "UserBlock".
WITH moved AS (
  DELETE FROM public."UserBlock"
  WHERE reason = 'neighbor_message'
  RETURNING id, blocker_user_id, blocked_user_id, created_at
)
INSERT INTO public."PostMute" (id, user_id, muted_entity_type, muted_entity_id, created_at)
SELECT id, blocker_user_id, 'note_sender_block', blocked_user_id::text, created_at FROM moved
ON CONFLICT DO NOTHING;
