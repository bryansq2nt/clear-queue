-- =============================================================================
-- Idempotent backfill: assign team_member URA for project_members still missing
-- a row (same logic as 20260324200012). Safe to re-run after new edge cases.
-- App layer also falls back in getRoleIdsForUserInProject when URA is empty.
-- =============================================================================

INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
SELECT
  pm.user_id,
  r.id AS role_id,
  pm.project_id,
  pm.user_id
FROM public.project_members pm
JOIN public.projects p
  ON p.id = pm.project_id
JOIN public.rbac_roles r
  ON r.name = 'team_member'
  AND r.is_system_role = true
WHERE
  p.owner_id <> pm.user_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    WHERE ura.user_id = pm.user_id
      AND ura.project_id = pm.project_id
  );
