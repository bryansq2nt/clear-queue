-- =============================================================================
-- Fix: open project_files and project-media storage to project members.
--
-- Root causes:
--   1. project_files SELECT/UPDATE were owner-only → members read/write nothing.
--   2. project-media storage SELECT was owner-only (first path segment = uploader UID)
--      → members cannot generate signed URLs for files they didn't upload.
--
-- Design:
--   • RLS governs "is this user a member of this project?" — defense-in-depth.
--   • RBAC (requireCan in server actions) governs fine-grained write permissions
--     (media.archive, media.delete, etc.) — enforced before the DB call.
--   • Write policies (INSERT / DELETE) remain owner-only: only the uploader can
--     INSERT their own row (owner_id = auth.uid()) or DELETE their own storage object.
--     Server-side soft-deletes (UPDATE deleted_at) go through the new UPDATE policy.
-- =============================================================================

-- 1. project_files SELECT — project members can read all files in their projects
CREATE POLICY "Members can select project files"
  ON public.project_files FOR SELECT
  USING (public.is_project_member(project_id));

-- 2. project_files UPDATE — project members can update files in their projects.
--    RBAC requireCan() in server actions enforces fine-grained write permissions
--    (media.archive, media.update_metadata, media.delete soft-delete, etc.)
--    before the DB query runs, so this policy is defense-in-depth only.
CREATE POLICY "Members can update project files"
  ON public.project_files FOR UPDATE
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

-- 3. project-media storage SELECT — project members can read (download / sign) media.
--    Path convention: {uploader_uid}/{project_id}/{yyyy}/{mm}/{uuid}.{ext}
--    The project_id is the second path segment (1-based index in Postgres arrays).
CREATE POLICY "project-media select member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-media'
    AND public.is_project_member((storage.foldername(name))[2]::uuid)
  );
