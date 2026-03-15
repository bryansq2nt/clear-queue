-- ============================================================
-- RPC: project_has_member_with_email
--
-- Used by inviteProjectMember to block inviting an email that is
-- already a project member. Requires reading auth.users.email;
-- SECURITY DEFINER allows the check without granting authenticated
-- direct read on auth.users.
-- ============================================================

CREATE OR REPLACE FUNCTION public.project_has_member_with_email(
  p_project_id UUID,
  p_email TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    JOIN auth.users u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id
      AND LOWER(TRIM(u.email::TEXT)) = LOWER(TRIM(p_email))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.project_has_member_with_email(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_has_member_with_email(UUID, TEXT) TO authenticated;
