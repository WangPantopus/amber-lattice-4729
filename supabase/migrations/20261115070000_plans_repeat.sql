-- Backwards compatible: yes. Four added nullable columns, one index and one feature flag. Deployed apps and the
-- current server never write the new columns, and every plan already posted has them empty, which is a plan
-- that doesn't repeat.
--
-- Repeating plans (the founder's go on 2026-11-14): a plan repeats every week on chosen days, every two weeks or
-- every month, until a date or for a number of times. Each date is its own Plan row, posted when the one before
-- it ends (services/plans/planSeries.js), so no existing rule, limit or screen changes.
--
--   Plan.repeat          the pattern, on each date of the series: { freq, weekdays | month_days, until | count,
--                        anchor }. Null: the plan doesn't repeat, or its host stopped it.
--   Plan.series_id       the series' first plan, the same on every date. No foreign key: a date outlives the
--                        first one's deletion.
--   Plan.series_index    which date of the series this is, from 1.
--   Plan.series_next_at  when the date after this one was posted (or found to be past the end): the claim that
--                        makes posting happen once.
--
-- Deploy this migration before the backend that reads the columns.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."Plan"
  ADD COLUMN IF NOT EXISTS repeat jsonb,
  ADD COLUMN IF NOT EXISTS series_id uuid,
  ADD COLUMN IF NOT EXISTS series_index integer,
  ADD COLUMN IF NOT EXISTS series_next_at timestamptz;

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_repeat_shape;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_repeat_shape
  CHECK (repeat IS NULL OR (jsonb_typeof(repeat) = 'object' AND repeat ->> 'freq' IN ('weekly', 'biweekly', 'monthly')));

ALTER TABLE public."Plan" DROP CONSTRAINT IF EXISTS plan_series_index_positive;
ALTER TABLE public."Plan" ADD CONSTRAINT plan_series_index_positive
  CHECK (series_index IS NULL OR series_index >= 1);

-- The Plans tick reads ended repeating plans whose next date isn't posted yet.
CREATE INDEX IF NOT EXISTS plan_series_due_idx
  ON public."Plan" (status) WHERE repeat IS NOT NULL AND series_next_at IS NULL;
CREATE INDEX IF NOT EXISTS plan_series_idx
  ON public."Plan" (series_id) WHERE series_id IS NOT NULL;

INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES
  ('plans_repeat', true, true, ARRAY[]::uuid[],
   'Repeating plans: a host sets a plan to repeat (weekly on chosen days, every two weeks, monthly). On, as Plans is; an off switch for starting new repeats. A series already running keeps posting its dates until its host stops it. Needs the plans flag.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
