-- Backwards compatible: yes. Adds one nullable column to "ProfileTie" (declined_at: when the party said "Not me"),
-- fills it for answers already given, adds an index, and replaces the bodies of three reads only this backend calls
-- (profile_tie_ask_facts, profile_tie_role_facts, profile_tie_suggestions; same signatures and grants). No other
-- table, function or grant changes. Run after 20261124210600_profile_tie_roles_circle.sql.
--
-- A pause after "Not me" (design session, 2026-11-24; CONTRACT p2.10): once a party answers "Not me" to anything from
-- an owner, that owner can't ask that same party (a person or a business) for a credit or a role for 30 days. The
-- answer stays the single CREDIT_CANNOT_ASK. declined_at is kept when the owner later removes the credit, so removing
-- a "did not confirm" never opens a second ask.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."ProfileTie" ADD COLUMN IF NOT EXISTS declined_at timestamptz;
UPDATE public."ProfileTie" SET declined_at = updated_at WHERE status = 'declined' AND declined_at IS NULL;
CREATE INDEX IF NOT EXISTS profile_tie_declined ON public."ProfileTie" (user_id, party_user_id, declined_at)
  WHERE declined_at IS NOT NULL;
COMMENT ON COLUMN public."ProfileTie".declined_at IS
  'When the party said "Not me"; kept after the owner removes it. The owner can''t ask that party again for 30 days.';

CREATE OR REPLACE FUNCTION public.profile_tie_ask_facts(p_owner uuid, p_party uuid, p_piece uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
SELECT jsonb_build_object(
  'piece', (SELECT jsonb_build_object('id', pf.id, 'title', pf.title, 'is_visible', pf.is_visible, 'is_draft', pf.is_draft)
              FROM "UserPortfolio" pf WHERE pf.id = p_piece AND pf.user_id = p_owner),
  'credits_on_piece', (SELECT count(*) FROM "ProfileTie" t WHERE t.piece_id = p_piece AND t.kind = 'credit' AND t.status <> 'removed'),
  'asks_today', (SELECT count(*) FROM "ProfileTie" t WHERE t.asked_by = p_owner AND t.asked_at > now() - interval '24 hours'),
  'party', CASE WHEN p_party IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object('account_type', w.account_type,
                                'ties_enabled', (w.profile_share->>'ties_enabled') IS DISTINCT FROM 'false')
        FROM "User" w WHERE w.id = p_party) END,
  'connected', p_party IS NOT NULL AND EXISTS (SELECT 1 FROM "Relationship" r WHERE r.status::text = 'accepted'
      AND LEAST(r.requester_id, r.addressee_id) = LEAST(p_owner, p_party)
      AND GREATEST(r.requester_id, r.addressee_id) = GREATEST(p_owner, p_party)),
  'blocked', COALESCE(public.profile_tie_blocked(p_owner, p_party), false),
  'job_party', p_party IS NOT NULL AND EXISTS (SELECT 1 FROM "UserPortfolio" pf JOIN "Gig" g ON g.id = pf.source_gig_id
      WHERE pf.id = p_piece AND pf.user_id = p_owner AND g.accepted_by = p_owner AND g.user_id = p_party
        AND g.status = 'completed' AND g.payment_status IN ('captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid')),
  'plan_party', p_party IS NOT NULL AND EXISTS (SELECT 1 FROM "UserPortfolio" pf
      JOIN "Plan" pl ON pl.post_id = pf.source_plan_id JOIN "PlanRequest" pr ON pr.post_id = pl.post_id
      WHERE pf.id = p_piece AND pf.user_id = p_owner AND pl.host_user_id = p_owner AND pl.status = 'ended'
        AND pr.user_id = p_party AND pr.status = 'accepted'),
  'paused', p_party IS NOT NULL AND EXISTS (SELECT 1 FROM "ProfileTie" pz WHERE pz.user_id = p_owner AND pz.party_user_id = p_party
                                AND pz.declined_at > now() - interval '30 days'),
  'existing', CASE WHEN p_party IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object('id', t.id, 'status', t.status, 'removed_by', t.removed_by, 'declined_at', t.declined_at)
        FROM "ProfileTie" t WHERE t.piece_id = p_piece AND t.party_user_id = p_party AND t.kind = 'credit') END,
  'party_person', (SELECT jsonb_build_object(
          'user', jsonb_build_object('id', w.id, 'username', w.username, 'name', w.name,
                                     'first_name', w.first_name, 'middle_name', w.middle_name,
                                     'last_name', w.last_name, 'profile_picture_url', w.profile_picture_url,
                                     'account_type', w.account_type),
          'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                                'avatar_url', l.avatar_url)
                        FROM "LocalProfile" l WHERE l.user_id = w.id)) FROM "User" w WHERE w.id = p_party),
  'asker', (SELECT jsonb_build_object(
          'user', jsonb_build_object('id', w.id, 'username', w.username, 'name', w.name,
                                     'first_name', w.first_name, 'middle_name', w.middle_name,
                                     'last_name', w.last_name, 'profile_picture_url', w.profile_picture_url,
                                     'account_type', w.account_type),
          'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                                'avatar_url', l.avatar_url)
                        FROM "LocalProfile" l WHERE l.user_id = w.id)) FROM "User" w WHERE w.id = p_owner));
$$;

REVOKE ALL ON FUNCTION public.profile_tie_ask_facts(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_tie_ask_facts(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.profile_tie_role_facts(p_owner uuid, p_business uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
SELECT jsonb_build_object(
  'business', (SELECT jsonb_build_object('id', b.id, 'name', COALESCE(b.name, b.username), 'username', b.username,
                                         'picture_url', b.profile_picture_url,
                                         'ties_enabled', (b.profile_share->>'ties_enabled') IS DISTINCT FROM 'false')
                 FROM "User" b JOIN "BusinessProfile" bp ON bp.business_user_id = b.id AND bp.is_published = true
                WHERE b.id = p_business AND b.account_type = 'business'),
  'owners', COALESCE((SELECT jsonb_agg(bt.user_id) FROM "BusinessTeam" bt
                       WHERE bt.business_user_id = p_business AND bt.role_base = 'owner' AND bt.is_active = true), '[]'::jsonb),
  'blocked', public.profile_tie_blocked(p_owner, p_business)
     OR EXISTS (SELECT 1 FROM "BusinessTeam" bt WHERE bt.business_user_id = p_business AND bt.role_base = 'owner'
                  AND bt.is_active = true AND public.profile_tie_blocked(p_owner, bt.user_id)),
  'owns_it', EXISTS (SELECT 1 FROM "BusinessTeam" bt WHERE bt.business_user_id = p_business AND bt.user_id = p_owner
                   AND bt.role_base = 'owner' AND bt.is_active = true),
  'paused', EXISTS (SELECT 1 FROM "ProfileTie" pz WHERE pz.user_id = p_owner AND pz.party_user_id = p_business
                                AND pz.declined_at > now() - interval '30 days'),
  'asks_today', (SELECT count(*) FROM "ProfileTie" t WHERE t.asked_by = p_owner AND t.asked_at > now() - interval '24 hours'),
  'roles', (SELECT count(*) FROM "ProfileTie" t WHERE t.user_id = p_owner AND t.kind = 'role' AND t.status <> 'removed'),
  'asker', (SELECT jsonb_build_object(
          'user', jsonb_build_object('id', w.id, 'username', w.username, 'name', w.name,
                                     'first_name', w.first_name, 'middle_name', w.middle_name,
                                     'last_name', w.last_name, 'profile_picture_url', w.profile_picture_url,
                                     'account_type', w.account_type),
          'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                                'avatar_url', l.avatar_url)
                        FROM "LocalProfile" l WHERE l.user_id = w.id)) FROM "User" w WHERE w.id = p_owner));
$$;

REVOKE ALL ON FUNCTION public.profile_tie_role_facts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_tie_role_facts(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.profile_tie_suggestions(p_owner uuid, p_gig_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'gig_id', g.id, 'poster_id', g.user_id, 'account_type', w.account_type,
    'ties_enabled', (w.profile_share->>'ties_enabled') IS DISTINCT FROM 'false',
    'blocked', public.profile_tie_blocked(p_owner, g.user_id),
    'paused', EXISTS (SELECT 1 FROM "ProfileTie" pz WHERE pz.user_id = p_owner AND pz.party_user_id = g.user_id
                                AND pz.declined_at > now() - interval '30 days'),
    'existing', (SELECT jsonb_build_object('status', t.status, 'removed_by', t.removed_by, 'declined_at', t.declined_at)
                   FROM "ProfileTie" t JOIN "UserPortfolio" pf ON pf.id = t.piece_id
                  WHERE pf.source_gig_id = g.id AND pf.user_id = p_owner AND t.party_user_id = g.user_id AND t.kind = 'credit'
                  LIMIT 1),
    'person', jsonb_build_object(
          'user', jsonb_build_object('id', w.id, 'username', w.username, 'name', w.name,
                                     'first_name', w.first_name, 'middle_name', w.middle_name,
                                     'last_name', w.last_name, 'profile_picture_url', w.profile_picture_url,
                                     'account_type', w.account_type),
          'profile', (SELECT jsonb_build_object('user_id', l.user_id, 'handle', l.handle, 'display_name', l.display_name,
                                                'avatar_url', l.avatar_url)
                        FROM "LocalProfile" l WHERE l.user_id = w.id)))), '[]'::jsonb)
  FROM "Gig" g JOIN "User" w ON w.id = g.user_id
 WHERE g.id = ANY (p_gig_ids[1:100]) AND g.accepted_by = p_owner AND g.status = 'completed'
   AND g.payment_status IN ('captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid');
$$;

REVOKE ALL ON FUNCTION public.profile_tie_suggestions(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_tie_suggestions(uuid, uuid[]) TO service_role;
