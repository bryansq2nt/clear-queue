-- =============================================================================
-- Ensure project creator always gets a module access grant row.
--
-- Missing row in user_project_access_grants is interpreted as fail-closed
-- (no module access). For creators/owners we must always persist a row with
-- NULL allowed_modules (unrestricted visibility).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_project_atomic(
  in_name        TEXT,
  in_color       TEXT        DEFAULT NULL,
  in_category    TEXT        DEFAULT 'business',
  in_org_id      UUID        DEFAULT NULL,
  in_client_id   UUID        DEFAULT NULL,
  in_business_id UUID        DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
  v_project public.projects%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF COALESCE(BTRIM(in_name), '') = '' THEN
    RAISE EXCEPTION 'Project name is required';
  END IF;

  SELECT id
  INTO v_role_id
  FROM public.rbac_roles
  WHERE is_system_role = true
    AND name IN ('owner', 'project_owner')
  ORDER BY CASE WHEN name = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'owner role not found in rbac_roles';
  END IF;

  INSERT INTO public.projects (
    name,
    color,
    category,
    owner_id,
    org_id,
    client_id,
    business_id
  )
  VALUES (
    BTRIM(in_name),
    in_color,
    in_category,
    v_user_id,
    in_org_id,
    in_client_id,
    in_business_id
  )
  RETURNING * INTO v_project;

  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_project.id, v_user_id, v_user_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (v_user_id, v_role_id, v_project.id, v_user_id)
  ON CONFLICT DO NOTHING;

  -- Creator/owner must always have a grant row; NULL allowed_modules = unrestricted.
  INSERT INTO public.user_project_access_grants (
    project_id,
    user_id,
    allowed_modules,
    read_scope
  )
  VALUES (v_project.id, v_user_id, NULL, 'project')
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    read_scope = EXCLUDED.read_scope,
    updated_at = NOW();

  RETURN v_project;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_atomic(TEXT, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;
