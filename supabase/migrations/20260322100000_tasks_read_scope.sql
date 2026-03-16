-- =============================================================================
-- Tasks Read Scope: tasks.read.own / tasks.read.team / tasks.read.project
--
-- Mirrors the pattern established in 20260319200000_read_scope_action_keys.sql
-- for the 8 content modules. Tasks did not have tiered read keys because all
-- project members could see all tasks. This migration adds them so the invite
-- form can restrict a member to only seeing tasks assigned to them.
--
-- Backwards compat: the existing tasks.read key is preserved and resolves to
-- 'project' scope in resolveTaskReadScope() — no existing grants break.
-- =============================================================================

-- ── 1. Insert scoped read action keys ─────────────────────────────────────────

INSERT INTO public.rbac_module_actions (module_key, action_key, description) VALUES
  ('tasks', 'tasks.read.own',     'View only tasks assigned to you in this project'),
  ('tasks', 'tasks.read.team',    'View tasks assigned to members of your sub-teams'),
  ('tasks', 'tasks.read.project', 'View all tasks in the project')
ON CONFLICT DO NOTHING;

-- ── 2. project_viewer → tasks.read.project ────────────────────────────────────
-- Viewer can see everything — keep at project scope.

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_viewer'
  AND a.action_key = 'tasks.read.project'
ON CONFLICT DO NOTHING;

-- ── 3. project_member → tasks.read.own ────────────────────────────────────────
-- Members see only their own tasks by default.

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_member'
  AND a.action_key = 'tasks.read.own'
ON CONFLICT DO NOTHING;

-- ── 4. team_manager → tasks.read.team + tasks.read.own ────────────────────────

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'team_manager'
  AND a.action_key IN ('tasks.read.team', 'tasks.read.own')
ON CONFLICT DO NOTHING;

-- ── 5. project_manager / project_editor / project_owner → tasks.read.project ──

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name IN ('project_manager', 'project_editor', 'project_owner')
  AND a.action_key IN ('tasks.read.project', 'tasks.read.team', 'tasks.read.own')
ON CONFLICT DO NOTHING;
