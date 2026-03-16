-- =============================================================================
-- Phase 4: Read Scope Enforcement
--
-- Adds *.read.own / *.read.team / *.read.project tiered action keys for the
-- 8 modules that have owner_id on their records:
--   notes, links, budgets, billings, calendar, ideas, documents, media
--
-- Existing *.read keys are preserved (they resolve to 'project' scope in
-- getReadScope() as a backwards-compatible fallback).
-- =============================================================================

-- ── 1. Insert scoped read action keys ─────────────────────────────────────────

INSERT INTO public.rbac_module_actions (module_key, action_key, description) VALUES
  -- notes
  ('notes',      'notes.read.own',       'View only your own notes in this project'),
  ('notes',      'notes.read.team',      'View notes created by members of your sub-teams'),
  ('notes',      'notes.read.project',   'View all notes in the project'),
  -- links
  ('links',      'links.read.own',       'View only your own links in this project'),
  ('links',      'links.read.team',      'View links created by members of your sub-teams'),
  ('links',      'links.read.project',   'View all links in the project'),
  -- budgets
  ('budgets',    'budgets.read.own',     'View only your own budgets in this project'),
  ('budgets',    'budgets.read.team',    'View budgets created by members of your sub-teams'),
  ('budgets',    'budgets.read.project', 'View all budgets in the project'),
  -- billings
  ('billings',   'billings.read.own',    'View only your own billing records in this project'),
  ('billings',   'billings.read.team',   'View billing records from members of your sub-teams'),
  ('billings',   'billings.read.project','View all billing records in the project'),
  -- calendar
  ('calendar',   'calendar.read.own',    'View only your own calendar events in this project'),
  ('calendar',   'calendar.read.team',   'View events created by members of your sub-teams'),
  ('calendar',   'calendar.read.project','View all calendar events in the project'),
  -- ideas
  ('ideas',      'ideas.read.own',       'View only your own idea boards in this project'),
  ('ideas',      'ideas.read.team',      'View idea boards created by members of your sub-teams'),
  ('ideas',      'ideas.read.project',   'View all idea boards in the project'),
  -- documents
  ('documents',  'documents.read.own',   'View only your own documents in this project'),
  ('documents',  'documents.read.team',  'View documents uploaded by members of your sub-teams'),
  ('documents',  'documents.read.project','View all documents in the project'),
  -- media
  ('media',      'media.read.own',       'View only your own media in this project'),
  ('media',      'media.read.team',      'View media uploaded by members of your sub-teams'),
  ('media',      'media.read.project',   'View all media in the project')
ON CONFLICT DO NOTHING;

-- ── 2. project_viewer → *.read.project for all 8 modules ─────────────────────

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_viewer'
  AND a.action_key IN (
    'notes.read.project', 'links.read.project', 'budgets.read.project',
    'billings.read.project', 'calendar.read.project', 'ideas.read.project',
    'documents.read.project', 'media.read.project'
  )
ON CONFLICT DO NOTHING;

-- ── 3. project_member → *.read.own ────────────────────────────────────────────

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_member'
  AND a.action_key IN (
    'notes.read.own', 'links.read.own', 'budgets.read.own',
    'billings.read.own', 'calendar.read.own', 'ideas.read.own',
    'documents.read.own', 'media.read.own'
  )
ON CONFLICT DO NOTHING;

-- ── 4. team_manager → *.read.team + *.read.own ────────────────────────────────

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'team_manager'
  AND a.action_key IN (
    'notes.read.team',     'notes.read.own',
    'links.read.team',     'links.read.own',
    'budgets.read.team',   'budgets.read.own',
    'billings.read.team',  'billings.read.own',
    'calendar.read.team',  'calendar.read.own',
    'ideas.read.team',     'ideas.read.own',
    'documents.read.team', 'documents.read.own',
    'media.read.team',     'media.read.own'
  )
ON CONFLICT DO NOTHING;

-- ── 5. project_manager → *.read.project + *.read.team + *.read.own ────────────

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_manager'
  AND a.action_key IN (
    'notes.read.project',     'notes.read.team',     'notes.read.own',
    'links.read.project',     'links.read.team',     'links.read.own',
    'budgets.read.project',   'budgets.read.team',   'budgets.read.own',
    'billings.read.project',  'billings.read.team',  'billings.read.own',
    'calendar.read.project',  'calendar.read.team',  'calendar.read.own',
    'ideas.read.project',     'ideas.read.team',     'ideas.read.own',
    'documents.read.project', 'documents.read.team', 'documents.read.own',
    'media.read.project',     'media.read.team',     'media.read.own'
  )
ON CONFLICT DO NOTHING;

-- ── 6. project_editor → *.read.project ────────────────────────────────────────

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_editor'
  AND a.action_key IN (
    'notes.read.project', 'links.read.project', 'budgets.read.project',
    'billings.read.project', 'calendar.read.project', 'ideas.read.project',
    'documents.read.project', 'media.read.project'
  )
ON CONFLICT DO NOTHING;

-- ── 7. project_owner → all 3 tiers ────────────────────────────────────────────
-- (project_owner already has the legacy *.read keys which resolve to project scope,
-- but we add the explicit scoped keys for completeness)

INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_owner'
  AND a.action_key IN (
    'notes.read.project',     'notes.read.team',     'notes.read.own',
    'links.read.project',     'links.read.team',     'links.read.own',
    'budgets.read.project',   'budgets.read.team',   'budgets.read.own',
    'billings.read.project',  'billings.read.team',  'billings.read.own',
    'calendar.read.project',  'calendar.read.team',  'calendar.read.own',
    'ideas.read.project',     'ideas.read.team',     'ideas.read.own',
    'documents.read.project', 'documents.read.team', 'documents.read.own',
    'media.read.project',     'media.read.team',     'media.read.own'
  )
ON CONFLICT DO NOTHING;

-- ── 8. RLS: allow project members to read cross-user content ──────────────────
-- Application logic filters to the correct scope tier; RLS is the final guard
-- that allows members to *potentially* see other users' records.
-- project_files (documents + media) already has a member SELECT policy added in
-- 20260317100000_media_team_access.sql — no change needed there.

CREATE POLICY "Project members can read project notes"
  ON public.notes FOR SELECT
  USING (project_id IS NOT NULL AND public.is_project_member(project_id));

CREATE POLICY "Project members can read project links"
  ON public.project_links FOR SELECT
  USING (public.is_project_member(project_id));

-- Note: link_categories has no project_id (user-owned personal labels).
-- Existing "Users can select own link_categories" policy is sufficient.
-- Team members will see the category_id on others' links but not the name — acceptable.

CREATE POLICY "Project members can read project budgets"
  ON public.budgets FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Project members can read project billings"
  ON public.billings FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Project members can read project calendar events"
  ON public.calendar_events FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY "Project members can read project idea boards"
  ON public.idea_boards FOR SELECT
  USING (public.is_project_member(project_id));
