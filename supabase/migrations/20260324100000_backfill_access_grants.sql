-- ============================================================
-- Backfill user_project_access_grants for existing members
--
-- Before this migration, a missing row in user_project_access_grants
-- was treated as "unrestricted" (fail-open) in the app layer.
-- After this migration + the app change that ships with it, a missing
-- row means "not a member" (fail-closed).
--
-- We insert (project_id, user_id, NULL) for every project_member
-- who doesn't have a row yet. NULL allowed_modules = explicitly
-- unrestricted — the member can see all project-enabled tabs.
-- This preserves existing behaviour for every current user.
-- ============================================================

INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
SELECT
  pm.project_id,
  pm.user_id,
  NULL   -- explicitly unrestricted; semantic is preserved
FROM public.project_members pm
LEFT JOIN public.user_project_access_grants upag
  ON  upag.project_id = pm.project_id
  AND upag.user_id    = pm.user_id
WHERE upag.user_id IS NULL;
