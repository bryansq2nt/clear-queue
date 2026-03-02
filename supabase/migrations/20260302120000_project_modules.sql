-- Project modules: per-project module activation state.
-- Design: lazy defaults — only explicit overrides are stored.
-- If no row exists for a project+module_key, the registry defaultEnabled is used.
-- Source of truth for module definitions: lib/modules/registry.ts
-- See docs/plans/plan-project-module-toggle.md

-- 1. Table
CREATE TABLE public.project_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Unique constraint: one row per module per project
CREATE UNIQUE INDEX idx_project_modules_project_key
  ON public.project_modules (project_id, module_key);

-- 3. Index for "give me all modules for project X" query
CREATE INDEX idx_project_modules_project_id
  ON public.project_modules (project_id);

-- 4. updated_at trigger
CREATE TRIGGER update_project_modules_updated_at
  BEFORE UPDATE ON public.project_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.project_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select project modules"
  ON public.project_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can insert project modules"
  ON public.project_modules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update project modules"
  ON public.project_modules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete project modules"
  ON public.project_modules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );
