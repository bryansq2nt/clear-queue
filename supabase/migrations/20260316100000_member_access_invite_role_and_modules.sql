-- ============================================================
-- RPCs: update_member_access_by_invite_role_atomic, update_member_modules_atomic
-- Allow applying a saved invite role to an existing member, and updating
-- only their visible modules (allowed_modules) without changing role.
-- ============================================================

-- ─── update_member_access_by_invite_role_atomic ─────────────────────────────
-- Applies a project_invite_roles row to an existing member: sets their role
-- from effective_role_name and allowed_modules from the invite role.
CREATE OR REPLACE FUNCTION public.update_member_access_by_invite_role_atomic(
  p_project_id     UUID,
  p_user_id        UUID,
  p_invite_role_id UUID,
  p_assigned_by    UUID DEFAULT auth.uid()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_role   RECORD;
  v_effective_role UUID;
  v_owner_role    UUID;
  v_owner_count   INT;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT effective_role_name, allowed_modules
  INTO v_invite_role
  FROM public.project_invite_roles
  WHERE id = p_invite_role_id AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_role_not_found';
  END IF;

  SELECT id INTO v_effective_role
  FROM public.rbac_roles
  WHERE name = v_invite_role.effective_role_name AND is_system_role = true;

  IF v_effective_role IS NULL THEN
    RAISE EXCEPTION 'role_not_found';
  END IF;

  SELECT id INTO v_owner_role
  FROM public.rbac_roles
  WHERE name = 'project_owner' AND is_system_role = true;

  IF EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = p_user_id
      AND ura.project_id = p_project_id
      AND ura.role_id = v_owner_role
  ) AND v_effective_role <> v_owner_role THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.user_role_assignments ura
    WHERE ura.project_id = p_project_id AND ura.role_id = v_owner_role;
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_demote_last_owner';
    END IF;
  END IF;

  DELETE FROM public.user_role_assignments
  WHERE user_id = p_user_id AND project_id = p_project_id;

  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (p_user_id, v_effective_role, p_project_id, p_assigned_by);

  IF v_invite_role.allowed_modules IS NOT NULL AND array_length(v_invite_role.allowed_modules, 1) > 0 THEN
    INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
    VALUES (p_project_id, p_user_id, v_invite_role.allowed_modules)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();
  ELSE
    DELETE FROM public.user_project_access_grants
    WHERE project_id = p_project_id AND user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_access_by_invite_role_atomic(UUID, UUID, UUID, UUID) TO authenticated;


-- ─── update_member_modules_atomic ───────────────────────────────────────────
-- Updates only the visible modules (allowed_modules) for a project member.
-- p_allowed_modules: NULL or empty = unrestricted (all tabs); non-empty = allowlist.
CREATE OR REPLACE FUNCTION public.update_member_modules_atomic(
  p_project_id      UUID,
  p_user_id         UUID,
  p_allowed_modules TEXT[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_allowed_modules IS NULL OR array_length(p_allowed_modules, 1) IS NULL OR array_length(p_allowed_modules, 1) = 0 THEN
    DELETE FROM public.user_project_access_grants
    WHERE project_id = p_project_id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
    VALUES (p_project_id, p_user_id, p_allowed_modules)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_modules_atomic(UUID, UUID, TEXT[]) TO authenticated;
