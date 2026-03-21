-- =============================================================================
-- Backfill team_member role for non-owner project_members with no URA row.
--
-- Root cause: migration 20260324200000 TRUNCATEd user_role_assignments to
-- clear legacy test data. Migration 20260324200001 only seeded the 'owner'
-- role for project owners. All other pre-existing project_members were left
-- with no user_role_assignments row, which causes getCanUseModuleMemberContent
-- to return false → canCreate = false → no create buttons in board/notes/docs.
--
-- Fix: assign the 'team_member' role (full CRUD on all 12 content modules,
-- no admin capabilities) to every non-owner project_member who has no role.
-- New invites go through accept_invite_atomic which already writes a URA row,
-- so only pre-existing members are affected.
-- =============================================================================

INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
SELECT
  pm.user_id,
  r.id AS role_id,
  pm.project_id,
  pm.user_id   -- self-assigned (backfill; no original assigner)
FROM public.project_members pm
JOIN public.projects p
  ON p.id = pm.project_id
JOIN public.rbac_roles r
  ON r.name = 'team_member'
  AND r.is_system_role = true
WHERE
  -- Skip project owners — already backfilled with 'owner' role in 20260324200001
  p.owner_id <> pm.user_id
  -- Only members who have no role assignment for this project at all
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    WHERE ura.user_id = pm.user_id
      AND ura.project_id = pm.project_id
  );
