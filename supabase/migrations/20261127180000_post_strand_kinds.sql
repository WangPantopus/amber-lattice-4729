-- Backwards compatible: yes. Widens one check on a table this build added (PostStrand, 20261127170000) that no client
-- role can read; no other table, column, function, policy or row changes. Approved by LEAD-3 for the founder.
--
-- Pulse, reinvented, phase 3 (coord CONTRACT 8e, 8f): two more kinds of strand. `retake`: someone added a frame to your
-- Retake; `passed`: someone carried your post on. Told to the first person only, as `went` is.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."PostStrand" DROP CONSTRAINT "PostStrand_kind_check";
ALTER TABLE public."PostStrand" ADD CONSTRAINT "PostStrand_kind_check" CHECK (kind IN ('went', 'retake', 'passed'));

COMMIT;
