-- ============================================================
-- Notes module — Folders + last_opened_at
-- Migration: 20260224130000_note_folders_and_last_opened.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table: project_note_folders
-- ------------------------------------------------------------

CREATE TABLE public.project_note_folders (
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

CREATE INDEX idx_project_note_folders_project_sort
  ON public.project_note_folders (project_id, sort_order, name);

CREATE INDEX idx_project_note_folders_owner
  ON public.project_note_folders (owner_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. updated_at trigger
-- ------------------------------------------------------------

CREATE TRIGGER update_project_note_folders_updated_at
  BEFORE UPDATE ON public.project_note_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 4. RLS — project_note_folders
-- ------------------------------------------------------------

ALTER TABLE public.project_note_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own note folders"
  ON public.project_note_folders FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own note folders"
  ON public.project_note_folders FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own note folders"
  ON public.project_note_folders FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own note folders"
  ON public.project_note_folders FOR DELETE
  USING (owner_id = auth.uid());

-- ------------------------------------------------------------
-- 5. notes: add folder_id and last_opened_at
-- ------------------------------------------------------------

ALTER TABLE public.notes
  ADD COLUMN folder_id UUID NULL REFERENCES public.project_note_folders(id) ON DELETE SET NULL,
  ADD COLUMN last_opened_at TIMESTAMPTZ NULL;

CREATE INDEX idx_notes_project_folder_updated
  ON public.notes (project_id, folder_id, updated_at DESC);

CREATE INDEX idx_notes_last_opened
  ON public.notes (project_id, last_opened_at DESC NULLS LAST);
