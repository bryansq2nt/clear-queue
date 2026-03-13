-- ============================================================
-- Migration: bootstrap role assignments
-- Admin user 8df49d2b-9bd4-4a98-8f39-865cc68ea601:
--   - org_owner of mutechlabs organization
--   - project_owner of all their existing projects
-- All other users:
--   - org_member of mutechlabs organization
-- ============================================================

-- Admin user → org_owner at mutechlabs org level
INSERT INTO public.user_role_assignments (user_id, role_id, org_id, assigned_by)
SELECT
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601',
  (SELECT id FROM public.rbac_roles WHERE name = 'org_owner' AND is_system_role = true),
  (SELECT id FROM public.organizations WHERE slug = 'mutechlabs'),
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
ON CONFLICT DO NOTHING;

-- All other users → org_member at mutechlabs org level
INSERT INTO public.user_role_assignments (user_id, role_id, org_id, assigned_by)
SELECT
  om.user_id,
  (SELECT id FROM public.rbac_roles WHERE name = 'org_member' AND is_system_role = true),
  om.org_id,
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
FROM public.organization_members om
WHERE om.user_id <> '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
ON CONFLICT DO NOTHING;

-- Admin user → project_owner for every project they own
INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
SELECT
  pm.user_id,
  (SELECT id FROM public.rbac_roles WHERE name = 'project_owner' AND is_system_role = true),
  pm.project_id,
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
FROM public.project_members pm
WHERE pm.user_id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
ON CONFLICT DO NOTHING;

-- Validation: admin user must have exactly 1 org-level role assignment
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.user_role_assignments
  WHERE user_id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
    AND org_id IS NOT NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 org role assignment for admin user, got %', v_count;
  END IF;
END $$;

-- Validation: admin user must have project_owner assignment for every project they own
DO $$
DECLARE v_missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM public.project_members pm
  LEFT JOIN public.user_role_assignments ura
    ON ura.project_id = pm.project_id
   AND ura.user_id = pm.user_id
  WHERE pm.user_id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
    AND ura.id IS NULL;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Admin user is missing project_owner assignment on % project(s)', v_missing;
  END IF;
END $$;
