-- Backwards compatible: yes. Data only: renames the curator account (the account that posts the seeded local
-- headlines on Today's "Around you") from "Pantopus Local" to "Pantopus". No table, column, function, trigger,
-- policy or grant changes.
--
-- Only a curator row still carrying the old default name changes, so a name set by hand is kept. The username
-- (pantopus_local) and the sign-in email are unchanged. Running it twice changes nothing the second time.
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public."User"
SET name = 'Pantopus'
WHERE account_type = 'curator'
  AND name = 'Pantopus Local';

COMMIT;
