# RBAC Bug Handoff — canCreate=false for team_member users

**Date:** 2026-03-21
**Status:** Root cause identified, RLS gap confirmed, fix not yet applied
**Severity:** P0 — all invited team_member users cannot create tasks, notes, or documents

---

## 1. The bug

An invited user with role `team_member` can **see** the board, notes, and documents tabs but **cannot see any "create" button** anywhere in the app. The board is read-only. Notes and documents are read-only.

The affected user in testing:

- **User ID:** `3eeee559-807c-4e0e-a6cf-5d1004fc78f1`
- **Email:** `ivisruiz5@gmail.com`
- **Project ID:** `ef2c243a-982a-44c9-986a-7bfa3c936145`
- **Role:** `team_member` (role_id: `e25e6b91-b51c-4731-a467-f1aba7aac9e6`)

---

## 2. How permissions work in this app

Permission flow for "can I create a task?":

```
page.tsx (server component)
  └── getBoardPermissions(projectId)         [app/actions/tasks.ts]
        ├── getGrantedActions(userId, projectId, true)     [lib/rbac/resolver.ts]
        │     └── getRoleIdsForUserInProject(userId, projectId)
        │           └── SELECT role_id FROM user_role_assignments
        │                 WHERE user_id = $userId AND project_id = $projectId
        │           → returns [] if no row found → canCreate = false
        │
        └── getCanUseModuleMemberContent(projectId, 'board')  [app/actions/modules.ts]
              └── getRoleIdsForUserInProject(userId, projectId)
                    → same query → returns [] → memberUse = false

canCreate = granted.has('tasks.create') || memberUse
         = false                         || false
         = FALSE  ← this is what the user sees
```

**Both paths require reading `user_role_assignments` to get role IDs.**
If that table returns no rows for the user, everything collapses to `canCreate = false`.

The function `getRoleIdsForUserInProject` has a fallback: if URA is empty AND the user IS in `project_members`, it treats them as `team_member`. But if `project_members` also returns empty (same RLS problem), the fallback does not fire.

---

## 3. What was investigated and tried

### Step 1 — Diagnosed via `/api/debug/rbac-audit`

Created `app/api/debug/rbac-audit/route.ts` (dev-only, no params required for own user, `?userId=X` for other users). Runs 9 DB diagnostic queries and computes the full app-layer permission chain.

**First run (before SQL fix):**

- `Q2_projectMember.exists: false` — user was NOT in `project_members`
- `Q3_uraRows.total_count: 0` — user had NO role assignment
- `Q4_accessGrant.exists: true`, `allowed_modules: ["board","notes","documents"]` — invite WAS accepted

**Root cause #1 identified:** The old `accept_invite_atomic` RPC only wrote `user_project_access_grants`. It did NOT write `project_members` or `user_role_assignments`. Every invited user before the new version was in this broken state.

### Step 2 — Diagnosed via `/api/debug/migration-status`

Created `app/api/debug/migration-status/route.ts` (dev-only, GET, no params). Uses the **service role key** to check DB health without RLS restrictions. Checks:

- Whether critical tables/columns exist (via `from(table).select(col).limit(0)`)
- Which version of `accept_invite_atomic` is running (calls the RPC with a dummy token; "invite_not_found" error = new version)
- Whether any user has an `access_grant` but no `project_members` row (orphaned)
- Whether any user has an `access_grant` but no `user_role_assignments` row (missing URA)

**Result after SQL fix:**

```json
{
  "verdict": "✅ All critical migrations applied — DB looks healthy",
  "accept_invite_atomic": { "ok": true, "new_signature_running": true },
  "orphaned_users": {
    "ok": true,
    "users_with_grant_but_no_project_member": [],
    "users_with_grant_but_no_ura": []
  }
}
```

The service role can see the rows that were inserted by the SQL fix.

### Step 3 — SQL fix applied manually

Ran this SQL in Supabase SQL Editor:

```sql
INSERT INTO public.project_members (project_id, user_id, invited_by)
VALUES (
  'ef2c243a-982a-44c9-986a-7bfa3c936145',
  '3eeee559-807c-4e0e-a6cf-5d1004fc78f1',
  '3eeee559-807c-4e0e-a6cf-5d1004fc78f1'
) ON CONFLICT DO NOTHING;

INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
SELECT
  '3eeee559-807c-4e0e-a6cf-5d1004fc78f1',
  r.id,
  'ef2c243a-982a-44c9-986a-7bfa3c936145',
  '3eeee559-807c-4e0e-a6cf-5d1004fc78f1'
FROM public.rbac_roles r
WHERE r.name = 'team_member' AND r.is_system_role = true
ON CONFLICT DO NOTHING;
```

Verification SQL returned 1 row with `role_name = team_member`. Rows confirmed to exist via service role.

### Step 4 — Bug persists. Second rbac-audit run (as the affected user)

**The affected user logged into the app and hit the rbac-audit endpoint themselves.**

Full JSON response (key sections):

```json
{
  "Q2_projectMember": { "exists": false, "row": null },
  "Q3_uraRows": {
    "project_scoped": [],
    "org_scoped": [],
    "total_count": 0
  },
  "appLayer": {
    "getRoleIdsForUserInProject": {
      "roleIds": [],
      "note": "EMPTY — fallback did not fire (user not in project_members or team_member role not found)"
    },
    "getBoardPermissions": { "canCreate": false, "canAssign": false },
    "grantedActions": { "total": 0 }
  }
}
```

**The rows EXIST in the DB (confirmed by service role). The user CANNOT READ THEM via their own JWT.**

This is an RLS (Row Level Security) gap.

---

## 4. Confirmed root cause: TWO separate bugs

### Bug A — `accept_invite_atomic` old version (FIXED)

The old RPC only wrote `user_project_access_grants`. Migrations applied:

- `20260324200010_fix_accept_invite_simplified_roles.sql` — new RPC that writes all three tables
- Migration confirmed running: `rpc_error_detail: "invite_not_found"` (new version signature)

New invites going forward will work correctly.

### Bug B — RLS SELECT policies missing on `user_role_assignments` and/or `project_members` (NOT FIXED)

**This is the active blocker.**

The SQL fix inserted rows into both tables. The service role (migration-status) can see them. But the user's own JWT query returns nothing. The only explanation is that the SELECT RLS policies on these tables are not working for this user.

The original RLS policies (from `20260310100006_user_role_assignments.sql`):

```sql
-- Members can see their own role assignments
CREATE POLICY "ura_own_select" ON public.user_role_assignments
  FOR SELECT USING (user_id = auth.uid());
```

This policy should work — `auth.uid()` matches the user's ID. But it is not working.

**Most probable explanation:** A later migration — almost certainly `20260324200000_remove_legacy_rbac.sql` (which removes "legacy RBAC") — **dropped or replaced the SELECT policies on `user_role_assignments` and possibly `project_members`** without adding new ones. This would make the rows invisible to users querying with their JWT, while the service role (which bypasses RLS) still sees them.

---

## 5. How to verify and fix (instructions for the next AI)

### Step 1 — Check what SELECT policies actually exist on these tables

Run this in Supabase SQL Editor:

```sql
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('user_role_assignments', 'project_members')
ORDER BY tablename, cmd;
```

**Expected result (healthy):** You should see at minimum:

- A SELECT policy on `user_role_assignments` with `cmd = SELECT` that allows `user_id = auth.uid()`
- A SELECT policy on `project_members` that allows project members to see rows for their project

**If SELECT policies are missing** on either table, that is the bug.

### Step 2 — Check which migrations ran and what they changed

Read `supabase/migrations/20260324200000_remove_legacy_rbac.sql` and any migration between `20260310100006` and `20260324200000` that touches `user_role_assignments` or `project_members` RLS policies. Look for `DROP POLICY` statements that remove SELECT policies without replacing them.

### Step 3 — Apply the fix

If SELECT policies are missing, add them back with a new migration:

```sql
-- Re-add SELECT policy for user_role_assignments if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_role_assignments'
    AND cmd = 'SELECT'
    AND policyname = 'ura_own_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ura_own_select" ON public.user_role_assignments
        FOR SELECT USING (user_id = auth.uid());
    $policy$;
  END IF;
END $$;
```

And similarly for `project_members` if its SELECT policy is also missing.

### Step 4 — Verify the fix

After adding the policy, have the affected user reload the board page and hit the rbac-audit endpoint. You should see:

- `Q2_projectMember.exists: true`
- `Q3_uraRows.total_count: 1`
- `appLayer.getRoleIdsForUserInProject.roleIds: ["e25e6b91-b51c-4731-a467-f1aba7aac9e6"]`
- `appLayer.getBoardPermissions.canCreate: true`
- `appLayer.grantedActions.total: 51`

### Step 5 — Backfill all affected users

There are other users who accepted invites before Bug A was fixed. Now that Bug B is also fixed (SELECT policies restored), those users will be able to read their own rows. But if they don't have rows yet (invited before Bug A fix and not manually fixed), they still need backfill.

Run the backfill migration:

```
supabase/migrations/20260324200013_robust_ura_backfill.sql
```

or

```
supabase/migrations/20260324200019_backfill_user_role_assignments_missing_members.sql
```

Both are idempotent (safe to re-run). Run via Supabase SQL Editor.

---

## 6. Diagnostic tools available

### `/api/debug/migration-status` (GET, no params)

Uses service role — bypasses RLS. Checks:

- Critical tables and columns exist
- `accept_invite_atomic` version (old vs new)
- Orphaned users (access grant without project_members or URA row)

**File:** `app/api/debug/migration-status/route.ts`

### `/api/debug/rbac-audit` (GET, `?projectId=X&userId=Y`)

Uses user JWT — subject to RLS. Runs full diagnostic:

- Q1: project info
- Q2: project_members row for target user
- Q3: all URA rows for target user
- Q4: user_project_access_grants row
- Q5: project_modules
- Q6: action grants per assigned role
- Q7: team_member system role health
- Q8: project invites for this project
- Q9: users with duplicate URA rows
- `appLayer`: full computed permission chain (only runs when authenticated as the target user)

**File:** `app/api/debug/rbac-audit/route.ts`

**Critical insight:** If migration-status (service role) says rows exist but rbac-audit (user JWT) shows empty, the issue is RLS — the user cannot read their own rows.

---

## 7. Other observations from the audit

- `Q5_projectModules` returned only `[{module_key: "media", enabled: true}]` — the project_modules table is missing rows for board, notes, documents. The app handles this via a fallback in `getProjectModules` (uses registry defaults), which is why the tabs still show. This is a secondary data issue worth investigating but not blocking the create button.
- `Q8_invites` shows 2 accepted invites for the same user — duplicate invites were sent and both accepted. The backfill migrations handle this correctly (ON CONFLICT DO NOTHING).
- The `team_member` role has 51 action grants including `tasks.create`, `notes.create`, `documents.create` — the role data is healthy. The problem is purely that the user cannot read their own URA row to discover they have this role.
