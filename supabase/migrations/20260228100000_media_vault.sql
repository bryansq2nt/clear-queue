-- ============================================================
-- Media Vault — Phase 1: Database Foundation
-- ============================================================
-- Adds project_media_category_enum, media_category column,
-- project-media storage bucket and its RLS policies.
--
-- Notes:
--   - project_file_kind_enum already includes 'media' (created in 20260224100000).
--   - bucket_values CHECK already allows 'project-media' (created in 20260224100000).
--   - idx_project_files_project_kind (project_id, kind, created_at DESC) already
--     covers the getMedia paginated query; no new index required.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Media category enum
-- ------------------------------------------------------------
CREATE TYPE public.project_media_category_enum AS ENUM (
  'branding',
  'content',
  'reference',
  'screenshot',
  'mockup',
  'other'
);

-- ------------------------------------------------------------
-- 2. Add media_category column to project_files
-- ------------------------------------------------------------
ALTER TABLE public.project_files
  ADD COLUMN media_category public.project_media_category_enum NULL;

-- Constraint: every media row must have a media_category.
-- Document rows (kind = 'document') are unaffected — media_category stays NULL for them.
ALTER TABLE public.project_files
  ADD CONSTRAINT media_category_required CHECK (
    kind <> 'media' OR media_category IS NOT NULL
  );

-- ------------------------------------------------------------
-- 3. Storage bucket: project-media (private)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-media', 'project-media', false);

-- ------------------------------------------------------------
-- 4. Storage RLS policies for project-media
-- Path convention: {owner_id}/{project_id}/{yyyy}/{mm}/{uuid}.{ext}
-- All policies scope access to the first path segment = auth.uid().
-- ------------------------------------------------------------

-- SELECT
CREATE POLICY "project-media select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT
CREATE POLICY "project-media insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE
CREATE POLICY "project-media update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE
CREATE POLICY "project-media delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
