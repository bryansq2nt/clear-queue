-- ============================================================
-- Fix: infinite recursion in org_members_team_select policy
--
-- The original policy in 20260310100003_organization_members.sql
-- used a direct subquery on organization_members to check membership,
-- which triggers RLS on that same table → infinite recursion.
--
-- The SECURITY DEFINER function is_org_member() (created in migration 09)
-- bypasses RLS when executing, so there is no recursion.
-- We simply replace the recursive policy with a call to that function.
-- ============================================================

DROP POLICY IF EXISTS "org_members_team_select" ON public.organization_members;

CREATE POLICY "org_members_team_select" ON public.organization_members
  FOR SELECT USING (
    public.is_org_member(org_id)
  );
