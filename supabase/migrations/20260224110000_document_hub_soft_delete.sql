-- ============================================================
-- Document Hub — soft delete column
-- Migration: 20260224110000_document_hub_soft_delete.sql
-- ============================================================

ALTER TABLE public.project_files
  ADD COLUMN deleted_at TIMESTAMPTZ NULL;

CREATE INDEX idx_project_files_deleted
  ON public.project_files (project_id, deleted_at, created_at DESC);
