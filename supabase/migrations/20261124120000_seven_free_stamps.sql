-- Backwards compatible: yes. No table, column, index, policy or trigger changes; one function is replaced with the same
-- signature, owner, SECURITY DEFINER, search_path and grants: public.mail_stamp_balance(uuid)
-- (20261108010000_christmas_stamp_books), which mail_stamp_purchase and mail_stamp_card_accounting keep calling.
-- Founder approved, November 24, 2026 ("we can do 7 instead of 10"): every account starts with seven free stamps instead
-- of three, for this season's Christmas cards (sending closes by itself when December 31 ends).
--   A new account: its welcome row (welcome:<user>, bucket free) is 7 instead of 3.
--   An account that already has its welcome of 3: one more row, welcome:<user>:7, bucket free, +4, written once the
--   first time its balance is read after this migration. Its free stamps already used stay used (3 used of 3 reads 4,
--   2 used of 3 reads 5). The Stamps wallet lists both rows as "Your free cards" (kind welcome): +3, then +4.
-- Both rows are written under the same per-person lock as before, and each only when it isn't there yet, so two reads
-- at once still give one welcome, and a read no longer tries an insert once the rows are there.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.mail_stamp_balance(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f integer; p integer; w integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('mail-stamps:'||p_user::text,0));
 SELECT delta INTO w FROM "MailStampLedger" WHERE event_key='welcome:'||p_user;
 IF NOT FOUND THEN
  INSERT INTO "MailStampLedger"(user_id,event_key,bucket,delta) VALUES(p_user,'welcome:'||p_user,'free',7) ON CONFLICT(event_key) DO NOTHING;
 ELSIF w<7 AND NOT EXISTS(SELECT FROM "MailStampLedger" WHERE event_key='welcome:'||p_user||':7') THEN
  INSERT INTO "MailStampLedger"(user_id,event_key,bucket,delta) VALUES(p_user,'welcome:'||p_user||':7','free',7-w) ON CONFLICT(event_key) DO NOTHING;
 END IF;
 SELECT COALESCE(sum(delta) FILTER(WHERE bucket='free'),0), COALESCE(sum(delta) FILTER(WHERE bucket='paid'),0) INTO f,p FROM "MailStampLedger" WHERE user_id=p_user;
 RETURN jsonb_build_object('free_remaining',f,'paid_remaining',p,'available',CASE WHEN p<0 THEN 0 ELSE greatest(0,f+p) END);
END $$;
REVOKE ALL ON FUNCTION public.mail_stamp_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_stamp_balance(uuid) TO service_role;

COMMIT;
