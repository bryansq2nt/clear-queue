-- ============================================================
-- Migration: RBAC metadata tables
-- rbac_roles, rbac_modules, rbac_module_actions, rbac_role_module_actions
-- All seeded with system roles and canonical action keys
-- ============================================================

-- ─── rbac_roles ───────────────────────────────────────────────────────────────

CREATE TABLE public.rbac_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT false,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (name, org_id)
);

CREATE INDEX rbac_roles_org ON public.rbac_roles (org_id) WHERE org_id IS NOT NULL;

CREATE TRIGGER update_rbac_roles_updated_at
  BEFORE UPDATE ON public.rbac_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.rbac_roles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read system roles and their org's custom roles
CREATE POLICY "rbac_roles_select" ON public.rbac_roles
  FOR SELECT USING (
    is_system_role = true
    OR EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = rbac_roles.org_id AND user_id = auth.uid()
    )
  );

-- ─── rbac_modules ─────────────────────────────────────────────────────────────

CREATE TABLE public.rbac_modules (
  key          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rbac_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rbac_modules_select" ON public.rbac_modules
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── rbac_module_actions ──────────────────────────────────────────────────────

CREATE TABLE public.rbac_module_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  TEXT NOT NULL REFERENCES public.rbac_modules(key) ON DELETE CASCADE,
  action_key  TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX rma_module ON public.rbac_module_actions (module_key);

ALTER TABLE public.rbac_module_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rbac_module_actions_select" ON public.rbac_module_actions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── rbac_role_module_actions ─────────────────────────────────────────────────

CREATE TABLE public.rbac_role_module_actions (
  role_id   UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.rbac_module_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, action_id)
);

CREATE INDEX rrma_role   ON public.rbac_role_module_actions (role_id);
CREATE INDEX rrma_action ON public.rbac_role_module_actions (action_id);

ALTER TABLE public.rbac_role_module_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rbac_role_module_actions_select" ON public.rbac_role_module_actions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── Seed: modules ────────────────────────────────────────────────────────────

INSERT INTO public.rbac_modules (key, display_name) VALUES
  ('tasks',       'Board / Tasks'),
  ('milestones',  'Milestones'),
  ('notes',       'Notes'),
  ('documents',   'Documents'),
  ('media',       'Media'),
  ('calendar',    'Calendar'),
  ('links',       'Links'),
  ('ideas',       'Ideas'),
  ('budgets',     'Budgets'),
  ('billings',    'Billings'),
  ('todos',       'To-do Lists'),
  ('copilot',     'Copilot AI'),
  ('projects',    'Projects'),
  ('clients',     'Clients'),
  ('businesses',  'Businesses'),
  ('teams',       'Teams & Members'),
  ('profile',     'Profile'),
  ('workspace',   'Workspace')
ON CONFLICT DO NOTHING;

-- ─── Seed: system roles ───────────────────────────────────────────────────────

INSERT INTO public.rbac_roles (name, description, is_system_role) VALUES
  ('org_owner',       'Full organization control including billing and danger zone', true),
  ('org_admin',       'Manage members, projects, and org-level resources; cannot delete org', true),
  ('org_member',      'View org-level resources; access projects they are invited to', true),
  ('project_owner',   'Full project control including member management', true),
  ('project_editor',  'Create and edit all project content; cannot manage members or delete project', true),
  ('project_viewer',  'Read-only access to all project content', true)
ON CONFLICT DO NOTHING;

-- ─── Seed: action keys ────────────────────────────────────────────────────────

INSERT INTO public.rbac_module_actions (module_key, action_key, description) VALUES
  -- tasks
  ('tasks', 'tasks.read',             'List and view tasks in a project'),
  ('tasks', 'tasks.create',           'Create a new task'),
  ('tasks', 'tasks.update_title',     'Edit task title'),
  ('tasks', 'tasks.update_status',    'Move task to another status column'),
  ('tasks', 'tasks.update_priority',  'Change task priority level'),
  ('tasks', 'tasks.update_due_date',  'Set or clear the due date'),
  ('tasks', 'tasks.update_notes',     'Edit task notes/description'),
  ('tasks', 'tasks.update_tags',      'Add or remove task tags'),
  ('tasks', 'tasks.update_milestone', 'Link or unlink a milestone'),
  ('tasks', 'tasks.assign',           'Assign task to a user'),
  ('tasks', 'tasks.unassign',         'Remove user assignment'),
  ('tasks', 'tasks.delete',           'Delete a single task'),
  ('tasks', 'tasks.bulk_delete',      'Delete multiple tasks'),
  ('tasks', 'tasks.reorder',          'Reorder tasks within or between columns'),
  ('tasks', 'tasks.duplicate',        'Clone an existing task'),
  -- milestones
  ('milestones', 'milestones.read',     'List and view milestones'),
  ('milestones', 'milestones.create',   'Create a milestone'),
  ('milestones', 'milestones.update',   'Edit milestone title, description, dates'),
  ('milestones', 'milestones.complete', 'Mark milestone as complete'),
  ('milestones', 'milestones.reopen',   'Reopen a completed milestone'),
  ('milestones', 'milestones.delete',   'Delete a milestone and unlink tasks'),
  -- notes
  ('notes', 'notes.read',            'List and open notes'),
  ('notes', 'notes.create',          'Create a note'),
  ('notes', 'notes.update_title',    'Edit note title'),
  ('notes', 'notes.update_content',  'Edit note body'),
  ('notes', 'notes.delete',          'Delete a single note'),
  ('notes', 'notes.bulk_delete',     'Delete multiple notes'),
  ('notes', 'notes.add_link',        'Add a reference link to a note'),
  ('notes', 'notes.delete_link',     'Remove a link from a note'),
  ('notes', 'notes.manage_folders',  'Create, rename, delete note folders'),
  -- documents
  ('documents', 'documents.read',             'List documents and metadata'),
  ('documents', 'documents.view_signed_url',  'Generate a signed URL to view a document'),
  ('documents', 'documents.download',         'Generate a download-intent signed URL'),
  ('documents', 'documents.upload',           'Upload one or more documents'),
  ('documents', 'documents.update_metadata',  'Edit title, description, category, tags'),
  ('documents', 'documents.archive',          'Soft-archive a document'),
  ('documents', 'documents.unarchive',        'Restore an archived document'),
  ('documents', 'documents.mark_final',       'Mark a document as final/approved'),
  ('documents', 'documents.delete',           'Soft-delete a document'),
  ('documents', 'documents.bulk_delete',      'Soft-delete multiple documents'),
  ('documents', 'documents.manage_folders',   'Create, rename, delete document folders'),
  -- media
  ('media', 'media.read',             'List media and metadata'),
  ('media', 'media.view_signed_url',  'Generate signed URL to view media'),
  ('media', 'media.upload',           'Upload a media file'),
  ('media', 'media.update_metadata',  'Edit caption, category, tags'),
  ('media', 'media.archive',          'Soft-archive a media item'),
  ('media', 'media.unarchive',        'Restore archived media'),
  ('media', 'media.mark_final',       'Mark as favorite/final'),
  ('media', 'media.delete',           'Delete a media item from DB and storage'),
  ('media', 'media.share_create',     'Create a public share token'),
  -- calendar
  ('calendar', 'calendar.read',    'Read project calendar feed'),
  ('calendar', 'calendar.create',  'Create a calendar event'),
  ('calendar', 'calendar.update',  'Edit event details'),
  ('calendar', 'calendar.delete',  'Delete an event'),
  -- links
  ('links', 'links.read',              'List project links and categories'),
  ('links', 'links.create',            'Create a new link'),
  ('links', 'links.update',            'Edit link title, URL, category, tags'),
  ('links', 'links.archive',           'Archive a link'),
  ('links', 'links.reorder',           'Reorder links'),
  ('links', 'links.delete',            'Delete a link'),
  ('links', 'links.manage_categories', 'Create, update, delete link categories'),
  -- ideas
  ('ideas', 'ideas.read',               'List idea boards and nodes'),
  ('ideas', 'ideas.create_board',       'Create an idea board'),
  ('ideas', 'ideas.update_board',       'Rename or describe a board'),
  ('ideas', 'ideas.delete_board',       'Delete a board and all nodes'),
  ('ideas', 'ideas.create_node',        'Add a node to a board'),
  ('ideas', 'ideas.update_node',        'Edit node content'),
  ('ideas', 'ideas.delete_node',        'Remove a node'),
  ('ideas', 'ideas.manage_connections', 'Create or delete connections between nodes'),
  ('ideas', 'ideas.batch_update',       'Batch canvas layout save'),
  ('ideas', 'ideas.link_project',       'Associate board with a project'),
  -- budgets
  ('budgets', 'budgets.read',              'List budgets and stats'),
  ('budgets', 'budgets.create',            'Create a budget envelope'),
  ('budgets', 'budgets.update',            'Edit budget name and description'),
  ('budgets', 'budgets.delete',            'Delete a budget and cascade items'),
  ('budgets', 'budgets.duplicate',         'Duplicate a budget'),
  ('budgets', 'budgets.manage_categories', 'Create, update, delete budget categories'),
  ('budgets', 'budgets.manage_items',      'Create, update, delete, status-change budget items'),
  -- billings
  ('billings', 'billings.read',               'List billing records'),
  ('billings', 'billings.create',             'Create a billing record'),
  ('billings', 'billings.update_amount',      'Change amount or currency'),
  ('billings', 'billings.update_status',      'Change billing status'),
  ('billings', 'billings.update_description', 'Edit title, notes, dates, payment fields'),
  ('billings', 'billings.delete',             'Delete a billing record'),
  ('billings', 'billings.manage_categories',  'Create or delete billing categories'),
  -- todos
  ('todos', 'todos.read',          'List todo lists and items'),
  ('todos', 'todos.create_list',   'Create a todo list'),
  ('todos', 'todos.update_list',   'Edit list title'),
  ('todos', 'todos.delete_list',   'Delete a list and all items'),
  ('todos', 'todos.create_item',   'Add an item to a list'),
  ('todos', 'todos.update_item',   'Edit item text'),
  ('todos', 'todos.toggle_item',   'Check or uncheck an item'),
  ('todos', 'todos.delete_item',   'Delete an item'),
  ('todos', 'todos.reorder_items', 'Reorder items in a list'),
  -- copilot
  ('copilot', 'copilot.read_sessions',    'List and read AI sessions'),
  ('copilot', 'copilot.create_session',   'Start a new AI session'),
  ('copilot', 'copilot.archive_session',  'Archive a session'),
  ('copilot', 'copilot.delete_session',   'Permanently delete a session'),
  ('copilot', 'copilot.send_message',     'Send a message to the AI'),
  ('copilot', 'copilot.read_proposals',   'View AI proposals'),
  ('copilot', 'copilot.approve_proposal', 'Approve a proposal (executes side effect)'),
  ('copilot', 'copilot.reject_proposal',  'Reject a proposal'),
  ('copilot', 'copilot.undo_proposal',    'Undo an approved delete proposal'),
  ('copilot', 'copilot.bulk_approve',     'Approve all pending proposals'),
  ('copilot', 'copilot.bulk_reject',      'Reject all pending proposals'),
  -- projects
  ('projects', 'projects.read',          'List and view project details'),
  ('projects', 'projects.create',        'Create a new project'),
  ('projects', 'projects.update',        'Edit project name, color, category, notes'),
  ('projects', 'projects.archive',       'Archive a project'),
  ('projects', 'projects.unarchive',     'Restore archived project'),
  ('projects', 'projects.delete',        'Hard-delete a project'),
  ('projects', 'projects.link_client',   'Link a client/business to a project'),
  ('projects', 'projects.toggle_module', 'Enable or disable a project module tab'),
  -- clients
  ('clients', 'clients.read',            'List clients'),
  ('clients', 'clients.create',          'Create a client'),
  ('clients', 'clients.update',          'Edit client fields'),
  ('clients', 'clients.delete',          'Delete a client'),
  ('clients', 'clients.manage_links',    'Create, update, delete client reference links'),
  ('clients', 'clients.link_to_project', 'Associate a client with a project'),
  -- businesses
  ('businesses', 'businesses.read',         'List businesses linked to clients'),
  ('businesses', 'businesses.create',       'Create a business record'),
  ('businesses', 'businesses.update',       'Edit business fields'),
  ('businesses', 'businesses.delete',       'Delete a business record'),
  ('businesses', 'businesses.manage_media', 'Upload or delete business media'),
  -- teams
  ('teams', 'teams.read_project_members',        'List project members'),
  ('teams', 'teams.invite_project_member',       'Invite a user to a project'),
  ('teams', 'teams.remove_project_member',       'Remove a user from a project'),
  ('teams', 'teams.update_project_member_roles', 'Add or remove roles for a project member'),
  ('teams', 'teams.read_org_members',            'List org members'),
  ('teams', 'teams.invite_org_member',           'Invite a user to the organization'),
  ('teams', 'teams.remove_org_member',           'Remove a user from the organization'),
  ('teams', 'teams.update_org_member_roles',     'Add or remove roles for an org member'),
  ('teams', 'teams.read_roles',                  'List roles and their granted actions'),
  ('teams', 'teams.create_custom_role',          'Define a new custom org role'),
  ('teams', 'teams.update_custom_role',          'Edit a custom role grants'),
  ('teams', 'teams.delete_custom_role',          'Delete a custom role'),
  -- profile
  ('profile', 'profile.read',                'Read own profile'),
  ('profile', 'profile.update_display_name', 'Change display name'),
  ('profile', 'profile.update_phone',        'Change phone number'),
  ('profile', 'profile.update_timezone',     'Change timezone preference'),
  ('profile', 'profile.upload_avatar',       'Upload a new avatar image'),
  ('profile', 'profile.delete_asset',        'Delete a user asset'),
  -- workspace
  ('workspace', 'workspace.read',                  'Read org/workspace settings'),
  ('workspace', 'workspace.update_appearance',      'Update theme, colors, locale (user-level)'),
  ('workspace', 'workspace.update_name',            'Change organization name'),
  ('workspace', 'workspace.update_branding',        'Upload org logo or cover'),
  ('workspace', 'workspace.manage_billing_plan',    'Manage subscription and plan'),
  ('workspace', 'workspace.danger_zone',            'Delete org or transfer ownership')
ON CONFLICT DO NOTHING;

-- ─── Seed: role grants ────────────────────────────────────────────────────────
-- project_viewer: all *.read actions

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_viewer'
  AND a.action_key IN (
    'tasks.read', 'milestones.read', 'notes.read', 'documents.read',
    'media.read', 'calendar.read', 'links.read', 'ideas.read',
    'budgets.read', 'billings.read', 'todos.read',
    'copilot.read_sessions', 'copilot.read_proposals',
    'projects.read', 'profile.read', 'workspace.read',
    'teams.read_project_members'
  )
ON CONFLICT DO NOTHING;

-- project_editor: viewer grants + create/update/delete content actions

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_editor'
  AND a.action_key IN (
    -- inherit viewer
    'tasks.read', 'milestones.read', 'notes.read', 'documents.read',
    'media.read', 'calendar.read', 'links.read', 'ideas.read',
    'budgets.read', 'billings.read', 'todos.read',
    'copilot.read_sessions', 'copilot.read_proposals',
    'projects.read', 'profile.read', 'workspace.read',
    'teams.read_project_members',
    -- tasks
    'tasks.create', 'tasks.update_title', 'tasks.update_status',
    'tasks.update_priority', 'tasks.update_due_date', 'tasks.update_notes',
    'tasks.update_tags', 'tasks.update_milestone', 'tasks.assign',
    'tasks.unassign', 'tasks.delete', 'tasks.reorder',
    -- milestones
    'milestones.create', 'milestones.update', 'milestones.complete',
    'milestones.reopen', 'milestones.delete',
    -- notes
    'notes.create', 'notes.update_title', 'notes.update_content',
    'notes.delete', 'notes.add_link', 'notes.delete_link', 'notes.manage_folders',
    -- documents
    'documents.upload', 'documents.update_metadata', 'documents.archive',
    'documents.unarchive', 'documents.delete', 'documents.manage_folders',
    'documents.view_signed_url', 'documents.download',
    -- media
    'media.upload', 'media.update_metadata', 'media.archive',
    'media.unarchive', 'media.mark_final', 'media.delete',
    -- calendar
    'calendar.create', 'calendar.update', 'calendar.delete',
    -- links
    'links.create', 'links.update', 'links.archive', 'links.reorder',
    'links.delete', 'links.manage_categories',
    -- ideas
    'ideas.create_board', 'ideas.update_board', 'ideas.delete_board',
    'ideas.create_node', 'ideas.update_node', 'ideas.delete_node',
    'ideas.manage_connections', 'ideas.batch_update', 'ideas.link_project',
    -- budgets
    'budgets.create', 'budgets.update', 'budgets.delete', 'budgets.duplicate',
    'budgets.manage_categories', 'budgets.manage_items',
    -- billings
    'billings.create', 'billings.update_amount', 'billings.update_status',
    'billings.update_description', 'billings.delete', 'billings.manage_categories',
    -- todos
    'todos.create_list', 'todos.update_list', 'todos.delete_list',
    'todos.create_item', 'todos.update_item', 'todos.toggle_item',
    'todos.delete_item', 'todos.reorder_items',
    -- copilot
    'copilot.create_session', 'copilot.archive_session', 'copilot.delete_session',
    'copilot.send_message', 'copilot.approve_proposal', 'copilot.reject_proposal',
    'copilot.undo_proposal'
  )
ON CONFLICT DO NOTHING;

-- project_owner: editor grants + project management + team management

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_owner'
  AND a.action_key IN (
    -- inherit editor (all editor action_keys)
    'tasks.read', 'milestones.read', 'notes.read', 'documents.read',
    'media.read', 'calendar.read', 'links.read', 'ideas.read',
    'budgets.read', 'billings.read', 'todos.read',
    'copilot.read_sessions', 'copilot.read_proposals',
    'projects.read', 'profile.read', 'workspace.read',
    'teams.read_project_members',
    'tasks.create', 'tasks.update_title', 'tasks.update_status',
    'tasks.update_priority', 'tasks.update_due_date', 'tasks.update_notes',
    'tasks.update_tags', 'tasks.update_milestone', 'tasks.assign',
    'tasks.unassign', 'tasks.delete', 'tasks.reorder',
    'milestones.create', 'milestones.update', 'milestones.complete',
    'milestones.reopen', 'milestones.delete',
    'notes.create', 'notes.update_title', 'notes.update_content',
    'notes.delete', 'notes.add_link', 'notes.delete_link', 'notes.manage_folders',
    'documents.upload', 'documents.update_metadata', 'documents.archive',
    'documents.unarchive', 'documents.delete', 'documents.manage_folders',
    'documents.view_signed_url', 'documents.download',
    'media.upload', 'media.update_metadata', 'media.archive',
    'media.unarchive', 'media.mark_final', 'media.delete',
    'calendar.create', 'calendar.update', 'calendar.delete',
    'links.create', 'links.update', 'links.archive', 'links.reorder',
    'links.delete', 'links.manage_categories',
    'ideas.create_board', 'ideas.update_board', 'ideas.delete_board',
    'ideas.create_node', 'ideas.update_node', 'ideas.delete_node',
    'ideas.manage_connections', 'ideas.batch_update', 'ideas.link_project',
    'budgets.create', 'budgets.update', 'budgets.delete', 'budgets.duplicate',
    'budgets.manage_categories', 'budgets.manage_items',
    'billings.create', 'billings.update_amount', 'billings.update_status',
    'billings.update_description', 'billings.delete', 'billings.manage_categories',
    'todos.create_list', 'todos.update_list', 'todos.delete_list',
    'todos.create_item', 'todos.update_item', 'todos.toggle_item',
    'todos.delete_item', 'todos.reorder_items',
    'copilot.create_session', 'copilot.archive_session', 'copilot.delete_session',
    'copilot.send_message', 'copilot.approve_proposal', 'copilot.reject_proposal',
    'copilot.undo_proposal',
    -- owner-only additions
    'tasks.bulk_delete', 'notes.bulk_delete',
    'documents.bulk_delete', 'documents.mark_final',
    'media.share_create',
    'copilot.bulk_approve', 'copilot.bulk_reject',
    'projects.update', 'projects.archive', 'projects.unarchive',
    'projects.delete', 'projects.link_client', 'projects.toggle_module',
    'teams.invite_project_member', 'teams.remove_project_member',
    'teams.update_project_member_roles'
  )
ON CONFLICT DO NOTHING;

-- org_member: view org-level resources

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'org_member'
  AND a.action_key IN (
    'projects.read', 'clients.read', 'businesses.read',
    'profile.read', 'workspace.read',
    'teams.read_org_members'
  )
ON CONFLICT DO NOTHING;

-- org_admin: org_member grants + manage org resources

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'org_admin'
  AND a.action_key IN (
    -- inherit org_member
    'projects.read', 'clients.read', 'businesses.read',
    'profile.read', 'workspace.read', 'teams.read_org_members',
    -- projects
    'projects.create',
    -- clients
    'clients.create', 'clients.update', 'clients.delete',
    'clients.manage_links', 'clients.link_to_project',
    -- businesses
    'businesses.create', 'businesses.update', 'businesses.delete',
    'businesses.manage_media',
    -- teams
    'teams.invite_org_member', 'teams.remove_org_member',
    'teams.update_org_member_roles', 'teams.read_roles',
    'teams.create_custom_role', 'teams.update_custom_role',
    'teams.delete_custom_role'
  )
ON CONFLICT DO NOTHING;

-- org_owner: org_admin grants + workspace management

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'org_owner'
  AND a.action_key IN (
    -- inherit org_admin
    'projects.read', 'clients.read', 'businesses.read',
    'profile.read', 'workspace.read', 'teams.read_org_members',
    'projects.create',
    'clients.create', 'clients.update', 'clients.delete',
    'clients.manage_links', 'clients.link_to_project',
    'businesses.create', 'businesses.update', 'businesses.delete',
    'businesses.manage_media',
    'teams.invite_org_member', 'teams.remove_org_member',
    'teams.update_org_member_roles', 'teams.read_roles',
    'teams.create_custom_role', 'teams.update_custom_role',
    'teams.delete_custom_role',
    -- owner-only
    'workspace.update_name', 'workspace.update_branding',
    'workspace.manage_billing_plan', 'workspace.danger_zone',
    'workspace.update_appearance'
  )
ON CONFLICT DO NOTHING;
