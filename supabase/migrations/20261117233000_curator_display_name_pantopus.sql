-- Backwards compatible: yes. Data only: renames the curator account (the account that posts the seeded local
-- headlines on Today's "Around you") to "Pantopus". No table, column, function, trigger, policy or grant changes.
--
-- Posts show their author's Local Profile name before the account name, so both are set:
--   production: Local Profile "Pantopus Local" (account name was already "Pantopus")
--   staging:    Local Profile and account "Pantopus Staging Local"
-- Only the curator account changes, and only while it still carries one of those old names, so a name set by hand is
-- kept. The handle and username (pantopus_local) and the sign-in email are unchanged. Running it twice changes
-- nothing the second time.
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public."LocalProfile" lp
SET display_name = 'Pantopus',
    updated_at = now()
FROM public."User" u
WHERE u.id = lp.user_id
  AND u.account_type = 'curator'
  AND lp.display_name IN ('Pantopus Local', 'Pantopus Staging Local');

UPDATE public."User"
SET name = 'Pantopus'
WHERE account_type = 'curator'
  AND name IN ('Pantopus Local', 'Pantopus Staging Local');

COMMIT;
