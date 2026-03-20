-- =============================================================================
-- Notifications RPC: pending project invites for current authenticated user
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_pending_invite_notifications()
RETURNS TABLE (
  id UUID,
  token TEXT,
  project_id UUID,
  project_name TEXT,
  role_name TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.id,
    pi.token,
    pi.project_id,
    p.name AS project_name,
    rr.name AS role_name,
    pi.created_at,
    pi.expires_at
  FROM public.project_invites pi
  LEFT JOIN public.projects p ON p.id = pi.project_id
  LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
  WHERE pi.status = 'pending'
    AND pi.expires_at >= NOW()
    AND LOWER(TRIM(pi.email)) = LOWER(TRIM((SELECT email FROM auth.users WHERE id = auth.uid())))
  ORDER BY pi.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_pending_invite_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_invite_notifications() TO authenticated;
