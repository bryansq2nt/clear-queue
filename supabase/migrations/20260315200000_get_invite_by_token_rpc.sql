-- ============================================================
-- Migration: get_invite_by_token RPC (SECURITY DEFINER)
--
-- The invite accept page (/invite/[token]) must show invite metadata to anyone
-- with the link. RLS on project_invites only allows SELECT for project members,
-- so the invitee (not yet a member) cannot read the row. This RPC runs with
-- definer rights and returns the invite by token without requiring membership.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  status          TEXT,
  expires_at      TIMESTAMPTZ,
  project_id      UUID,
  project_name    TEXT,
  role_name       TEXT,
  profile_name    TEXT,
  allowed_modules TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pi.id,
    pi.email,
    pi.status,
    pi.expires_at,
    pi.project_id,
    p.name AS project_name,
    COALESCE(rr.name, pir.effective_role_name) AS role_name,
    COALESCE(pap.name, pir.name) AS profile_name,
    COALESCE(pir.allowed_modules, pap.allowed_modules) AS allowed_modules
  FROM public.project_invites pi
  JOIN public.projects p ON p.id = pi.project_id
  LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
  LEFT JOIN public.project_access_profiles pap ON pap.id = pi.profile_id
  LEFT JOIN public.project_invite_roles pir ON pir.id = pi.invite_role_id
  WHERE pi.token = p_token;
$$;

COMMENT ON FUNCTION public.get_invite_by_token(TEXT) IS
  'Returns invite metadata by token for the accept page. Callable by anyone (anon/authenticated).';

REVOKE EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO authenticated;
