-- =============================================================================
-- Phase 1A: Owner module RBAC
--
-- 1. Register 'owner' module and action keys in rbac_module_actions
-- 2. Seed project_viewer / project_editor / project_owner with owner.* keys
-- 3. Add RLS SELECT policies so project members can read the client and
--    business that are linked to a project they belong to.
-- =============================================================================

-- ── 1. Register module ────────────────────────────────────────────────────────

INSERT INTO public.rbac_modules (key, display_name) VALUES
  ('owner', 'Project Owner (Client & Business)')
ON CONFLICT DO NOTHING;

-- ── 2. Register action keys ───────────────────────────────────────────────────

INSERT INTO public.rbac_module_actions (module_key, action_key, description) VALUES
  ('owner', 'owner.read',            'View the client and business linked to the project'),
  ('owner', 'owner.create_client',   'Create a new client and link to the project'),
  ('owner', 'owner.update_client',   'Edit the linked client''s details'),
  ('owner', 'owner.delete_client',   'Delete the linked client'),
  ('owner', 'owner.create_business', 'Create a new business and link to the project'),
  ('owner', 'owner.update_business', 'Edit the linked business''s details'),
  ('owner', 'owner.delete_business', 'Delete the linked business')
ON CONFLICT DO NOTHING;

-- ── 3. Seed role grants ───────────────────────────────────────────────────────

-- project_viewer: read only
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_viewer'
  AND a.action_key IN ('owner.read')
ON CONFLICT DO NOTHING;

-- project_editor: read + create + update (no delete)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_editor'
  AND a.action_key IN (
    'owner.read',
    'owner.create_client',
    'owner.update_client',
    'owner.create_business',
    'owner.update_business'
  )
ON CONFLICT DO NOTHING;

-- project_owner: full access
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_module_actions a
WHERE r.name = 'project_owner'
  AND a.action_key IN (
    'owner.read',
    'owner.create_client',
    'owner.update_client',
    'owner.delete_client',
    'owner.create_business',
    'owner.update_business',
    'owner.delete_business'
  )
ON CONFLICT DO NOTHING;

-- ── 4. RLS: project members can read a client linked to their project ─────────
--
-- The existing policy (owner_id = auth.uid()) still applies for the owner.
-- This additive policy allows team members to read the project's linked client.

CREATE POLICY "Project members can read linked client"
  ON public.clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.client_id = clients.id
        AND public.is_project_member(p.id)
    )
  );

-- ── 5. RLS: project members can read a business linked to their project ───────

CREATE POLICY "Project members can read linked business"
  ON public.businesses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.business_id = businesses.id
        AND public.is_project_member(p.id)
    )
  );
