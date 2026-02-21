-- ============================================
-- LINK VAULT: project_links table (Phase 1)
-- Bitácora de enlaces por proyecto: herramientas, referencias, sitios.
-- ============================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.project_link_type_enum AS ENUM (
  'environment',
  'tool',
  'resource',
  'social',
  'reference',
  'other'
);

CREATE TYPE public.project_link_section_enum AS ENUM (
  'delivery',
  'infrastructure',
  'product',
  'marketing',
  'operations',
  'client',
  'other'
);

-- ---------------------------------------------------------------------------
-- 2. Table: public.project_links
-- ---------------------------------------------------------------------------
CREATE TABLE public.project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  provider TEXT,
  link_type public.project_link_type_enum NOT NULL,
  section public.project_link_section_enum NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  pinned BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  open_in_new_tab BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  status_code INT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT project_links_url_http_or_https CHECK (url ~ '^https?://')
);

-- Indexes
CREATE INDEX idx_project_links_project_pinned_sort
  ON public.project_links(project_id, pinned DESC, sort_order, created_at DESC);

CREATE INDEX idx_project_links_project_section
  ON public.project_links(project_id, section, pinned DESC, created_at DESC);

CREATE INDEX idx_project_links_project_link_type
  ON public.project_links(project_id, link_type, created_at DESC);

CREATE INDEX idx_project_links_owner_id
  ON public.project_links(owner_id, created_at DESC);

CREATE INDEX idx_project_links_tags_gin
  ON public.project_links USING GIN (tags);

-- updated_at trigger
CREATE TRIGGER update_project_links_updated_at
  BEFORE UPDATE ON public.project_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own project_links"
  ON public.project_links FOR SELECT
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_links.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own project_links"
  ON public.project_links FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_links.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own project_links"
  ON public.project_links FOR UPDATE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_links.project_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_links.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own project_links"
  ON public.project_links FOR DELETE
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_links.project_id AND p.owner_id = auth.uid()
    )
  );
