-- ============================================================
-- Migration: create user_role_assignments table
-- Supports multiple roles per user per context (org or project)
-- ============================================================

CREATE TABLE public.user_role_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,

  -- Context: exactly one of these must be non-null
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id      UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce: exactly one context column must be set
  CONSTRAINT user_role_assignments_context_xor CHECK (
    (project_id IS NOT NULL AND org_id IS NULL) OR
    (project_id IS NULL AND org_id IS NOT NULL)
  )
);

-- Prevent duplicate role assignment for the same (user, role, project)
-- Partial index: only enforces uniqueness when project_id is actually set
CREATE UNIQUE INDEX ura_unique_project_role
  ON public.user_role_assignments (user_id, role_id, project_id)
  WHERE project_id IS NOT NULL;

-- Prevent duplicate role assignment for the same (user, role, org)
-- Partial index: only enforces uniqueness when org_id is actually set
CREATE UNIQUE INDEX ura_unique_org_role
  ON public.user_role_assignments (user_id, role_id, org_id)
  WHERE org_id IS NOT NULL;

CREATE INDEX ura_user_project ON public.user_role_assignments (user_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX ura_user_org ON public.user_role_assignments (user_id, org_id)
  WHERE org_id IS NOT NULL;

CREATE INDEX ura_role ON public.user_role_assignments (role_id);

ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

-- Members can see their own role assignments
CREATE POLICY "ura_own_select" ON public.user_role_assignments
  FOR SELECT USING (user_id = auth.uid());

-- Project members can see role assignments for the same project
CREATE POLICY "ura_project_select" ON public.user_role_assignments
  FOR SELECT USING (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = user_role_assignments.project_id
        AND pm.user_id = auth.uid()
    )
  );

-- Org members can see role assignments for the same org
CREATE POLICY "ura_org_select" ON public.user_role_assignments
  FOR SELECT USING (
    org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = user_role_assignments.org_id
        AND om.user_id = auth.uid()
    )
  );
