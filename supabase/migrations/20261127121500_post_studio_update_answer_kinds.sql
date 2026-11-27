-- Backwards compatible: yes. Lets the server's own role change a "PostStudio" row after posting, and lets "PostAnswer"
-- hold two more kinds of answer. No column, row, table or app role's access changes, and nothing today's routes read
-- is touched.
--
-- Pulse, reinvented, phase 2 (coord CONTRACT 7c, 7d, 7f; asked of the lead, who approves new storage for the founder):
-- 1. A Studio post's dots and field cards are kept in its PostStudio row, which changes after posting (the author
--    removes a dot; the first tap on a thing keeps its field card). The table was made with SELECT, INSERT and DELETE
--    for service_role only; this adds UPDATE for that same role. Apps still can't read or write it.
-- 2. PostAnswer (one row per person per item on a post) takes `correction` (a field card's "Not right?", one per person
--    per card) and `collect` (Collect into the reader's field guide), beside the five kinds it has. The new check allows
--    every value the old one did, and is added NOT VALID then validated, so the table is never locked for long.
BEGIN;
SET LOCAL lock_timeout = '5s';

GRANT UPDATE ON TABLE public."PostStudio" TO service_role;

ALTER TABLE public."PostAnswer" DROP CONSTRAINT "PostAnswer_kind_check";
ALTER TABLE public."PostAnswer" ADD CONSTRAINT "PostAnswer_kind_check"
  CHECK (kind IN ('poll', 'slider', 'board', 'question', 'guess', 'correction', 'collect')) NOT VALID;
ALTER TABLE public."PostAnswer" VALIDATE CONSTRAINT "PostAnswer_kind_check";

COMMENT ON TABLE public."PostAnswer" IS
  'Pulse, reinvented: one answer per person per playable item on a post (poll, slider, board, question, guess), a field card''s correction, or a collected card. Only the server reads it.';

COMMIT;
