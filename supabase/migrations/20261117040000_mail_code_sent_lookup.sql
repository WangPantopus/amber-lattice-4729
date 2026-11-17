-- Backwards compatible: yes. One partial index on AuthSecurityEvent; no table or column changes, and nothing reads it
-- until the backend that does (it works without the index, only slower).
--
-- The card link page's one-time code (backend/services/mailClaimCode.js) records each code sent as an AuthSecurityEvent
-- row of type 'mail_code_sent', whose meta.to is a keyed hash of the address (never the address). Each try finds the
-- newest such row by that hash to count the code's tries, so this index keeps that lookup to the few rows it needs.
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS authsecurityevent_mail_code_sent_to_idx
  ON public."AuthSecurityEvent" ((meta ->> 'to'), id DESC)
  WHERE type = 'mail_code_sent';
