-- ============================================================
-- Document Hub — Folders (Fase 1)
-- Migration: 20260224120000_document_hub_folders.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table: project_document_folders
-- ------------------------------------------------------------

CREATE TABLE public.project_document_folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ------------------------------------------------------------
-- 2. Indexes
-- ------------------------------------------------------------

CREATE INDEX idx_project_document_folders_project_sort
  ON public.project_document_folders (project_id, sort_order, name);

CREATE INDEX idx_project_document_folders_owner
  ON public.project_document_folders (owner_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. updated_at trigger
-- ------------------------------------------------------------

CREATE TRIGGER update_project_document_folders_updated_at
  BEFORE UPDATE ON public.project_document_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 4. RLS — project_document_folders
-- ------------------------------------------------------------

ALTER TABLE public.project_document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own document folders"
  ON public.project_document_folders FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own document folders"
  ON public.project_document_folders FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own document folders"
  ON public.project_document_folders FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own document folders"
  ON public.project_document_folders FOR DELETE
  USING (owner_id = auth.uid());

-- ------------------------------------------------------------
-- 5. project_files: add folder_id
-- ------------------------------------------------------------

ALTER TABLE public.project_files
  ADD COLUMN folder_id UUID NULL REFERENCES public.project_document_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_project_files_project_folder
  ON public.project_files (project_id, folder_id, created_at DESC);
