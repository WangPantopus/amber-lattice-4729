-- Backwards compatible: yes. Adds one nullable column, "User".profile_shelf, and replaces the body of
-- public.profile_page_rows (20261124225100) with the same signature and grants, adding one key, `shelf`, that older
-- backends never read. Every other key keeps its meaning. Run after 20261124225100_profile_page_rows_role_owner.sql.
--
-- A profile with sources, phase 3C: the shelf (SPEC "Phase 3"; CONTRACT P3.1). Server only.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS profile_shelf jsonb
  CONSTRAINT user_profile_shelf_array CHECK (profile_shelf IS NULL OR jsonb_typeof(profile_shelf) = 'array');
COMMENT ON COLUMN public."User".profile_shelf IS
  'The person''s shelf on their profile: at most five { id (File), picture_url, caption } in order; null when empty.';

CREATE OR REPLACE FUNCTION public.profile_page_rows(
  p_ids uuid[],
  p_viewer uuid DEFAULT NULL,
  p_not_helpful text[] DEFAULT '{}'::text[],
  p_row_limit integer DEFAULT 1000,
  p_oldest_first boolean DEFAULT false,
  p_reviewers boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
SELECT COALESCE(jsonb_object_agg(u.id::text, jsonb_build_object(
  'account_type', u.account_type,
  'profile_visibility', u.profile_visibility,
  'share', u.profile_share,
  'privacy', (SELECT jsonb_build_object('show_neighborhood', s.show_neighborhood, 'search_visibility', s.search_visibility)
                FROM "UserPrivacySettings" s WHERE s.user_id = u.id),
  'local_profile', (SELECT to_jsonb(lp) FROM (
      SELECT l.id, l.user_id, l.handle, l.handle_normalized, l.display_name, l.avatar_url, l.bio, l.tagline,
             l.public_city, l.public_state, l.public_neighborhood, l.show_neighborhood, l.profile_visibility,
             l.search_visibility
        FROM "LocalProfile" l WHERE l.user_id = u.id) lp),
  'occupancies', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at) FROM (
      SELECT o.home_id, o.user_id, o.is_active, o.verification_status, o.verification_source, o.verified_at, o.start_at,
             o.end_at, o.created_at, o.fast_check_kind, o.fast_check_at, o.fast_check_expires_at,
             o.fast_check_recheck_due_at, o.fast_check_confirmed_at, h.city, h.state
        FROM "HomeOccupancy" o JOIN "Home" h ON h.id = o.home_id
       WHERE o.user_id = u.id AND o.is_active) x), '[]'::jsonb),
  'owners', COALESCE((SELECT jsonb_agg(jsonb_build_object('home_id', ho.home_id, 'updated_at', ho.updated_at))
        FROM "HomeOwner" ho
       WHERE ho.subject_id = u.id AND ho.subject_type = 'user' AND ho.owner_status = 'verified'), '[]'::jsonb),
  'paid_jobs', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT g.id, g.owner_confirmed_at, g.worker_completed_at, g.updated_at, g.user_id AS poster_id,
             (SELECT pw.account_type FROM "User" pw WHERE pw.id = g.user_id) AS poster_type
        FROM "Gig" g
       WHERE g.accepted_by = u.id AND g.status = 'completed'
         AND g.payment_status IN ('captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid')
       ORDER BY CASE WHEN p_oldest_first THEN g.updated_at END ASC, CASE WHEN NOT p_oldest_first THEN g.updated_at END DESC
       LIMIT p_row_limit) x), '[]'::jsonb),
  'reviews', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
      SELECT r.id, r.gig_id, r.reviewer_id, r.comment, r.created_at, g.user_id AS gig_user_id, g.accepted_by AS gig_accepted_by
        FROM "Review" r LEFT JOIN "Gig" g ON g.id = r.gig_id
       WHERE r.reviewee_id = u.id AND r.comment IS NOT NULL AND r.comment <> ''
       ORDER BY CASE WHEN p_oldest_first THEN r.created_at END ASC, CASE WHEN NOT p_oldest_first THEN r.created_at END DESC
       LIMIT CASE WHEN p_oldest_first THEN p_row_limit ELSE 20 END) x), '[]'::jsonb),
  'reviewers', CASE WHEN p_reviewers THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'user', jsonb_build_object('id', w.id, 'username', w.username, 'name', w.name, 'first_name', w.first_name,
                                   'middle_name', w.middle_name, 'last_name', w.last_name,
                                   'profile_picture_url', w.profile_picture_url, 'account_type', w.account_type),
        'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                              'avatar_url', l.avatar_url)
                      FROM "LocalProfile" l WHERE l.user_id = w.id)))
        FROM "User" w
       WHERE w.id IN (SELECT r.reviewer_id FROM "Review" r
                       WHERE r.reviewee_id = u.id AND r.comment IS NOT NULL AND r.comment <> ''
                       ORDER BY r.created_at DESC LIMIT 20)), '[]'::jsonb) ELSE '[]'::jsonb END,
  'certifications', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT c.id, c.certification_name, c.issuing_organization, c.issue_date, c.expiry_date, c.is_verified, c.created_at
        FROM "UserCertification" c WHERE c.user_id = u.id AND c.show_on_profile = true
       ORDER BY c.issue_date DESC NULLS LAST LIMIT 30) x), '[]'::jsonb),
  'professional', (SELECT jsonb_build_object('verification_status', pp.verification_status,
                                             'verification_completed_at', pp.verification_completed_at,
                                             'is_public', pp.is_public, 'is_active', pp.is_active)
                     FROM "UserProfessionalProfile" pp WHERE pp.user_id = u.id LIMIT 1),
  'businesses', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT b.id, COALESCE(b.name, b.username) AS name, b.username, b.profile_picture_url AS picture_url,
             COALESCE(bt.joined_at, bt.created_at) AS since
        FROM "BusinessTeam" bt
        JOIN "BusinessProfile" bp ON bp.business_user_id = bt.business_user_id AND bp.is_published = true
             AND bp.verification_status IN ('document_verified', 'government_verified')
        JOIN "User" b ON b.id = bt.business_user_id AND b.account_type = 'business'
       WHERE bt.user_id = u.id AND bt.role_base = 'owner' AND bt.is_active = true
       LIMIT 10) x), '[]'::jsonb),
  'skills', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.display_order) FROM (
      SELECT k.id, k.skill_name, k.is_verified, k.verified_at, k.created_at, k.display_order
        FROM "UserSkill" k WHERE k.user_id = u.id AND (k.show_on_profile IS NULL OR k.show_on_profile = true)
       ORDER BY k.display_order LIMIT 40) x), '[]'::jsonb),
  -- Visible, finished pieces (as before), with the phase 2A columns and what Pantopus saw each from, checked now:
  -- a job the person did that is completed and paid, or a plan they hosted that took place.
  'pieces', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.is_featured DESC, x.display_order ASC, x.created_at DESC) FROM (
      SELECT pf.id, pf.title, pf.description, pf.portfolio_type, pf.media_urls, pf.thumbnail_url, pf.file_ids,
             pf.skills_used, pf.external_url, pf.github_url, pf.demo_url, pf.completed_at, pf.display_order,
             pf.is_featured, pf.is_visible, pf.created_at, pf.piece_kind, pf.started_on, pf.place_city, pf.place_state,
             pf.audience, pf.links, pf.is_draft, pf.owner_role,
             (SELECT count(*) FROM "File" df WHERE df.id = ANY (pf.file_ids) AND df.file_type = 'portfolio_document'
               AND df.is_deleted IS NOT TRUE) AS document_count,
             CASE WHEN sg.id IS NOT NULL THEN 'gig' WHEN sp.post_id IS NOT NULL THEN 'plan' END AS source_kind,
             COALESCE(sg.owner_confirmed_at, sg.worker_completed_at, sg.updated_at, sp.ended_at) AS source_at,
             sg.id AS source_gig_id
        FROM "UserPortfolio" pf
        LEFT JOIN "Gig" sg ON sg.id = pf.source_gig_id AND sg.accepted_by = u.id AND sg.status = 'completed'
             AND sg.payment_status IN ('captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid')
        LEFT JOIN "Plan" sp ON sp.post_id = pf.source_plan_id AND sp.host_user_id = u.id AND sp.status = 'ended'
       WHERE pf.user_id = u.id AND pf.is_visible = true AND pf.is_draft = false
       ORDER BY pf.is_featured DESC, pf.display_order ASC, pf.created_at DESC LIMIT 80) x), '[]'::jsonb),
  -- Hidden and draft pieces: the backend shows these to the owner only. A key the phase 1 backend never reads.
  'owner_only_pieces', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.is_featured DESC, x.display_order ASC, x.created_at DESC) FROM (
      SELECT pf.id, pf.title, pf.description, pf.portfolio_type, pf.media_urls, pf.thumbnail_url, pf.file_ids,
             pf.skills_used, pf.external_url, pf.github_url, pf.demo_url, pf.completed_at, pf.display_order,
             pf.is_featured, pf.is_visible, pf.created_at, pf.piece_kind, pf.started_on, pf.place_city, pf.place_state,
             pf.audience, pf.links, pf.is_draft, pf.owner_role,
             (SELECT count(*) FROM "File" df WHERE df.id = ANY (pf.file_ids) AND df.file_type = 'portfolio_document'
               AND df.is_deleted IS NOT TRUE) AS document_count,
             CASE WHEN sg.id IS NOT NULL THEN 'gig' WHEN sp.post_id IS NOT NULL THEN 'plan' END AS source_kind,
             COALESCE(sg.owner_confirmed_at, sg.worker_completed_at, sg.updated_at, sp.ended_at) AS source_at,
             sg.id AS source_gig_id
        FROM "UserPortfolio" pf
        LEFT JOIN "Gig" sg ON sg.id = pf.source_gig_id AND sg.accepted_by = u.id AND sg.status = 'completed'
             AND sg.payment_status IN ('captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid')
        LEFT JOIN "Plan" sp ON sp.post_id = pf.source_plan_id AND sp.host_user_id = u.id AND sp.status = 'ended'
       WHERE pf.user_id = u.id AND (pf.is_visible IS NOT TRUE OR pf.is_draft = true)
       ORDER BY pf.is_featured DESC, pf.display_order ASC, pf.created_at DESC LIMIT 80) x), '[]'::jsonb),
  -- Phase 2B (PROFILE_TIES; the backend sends none of these while it is off). Credits on the person's pieces that
  -- may show: typed names (said) and signed ones, with the party's name, their own switch and any block between the two.
  'credits', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at) FROM (
      SELECT t.id, t.piece_id, t.party_user_id, t.party_name, t.role, t.relation, t.status, t.asked_at, t.signed_at,
             t.show_on_party_work, t.name_on_links, t.created_at,
             (w.profile_share->>'ties_enabled') IS DISTINCT FROM 'false' AS party_ties_enabled,
             public.profile_tie_blocked(u.id, t.party_user_id) AS party_blocked,
             CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object(
          'user', jsonb_build_object('id', w.id, 'username', w.username, 'name', w.name,
                                     'first_name', w.first_name, 'middle_name', w.middle_name,
                                     'last_name', w.last_name, 'profile_picture_url', w.profile_picture_url,
                                     'account_type', w.account_type),
          'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                                'avatar_url', l.avatar_url)
                        FROM "LocalProfile" l WHERE l.user_id = w.id)) END AS party
        FROM "ProfileTie" t LEFT JOIN "User" w ON w.id = t.party_user_id
       WHERE t.user_id = u.id AND t.kind = 'credit' AND t.status IN ('said', 'signed')
       ORDER BY t.created_at LIMIT 400) x), '[]'::jsonb),
  -- Asked and "did not confirm": the person's alone (and an ask, the one asked). A key the phase 1 backend never reads.
  'owner_only_credits', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at) FROM (
      SELECT t.id, t.piece_id, t.party_user_id, t.party_name, t.role, t.relation, t.status, t.asked_at, t.signed_at,
             t.show_on_party_work, t.name_on_links, t.created_at,
             (w.profile_share->>'ties_enabled') IS DISTINCT FROM 'false' AS party_ties_enabled,
             public.profile_tie_blocked(u.id, t.party_user_id) AS party_blocked,
             CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object(
          'user', jsonb_build_object('id', w.id, 'username', w.username, 'name', w.name,
                                     'first_name', w.first_name, 'middle_name', w.middle_name,
                                     'last_name', w.last_name, 'profile_picture_url', w.profile_picture_url,
                                     'account_type', w.account_type),
          'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                                'avatar_url', l.avatar_url)
                        FROM "LocalProfile" l WHERE l.user_id = w.id)) END AS party
        FROM "ProfileTie" t LEFT JOIN "User" w ON w.id = t.party_user_id
       WHERE t.user_id = u.id AND t.kind = 'credit' AND t.status IN ('asked', 'declined')
       ORDER BY t.created_at LIMIT 400) x), '[]'::jsonb),
  -- Pieces of others this person signed a credit on and chose to show on their own Work ("With <owner>"): the owner's
  -- piece if it is visible and finished, no block between the two, with the owner's settings and the viewer's side of
  -- the owner, so the backend shows each only to a viewer who may open it.
  'signed_ties', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.signed_at DESC) FROM (
      SELECT t.id, t.piece_id, t.role, t.relation, t.signed_at, t.name_on_links, t.user_id AS owner_id,
             o.profile_visibility AS owner_visibility, o.profile_share AS owner_share,
             (SELECT s.search_visibility FROM "UserPrivacySettings" s WHERE s.user_id = o.id) AS owner_search_visibility,
             jsonb_build_object(
          'user', jsonb_build_object('id', o.id, 'username', o.username, 'name', o.name,
                                     'first_name', o.first_name, 'middle_name', o.middle_name,
                                     'last_name', o.last_name, 'profile_picture_url', o.profile_picture_url,
                                     'account_type', o.account_type),
          'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                                'avatar_url', l.avatar_url)
                        FROM "LocalProfile" l WHERE l.user_id = o.id)) AS owner,
             jsonb_build_object('id', pf.id, 'title', pf.title, 'portfolio_type', pf.portfolio_type,
                                'media_urls', pf.media_urls, 'thumbnail_url', pf.thumbnail_url, 'file_ids', pf.file_ids,
                                'skills_used', pf.skills_used, 'external_url', pf.external_url, 'github_url', pf.github_url,
                                'demo_url', pf.demo_url, 'completed_at', pf.completed_at, 'created_at', pf.created_at,
                                'is_featured', pf.is_featured, 'is_visible', pf.is_visible, 'is_draft', pf.is_draft,
                                'piece_kind', pf.piece_kind, 'started_on', pf.started_on, 'audience', pf.audience,
                                'links', pf.links, 'owner_role', pf.owner_role,
                                'document_count', (SELECT count(*) FROM "File" df WHERE df.id = ANY (pf.file_ids)
                                   AND df.file_type = 'portfolio_document' AND df.is_deleted IS NOT TRUE),
                                'source_kind', CASE WHEN sg.id IS NOT NULL THEN 'gig' WHEN sp.post_id IS NOT NULL THEN 'plan' END,
                                'source_at', COALESCE(sg.owner_confirmed_at, sg.worker_completed_at, sg.updated_at, sp.ended_at)) AS piece,
             CASE WHEN p_viewer IS NULL OR p_viewer = u.id THEN NULL ELSE jsonb_build_object(
               'connected', EXISTS (SELECT 1 FROM "Relationship" r WHERE r.status::text = 'accepted'
                   AND LEAST(r.requester_id, r.addressee_id) = LEAST(p_viewer, o.id)
                   AND GREATEST(r.requester_id, r.addressee_id) = GREATEST(p_viewer, o.id)),
               'household', EXISTS (SELECT 1 FROM "HomeOccupancy" a JOIN "HomeOccupancy" b ON b.home_id = a.home_id
                   WHERE a.user_id = p_viewer AND a.is_active AND a.end_at IS NULL
                     AND b.user_id = o.id AND b.is_active AND b.end_at IS NULL),
               'blocked', public.profile_tie_blocked(p_viewer, o.id)) END AS viewer_side
        FROM "ProfileTie" t
        JOIN "User" o ON o.id = t.user_id
        JOIN "UserPortfolio" pf ON pf.id = t.piece_id AND pf.user_id = t.user_id AND pf.is_visible = true AND pf.is_draft = false
        LEFT JOIN "Gig" sg ON sg.id = pf.source_gig_id AND sg.accepted_by = t.user_id AND sg.status = 'completed'
             AND sg.payment_status IN ('captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid')
        LEFT JOIN "Plan" sp ON sp.post_id = pf.source_plan_id AND sp.host_user_id = t.user_id AND sp.status = 'ended'
       WHERE t.party_user_id = u.id AND t.kind = 'credit' AND t.status = 'signed' AND t.show_on_party_work
         AND NOT public.profile_tie_blocked(u.id, t.user_id)
       ORDER BY t.signed_at DESC LIMIT 40) x), '[]'::jsonb),
  -- Roles and schools (phase 2B): ties with no piece, at a business on Pantopus or a typed place, every status but
  -- removed (an asked role still shows as the person's own words, the business unnamed); the backend decides what each
  -- view sees. A block between the person and the business or any of its owners counts. Never read by an older backend.
  'roles', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.from_month DESC NULLS LAST, x.created_at) FROM (
      SELECT t.id, t.party_user_id, t.party_name, t.role, t.relation, t.from_month, t.to_month, t.status, t.asked_at,
             t.signed_at, t.name_on_links, t.created_at,
             (w.profile_share->>'ties_enabled') IS DISTINCT FROM 'false' AS party_ties_enabled,
             CASE WHEN t.party_user_id IS NULL THEN false ELSE (public.profile_tie_blocked(u.id, t.party_user_id)
               OR EXISTS (SELECT 1 FROM "BusinessTeam" bt WHERE bt.business_user_id = t.party_user_id
                             AND bt.role_base = 'owner' AND bt.is_active = true
                             AND public.profile_tie_blocked(u.id, bt.user_id))) END AS party_blocked,
             CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('id', w.id, 'name', COALESCE(w.name, w.username),
               'username', w.username, 'picture_url', w.profile_picture_url, 'account_type', w.account_type) END AS party,
             -- The viewer is an active owner of the business: they may change or take off its signature.
             (p_viewer IS NOT NULL AND t.party_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM "BusinessTeam" vb
                WHERE vb.business_user_id = t.party_user_id AND vb.user_id = p_viewer AND vb.role_base = 'owner'
                  AND vb.is_active = true)) AS viewer_owns
        FROM "ProfileTie" t LEFT JOIN "User" w ON w.id = t.party_user_id
       WHERE t.user_id = u.id AND t.kind = 'role' AND t.status IN ('said', 'asked', 'signed', 'declined')
       ORDER BY t.from_month DESC NULLS LAST, t.created_at LIMIT 40) x), '[]'::jsonb),
  'tools', u.profile_tools,
  -- Phase 3: the person's shelf (at most five pictures with captions; the backend decides who sees it).
  'shelf', u.profile_shelf,
  'plans', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT pl.post_id, pl.ended_at, pl.updated_at FROM "Plan" pl
       WHERE pl.host_user_id = u.id AND pl.status = 'ended'
       ORDER BY CASE WHEN p_oldest_first THEN pl.ended_at END ASC, CASE WHEN NOT p_oldest_first THEN pl.ended_at END DESC
       LIMIT p_row_limit) x), '[]'::jsonb),
  'trains', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT sr.support_train_id, sr.created_at, ss.slot_date
        FROM "SupportTrainReservation" sr
        JOIN "SupportTrain" st ON st.id = sr.support_train_id AND st.status <> 'draft'
        LEFT JOIN "SupportTrainSlot" ss ON ss.id = sr.slot_id
       WHERE sr.user_id = u.id AND sr.status IN ('reserved', 'delivered', 'confirmed')
       LIMIT p_row_limit) x), '[]'::jsonb),
  -- Helpful marks as services/profileContributions.js counts them.
  'helpful_count', (SELECT count(*) FROM "PostLike" pk JOIN "Post" p ON p.id = pk.post_id
       WHERE p.user_id = u.id AND p.archived_at IS NULL AND p.moderation_state <> 'removed'
         AND (p.post_as IS NULL OR p.post_as NOT IN ('business', 'persona'))
         AND (p.identity_context_type IS NULL OR p.identity_context_type <> 'persona')
         AND (p.post_type IS NULL OR NOT (p.post_type = ANY (p_not_helpful)))
         AND pk.user_id <> u.id),
  'helpful_months', COALESCE((SELECT jsonb_agg(x.created_at) FROM (
      SELECT pk.created_at FROM "PostLike" pk JOIN "Post" p ON p.id = pk.post_id
       WHERE p.user_id = u.id AND p.archived_at IS NULL AND p.moderation_state <> 'removed'
         AND (p.post_as IS NULL OR p.post_as NOT IN ('business', 'persona'))
         AND (p.identity_context_type IS NULL OR p.identity_context_type <> 'persona')
         AND (p.post_type IS NULL OR NOT (p.post_type = ANY (p_not_helpful)))
         AND pk.user_id <> u.id
       ORDER BY CASE WHEN p_oldest_first THEN pk.created_at END ASC, CASE WHEN NOT p_oldest_first THEN pk.created_at END DESC
       LIMIT p_row_limit) x), '[]'::jsonb),
  'pinned', EXISTS (SELECT 1 FROM "Post" p WHERE p.user_id = u.id AND p.profile_pinned_at IS NOT NULL AND p.archived_at IS NULL),
  -- The person's live Moments, as momentStore.peopleRings reads them (page reads only).
  'moments', CASE WHEN p_oldest_first THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT m.id, m.user_id, m.content, m.latitude, m.longitude, m.location_name, m.location_precision, m.audience,
             m.created_at, m.story_expires_at, m.is_story, m.moderation_state, m.moderation_rule, m.moderation_note,
             m.archived_at, m.archive_reason, m.post_metadata, m.view_count, m.origin
        FROM "Post" m
       WHERE m.user_id = u.id AND m.is_story = true AND m.story_expires_at > now() AND m.archived_at IS NULL
         AND m.moderation_state = 'live' AND m.post_metadata->'moment'->>'state' = 'live'
       ORDER BY m.created_at DESC LIMIT 200) x), '[]'::jsonb) END,
  -- The viewer's side (null when signed out or the person themself).
  'relationship', CASE WHEN p_viewer IS NULL OR p_viewer = u.id THEN NULL ELSE (
      SELECT jsonb_build_object('requester_id', r.requester_id, 'addressee_id', r.addressee_id, 'status', r.status,
                                'blocked_by', r.blocked_by)
        FROM "Relationship" r
       WHERE (r.requester_id = p_viewer AND r.addressee_id = u.id) OR (r.requester_id = u.id AND r.addressee_id = p_viewer)
       ORDER BY (r.status::text = 'blocked') DESC LIMIT 1) END,
  'shares_home', CASE WHEN p_viewer IS NULL OR p_viewer = u.id THEN false ELSE EXISTS (
      SELECT 1 FROM "HomeOccupancy" a JOIN "HomeOccupancy" b ON b.home_id = a.home_id
       WHERE a.user_id = p_viewer AND a.is_active AND a.end_at IS NULL
         AND b.user_id = u.id AND b.is_active AND b.end_at IS NULL) END,
  'blocked_by_them', CASE WHEN p_viewer IS NULL OR p_viewer = u.id THEN false ELSE EXISTS (
      SELECT 1 FROM "UserBlock" ub WHERE ub.blocker_user_id = u.id AND ub.blocked_user_id = p_viewer) END,
  'blocked_by_viewer', CASE WHEN p_viewer IS NULL OR p_viewer = u.id THEN false ELSE EXISTS (
      SELECT 1 FROM "UserBlock" ub WHERE ub.blocker_user_id = p_viewer AND ub.blocked_user_id = u.id) END,
  -- A mute of the person by the viewer, of any surface (feedService.getMuteAndHideFilters: account and Moments mutes).
  'muted_by_viewer', CASE WHEN p_viewer IS NULL OR p_viewer = u.id THEN false ELSE EXISTS (
      SELECT 1 FROM "PostMute" pm WHERE pm.user_id = p_viewer AND pm.muted_entity_type IN ('user', 'business')
         AND pm.muted_entity_id = u.id::text) END,
  -- The person's Moments the viewer reported in the last four days (momentStore.reportedIds).
  'reported_moments', CASE WHEN p_viewer IS NULL OR p_viewer = u.id OR p_oldest_first THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(DISTINCT pr.post_id) FROM "PostReport" pr JOIN "Post" m ON m.id = pr.post_id
       WHERE pr.reported_by = p_viewer AND pr.created_at >= now() - interval '4 days'
         AND m.user_id = u.id AND m.is_story = true), '[]'::jsonb) END,
  'profile_blocks', CASE WHEN p_viewer IS NULL OR p_viewer = u.id THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('by_viewer', pb.user_id = p_viewer, 'scope', pb.block_scope))
        FROM "UserProfileBlock" pb
       WHERE (pb.user_id = p_viewer AND pb.blocked_user_id = u.id) OR (pb.user_id = u.id AND pb.blocked_user_id = p_viewer)),
      '[]'::jsonb) END
)), '{}'::jsonb)
FROM "User" u
WHERE u.id = ANY (p_ids[1:100])
   OR u.id IN (SELECT l.user_id FROM "LocalProfile" l WHERE l.id = ANY (p_ids[1:100]));
$$;

REVOKE ALL ON FUNCTION public.profile_page_rows(uuid[], uuid, text[], integer, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_page_rows(uuid[], uuid, text[], integer, boolean, boolean) TO service_role;
