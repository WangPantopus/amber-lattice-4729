-- Backwards compatible: yes. Adds one nullable column to an existing table. No new table, no data change; every
-- existing row reads null (nothing saved), and deployed apps and backends never read it.
--
-- A sender's saved card signature (founder, November 16): the finger signature beside FROM on a Christmas card, kept
-- on their own account when they tick "Keep this signature for my next cards", so their next card on any app starts
-- signed. The same shape a card stores in its private copy: { w: 400, h: 100, strokes: [[x, y, ...], ...] }, at most
-- 2 KB, checked by the backend (holidayCards.cleanSignature) before it is written. MailPreferences is one row a person
-- and its row security already lets only that person read or write it; the backend reads it only for that person's
-- own card screens (GET /api/mailbox/cards).
--
-- Deploy this migration before the backend that reads it.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."MailPreferences" ADD COLUMN IF NOT EXISTS card_signature jsonb;

COMMENT ON COLUMN public."MailPreferences".card_signature IS
  'The person''s saved Christmas card signature ({w,h,strokes}, <= 2 KB), or null. Private to them.';

COMMIT;
