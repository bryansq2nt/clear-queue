-- =============================================================================
-- Sub-team memberships for the current user in a project (for "Tu rol y equipos").
-- SECURITY DEFINER: RLS on project_team_members / project_teams must not block
-- the member from seeing their own sub-team rows when listing full teams fails
-- or returns incomplete member lists.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_sub_team_memberships(p_project_id uuid)
RETURNS TABLE (
  team_id uuid,
  team_name text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ptm.team_id, pt.name::text, ptm.role::text
  FROM public.project_team_members ptm
  INNER JOIN public.project_teams pt ON pt.id = ptm.team_id
  WHERE pt.project_id = p_project_id
    AND ptm.user_id = (SELECT auth.uid())
    AND public.is_project_member(p_project_id);
$$;

COMMENT ON FUNCTION public.get_my_sub_team_memberships(uuid) IS
  'Returns sub-teams the current user belongs to in the given project; bypasses RLS for consistent self-view.';

GRANT EXECUTE ON FUNCTION public.get_my_sub_team_memberships(uuid) TO authenticated;
