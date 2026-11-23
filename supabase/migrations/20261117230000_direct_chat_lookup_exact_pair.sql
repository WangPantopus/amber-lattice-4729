-- Backwards compatible: yes. Replaces the body of public.get_or_create_direct_chat(uuid, uuid); its signature, result
-- and callers (routes/chats.js POST /direct, routes/businesses.js, routes/gigs.js, services/moments/momentChat.js,
-- socket/chatSocketio.js) are unchanged, and it stays service-only: EXECUTE is revoked from PUBLIC, anon and
-- authenticated again below, as 20261001130000 did. No table, index, trigger, policy or data changes.
--
-- A direct chat is a room for two people. The look-up now returns a direct room only when its members are exactly
-- the two people asked for: a room that has any other member row, active or not, is not their direct chat, and the
-- pair gets a room of their own instead. Everything else is as 20261001130000 left it: the per-pair advisory lock,
-- the refusal of a chat with yourself, the reactivation of the two people's rows in the room found, and the owner and
-- member rows of a new room. The API no longer adds members to a direct room (routes/chats.js, same change).
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(p_user_id_1 uuid, p_user_id_2 uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_room_id UUID;
BEGIN
  -- Prevent creating a chat with yourself
  IF p_user_id_1 = p_user_id_2 THEN
    RAISE EXCEPTION 'Cannot create chat with yourself';
  END IF;

  -- One creator per pair at a time: a concurrent call for the same two people waits here, then finds the room
  -- the first call made. Released when this call's transaction ends.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'direct-chat-create:' || least(p_user_id_1::text, p_user_id_2::text) || ':' || greatest(p_user_id_1::text, p_user_id_2::text),
    0
  ));

  -- Look for the direct chat of exactly these two people: both are members and nobody else is.
  SELECT cp1.room_id INTO v_room_id
  FROM "ChatParticipant" cp1
  JOIN "ChatParticipant" cp2 ON cp1.room_id = cp2.room_id
  JOIN "ChatRoom" r ON r.id = cp1.room_id
  WHERE cp1.user_id = p_user_id_1
    AND cp2.user_id = p_user_id_2
    AND r.type = 'direct'
    AND NOT EXISTS (
      SELECT 1 FROM "ChatParticipant" other
      WHERE other.room_id = cp1.room_id
        AND other.user_id NOT IN (p_user_id_1, p_user_id_2)
    )
  LIMIT 1;

  IF v_room_id IS NOT NULL THEN
    -- Reactivate participants if they left
    UPDATE "ChatParticipant"
    SET is_active = true, left_at = NULL
    WHERE room_id = v_room_id
      AND user_id IN (p_user_id_1, p_user_id_2)
      AND is_active = false;

    RETURN v_room_id;
  END IF;

  -- Create a new direct chat room
  INSERT INTO "ChatRoom" (type)
  VALUES ('direct')
  RETURNING id INTO v_room_id;

  -- Add both participants
  INSERT INTO "ChatParticipant" (room_id, user_id, role, is_active)
  VALUES
    (v_room_id, p_user_id_1, 'owner', true),
    (v_room_id, p_user_id_2, 'member', true);

  RETURN v_room_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_chat(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
