-- Backwards compatible: yes. Replaces the bodies of list_support_trains_nearby, find_businesses_in_bounds,
-- find_businesses_nearby and find_nearest_activity_center. Their signatures, return columns, owners, grants and
-- search_path settings stay, so the running API and every client read the same columns. No table, index, trigger,
-- policy or data changes.
--
-- Each of these lists now measures from the point the app shows for a place, never from a stored point it does not
-- show (docs/location-privacy-matrix.md):
--
-- 1. list_support_trains_nearby (GET /api/activities/support-trains/nearby). A train's page shows people who are not
--    helping yet its Home's point rounded to two decimals (routes/supportTrains.js buildCoarseLocation). The list
--    now filters and measures from that same rounded point, returns the distance to the nearest 100 m, and never
--    searches a radius under about a mile (1609 m).
--
-- 2. find_businesses_in_bounds (GET /api/businesses/map) and find_businesses_nearby (GET /api/businesses/search). A
--    business page shows a home-based business that keeps its address private (location_type home_based_private
--    without show_exact_location) at its display point, and at no point when it has none
--    (businessAddressService.toPublicBusinessLocation). The map and the search now place, filter and measure such a
--    business by that display point, leave it out when it has none, give its distance to the nearest 100 m and no
--    street line. Every other business is as before. Both still pre-filter on the stored point through its index
--    (idx_bloc_geo), a kilometre wider than asked, so the lists cost what they did.
--
-- 3. find_nearest_activity_center, 'business' branch (the empty-map hint of GET /api/businesses/map). It now
--    answers with the nearest business the map would show (published, primary, active), at the point the map shows.
--    The gig and listing branches are unchanged.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.list_support_trains_nearby(p_lat double precision, p_lng double precision, p_radius_meters double precision, p_limit integer DEFAULT 40) RETURNS TABLE(support_train_id uuid, activity_id uuid, title text, status text, published_at timestamp with time zone, distance_meters double precision, open_slots_count bigint, city text, state text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH home_points AS (
    SELECT
      st.id AS st_id,
      st.activity_id,
      st.status AS st_status,
      st.published_at,
      a.title,
      a.visibility,
      a.status AS act_status,
      COALESCE(st.recipient_home_id, a.home_id) AS resolved_home_id
    FROM public."SupportTrain" st
    INNER JOIN public."Activity" a ON a.id = st.activity_id
    WHERE st.status = ANY (ARRAY['published'::text, 'active'::text])
      AND a.activity_type = 'support_train'
      AND a.status = ANY (ARRAY['published'::text, 'active'::text])
      AND a.visibility = ANY (ARRAY['nearby'::text, 'public'::text])
      AND COALESCE(st.recipient_home_id, a.home_id) IS NOT NULL
  ),
  with_geo AS (
    SELECT
      hp.*,
      h.location,
      h.map_center_lat,
      h.map_center_lng,
      h.city,
      h.state
    FROM home_points hp
    INNER JOIN public."Home" h ON h.id = hp.resolved_home_id
  ),
  -- The Home's point as the train's page shows it to people who are not helping yet (routes/supportTrains.js
  -- buildCoarseLocation): the map centre, else the stored point, each coordinate rounded to two decimals.
  with_shown AS (
    SELECT
      wg.*,
      floor((CASE
        WHEN wg.map_center_lat IS NOT NULL AND wg.map_center_lng IS NOT NULL THEN wg.map_center_lat
        WHEN wg.location IS NOT NULL THEN ST_Y(wg.location::geometry)
      END) * 100 + 0.5) / 100 AS shown_lat,
      floor((CASE
        WHEN wg.map_center_lat IS NOT NULL AND wg.map_center_lng IS NOT NULL THEN wg.map_center_lng
        WHEN wg.location IS NOT NULL THEN ST_X(wg.location::geometry)
      END) * 100 + 0.5) / 100 AS shown_lng
    FROM with_geo wg
  ),
  with_distance AS (
    SELECT
      sh.st_id,
      sh.activity_id,
      sh.title,
      sh.st_status,
      sh.published_at,
      sh.city,
      sh.state,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(sh.shown_lng, sh.shown_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      ) AS dist
    FROM with_shown sh
    WHERE sh.shown_lat IS NOT NULL AND sh.shown_lng IS NOT NULL
  ),
  filtered AS (
    SELECT *
    FROM with_distance wd
    -- Never a search narrower than about a mile.
    WHERE wd.dist <= GREATEST(p_radius_meters, 1609)
  ),
  with_slots AS (
    SELECT
      f.st_id,
      f.activity_id,
      f.title,
      f.st_status,
      f.published_at,
      f.dist,
      f.city,
      f.state,
      (
        SELECT COUNT(*)::bigint
        FROM public."SupportTrainSlot" s
        WHERE s.support_train_id = f.st_id
          AND s.status = ANY (ARRAY['open'::text, 'full'::text])
          AND (
            SELECT COUNT(*)::integer
            FROM public."SupportTrainReservation" r
            WHERE r.slot_id = s.id
              AND r.status = ANY (ARRAY['reserved'::text, 'delivered'::text, 'confirmed'::text])
          ) < s.capacity
      ) AS open_cnt
    FROM filtered f
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
  ORDER BY ws.dist ASC, ws.published_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.find_businesses_in_bounds(p_south double precision, p_west double precision, p_north double precision, p_east double precision, p_categories text[] DEFAULT NULL::text[], p_open_now_only boolean DEFAULT false, p_limit integer DEFAULT 500) RETURNS TABLE(business_user_id uuid, username character varying, name character varying, profile_picture_url text, latitude double precision, longitude double precision, categories text[], business_type text, average_rating numeric, review_count integer, completed_gigs bigint, is_open_now boolean, is_new_business boolean)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_bounds geography;
BEGIN
  -- Build bounding box envelope for spatial query
  v_bounds := ST_SetSRID(
    ST_MakeEnvelope(p_west, p_south, p_east, p_north),
    4326
  )::geography;

  RETURN QUERY
  SELECT
    u.id AS business_user_id,
    u.username,
    u.name,
    u.profile_picture_url,
    ST_Y(pt.shown::geometry) AS latitude,
    ST_X(pt.shown::geometry) AS longitude,
    bp.categories,
    bp.business_type,
    u.average_rating,
    u.review_count,

    -- Completed gigs count (for pin tier: 0=small, 1-9=medium, 10+=large)
    (SELECT COUNT(*) FROM "Gig" g WHERE g.accepted_by = u.id AND g.status = 'completed') AS completed_gigs,

    -- Open-now check (timezone-aware with special hours override)
    public.business_location_open_now(bl.id, bl.timezone) AS is_open_now,

    -- New business flag (< 3 completed gigs AND profile < 30 days old)
    (
      (SELECT COUNT(*) FROM "Gig" g WHERE g.accepted_by = u.id AND g.status = 'completed') < 3
      AND bp.created_at > NOW() - INTERVAL '30 days'
    ) AS is_new_business

  FROM "User" u
  JOIN "BusinessProfile" bp ON bp.business_user_id = u.id
  JOIN "BusinessLocation" bl ON bl.business_user_id = u.id
    AND bl.is_primary = true
    AND bl.is_active = true
  -- The point this location shows to people outside the business (the rule of the business page,
  -- businessAddressService.toPublicBusinessLocation): a home-based business that keeps its address private shows its
  -- display point, and no point at all when it has none.
  CROSS JOIN LATERAL (
    SELECT
      (bl.location_type = 'home_based_private' AND bl.show_exact_location IS NOT TRUE) AS address_private,
      CASE WHEN bl.location_type = 'home_based_private' AND bl.show_exact_location IS NOT TRUE
        THEN bl.display_location ELSE bl.location END AS shown
  ) pt
  WHERE u.account_type = 'business'
    AND bp.is_published = true
    AND bl.location IS NOT NULL
    -- Index-assisted pre-filter (idx_bloc_geo): a display point sits a few hundred metres from the stored point, so
    -- everything shown inside the box is stored within a kilometre of it. The stored point itself is not returned.
    AND ST_DWithin(bl.location, v_bounds, 1000)
    AND pt.shown IS NOT NULL
    -- Bounding box filter, on the shown point
    AND ST_Intersects(pt.shown, v_bounds)
    -- Category filter (optional): a saved category matches a wanted one however
    -- either is spelled (business_category_key).
    AND (
      p_categories IS NULL
      OR EXISTS (
        SELECT 1
        FROM unnest(bp.categories) AS saved(category)
        JOIN unnest(p_categories) AS wanted(category)
          ON public.business_category_key(saved.category) = public.business_category_key(wanted.category)
      )
    )
    -- Open-now filter (optional, applied in WHERE for perf). A null time zone
    -- or a day whose hours aren't set is unknown, and unknown isn't filtered out.
    AND (
      NOT p_open_now_only
      OR COALESCE(public.business_location_open_now(bl.id, bl.timezone), TRUE)
    )
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_businesses_nearby(p_center_lat double precision, p_center_lon double precision, p_radius_meters integer DEFAULT 8047, p_viewer_home_id uuid DEFAULT NULL::uuid, p_categories text[] DEFAULT NULL::text[], p_rating_min numeric DEFAULT NULL::numeric, p_limit integer DEFAULT 200, p_entity_types text[] DEFAULT NULL::text[]) RETURNS TABLE(business_user_id uuid, username character varying, name character varying, profile_picture_url text, average_rating numeric, review_count integer, categories text[], description text, business_type text, logo_file_id uuid, banner_file_id uuid, avg_response_minutes integer, profile_created_at timestamp with time zone, location_id uuid, primary_address text, primary_city text, primary_state text, location_timezone text, distance_meters integer, neighbor_count bigint, completed_gigs bigint, profile_completeness integer, last_activity_at timestamp with time zone, is_open_now boolean, accepts_gigs boolean, verification_status character varying, founding_badge boolean, founding_benefit_expires_at timestamp with time zone)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_center geography;
  v_viewer_location geography;
BEGIN
  -- Build center point for distance calculation
  v_center := ST_SetSRID(ST_MakePoint(p_center_lon, p_center_lat), 4326)::geography;

  -- Resolve viewer home location for neighbor trust count
  IF p_viewer_home_id IS NOT NULL THEN
    SELECT h.location INTO v_viewer_location
    FROM "Home" h
    WHERE h.id = p_viewer_home_id;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS business_user_id,
    u.username,
    u.name,
    u.profile_picture_url,
    u.average_rating,
    u.review_count,
    bp.categories,
    bp.description,
    bp.business_type,
    bp.logo_file_id,
    bp.banner_file_id,
    bp.avg_response_minutes,
    bp.created_at AS profile_created_at,
    bl.id AS location_id,
    CASE WHEN pt.address_private THEN NULL ELSE bl.address END AS primary_address,
    bl.city AS primary_city,
    bl.state AS primary_state,
    bl.timezone AS location_timezone,
    -- From the shown point; to the nearest 100 m when the address is private.
    CASE WHEN pt.address_private
      THEN CAST(round(ST_Distance(pt.shown, v_center) / 100.0) * 100 AS INT)
      ELSE CAST(ST_Distance(pt.shown, v_center) AS INT)
    END AS distance_meters,

    -- Neighbor trust count (with gaming protections)
    CASE WHEN v_viewer_location IS NOT NULL THEN
      (
        SELECT COUNT(DISTINCT g.origin_home_id)
        FROM "Gig" g
        JOIN "Home" oh ON oh.id = g.origin_home_id
        JOIN "HomeOccupancy" ho ON ho.home_id = oh.id
          AND ho.is_active = true
          AND (ho.role_base IS NULL OR ho.role_base != 'guest')
        WHERE g.accepted_by = u.id
          AND g.status = 'completed'
          AND g.price >= 10
          AND g.payment_status IN ('captured_hold','transfer_scheduled','transfer_pending','transferred')
          AND g.origin_home_id IS NOT NULL
          AND oh.location IS NOT NULL
          AND ST_DWithin(oh.location, v_viewer_location, p_radius_meters)
          AND (
            EXISTS (SELECT 1 FROM "HomeOwnershipClaim" hoc WHERE hoc.home_id = oh.id AND hoc.state = 'approved')
            OR EXISTS (SELECT 1 FROM "HomeResidencyClaim" hrc WHERE hrc.home_id = oh.id AND hrc.status = 'verified')
          )
          AND NOT EXISTS (
            SELECT 1 FROM "Payment" p
            WHERE p.gig_id = g.id
              AND p.payment_status IN ('disputed','refunded','refunded_full','refunded_partial')
          )
      )
    ELSE 0
    END AS neighbor_count,

    -- Completed gigs (for new-business check)
    (SELECT COUNT(*) FROM "Gig" g WHERE g.accepted_by = u.id AND g.status = 'completed') AS completed_gigs,

    -- Profile completeness: read from stored column instead of computing inline
    bp.profile_completeness,

    -- Last activity: most recent completed gig or post
    GREATEST(
      (SELECT MAX(g2.created_at) FROM "Gig" g2 WHERE g2.accepted_by = u.id AND g2.status = 'completed'),
      (SELECT MAX(po.created_at) FROM "Post" po WHERE po.user_id = u.id)
    ) AS last_activity_at,

    -- Open-now: checks special hours override, then regular hours, handles overnight
    public.business_location_open_now(bl.id, bl.timezone) AS is_open_now,

    -- Accepts gig requests: has active team member with gig-capable role
    EXISTS (
      SELECT 1 FROM "BusinessTeam" bt
      WHERE bt.business_user_id = u.id
        AND bt.is_active = true
        AND bt.role_base IN ('owner', 'admin', 'editor', 'staff')
    ) AS accepts_gigs,

    -- Verification status from stored column
    bp.verification_status,

    -- Founding badge fields
    bp.founding_badge,
    bp.founding_benefit_expires_at

  FROM "User" u
  JOIN "BusinessProfile" bp ON bp.business_user_id = u.id
  JOIN "BusinessLocation" bl ON bl.business_user_id = u.id
    AND bl.is_primary = true
    AND bl.is_active = true
  -- The point this location shows to people outside the business (the rule of the business page,
  -- businessAddressService.toPublicBusinessLocation): a home-based business that keeps its address private shows its
  -- display point, and no point at all when it has none.
  CROSS JOIN LATERAL (
    SELECT
      (bl.location_type = 'home_based_private' AND bl.show_exact_location IS NOT TRUE) AS address_private,
      CASE WHEN bl.location_type = 'home_based_private' AND bl.show_exact_location IS NOT TRUE
        THEN bl.display_location ELSE bl.location END AS shown
  ) pt
  WHERE u.account_type = 'business'
    AND bp.is_published = true
    AND bl.location IS NOT NULL
    -- Index-assisted pre-filter (idx_bloc_geo), a kilometre wider than the radius; the radius itself is applied to
    -- the shown point.
    AND ST_DWithin(bl.location, v_center, p_radius_meters + 1000)
    AND pt.shown IS NOT NULL
    AND ST_DWithin(pt.shown, v_center, p_radius_meters)
    -- Category filter (optional): a saved category matches a wanted one however
    -- either is spelled (business_category_key).
    AND (
      p_categories IS NULL
      OR EXISTS (
        SELECT 1
        FROM unnest(bp.categories) AS saved(category)
        JOIN unnest(p_categories) AS wanted(category)
          ON public.business_category_key(saved.category) = public.business_category_key(wanted.category)
      )
    )
    -- Rating minimum filter
    AND (p_rating_min IS NULL OR COALESCE(u.average_rating, 0) >= p_rating_min)
    -- Entity type filter
    AND (p_entity_types IS NULL OR bp.business_type = ANY(p_entity_types))
  ORDER BY ST_Distance(pt.shown, v_center) ASC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_nearest_activity_center(p_center_lat double precision, p_center_lon double precision, p_content_type text DEFAULT 'gig'::text) RETURNS TABLE(latitude double precision, longitude double precision)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  IF p_content_type = 'gig' THEN
    RETURN QUERY
      SELECT
        ST_Y(g.approx_location::geometry)::double precision AS latitude,
        ST_X(g.approx_location::geometry)::double precision AS longitude
      FROM "Gig" g
      WHERE g.approx_location IS NOT NULL
        AND g.status = 'open'
      ORDER BY g.approx_location <-> ST_SetSRID(ST_MakePoint(p_center_lon, p_center_lat), 4326)::geography
      LIMIT 1;

  ELSIF p_content_type = 'business' THEN
    RETURN QUERY
      -- The nearest business the map would show (find_businesses_in_bounds), at the point it shows. The nearest few
      -- by stored point come from the index (idx_bloc_geo); the answer is the nearest of them by shown point.
      SELECT
        ST_Y(c.shown::geometry)::double precision AS latitude,
        ST_X(c.shown::geometry)::double precision AS longitude
      FROM (
        SELECT CASE WHEN bl.location_type = 'home_based_private' AND bl.show_exact_location IS NOT TRUE
          THEN bl.display_location ELSE bl.location END AS shown
        FROM "BusinessLocation" bl
        JOIN "User" u ON u.id = bl.business_user_id AND u.account_type = 'business'
        JOIN "BusinessProfile" bp ON bp.business_user_id = bl.business_user_id AND bp.is_published = true
        WHERE bl.location IS NOT NULL
          AND bl.is_primary = true
          AND bl.is_active = true
        ORDER BY bl.location <-> ST_SetSRID(ST_MakePoint(p_center_lon, p_center_lat), 4326)::geography
        LIMIT 25
      ) c
      WHERE c.shown IS NOT NULL
      ORDER BY c.shown <-> ST_SetSRID(ST_MakePoint(p_center_lon, p_center_lat), 4326)::geography
      LIMIT 1;

  ELSIF p_content_type = 'listing' THEN
    RETURN QUERY
      SELECT
        ST_Y(l.location::geometry)::double precision AS latitude,
        ST_X(l.location::geometry)::double precision AS longitude
      FROM "Listing" l
      WHERE l.location IS NOT NULL
        AND l.status = 'active'
      ORDER BY l.location <-> ST_SetSRID(ST_MakePoint(p_center_lon, p_center_lat), 4326)::geography
      LIMIT 1;
  END IF;
END;
$$;

COMMIT;
