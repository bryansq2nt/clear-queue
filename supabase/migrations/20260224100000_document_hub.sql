-- ============================================================
-- Document Hub — Phase 1: Database Foundation
-- Migration: 20260224100000_document_hub.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enums
-- ------------------------------------------------------------

CREATE TYPE public.project_file_kind_enum AS ENUM ('media', 'document');

CREATE TYPE public.project_document_category_enum AS ENUM (
  'brief',
  'contract',
  'invoice',
  'proposal',
  'report',
  'spreadsheet',
  'notes',
  'other'
);

-- ------------------------------------------------------------
-- 2. Table: project_files
-- ------------------------------------------------------------

CREATE TABLE public.project_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                  public.project_file_kind_enum NOT NULL,
  document_category     public.project_document_category_enum NULL,
  title                 TEXT NOT NULL,
  description           TEXT NULL,
  bucket                TEXT NOT NULL,
  path                  TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  file_ext              TEXT NULL,
  size_bytes            BIGINT NOT NULL CHECK (size_bytes > 0),
  tags                  TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_final              BOOLEAN NOT NULL DEFAULT false,
  last_opened_at        TIMESTAMPTZ NULL,
  archived_at           TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT bucket_values CHECK (bucket IN ('project-media', 'project-docs')),
  CONSTRAINT document_category_required CHECK (
    kind <> 'document' OR document_category IS NOT NULL
  )
);

-- ------------------------------------------------------------
-- 3. Indexes
-- ------------------------------------------------------------

CREATE INDEX idx_project_files_project_kind
  ON public.project_files (project_id, kind, created_at DESC);

CREATE INDEX idx_project_files_last_opened
  ON public.project_files (project_id, last_opened_at DESC NULLS LAST);

CREATE INDEX idx_project_files_owner
  ON public.project_files (owner_id, created_at DESC);

CREATE INDEX idx_project_files_archived
  ON public.project_files (project_id, archived_at, created_at DESC);

-- ------------------------------------------------------------
-- 4. updated_at trigger
-- ------------------------------------------------------------

CREATE TRIGGER update_project_files_updated_at
  BEFORE UPDATE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 5. RLS Policies — project_files
-- ------------------------------------------------------------

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own project files"
  ON public.project_files FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own project files"
  ON public.project_files FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own project files"
  ON public.project_files FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own project files"
  ON public.project_files FOR DELETE
  USING (owner_id = auth.uid());

-- ------------------------------------------------------------
-- 6. Storage bucket: project-docs
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-docs', 'project-docs', false);

-- Storage RLS policies

CREATE POLICY "project-docs select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "project-docs insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "project-docs update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "project-docs delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
