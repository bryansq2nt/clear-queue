-- ============================================================
-- RPCs: get_member_access_for_project, update_member_access_atomic
-- Used by Teams UI to view and update a member's modules and permissions.
-- ============================================================

-- ─── get_member_access_for_project ─────────────────────────────────────────
-- Returns current roles, allowed_modules (from user_project_access_grants),
-- and granted action keys (from rbac_role_module_actions) for a project member.
-- Caller must be a member of the same project.

CREATE OR REPLACE FUNCTION public.get_member_access_for_project(
  p_project_id UUID,
  p_user_id    UUID
)
RETURNS TABLE (
  role_ids        UUID[],
  role_names      TEXT[],
  allowed_modules TEXT[],
  granted_actions  TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH member_roles AS (
    SELECT ura.role_id
    FROM public.user_role_assignments ura
    WHERE ura.user_id = p_user_id
      AND ura.project_id = p_project_id
  )
  SELECT
    COALESCE((SELECT array_agg(mr.role_id) FROM member_roles mr), ARRAY[]::UUID[]),
    COALESCE((
      SELECT array_agg(r.name ORDER BY r.name)
      FROM member_roles mr
      JOIN public.rbac_roles r ON r.id = mr.role_id
    ), ARRAY[]::TEXT[]),
    (SELECT g.allowed_modules FROM public.user_project_access_grants g
     WHERE g.project_id = p_project_id AND g.user_id = p_user_id LIMIT 1),
    COALESCE((
      SELECT array_agg(DISTINCT a.action_key ORDER BY a.action_key)
      FROM member_roles mr
      JOIN public.rbac_role_module_actions rrma ON rrma.role_id = mr.role_id
      JOIN public.rbac_module_actions a ON a.id = rrma.action_id
    ), ARRAY[]::TEXT[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_access_for_project(UUID, UUID) TO authenticated;


-- ─── update_member_access_atomic ───────────────────────────────────────────
-- Assigns a project access profile to an existing member: sets their role to the
-- profile's base_role and updates user_project_access_grants with the profile's
-- allowed_modules. Caller must be a project member with teams.update_project_member_roles
-- (enforced in server action); this RPC only checks project membership.
-- Fails if demoting the last project_owner.

CREATE OR REPLACE FUNCTION public.update_member_access_atomic(
  p_project_id UUID,
  p_user_id    UUID,
  p_profile_id UUID,
  p_assigned_by UUID DEFAULT auth.uid()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile     RECORD;
  v_owner_role  UUID;
  v_owner_count INT;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT id, base_role_id, allowed_modules
  INTO v_profile
  FROM public.project_access_profiles
  WHERE id = p_profile_id
    AND (project_id = p_project_id OR (project_id IS NULL AND org_id IS NULL));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Resolve project_owner role id
  SELECT id INTO v_owner_role
  FROM public.rbac_roles
  WHERE name = 'project_owner' AND is_system_role = true;

  -- If target user is currently an owner, check they are not the last owner
  IF EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = p_user_id
      AND ura.project_id = p_project_id
      AND ura.role_id = v_owner_role
  ) AND v_profile.base_role_id <> v_owner_role THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.user_role_assignments ura
    WHERE ura.project_id = p_project_id AND ura.role_id = v_owner_role;
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_demote_last_owner';
    END IF;
  END IF;

  -- Remove all existing role assignments for this user in this project
  DELETE FROM public.user_role_assignments
  WHERE user_id = p_user_id AND project_id = p_project_id;

  -- Assign the profile's base role
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (p_user_id, v_profile.base_role_id, p_project_id, p_assigned_by);

  -- Upsert user_project_access_grants
  IF v_profile.allowed_modules IS NOT NULL THEN
    INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
    VALUES (p_project_id, p_user_id, v_profile.allowed_modules)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();
  ELSE
    DELETE FROM public.user_project_access_grants
    WHERE project_id = p_project_id AND user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_access_atomic(UUID, UUID, UUID, UUID) TO authenticated;
