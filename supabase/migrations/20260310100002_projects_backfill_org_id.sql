-- ============================================================
-- Migration: backfill org_id on all projects owned by the admin user
-- All existing projects belong to the mutechlabs organization
-- Admin user: 8df49d2b-9bd4-4a98-8f39-865cc68ea601
-- ============================================================

UPDATE public.projects
SET org_id = (
  SELECT id FROM public.organizations WHERE slug = 'mutechlabs'
)
WHERE owner_id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
  AND org_id IS NULL;

-- Validation: every project owned by the admin user must have org_id set
-- If this returns rows, the backfill failed and must be investigated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projects
    WHERE owner_id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
      AND org_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill failed: some admin projects still have NULL org_id';
  END IF;
END $$;
