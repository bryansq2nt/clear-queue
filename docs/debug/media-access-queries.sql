-- =============================================================================
-- Debug: Media module access
-- Run these in Supabase SQL Editor to see what is stored and why access may fail.
-- Replace PROJECT_ID and USER_EMAIL (or USER_ID) with your real values.
-- =============================================================================

-- 1) Project ID and member user ID (get from your app URL and auth.users)
-- Example: project ID from URL /context/abc-123-def/media  => abc-123-def
-- Get user id for bryansq2nt@gmail.com:
SELECT id AS user_id, email FROM auth.users WHERE email = 'bryansq2nt@gmail.com';

-- 2) Is Media enabled at PROJECT level? (project_modules)
-- Replace :project_id with your project UUID (e.g. in Supabase use a literal)
SELECT project_id, module_key, enabled
FROM public.project_modules
WHERE project_id = 'REPLACE_WITH_PROJECT_UUID'
ORDER BY module_key;

-- If there is no row for 'media', the module uses registry default (see app).
-- If there is a row, enabled = true means project has Media on.

-- 3) What does the MEMBER have in user_project_access_grants?
-- This is what getMyProjectAccessGrant() reads for the team member.
SELECT project_id, user_id, allowed_modules, updated_at
FROM public.user_project_access_grants
WHERE project_id = 'REPLACE_WITH_PROJECT_UUID'
  AND user_id = (SELECT id FROM auth.users WHERE email = 'bryansq2nt@gmail.com' LIMIT 1);

-- If no row: app treats as "unrestricted" (null) and user can see all project-enabled modules.
-- If row exists: allowed_modules is the allowlist; 'media' must be in the array for Media access.

-- 4) Full picture for one project (all members' access grants + project modules)
SELECT
  'project_modules' AS source,
  pm.project_id::text,
  NULL::uuid AS user_id,
  NULL::text AS email,
  pm.module_key AS detail,
  pm.enabled::text AS extra
FROM public.project_modules pm
WHERE pm.project_id = 'REPLACE_WITH_PROJECT_UUID'
UNION ALL
SELECT
  'access_grant' AS source,
  g.project_id::text,
  g.user_id,
  u.email,
  'allowed_modules' AS detail,
  array_to_string(g.allowed_modules, ', ') AS extra
FROM public.user_project_access_grants g
JOIN auth.users u ON u.id = g.user_id
WHERE g.project_id = 'REPLACE_WITH_PROJECT_UUID'
ORDER BY source, user_id, detail;

-- 5) Quick check: does the member have 'media' in allowed_modules?
SELECT
  g.user_id,
  u.email,
  g.allowed_modules,
  ('media' = ANY(g.allowed_modules)) AS has_media_in_allowlist
FROM public.user_project_access_grants g
JOIN auth.users u ON u.id = g.user_id
WHERE g.project_id = 'REPLACE_WITH_PROJECT_UUID';
