-- ============================================================
-- remove_project_member_atomic
--
-- Atomically removes a member from a project:
--   1. Deletes user_role_assignments for (user, project)
--   2. Deletes user_project_action_grants for (user, project)
--   3. Deletes project_members row
--
-- SECURITY DEFINER: project_members has no DELETE RLS policy (writes
-- go through RPCs). The function validates auth.uid() at the top and
-- checks the caller has project_owner role before deleting.
-- ============================================================

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
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  -- Caller must be a project member
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  -- Caller must hold the project_owner role for this project
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.rbac_roles r ON r.id = ura.role_id
    WHERE ura.project_id = p_project_id
      AND ura.user_id    = v_caller_id
      AND r.name         = 'project_owner'
  ) THEN
    RAISE EXCEPTION 'Only project owners can remove members';
  END IF;

  -- Target must be an actual member
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id    = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this project';
  END IF;

  -- 1. Remove role assignments
  DELETE FROM public.user_role_assignments
  WHERE user_id    = p_target_user_id
    AND project_id = p_project_id;

  -- 2. Remove custom action grants (if any)
  DELETE FROM public.user_project_action_grants
  WHERE user_id    = p_target_user_id
    AND project_id = p_project_id;

  -- 3. Remove membership
  DELETE FROM public.project_members
  WHERE project_id = p_project_id
    AND user_id    = p_target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_project_member_atomic(UUID, UUID) TO authenticated;
