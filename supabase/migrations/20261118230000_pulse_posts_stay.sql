-- Backwards compatible: yes. Data only: no table, column, function, trigger, policy or grant changes.
--
-- Pulse posts stay (founder, 2026-11-18): Local Update, Recommend, Local Win (neighborhood_win), Visitor Guide and the
-- plain kinds (general, personal_update) stay until their author removes them. The archive job and the restore route
-- now leave these kinds without an end time (backend/services/pulse/lifecycle.js STAYING_POST_TYPES).
--
-- The only way such a post got an end time (expires_at) was being restored from My posts, which gave it one more
-- window. This clears that end time on the ones still up, so they stay too. Posts that already ended stay ended: an
-- archived post is not touched. Running it twice changes nothing the second time.
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public."Post"
SET expires_at = NULL
WHERE archived_at IS NULL
  AND expires_at IS NOT NULL
  AND is_story IS NOT TRUE
  AND (post_type IS NULL
       OR post_type IN ('local_update', 'recommendation', 'neighborhood_win', 'visitor_guide', 'general', 'personal_update'));

COMMIT;
