-- =============================================================================
-- Remove projects.delete from project_manager role.
--
-- Per product decision: project managers can use everything in a project but
-- cannot delete the project itself. Only the owner can delete a project.
-- This is enforced at DB level (role grants) and at UI level.
-- =============================================================================

DELETE FROM public.rbac_role_module_actions
WHERE role_id = (
    SELECT id FROM public.rbac_roles
    WHERE name = 'project_manager' AND is_system_role = true
)
AND action_id = (
    SELECT id FROM public.rbac_module_actions
    WHERE action_key = 'projects.delete'
);
