-- =============================================================================
-- Restrict task assignment changes to owner, project_manager, and team_manager.
--
-- team_manager is limited to members of the sub-teams they manage.
-- team_member and guest may only create self-assigned tasks or leave tasks
-- unassigned; they cannot change assignments involving other members.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_task_assignee(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_project_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_assign_task_to_member(
  p_project_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_role_name text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_project_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_valid_task_assignee(p_project_id, p_target_user_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = v_caller_id
  ) THEN
    RETURN true;
  END IF;

  SELECT r.name
  INTO v_role_name
  FROM public.user_role_assignments ura
  JOIN public.rbac_roles r
    ON r.id = ura.role_id
  WHERE ura.user_id = v_caller_id
    AND ura.project_id = p_project_id
  LIMIT 1;

  IF v_role_name = 'project_manager' THEN
    RETURN true;
  END IF;

  IF v_role_name = 'team_manager' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.project_team_members ptm_mgr
      JOIN public.project_teams pt
        ON pt.id = ptm_mgr.team_id
       AND pt.project_id = p_project_id
      JOIN public.project_team_members ptm_tgt
        ON ptm_tgt.team_id = ptm_mgr.team_id
       AND ptm_tgt.user_id = p_target_user_id
      WHERE ptm_mgr.user_id = v_caller_id
        AND ptm_mgr.role = 'manager'
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_task_assignment_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_assignment_changed boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NEW.assigned_to IS NOT NULL
     AND NOT public.is_valid_task_assignee(NEW.project_id, NEW.assigned_to) THEN
    RAISE EXCEPTION 'task_assignee_must_be_project_member';
  END IF;

  v_assignment_changed :=
    TG_OP = 'INSERT'
    OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.project_id IS DISTINCT FROM OLD.project_id;

  IF NOT v_assignment_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    IF TG_OP = 'INSERT' OR OLD.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;

    IF OLD.assigned_to = v_caller_id THEN
      RETURN NEW;
    END IF;

    IF public.can_assign_task_to_member(NEW.project_id, OLD.assigned_to) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'task_assignment_forbidden';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.assigned_to = v_caller_id THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_to IS NULL AND NEW.assigned_to = v_caller_id THEN
    RETURN NEW;
  END IF;

  IF public.can_assign_task_to_member(NEW.project_id, NEW.assigned_to) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'task_assignment_forbidden';
END;
$$;

DROP TRIGGER IF EXISTS enforce_task_assignment_permissions_on_tasks
  ON public.tasks;

CREATE TRIGGER enforce_task_assignment_permissions_on_tasks
  BEFORE INSERT OR UPDATE OF project_id, assigned_to
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_assignment_permissions();
