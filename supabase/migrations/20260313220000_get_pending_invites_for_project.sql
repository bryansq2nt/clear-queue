-- ============================================================
-- Migration: get_pending_invites_for_project RPC
--
-- listPendingInvites was failing because it used a PostgREST embed
-- "profiles!project_invites_invited_by_fkey(display_name)" — that FK
-- points from project_invites.invited_by to auth.users(id), not to
-- public.profiles. There is no direct FK from project_invites to profiles,
-- so the embed was invalid and the query returned an error (swallowed as []).
--
-- This RPC returns pending invites with inviter display name via a proper
-- JOIN: profiles.user_id = project_invites.invited_by.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pending_invites_for_project(p_project_id UUID)
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  role_id         UUID,
  role_name       TEXT,
  profile_id      UUID,
  profile_name    TEXT,
  invite_role_id  UUID,
  invite_role_name TEXT,
  status          TEXT,
  invited_by_name TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.id,
    pi.email,
    pi.role_id,
    COALESCE(rr.name, '')::TEXT AS role_name,
    pi.profile_id,
    pap.name::TEXT AS profile_name,
    pi.invite_role_id,
    pir.name::TEXT AS invite_role_name,
    pi.status,
    COALESCE(pr.display_name, split_part(au.email, '@', 1), '')::TEXT AS invited_by_name,
    pi.expires_at,
    pi.created_at
  FROM public.project_invites pi
  LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
  LEFT JOIN public.project_access_profiles pap ON pap.id = pi.profile_id
  LEFT JOIN public.project_invite_roles pir ON pir.id = pi.invite_role_id
  LEFT JOIN auth.users au ON au.id = pi.invited_by
  LEFT JOIN public.profiles pr ON pr.user_id = pi.invited_by
  WHERE pi.project_id = p_project_id
    AND pi.status = 'pending'
    AND public.is_project_member(p_project_id)
  ORDER BY pi.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_invites_for_project(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_invites_for_project(UUID) TO authenticated;
