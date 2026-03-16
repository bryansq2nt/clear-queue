-- =============================================================================
-- Phase 3: Sub-Teams
--
-- 1. Register 'project_teams' RBAC module + action keys
-- 2. Seed 3 new project-level roles: project_member, team_manager, project_manager
-- 3. Seed role grants for all new keys + update existing roles with new keys
-- 4. Create project_teams table (sub-teams within a project)
-- 5. Create project_team_members table (membership + manager role per sub-team)
-- =============================================================================

-- ── 1. Register module ────────────────────────────────────────────────────────

INSERT INTO public.rbac_modules (key, display_name, description) VALUES
  ('project_teams', 'Sub-Teams', 'Sub-team groups within a project')
ON CONFLICT DO NOTHING;

-- ── 2. Register action keys ───────────────────────────────────────────────────

INSERT INTO public.rbac_module_actions (module_key, action_key, description) VALUES
  ('project_teams', 'project_teams.read',            'List sub-teams and their members'),
  ('project_teams', 'project_teams.create',          'Create a sub-team'),
  ('project_teams', 'project_teams.update',          'Rename or describe a sub-team'),
  ('project_teams', 'project_teams.delete',          'Delete a sub-team'),
  ('project_teams', 'project_teams.manage_members',  'Add/remove members and set manager role within a sub-team')
ON CONFLICT DO NOTHING;

-- ── 3. Seed 3 new project-level roles ─────────────────────────────────────────

INSERT INTO public.rbac_roles (name, description, is_system_role) VALUES
  ('project_member',  'Can create and edit their own content; can be assigned to a sub-team', true),
  ('team_manager',    'Manages a sub-team: can view team data and manage own team members', true),
  ('project_manager', 'Manages all sub-teams and can assign tasks across the project', true)
ON CONFLICT DO NOTHING;

-- ── 4. Seed role grants ───────────────────────────────────────────────────────

-- project_viewer: can read sub-teams (already reads project members)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_viewer'
  AND a.action_key IN ('project_teams.read')
ON CONFLICT DO NOTHING;

-- project_member: same as viewer + read sub-teams
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_member'
  AND a.action_key IN (
    -- read access (same as project_viewer)
    'tasks.read', 'milestones.read', 'notes.read', 'documents.read',
    'media.read', 'calendar.read', 'links.read', 'ideas.read',
    'budgets.read', 'billings.read', 'todos.read', 'owner.read',
    'copilot.read_sessions', 'copilot.read_proposals',
    'projects.read', 'profile.read', 'workspace.read',
    'teams.read_project_members', 'project_teams.read',
    -- create own content
    'tasks.create', 'tasks.update_title', 'tasks.update_status',
    'tasks.update_priority', 'tasks.update_due_date', 'tasks.update_notes',
    'tasks.update_tags', 'tasks.update_milestone', 'tasks.assign', 'tasks.unassign',
    'tasks.reorder',
    'notes.create', 'notes.update_title', 'notes.update_content',
    'notes.add_link', 'notes.delete_link',
    'documents.upload', 'documents.view_signed_url', 'documents.download',
    'calendar.create', 'calendar.update', 'calendar.delete',
    'todos.create_item', 'todos.update_item', 'todos.toggle_item',
    'copilot.create_session', 'copilot.send_message', 'copilot.read_proposals',
    'copilot.approve_proposal', 'copilot.reject_proposal'
  )
ON CONFLICT DO NOTHING;

-- team_manager: project_member grants + sub-team management for own team
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'team_manager'
  AND a.action_key IN (
    -- inherit project_member
    'tasks.read', 'milestones.read', 'notes.read', 'documents.read',
    'media.read', 'calendar.read', 'links.read', 'ideas.read',
    'budgets.read', 'billings.read', 'todos.read', 'owner.read',
    'copilot.read_sessions', 'copilot.read_proposals',
    'projects.read', 'profile.read', 'workspace.read',
    'teams.read_project_members', 'project_teams.read',
    'tasks.create', 'tasks.update_title', 'tasks.update_status',
    'tasks.update_priority', 'tasks.update_due_date', 'tasks.update_notes',
    'tasks.update_tags', 'tasks.update_milestone', 'tasks.assign', 'tasks.unassign',
    'tasks.reorder',
    'notes.create', 'notes.update_title', 'notes.update_content',
    'notes.add_link', 'notes.delete_link',
    'documents.upload', 'documents.view_signed_url', 'documents.download',
    'calendar.create', 'calendar.update', 'calendar.delete',
    'todos.create_item', 'todos.update_item', 'todos.toggle_item',
    'copilot.create_session', 'copilot.send_message',
    'copilot.approve_proposal', 'copilot.reject_proposal',
    -- team_manager additions (scoped enforcement in server actions)
    'project_teams.update', 'project_teams.manage_members'
  )
ON CONFLICT DO NOTHING;

-- project_manager: team_manager grants + create/delete teams + full project scope
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_manager'
  AND a.action_key IN (
    -- inherit team_manager
    'tasks.read', 'milestones.read', 'notes.read', 'documents.read',
    'media.read', 'calendar.read', 'links.read', 'ideas.read',
    'budgets.read', 'billings.read', 'todos.read', 'owner.read',
    'copilot.read_sessions', 'copilot.read_proposals',
    'projects.read', 'profile.read', 'workspace.read',
    'teams.read_project_members', 'project_teams.read',
    'tasks.create', 'tasks.update_title', 'tasks.update_status',
    'tasks.update_priority', 'tasks.update_due_date', 'tasks.update_notes',
    'tasks.update_tags', 'tasks.update_milestone', 'tasks.assign', 'tasks.unassign',
    'tasks.reorder',
    'notes.create', 'notes.update_title', 'notes.update_content',
    'notes.add_link', 'notes.delete_link',
    'documents.upload', 'documents.view_signed_url', 'documents.download',
    'calendar.create', 'calendar.update', 'calendar.delete',
    'todos.create_item', 'todos.update_item', 'todos.toggle_item',
    'copilot.create_session', 'copilot.send_message',
    'copilot.approve_proposal', 'copilot.reject_proposal',
    'project_teams.update', 'project_teams.manage_members',
    -- project_manager additions
    'project_teams.create', 'project_teams.delete',
    'milestones.create', 'milestones.update', 'milestones.complete',
    'milestones.reopen', 'milestones.delete',
    'tasks.delete', 'notes.delete', 'documents.delete', 'documents.update_metadata',
    'documents.archive', 'documents.unarchive', 'documents.manage_folders',
    'links.create', 'links.update', 'links.archive', 'links.reorder', 'links.delete',
    'links.manage_categories', 'budgets.create', 'budgets.update',
    'billings.create', 'billings.update_amount', 'billings.update_status',
    'billings.update_description',
    'todos.create_list', 'todos.update_list', 'todos.delete_list',
    'todos.delete_item', 'todos.reorder_items'
  )
ON CONFLICT DO NOTHING;

-- Update existing roles with the new project_teams.read key
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name IN ('project_editor', 'project_owner')
  AND a.action_key = 'project_teams.read'
ON CONFLICT DO NOTHING;

-- project_owner additionally gets full sub-team management
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_owner'
  AND a.action_key IN (
    'project_teams.create', 'project_teams.update',
    'project_teams.delete', 'project_teams.manage_members'
  )
ON CONFLICT DO NOTHING;

-- ── 5. project_teams table ────────────────────────────────────────────────────

CREATE TABLE public.project_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX project_teams_project ON public.project_teams (project_id);

CREATE TRIGGER update_project_teams_updated_at
  BEFORE UPDATE ON public.project_teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.project_teams ENABLE ROW LEVEL SECURITY;

-- Any project member can read sub-teams
CREATE POLICY "project_teams_select" ON public.project_teams
  FOR SELECT USING (public.is_project_member(project_id));

-- Only project owners/managers can insert (enforced by requireCan in server action,
-- but RLS provides defense-in-depth by scoping to project membership)
CREATE POLICY "project_teams_insert" ON public.project_teams
  FOR INSERT WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "project_teams_update" ON public.project_teams
  FOR UPDATE USING (public.is_project_member(project_id));

CREATE POLICY "project_teams_delete" ON public.project_teams
  FOR DELETE USING (public.is_project_member(project_id));

-- ── 6. project_team_members table ─────────────────────────────────────────────

CREATE TABLE public.project_team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES public.project_teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX project_team_members_team   ON public.project_team_members (team_id);
CREATE INDEX project_team_members_user   ON public.project_team_members (user_id);

ALTER TABLE public.project_team_members ENABLE ROW LEVEL SECURITY;

-- Any project member can see who is in a sub-team
CREATE POLICY "project_team_members_select" ON public.project_team_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_teams pt
      WHERE pt.id = project_team_members.team_id
        AND public.is_project_member(pt.project_id)
    )
  );

CREATE POLICY "project_team_members_insert" ON public.project_team_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_teams pt
      WHERE pt.id = project_team_members.team_id
        AND public.is_project_member(pt.project_id)
    )
  );

CREATE POLICY "project_team_members_update" ON public.project_team_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.project_teams pt
      WHERE pt.id = project_team_members.team_id
        AND public.is_project_member(pt.project_id)
    )
  );

CREATE POLICY "project_team_members_delete" ON public.project_team_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.project_teams pt
      WHERE pt.id = project_team_members.team_id
        AND public.is_project_member(pt.project_id)
    )
  );
