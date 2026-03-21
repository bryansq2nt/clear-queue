-- team_manager should manage members of sub-teams they lead, not create/edit/delete
-- sub-team definitions. Those stay with project_owner / project_manager.
--
-- Depends on 20260324200001_seed_simplified_roles (must run after that seed).
--
-- Keeps: project_teams.read, project_teams.manage_members
-- Drops: project_teams.create, project_teams.update, project_teams.delete

DELETE FROM public.rbac_role_module_actions AS rma
USING public.rbac_roles AS r,
  public.rbac_module_actions AS a
WHERE rma.role_id = r.id
  AND rma.action_id = a.id
  AND r.name = 'team_manager'
  AND r.is_system_role = true
  AND a.action_key IN (
    'project_teams.create',
    'project_teams.update',
    'project_teams.delete'
  );
