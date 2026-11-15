-- Backwards compatible: yes. One added nullable column. Deployed apps and the current server never write or
-- read it, and every post already written has it empty.
--
-- "Repost with your words" (the founder's go on 2026-11-14): a person writes a post of their own about
-- another post, which shows under their words as a card.
--
--   Post.quoted_post_id  the post this one is about; null on every other post. Not a foreign key on purpose:
--                        when the original is deleted, taken back by its author or closed to a reader, the
--                        server draws "This post isn't available" in its place and the person's words stay.
--
-- Deploy this migration before the backend that reads the column.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Post"
  ADD COLUMN IF NOT EXISTS quoted_post_id uuid;

COMMIT;
