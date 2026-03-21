# RBAC Incident Resolution — Recursive `project_members` RLS Broke `canCreate`

**Date:** 2026-03-21  
**Status:** Resolved  
**Severity:** P0  
**Affected area:** invited project members could view modules but could not create tasks, notes, document folders, or uploads

## Summary

The app logic was correct. The user data was correct. JWT forwarding was correct.

The actual bug was a recursive RLS policy deployed in the live Supabase database:

- `public.project_members`
- policy: `project_members_team_select`
- live definition: subquery against `project_members` inside a policy on `project_members`

That caused Postgres error `42P17`:

`infinite recursion detected in policy for relation "project_members"`

Because `user_role_assignments` project-scoped visibility also depended on project membership, the recursion blocked both:

- reading the user’s own `project_members` row
- reading the user’s own `user_role_assignments` row

The RBAC resolver then returned no roles, which caused all `canCreate` checks to fail closed.

## User / Project

- User ID: `3eeee559-807c-4e0e-a6cf-5d1004fc78f1`
- Email: `ivisruiz5@gmail.com`
- Project ID: `ef2c243a-982a-44c9-986a-7bfa3c936145`
- Expected role: `team_member`

## What Was Confirmed Before The Fix

The following were already true and were not the root cause:

- `accept_invite_atomic` was the new version for new invites
- `team_member` had 51 granted actions, including `tasks.create`
- the affected user had correct rows in both:
  - `public.project_members`
  - `public.user_role_assignments`
- service-role diagnostics could read those rows
- app-layer logic in `lib/rbac/resolver.ts` and permission checks in actions were correct

## Why The App Showed Read-Only UI

Permission flow:

1. `getBoardPermissions(projectId)` calls `getGrantedActions(...)`
2. `getGrantedActions(...)` calls `getRoleIdsForUserInProject(...)`
3. `getRoleIdsForUserInProject(...)` reads `user_role_assignments`
4. fallback logic also checks `project_members`

Because both reads were blocked by recursive RLS, the resolver returned:

- no readable membership
- no readable role assignments
- `roleIds = []`
- `grantedActions = []`
- `canCreate = false`

The user could still view modules because `user_project_access_grants` was readable and contained the allowed modules.

## Key Diagnostic Split

The debug endpoint was updated to add a JWT/RLS sanity check against `profiles`:

- file: `app/api/debug/rbac-audit/route.ts`
- added `Q0_authUidSanity`

This was the critical split:

- `Q0_authUidSanity.exists = true`
  - proved JWT forwarding to PostgREST was working
  - `auth.uid()` was not null in general
- `Q2_projectMember.error.code = 42P17`
- `Q3_uraRows.error.code = 42P17`
  - proved the failure was recursive RLS on `project_members`

This ruled out the hypothesis that `lib/supabase/server.ts` was failing to attach the user session to PostgREST queries.

## Live Broken Policies Observed In Supabase

These were the live policy definitions at the time of failure:

### `project_members`

- `project_members_own_select`: `(user_id = auth.uid())`
- `project_members_team_select`: recursive `EXISTS (...) FROM project_members pm2 ...`

### `user_role_assignments`

- `ura_own_select`: `(user_id = auth.uid())`
- `ura_project_select`: `EXISTS (...) FROM project_members pm ...`
- `ura_org_select`: `EXISTS (...) FROM organization_members om ...`

The recursive `project_members_team_select` policy was enough to abort the whole `project_members` query, even though `project_members_own_select` should have matched independently.

## Why The Repo Looked Correct While Production Was Broken

The repository already contained the intended fix:

- `supabase/migrations/20260310100009_rls_transition_or_project_members.sql`
  - defines `public.is_project_member(UUID)` and `public.is_org_member(UUID)`
- `supabase/migrations/20260320100001_fix_create_project_atomic_and_members_rls.sql`
  - explicitly replaces recursive `project_members_team_select` with `public.is_project_member(project_id)`

So local code inspection alone could not prove the live DB state. The repo and the deployed database had diverged.

## SQL Fix Applied In Supabase SQL Editor

```sql
DROP POLICY IF EXISTS "project_members_team_select" ON public.project_members;

CREATE POLICY "project_members_team_select" ON public.project_members
  FOR SELECT USING (
    public.is_project_member(project_id)
  );

DROP POLICY IF EXISTS "ura_project_select" ON public.user_role_assignments;
CREATE POLICY "ura_project_select" ON public.user_role_assignments
  FOR SELECT USING (
    project_id IS NOT NULL AND public.is_project_member(project_id)
  );

DROP POLICY IF EXISTS "ura_org_select" ON public.user_role_assignments;
CREATE POLICY "ura_org_select" ON public.user_role_assignments
  FOR SELECT USING (
    org_id IS NOT NULL AND public.is_org_member(org_id)
  );
```

## Verification After Fix

The affected user immediately regained create permissions in the UI:

- create tasks
- create note folders
- create notes
- create document folders
- upload documents

The debug endpoint then returned the healthy state:

- `Q0_authUidSanity.exists: true`
- `Q2_projectMember.exists: true`
- `Q3_uraRows.total_count: 1`
- `Q3_uraRows.role_names_summary: ["team_member"]`
- `appLayer.getRoleIdsForUserInProject.roleIds: ["e25e6b91-b51c-4731-a467-f1aba7aac9e6"]`
- `appLayer.getBoardPermissions.canCreate: true`
- `appLayer.getNotesPermissions.canCreate: true`
- `appLayer.getDocumentsPermissions.canUpload: true`
- `appLayer.grantedActions.total: 51`

## Why Another AI Could Not Fully Fix It From Code Alone

This incident required distinguishing between three different classes of failure:

1. incorrect app-layer permission logic
2. JWT not being forwarded from Next.js server routes to PostgREST
3. broken live RLS policies in Supabase

The codebase already suggested the fix had been written in migrations, which made the failure appear inconsistent with the repo.

The missing piece was checking the actual live `pg_policies` output and exposing raw Postgres errors in the debug endpoint. Without that, the issue looked like “rows missing” or “auth.uid mismatch” rather than recursive RLS.

In short: this could not be fully resolved by patching local app code. The live database policy state had to be inspected and corrected directly in Supabase SQL Editor.

## Lessons For Future AI Handoffs

- If service-role checks see the rows but user-JWT reads return none, inspect live `pg_policies`.
- Do not assume migrations present in the repo have been applied to the hosted database.
- Add error visibility to diagnostics; empty results and RLS exceptions are not the same thing.
- If Postgres returns `42P17`, suspect recursive RLS immediately.
- On membership/role visibility bugs, check `project_members` first because downstream RBAC queries often depend on it.

## References

- `docs/audits/rbac-canCreate-false-handoff-2026-03-21.md`
- `app/api/debug/rbac-audit/route.ts`
- `lib/supabase/server.ts`
- `supabase/migrations/20260310100009_rls_transition_or_project_members.sql`
- `supabase/migrations/20260320100001_fix_create_project_atomic_and_members_rls.sql`
