# Plan: RBAC Correctness Fixes

> **Status:** Ready to implement
> **Scope:** 3 bugs + test matrix. No new features, no schema additions.
> **Estimate:** ~3 days of focused work

---

## What this fixes

| #   | Bug                                                                                      | Severity | Affected users                                                      |
| --- | ---------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| B1  | Missing `user_project_access_grants` row = all modules visible                           | High     | Every user invited before RBAC migration or via legacy role_id path |
| B2  | `user_project_action_grants` override **replaces** role grants instead of narrowing them | High     | Any member with a custom action grant row                           |
| B3  | UI shows Edit/Delete controls to view-only users (server rejects, no explanation)        | Medium   | All non-owner members                                               |

---

## Phase 1 — Fail-open → Fail-closed (B1)

**Goal:** A missing `user_project_access_grants` row should mean _blocked_, not _unrestricted_.
After this phase: every existing member has an explicit row; every new invite always creates one.

### Step 1a — Migration: backfill existing members

**New file:** `supabase/migrations/YYYYMMDD_backfill_access_grants.sql`

```sql
-- ============================================================
-- Backfill user_project_access_grants for all existing project
-- members who don't have a row yet.
--
-- NULL allowed_modules = explicitly unrestricted (see all tabs).
-- This is the safe default for users who were invited before the
-- RBAC migration or via the legacy role_id-only invite path.
--
-- After this runs, a missing row means "not a member" — fail-closed.
-- The app layer (getMyProjectAccessGrant) is updated in the same PR
-- to treat missing rows as blocked rather than unrestricted.
-- ============================================================

INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
SELECT pm.project_id, pm.user_id, NULL
FROM public.project_members pm
LEFT JOIN public.user_project_access_grants upag
  ON upag.project_id = pm.project_id
 AND upag.user_id    = pm.user_id
WHERE upag.user_id IS NULL;
```

**RLS note:** `user_project_access_grants` already has RLS. This runs in a migration
(superuser context) so it bypasses RLS. No policy change needed.

---

### Step 1b — Fix `accept_invite_atomic` RPC

**File:** new migration `YYYYMMDD_fix_accept_invite_always_writes_grant.sql`

The current RPC (in `20260323100000`) only writes to `user_project_access_grants` when
`v_allowed_modules IS NOT NULL AND array_length(v_allowed_modules, 1) > 0`.
The legacy path (`role_id` only) sets `v_allowed_modules := NULL` and skips the INSERT.

**Fix:** always write the row, even when `v_allowed_modules IS NULL`.

```sql
CREATE OR REPLACE FUNCTION public.accept_invite_atomic(
  p_token   TEXT,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite          RECORD;
  v_invite_role     RECORD;
  v_profile         RECORD;
  v_effective_role  UUID;
  v_allowed_modules TEXT[];
  v_granted_actions TEXT[];
  v_user_email      TEXT;
BEGIN
  -- 1. Fetch and lock invite
  SELECT pi.id, pi.project_id, pi.role_id, pi.profile_id,
         pi.invite_role_id, pi.invited_by, pi.status, pi.expires_at, pi.email
  INTO v_invite
  FROM public.project_invites pi
  WHERE pi.token = p_token
  FOR UPDATE;

  IF NOT FOUND                    THEN RAISE EXCEPTION 'invite_not_found';   END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF v_invite.expires_at < NOW()  THEN RAISE EXCEPTION 'invite_expired';     END IF;

  SELECT LOWER(TRIM(email)) INTO v_user_email
  FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR v_user_email <> LOWER(TRIM(v_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  -- 2. Resolve effective role / allowed_modules / granted_actions
  IF v_invite.invite_role_id IS NOT NULL THEN
    SELECT effective_role_name, allowed_modules, granted_actions
    INTO v_invite_role
    FROM public.project_invite_roles
    WHERE id = v_invite.invite_role_id;

    IF FOUND THEN
      SELECT id INTO v_effective_role
      FROM public.rbac_roles
      WHERE name = v_invite_role.effective_role_name AND is_system_role = true;

      v_allowed_modules := v_invite_role.allowed_modules;
      v_granted_actions := v_invite_role.granted_actions;
    END IF;

  ELSIF v_invite.profile_id IS NOT NULL THEN
    SELECT base_role_id, allowed_modules
    INTO v_profile
    FROM public.project_access_profiles
    WHERE id = v_invite.profile_id;

    IF FOUND THEN
      v_effective_role  := v_profile.base_role_id;
      v_allowed_modules := v_profile.allowed_modules;
    END IF;
  END IF;

  IF v_effective_role IS NULL THEN
    v_effective_role  := v_invite.role_id;
    -- v_allowed_modules stays NULL → explicit unrestricted (row still written below)
  END IF;

  -- 3. Add to project_members
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- 4. Assign role
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT p_user_id, v_effective_role, v_invite.project_id, v_invite.invited_by
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id    = p_user_id
      AND ura.role_id    = v_effective_role
      AND ura.project_id = v_invite.project_id
  );

  -- 5. ALWAYS write module allowlist row (even if NULL = unrestricted).
  --    A missing row now means "not a member" (fail-closed in app layer).
  --    NULL allowed_modules here means "explicitly unrestricted — show all tabs".
  INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
  VALUES (v_invite.project_id, p_user_id, v_allowed_modules)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();

  -- 6. Apply custom action grants (if any)
  IF v_granted_actions IS NOT NULL AND array_length(v_granted_actions, 1) > 0 THEN
    INSERT INTO public.user_project_action_grants (project_id, user_id, granted_actions)
    VALUES (v_invite.project_id, p_user_id, v_granted_actions)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET granted_actions = EXCLUDED.granted_actions, updated_at = NOW();
  END IF;

  -- 7. Mark invite accepted
  UPDATE public.project_invites
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$;

COMMENT ON FUNCTION public.accept_invite_atomic(TEXT, UUID) IS
  'Accepts a project invite. Always writes user_project_access_grants (NULL = unrestricted).
   A missing row in user_project_access_grants now means not-a-member (fail-closed).';
```

---

### Step 1c — Update `getMyProjectAccessGrant` return type

**File:** `app/actions/modules.ts`

Change the return type to distinguish "no row" from "row with null":

```typescript
// Before (both cases return null — ambiguous):
// null = no row OR row with null → unrestricted

// After (three distinct states):
// undefined = no row   → fail-closed (blocked)
// null      = row + null modules → unrestricted
// string[]  = row + explicit allowlist

export const getMyProjectAccessGrant = cache(
  async (projectId: string): Promise<string[] | null | undefined> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const { data } = await (supabase as any)
      .from('user_project_access_grants')
      .select('allowed_modules')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!data) return undefined; // no row → fail-closed
    const raw = data.allowed_modules;
    if (raw == null) return null; // row with null → unrestricted
    const arr = Array.isArray(raw) ? raw : [];
    return arr.filter((x): x is string => typeof x === 'string');
  }
);
```

Update `getCanViewModule` to use the new semantic:

```typescript
export const getCanViewModule = cache(
  async (
    projectId: string,
    moduleKey: ModuleKey
  ): Promise<{
    canView: boolean;
    reason?: 'no_access' | 'project_disabled';
  }> => {
    const [modules, grant] = await Promise.all([
      getProjectModules(projectId),
      getMyProjectAccessGrant(projectId),
    ]);

    const projectEnabled = getEnabledModuleKeys(modules).has(moduleKey);

    const userAllowed =
      grant === null || // explicit unrestricted
      (Array.isArray(grant) && grant.includes(moduleKey)); // explicit allowlist
    // grant === undefined (no row) → userAllowed = false → fail-closed ✓

    const canView = projectEnabled && userAllowed;
    return {
      canView,
      reason: canView
        ? undefined
        : !projectEnabled
          ? 'project_disabled'
          : 'no_access',
    };
  }
);
```

**Check for other callers of `getMyProjectAccessGrant`:** grep the codebase. Any caller
that currently treats `null` as "unrestricted" needs to be updated to treat `null || undefined`
as two distinct cases. Most callers likely just forward this to `getCanViewModule` — if so,
no change needed at the call site.

---

## Phase 2 — Fix Override Semantics (B2)

**Goal:** `user_project_action_grants` should **narrow** (intersect) role-based grants, not replace them.

**File:** `lib/rbac/resolver.ts`, function `getGrantedActions`

Current structure:

1. Check custom grants → if present, return early (replaces role grants)
2. Expand role grants

New structure:

1. Always expand role grants first
2. If custom grants exist, filter role grants to their intersection

```typescript
export const getGrantedActions = cache(
  async (
    userId: string,
    contextId: string,
    isProjectScope: boolean
  ): Promise<Set<string>> => {
    const supabase = await createClient();

    // ── 1. Expand role grants (always) ─────────────────────────────────
    const roleIds: string[] = [];

    if (isProjectScope) {
      const { data: projectRoles } = await (supabase as any)
        .from('user_role_assignments')
        .select('role_id')
        .eq('user_id', userId)
        .eq('project_id', contextId);
      if (projectRoles) for (const r of projectRoles) roleIds.push(r.role_id);

      const { data: project } = await (supabase as any)
        .from('projects')
        .select('org_id')
        .eq('id', contextId)
        .maybeSingle();

      if (project?.org_id) {
        const { data: orgRoles } = await (supabase as any)
          .from('user_role_assignments')
          .select('role_id')
          .eq('user_id', userId)
          .eq('org_id', project.org_id);
        if (orgRoles) for (const r of orgRoles) roleIds.push(r.role_id);
      }
    } else {
      const { data: orgRoles } = await (supabase as any)
        .from('user_role_assignments')
        .select('role_id')
        .eq('user_id', userId)
        .eq('org_id', contextId);
      if (orgRoles) for (const r of orgRoles) roleIds.push(r.role_id);
    }

    const roleGranted = new Set<string>();

    if (roleIds.length > 0) {
      const { data: actionRows } = await (supabase as any)
        .from('rbac_role_module_actions')
        .select('rbac_module_actions(action_key)')
        .in('role_id', roleIds);

      for (const row of actionRows ?? []) {
        const key = row?.rbac_module_actions?.action_key;
        if (key) roleGranted.add(key);
      }
    }

    // ── 2. Apply custom action grant as ceiling (intersection) ──────────
    //
    // If a custom grant row exists and is non-empty, it acts as a permission
    // boundary: the user receives only the actions that are BOTH in their role
    // AND in the custom grant list. This can only narrow, never expand or replace.
    //
    // Example: role grants [tasks.read.project, tasks.create, notes.read]
    //          custom grant = [tasks.read.own]
    //          result: [tasks.read.own] — read narrowed, notes.read preserved
    //
    // Empty custom grant ([]): no override applied — role grants used as-is.
    if (isProjectScope) {
      const { data: customRow } = await (supabase as any)
        .from('user_project_action_grants')
        .select('granted_actions')
        .eq('project_id', contextId)
        .eq('user_id', userId)
        .maybeSingle();

      const overrides = customRow?.granted_actions as string[] | undefined;
      if (overrides && Array.isArray(overrides) && overrides.length > 0) {
        const overrideSet = new Set(overrides);
        return new Set([...roleGranted].filter((a) => overrideSet.has(a)));
      }
    }

    return roleGranted;
  }
);
```

**Important:** The DB query order changed (role expansion first, then custom grants).
This adds one DB call per request for users with custom grants, but `getGrantedActions`
is still React-`cache()`-memoized so it only runs once per render per (userId, projectId).

---

## Phase 3 — Hide Ghost Controls (B3)

**Goal:** View-only users do not see Edit/Delete controls. Permission-denied server
action responses render an explanation, not a generic error dialog.

### Step 3a — `getModuleAccess()` composite helper

**New file:** `lib/rbac/access.ts`

```typescript
import { cache } from 'react';
import { can } from './resolver';
import {
  getCanViewModule,
  getMyProjectAccessGrant,
} from '@/app/actions/modules';
import { getReadScope } from './read-scope';
import type { ModuleKey } from '@/lib/modules/registry';

export type ModuleAccess = {
  canView: boolean;
  canRead: boolean;
  readScope: 'own' | 'team' | 'project';
  canWrite: boolean;
  canDelete: boolean;
  reason?: 'module_disabled' | 'no_module_access' | 'no_read_permission';
};

export const getModuleAccess = cache(
  async (
    userId: string,
    projectId: string,
    moduleKey: ModuleKey
  ): Promise<ModuleAccess> => {
    const [{ canView, reason }, readScope, canWrite, canDelete] =
      await Promise.all([
        getCanViewModule(projectId, moduleKey),
        getReadScope(userId, projectId, moduleKey),
        can(userId, `${moduleKey}.create`, {
          type: moduleKey as any,
          projectId,
        }),
        can(userId, `${moduleKey}.delete`, {
          type: moduleKey as any,
          projectId,
        }),
      ]);

    const canRead = readScope !== null;

    return {
      canView,
      canRead,
      readScope: readScope ?? 'own',
      canWrite,
      canDelete,
      reason: canView ? undefined : (reason as ModuleAccess['reason']),
    };
  }
);
```

### Step 3b — Wire into page.tsx → Client for boards/tasks tab

**File:** `app/context/[projectId]/board/page.tsx`

```typescript
// Add alongside existing data fetches:
const access = await getModuleAccess(user.id, projectId, 'board');

// Pass to Client:
<ContextBoardClient ... access={access} />
```

**File:** `app/context/[projectId]/board/ContextBoardClient.tsx`

```typescript
// Accept access prop:
type Props = {
  // ...existing props
  access: ModuleAccess;
};

// Use in JSX — hide controls the user can never use:
{access.canWrite && (
  <AddTaskButton onClick={...} />
)}

{access.canDelete && (
  <DeleteTaskButton onClick={...} />
)}
```

Do the same for the other context tabs that have write controls:
`notes`, `links`, `ideas`, `budgets`, `billings`, `todos`.

### Step 3c — Permission-denied response from server actions

In server actions that call `requireCan()`, the thrown error currently becomes
a caught exception that goes to MutationErrorDialog as a generic message.

Add a typed permission-denied return path:

```typescript
// app/actions/tasks.ts — example
export async function createTask(...) {
  const user = await requireAuth();
  const allowed = await can(user.id, 'tasks.create', { type: 'task', projectId });
  if (!allowed) {
    return { error: { code: 'permission_denied', action: 'tasks.create' } };
  }
  // ... rest of action
}
```

Add a `PermissionBanner` component:

```tsx
// components/shared/PermissionBanner.tsx
export function PermissionBanner({ action }: { action: string }) {
  const { t } = useI18n();
  return <div className="...">{t('errors.permission_denied')}</div>;
}
```

Add i18n keys:

```json
// locales/en.json
"errors": {
  "permission_denied": "You don't have permission to do this."
}

// locales/es.json
"errors": {
  "permission_denied": "No tienes permiso para realizar esta acción."
}
```

In Clients, handle the typed error:

```typescript
const result = await createTask(...);
if (result.error?.code === 'permission_denied') {
  // show PermissionBanner, not MutationErrorDialog
}
```

---

## Phase 4 — Test Matrix (Playwright)

**New directory:** `tests/rbac/`

### `tests/rbac/personas.ts` — helper to create each test persona

```typescript
export async function createPersona(type: PersonaType, page: Page) {
  // 1. Create project with owner
  // 2. Invite user with the appropriate profile/role/custom_grants
  // 3. Accept invite (simulate)
  // 4. Return authenticated page as that user
}

export type PersonaType =
  | 'owner'
  | 'full_editor'
  | 'full_viewer'
  | 'tasks_only_viewer' // allowed_modules: ['board']
  | 'finance_officer' // allowed_modules: ['budgets']
  | 'external_reviewer' // allowed_modules: ['board', 'notes', 'documents']
  | 'custom_read_own' // granted_actions: ['tasks.read.own']
  | 'legacy_invited'; // role_id only, no access_grants row (backfill scenario)
```

### Test files

```
tests/rbac/
  module-visibility.spec.ts   — tabs visible/hidden per persona
  write-controls.spec.ts      — edit/delete buttons present/absent per persona
  permission-denied-ux.spec.ts — blocked actions show explanation, not crash
  invite-acceptance.spec.ts   — all 3 invite paths create access_grants row
  override-semantics.spec.ts  — custom grant narrows role, doesn't replace it
```

### Critical assertions to write

```typescript
// module-visibility.spec.ts
test('tasks-only viewer sees board tab, not notes tab', async ({ page }) => {
  await createPersona('tasks_only_viewer', page);
  await expect(page.getByTestId('tab-board')).toBeVisible();
  await expect(page.getByTestId('tab-notes')).not.toBeVisible();
});

test('legacy invited user (no access row) sees all tabs after backfill', async ({
  page,
}) => {
  await createPersona('legacy_invited', page);
  // After backfill migration: row exists with null = unrestricted
  await expect(page.getByTestId('tab-board')).toBeVisible();
  await expect(page.getByTestId('tab-notes')).toBeVisible();
});

// write-controls.spec.ts
test('full viewer does not see add-task button', async ({ page }) => {
  await createPersona('full_viewer', page);
  await page.goto('/context/[projectId]/board');
  await expect(page.getByTestId('add-task-btn')).not.toBeVisible();
});

// override-semantics.spec.ts
test('custom read-own grant does not strip notes access', async ({ page }) => {
  await createPersona('custom_read_own', page);
  // custom grant = ['tasks.read.own'] — should narrow tasks scope, not remove notes
  await expect(page.getByTestId('tab-notes')).toBeVisible();
  // Should only see own tasks (not all project tasks)
  // ... assert only own tasks visible in board
});
```

---

## Pre-flight checklist before starting

- [ ] Read `lib/rbac/resolver.ts` in full (done — see this plan)
- [ ] Read `app/actions/modules.ts` in full (done — see this plan)
- [ ] Read `accept_invite_atomic` RPC (done — see this plan)
- [ ] Run `npm run test -- --run` to confirm baseline passes
- [ ] Run `npm run lint` to confirm clean baseline

## Definition of Done

- [ ] Backfill migration runs cleanly on a fresh Supabase reset
- [ ] `accept_invite_atomic` always writes `user_project_access_grants` row
- [ ] `getMyProjectAccessGrant` returns `undefined` (not `null`) for missing rows
- [ ] `getCanViewModule` treats `undefined` as blocked (not unrestricted)
- [ ] `getGrantedActions` does intersection, not replacement, for custom grants
- [ ] Board/tasks tab hides add/edit/delete for view-only users
- [ ] Permission-denied server action response shows `PermissionBanner`
- [ ] All 8 personas have a passing Playwright test
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` all pass
