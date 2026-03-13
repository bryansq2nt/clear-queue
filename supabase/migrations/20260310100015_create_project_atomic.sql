-- ============================================================
-- Migration: create_project_atomic RPC
-- Creates a project, adds the creator to project_members, and
-- assigns them the project_owner role — all in one transaction.
-- Replaces the non-atomic sequence in app/actions/projects.ts.
-- ============================================================

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
SECURITY INVOKER
AS $$
DECLARE
  v_user_id   UUID;
  v_role_id   UUID;
  v_project   public.projects%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF COALESCE(BTRIM(in_name), '') = '' THEN
    RAISE EXCEPTION 'Project name is required';
  END IF;

  -- Look up the project_owner role ID (system role, always exists)
  SELECT id INTO v_role_id
  FROM public.rbac_roles
  WHERE name = 'project_owner' AND is_system_role = true
  LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'project_owner role not found in rbac_roles';
  END IF;

  -- 1. Create the project
  INSERT INTO public.projects (name, color, category, owner_id, org_id, client_id, business_id)
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

  -- 2. Add creator to project_members
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_project.id, v_user_id, v_user_id)
  ON CONFLICT DO NOTHING;

  -- 3. Assign project_owner role
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (v_user_id, v_role_id, v_project.id, v_user_id)
  ON CONFLICT DO NOTHING;

  RETURN v_project;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_atomic(TEXT, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;
