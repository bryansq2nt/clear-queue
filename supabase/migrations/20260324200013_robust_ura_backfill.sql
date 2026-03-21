-- =============================================================================
-- Robust URA + project_members backfill using user_project_access_grants
-- as source of truth.
--
-- Root cause of 20260324200012 failure:
--   The affected user was invited via the new flow (has an explicit
--   user_project_access_grants row with allowed_modules). BUT the invite was
--   accepted between migrations, with a version of accept_invite_atomic that
--   may not have written project_members or user_role_assignments.
--   Migration 20260324200012 joined on project_members — found no row —
--   and silently skipped the user.
--
-- This migration uses user_project_access_grants as the canonical source of
-- "who has access to a project" and ensures both project_members AND
-- user_role_assignments are present for every access grant holder.
-- =============================================================================

DO $$
DECLARE
  v_team_member_id UUID;
  v_owner_id       UUID;
BEGIN
  SELECT id INTO v_team_member_id
  FROM public.rbac_roles
  WHERE name = 'team_member' AND is_system_role = true
  LIMIT 1;

  SELECT id INTO v_owner_id
  FROM public.rbac_roles
  WHERE name = 'owner' AND is_system_role = true
  LIMIT 1;

  IF v_team_member_id IS NULL THEN
    RAISE EXCEPTION 'team_member role not found in rbac_roles — run 20260324200001 first';
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'owner role not found in rbac_roles — run 20260324200001 first';
  END IF;

  -- Step 1: Ensure project_members rows exist for every access grant holder.
  -- invite acceptance may have written the grant but not the membership row.
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  SELECT upag.project_id, upag.user_id, upag.user_id
  FROM public.user_project_access_grants upag
  WHERE NOT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = upag.project_id
      AND pm.user_id    = upag.user_id
  )
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- Step 2: Backfill owner role for project owners missing a URA row.
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT p.owner_id, v_owner_id, p.id, p.owner_id
  FROM public.projects p
  WHERE p.owner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id    = p.owner_id
        AND ura.project_id = p.id
    )
  ON CONFLICT DO NOTHING;

  -- Step 3: Backfill team_member role for non-owner access grant holders
  -- who have no role assignment for this project.
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT upag.user_id, v_team_member_id, upag.project_id, upag.user_id
  FROM public.user_project_access_grants upag
  JOIN public.projects p ON p.id = upag.project_id
  WHERE p.owner_id <> upag.user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id    = upag.user_id
        AND ura.project_id = upag.project_id
    )
  ON CONFLICT DO NOTHING;

END $$;
