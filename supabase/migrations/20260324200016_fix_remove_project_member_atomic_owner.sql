-- =============================================================================
-- Fix remove_project_member_atomic for simplified RBAC + role scopes
--
-- 1) Legacy bug: required rbac_roles.name = 'project_owner' but simplified RBAC
--    uses 'owner'. Also trust projects.owner_id.
--
-- 2) Align with app action removeProjectMember → requireCan('teams.manage_members'):
--    - Project owner (row or URA owner / legacy project_owner) and project_manager
--      can remove any member except the project row owner.
--    - team_manager may remove only members who share a sub-team where the caller
--      is project_team_members.role = 'manager' (their own team).
--
-- 3) user_project_action_grants was dropped; clean user_project_access_grants and
--    project_team_members for the removed user.
--
-- Role resolution includes org-level URA for the project's org (same idea as
-- getGrantedActions / getRoleIdsForUserInProject).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_project_member_atomic(
  p_project_id     UUID,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id          UUID;
  v_project_owner_id   UUID;
  v_org_id             UUID;
  v_caller_can_full    BOOLEAN;
  v_caller_is_tm       BOOLEAN;
  v_tm_same_team       BOOLEAN;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  SELECT p.owner_id, p.org_id
  INTO v_project_owner_id, v_org_id
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_project_owner_id IS NULL THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  IF p_target_user_id = v_project_owner_id THEN
    RAISE EXCEPTION 'cannot_remove_project_owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id    = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this project';
  END IF;

  -- Full project scope: row owner, or owner / project_owner / project_manager (project or org URA)
  v_caller_can_full :=
    v_caller_id = v_project_owner_id
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.rbac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = v_caller_id
        AND ura.project_id = p_project_id
        AND r.name IN ('owner', 'project_owner', 'project_manager')
    )
    OR (
      v_org_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_role_assignments ura
        JOIN public.rbac_roles r ON r.id = ura.role_id
        WHERE ura.user_id = v_caller_id
          AND ura.org_id = v_org_id
          AND r.name IN ('owner', 'project_owner', 'project_manager')
      )
    );

  -- Team manager: only if target is in a sub-team the caller manages (manager row)
  v_caller_is_tm :=
    EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.rbac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = v_caller_id
        AND ura.project_id = p_project_id
        AND r.name = 'team_manager'
    )
    OR (
      v_org_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_role_assignments ura
        JOIN public.rbac_roles r ON r.id = ura.role_id
        WHERE ura.user_id = v_caller_id
          AND ura.org_id = v_org_id
          AND r.name = 'team_manager'
      )
    );

  v_tm_same_team :=
    EXISTS (
      SELECT 1
      FROM public.project_team_members ptm_mgr
      INNER JOIN public.project_teams pt
        ON pt.id = ptm_mgr.team_id
       AND pt.project_id = p_project_id
      INNER JOIN public.project_team_members ptm_tgt
        ON ptm_tgt.team_id = ptm_mgr.team_id
       AND ptm_tgt.user_id = p_target_user_id
      WHERE ptm_mgr.user_id = v_caller_id
        AND ptm_mgr.role = 'manager'
    );

  IF NOT (v_caller_can_full OR (v_caller_is_tm AND v_tm_same_team)) THEN
    RAISE EXCEPTION 'not_authorized_to_remove_member';
  END IF;

  DELETE FROM public.project_team_members ptm
  USING public.project_teams pt
  WHERE pt.id = ptm.team_id
    AND pt.project_id = p_project_id
    AND ptm.user_id = p_target_user_id;

  DELETE FROM public.user_role_assignments
  WHERE user_id    = p_target_user_id
    AND project_id = p_project_id;

  DELETE FROM public.user_project_access_grants
  WHERE user_id    = p_target_user_id
    AND project_id = p_project_id;

  DELETE FROM public.project_members
  WHERE project_id = p_project_id
    AND user_id    = p_target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_project_member_atomic(UUID, UUID) TO authenticated;
