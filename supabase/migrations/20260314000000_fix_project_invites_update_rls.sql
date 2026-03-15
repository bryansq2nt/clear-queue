-- ============================================================
-- Fix: "permission denied for table users" when revoking invites
--
-- The project_invites_update policy used:
--   email = (SELECT email FROM auth.users WHERE id = auth.uid())
-- The authenticated role cannot SELECT from auth.users, so the policy
-- failed when evaluating UPDATE (e.g. revoke). Fix by using a
-- SECURITY DEFINER function that reads auth.users with definer rights.
-- ============================================================

-- Helper: current user's email (for RLS policies that need it without
-- granting authenticated direct read on auth.users)
CREATE OR REPLACE FUNCTION public.current_auth_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT email::TEXT FROM auth.users WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.current_auth_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_auth_user_email() TO authenticated;

-- Recreate UPDATE policy using the helper instead of inline SELECT from auth.users
DROP POLICY IF EXISTS "project_invites_update" ON public.project_invites;

CREATE POLICY "project_invites_update" ON public.project_invites
  FOR UPDATE
  USING (
    public.is_project_member(project_id)
    OR email = public.current_auth_user_email()
  );
