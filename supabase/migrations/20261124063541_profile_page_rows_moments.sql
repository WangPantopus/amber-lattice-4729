-- Backwards compatible: yes. Replaces the body of public.profile_page_rows (20261124055802) with the same signature,
-- the same grants and every key it returned before, and adds three keys the current backend doesn't read: the
-- person's live Moments, whether the viewer muted them, and which of those Moments the viewer reported lately. A
-- backend that doesn't read them is unaffected; nothing else changes.
--
-- A profile with sources, phase 1: the page's Moments row (design session, 2026-11-23: only when Moments is on for
-- the viewer and the person has a Moment that viewer may see; never on a link). The rows let the backend apply
-- services/moments/momentStore.js's own canSee without a read of its own. Only page reads (newest first) get the
-- Moments; the avatar marks (oldest first) don't need them. Server only.
SET LOCAL lock_timeout = '5s';

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
      SELECT g.id, g.owner_confirmed_at, g.worker_completed_at, g.updated_at
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
  'pieces', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.is_featured DESC, x.display_order ASC, x.created_at DESC) FROM (
      SELECT pf.id, pf.title, pf.description, pf.portfolio_type, pf.media_urls, pf.thumbnail_url, pf.file_ids,
             pf.skills_used, pf.external_url, pf.github_url, pf.demo_url, pf.completed_at, pf.display_order,
             pf.is_featured, pf.created_at
        FROM "UserPortfolio" pf WHERE pf.user_id = u.id AND pf.is_visible = true
       ORDER BY pf.is_featured DESC, pf.display_order ASC, pf.created_at DESC LIMIT 60) x), '[]'::jsonb),
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
WHERE u.id = ANY (p_ids[1:100]);
$$;

REVOKE ALL ON FUNCTION public.profile_page_rows(uuid[], uuid, text[], integer, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_page_rows(uuid[], uuid, text[], integer, boolean, boolean) TO service_role;
