-- Backwards compatible: yes. Adds two nullable columns and one partial unique index to "SupportTrainReservation";
-- no other table, function, trigger, policy or grant changes. The deployed backend never reads or writes them.
--
-- A helper who signs up for a Support Train by email, without an account, gives an address nobody has checked.
-- guest_confirm_token_hash holds the hash of the link in their signup email, and guest_email_confirmed_at the time
-- they first opened it. Until then the emails to that address use fixed wording; after it the reminders read as
-- they always have (the helper's name, the train's title, what they are bringing).
--
-- Signups made before this change are marked confirmed at the time they were made, so the reminders already
-- promised to those helpers keep reading as they do today.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public."SupportTrainReservation"
  ADD COLUMN IF NOT EXISTS guest_confirm_token_hash text,
  ADD COLUMN IF NOT EXISTS guest_email_confirmed_at timestamptz;

UPDATE public."SupportTrainReservation"
SET guest_email_confirmed_at = created_at
WHERE user_id IS NULL
  AND guest_email IS NOT NULL
  AND guest_email_confirmed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_train_reservation_guest_confirm
  ON public."SupportTrainReservation" (guest_confirm_token_hash)
  WHERE guest_confirm_token_hash IS NOT NULL;

COMMIT;
