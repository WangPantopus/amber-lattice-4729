-- Backwards compatible: yes. Replaces the body of list_support_trains_nearby (GET /api/activities/support-trains/nearby)
-- and adds one helper function. The list's signature, return columns, owner, grants and search_path stay, so the
-- running API reads the same columns. No table, index, trigger, policy or data changes.
--
-- 1. A train with a typed or GPS delivery address is listed too (A7). Before, only a train at a Home was: the list
--    joined Home and left the rest out. Such a train is placed, filtered and measured from the point its page shows
--    people who are not helping yet (routes/supportTrains.js buildCoarseLocation): the delivery point rounded to two
--    decimals, as a Home's point already was. Its city and state are the ones its page shows.
-- 2. Only dates from today on count, today being the train's own (its Activity's zone): a train with no date today or
--    later is left out, and open_slots_count counts open dates from today on only (A8). Removed dates never counted.
--
-- support_train_local_today(zone) answers today's date in a zone, or in UTC when the zone is empty or unknown, so one
-- bad zone can't fail the whole list.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.support_train_local_today(p_timezone text) RETURNS date
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_timezone IS NULL OR p_timezone = '' THEN
    RETURN (now() AT TIME ZONE 'UTC')::date;
  END IF;
  RETURN (now() AT TIME ZONE p_timezone)::date;
EXCEPTION WHEN others THEN
  RETURN (now() AT TIME ZONE 'UTC')::date;
END;
$$;

-- The same callers as the list that uses it.
REVOKE ALL ON FUNCTION public.support_train_local_today(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_train_local_today(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_support_trains_nearby(p_lat double precision, p_lng double precision, p_radius_meters double precision, p_limit integer DEFAULT 40) RETURNS TABLE(support_train_id uuid, activity_id uuid, title text, status text, published_at timestamp with time zone, distance_meters double precision, open_slots_count bigint, city text, state text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH live AS (
    SELECT
      st.id AS st_id,
      st.activity_id,
      st.status AS st_status,
      st.published_at,
      a.title,
      a.timezone,
      COALESCE(st.recipient_home_id, a.home_id) AS resolved_home_id,
      st.delivery_lat,
      st.delivery_lng,
      st.delivery_city,
      st.delivery_state
    FROM public."SupportTrain" st
    INNER JOIN public."Activity" a ON a.id = st.activity_id
    WHERE st.status = ANY (ARRAY['published'::text, 'active'::text])
      AND a.activity_type = 'support_train'
      AND a.status = ANY (ARRAY['published'::text, 'active'::text])
      AND a.visibility = ANY (ARRAY['nearby'::text, 'public'::text])
      AND (COALESCE(st.recipient_home_id, a.home_id) IS NOT NULL
        OR (st.delivery_lat IS NOT NULL AND st.delivery_lng IS NOT NULL))
  ),
  -- The point the train's page shows to people who are not helping yet (routes/supportTrains.js buildCoarseLocation):
  -- a Home's map centre, else its stored point; a train without a Home, its delivery point. Each coordinate is
  -- rounded to two decimals.
  with_shown AS (
    SELECT
      l.st_id,
      l.activity_id,
      l.st_status,
      l.published_at,
      l.title,
      l.timezone,
      CASE WHEN h.id IS NOT NULL THEN h.city ELSE l.delivery_city END AS city,
      CASE WHEN h.id IS NOT NULL THEN h.state ELSE l.delivery_state END AS state,
      floor((CASE
        WHEN h.id IS NOT NULL AND h.map_center_lat IS NOT NULL AND h.map_center_lng IS NOT NULL THEN h.map_center_lat
        WHEN h.id IS NOT NULL AND h.location IS NOT NULL THEN ST_Y(h.location::geometry)
        WHEN h.id IS NULL THEN l.delivery_lat
      END) * 100 + 0.5) / 100 AS shown_lat,
      floor((CASE
        WHEN h.id IS NOT NULL AND h.map_center_lat IS NOT NULL AND h.map_center_lng IS NOT NULL THEN h.map_center_lng
        WHEN h.id IS NOT NULL AND h.location IS NOT NULL THEN ST_X(h.location::geometry)
        WHEN h.id IS NULL THEN l.delivery_lng
      END) * 100 + 0.5) / 100 AS shown_lng
    FROM live l
    LEFT JOIN public."Home" h ON h.id = l.resolved_home_id
    -- A train naming a Home that is gone is left out, as before.
    WHERE l.resolved_home_id IS NULL OR h.id IS NOT NULL
  ),
  with_distance AS (
    SELECT
      sh.*,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(sh.shown_lng, sh.shown_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      ) AS dist
    FROM with_shown sh
    WHERE sh.shown_lat IS NOT NULL AND sh.shown_lng IS NOT NULL
  ),
  -- Today where each train is: one call per zone, not per train.
  zones AS MATERIALIZED (
    SELECT z.timezone, public.support_train_local_today(z.timezone) AS local_today
    FROM (SELECT DISTINCT l.timezone FROM live l) z
  ),
  filtered AS (
    SELECT wd.*, zn.local_today
    FROM with_distance wd
    INNER JOIN zones zn ON zn.timezone IS NOT DISTINCT FROM wd.timezone
    -- Never a search narrower than about a mile.
    WHERE wd.dist <= GREATEST(p_radius_meters, 1609)
      -- A train with no date today or later is over for anyone looking for one to help with. (Its last date, read
      -- from the end of idx_support_train_slot_train_date, one probe a train.)
      AND (
        SELECT max(s.slot_date)
        FROM public."SupportTrainSlot" s
        WHERE s.support_train_id = wd.st_id
          AND s.status <> 'canceled'
      ) >= zn.local_today
  ),
  -- The nearest first; the open dates are counted for the trains listed only.
  nearest AS (
    SELECT f.*
    FROM filtered f
    ORDER BY f.dist ASC, f.published_at DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100)
  ),
  with_slots AS (
    SELECT
      n.st_id,
      n.activity_id,
      n.title,
      n.st_status,
      n.published_at,
      n.dist,
      n.city,
      n.state,
      (
        SELECT COUNT(*)::bigint
        FROM public."SupportTrainSlot" s
        WHERE s.support_train_id = n.st_id
          AND s.slot_date >= n.local_today
          AND s.status = ANY (ARRAY['open'::text, 'full'::text])
          AND (
            SELECT COUNT(*)::integer
            FROM public."SupportTrainReservation" r
            WHERE r.slot_id = s.id
              AND r.status = ANY (ARRAY['reserved'::text, 'delivered'::text, 'confirmed'::text])
          ) < s.capacity
      ) AS open_cnt
    FROM nearest n
  )
  SELECT
    ws.st_id AS support_train_id,
    ws.activity_id,
    ws.title,
    ws.st_status AS status,
    ws.published_at,
    -- To the nearest 100 m.
    (round(ws.dist / 100.0) * 100)::double precision AS distance_meters,
    ws.open_cnt AS open_slots_count,
    ws.city,
    ws.state
  FROM with_slots ws
  ORDER BY ws.dist ASC, ws.published_at DESC NULLS LAST;
$$;

COMMIT;
