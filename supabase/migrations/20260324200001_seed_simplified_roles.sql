-- =============================================================================
-- Phase 2: Seed the simplified 5-role system
--
-- Action key model: {module}.read / create / update / delete for each module.
-- Modules: tasks, notes, budgets, billings, links, ideas,
--          documents, media, todos, milestones, calendar, copilot
--          + extended: projects, owner, project_teams
-- Cross-module: projects.manage_modules, teams.invite, teams.manage_members
--
-- Total: (12 + 3) × 4 + 3 cross-module = 63 action keys
--
-- Role grants (exclusion-based):
--   owner          → ALL keys
--   project_manager→ ALL keys
--   team_manager   → ALL except projects.manage_modules + projects.create/update/delete + owner.delete
--   team_member    → ALL except projects.manage_modules + projects.create/update/delete
--                        + owner.create/update/delete + project_teams.create/update/delete
--                        + teams.invite + teams.manage_members
--   guest          → *.read only
--
-- Backfills owner role for all existing project owners.
-- =============================================================================

-- ── 1. Insert 5 new system roles ──────────────────────────────────────────────

INSERT INTO public.rbac_roles (name, description, is_system_role) VALUES
  ('owner',           'Full project control — manages members, modules, and all content', true),
  ('project_manager', 'Manages all sub-teams; can invite, configure modules, and edit all content', true),
  ('team_manager',    'Manages a specific sub-team; can invite Members and Guests for their team', true),
  ('team_member',     'Creates and manages their own content; can edit tasks assigned to them', true),
  ('guest',           'Read-only access to selected modules; scope set at invite time', true)
ON CONFLICT DO NOTHING;

-- ── 2. Simplified action keys — 12 context-tab modules × 4 CRUD actions ───────

DO $$
DECLARE
  modules TEXT[] := ARRAY[
    'tasks','notes','budgets','billings','links','ideas',
    'documents','media','todos','milestones','calendar','copilot'
  ];
  actions TEXT[] := ARRAY['read','create','update','delete'];
  mod TEXT;
  act TEXT;
BEGIN
  FOREACH mod IN ARRAY modules LOOP
    FOREACH act IN ARRAY actions LOOP
      INSERT INTO public.rbac_module_actions (id, module_key, action_key)
      VALUES (gen_random_uuid(), mod, mod || '.' || act)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ── 3. Cross-module management actions ────────────────────────────────────────

INSERT INTO public.rbac_module_actions (id, module_key, action_key) VALUES
  (gen_random_uuid(), 'projects', 'projects.manage_modules'),
  (gen_random_uuid(), 'teams',    'teams.invite'),
  (gen_random_uuid(), 'teams',    'teams.manage_members')
ON CONFLICT DO NOTHING;

-- ── 4. Extended system module keys (project management, owner tab, sub-teams) ─

DO $$
DECLARE
  ext_modules TEXT[] := ARRAY['projects', 'owner', 'project_teams'];
  actions     TEXT[] := ARRAY['read','create','update','delete'];
  mod TEXT;
  act TEXT;
BEGIN
  FOREACH mod IN ARRAY ext_modules LOOP
    FOREACH act IN ARRAY actions LOOP
      INSERT INTO public.rbac_module_actions (id, module_key, action_key)
      VALUES (gen_random_uuid(), mod, mod || '.' || act)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ── 5. Role → action grants ────────────────────────────────────────────────────

-- owner: all keys
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

-- project_manager: all keys (same as owner)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_manager'
ON CONFLICT DO NOTHING;

-- team_manager: all EXCEPT projects.manage_modules and project CRUD write ops
-- (TM can view projects but cannot create/modify/delete the project itself)
-- TM can do everything on their sub-team's content + invite + manage_members
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'team_manager'
  AND a.action_key NOT IN (
    'projects.manage_modules',
    'projects.create', 'projects.update', 'projects.delete',
    'owner.delete'
  )
ON CONFLICT DO NOTHING;

-- team_member: all 12-module CRUD + read-only access to system modules
-- Cannot: invite, manage members, manage modules, manage projects/owner/sub-teams
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'team_member'
  AND a.action_key NOT IN (
    'projects.manage_modules',
    'projects.create', 'projects.update', 'projects.delete',
    'owner.create', 'owner.update', 'owner.delete',
    'project_teams.create', 'project_teams.update', 'project_teams.delete',
    'teams.invite', 'teams.manage_members'
  )
ON CONFLICT DO NOTHING;

-- guest: read-only (all *.read keys; scope enforced at app layer via read_scope)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'guest'
  AND a.action_key LIKE '%.read'
ON CONFLICT DO NOTHING;

-- ── 6. Backfill owner role assignments from projects.owner_id ─────────────────

INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
SELECT
  p.owner_id,
  (SELECT id FROM public.rbac_roles WHERE name = 'owner' AND is_system_role = true),
  p.id,
  p.owner_id
FROM public.projects p
WHERE p.owner_id IS NOT NULL
ON CONFLICT DO NOTHING;
