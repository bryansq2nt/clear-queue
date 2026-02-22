# Codebase Architecture Audit — 2026-02-22

**Date:** 2026-02-22
**Auditor:** Claude Sonnet 4.6 (automated deep read)
**Total files read:** 52 (TypeScript/TSX: 32, SQL migrations: 20)
**Total migrations read:** 20 (in chronological order)
**Total server action files audited:** 3 (app/actions/projects.ts, app/notes/actions.ts, app/context/[projectId]/links/actions.ts — partial; app/actions/tasks.ts, app/billings/actions.ts, app/budgets/actions.ts, app/clients/actions.ts not directly read but audited via migrations and types)

---

## 1. Architecture Overview

### System at a Glance

Clear Queue is a Next.js 14 (App Router) project management SaaS. It uses:

- **Supabase** as the backend: Postgres database with RLS, Storage for user-uploaded assets, and Auth.
- **Server Actions** (`'use server'`) for all mutations and auth-sensitive reads.
- **React `cache()`** on read-only server actions.
- **A client-side session cache** (`ContextDataCache`) to avoid redundant fetches when a user navigates between project tabs.
- **Sentry** for error tracking via a `captureWithContext` wrapper.
- **Atomic Postgres RPCs** (`supabase.rpc(...)`) for multi-step operations that must not leave partial state.

### Route Structure

The application has two primary surface areas:

1. **Module pages** (`/notes`, `/budgets`, `/ideas`, `/todo`, `/clients`, `/billings`, etc.) — standalone top-level modules not tied to a project context.
2. **Context system** (`/context/[projectId]/[tab]`) — a per-project workspace with 7 tabs: Board, Owner, Notes, Links, Ideas, Budgets, Todos.

### Context System Data Flow (as implemented, not as documented)

```
app/context/layout.tsx
  └── ContextDataCacheProvider          (mounted once, persists across project navigations)
        └── app/context/[projectId]/layout.tsx (Server Component)
              ├── requireAuth()         (auth guard, server-side)
              └── ContextLayoutWrapper  (Client Component)
                    ├── reads cache.get({ type: 'project', projectId })
                    ├── on miss: calls getProjectById() server action
                    ├── stores result in cache.set({ type: 'project', projectId })
                    └── ContextLayoutClient
                          ├── useEffect → recordProjectAccess(projectId) (fire-and-forget)
                          └── ContextShell + ContextTabBar
                                └── children (tab pages)

Each tab page (e.g. /board, /notes):
  └── *FromCache component (client)
        ├── cache.get({ type: 'tab', projectId })  → cache hit: render immediately
        ├── cache miss: show skeleton, call server action, cache.set, render
        └── *Client component (receives initialData + onRefresh prop)
              └── onRefresh = loadData from FromCache (invalidate cache + refetch)
```

The cache provider is correctly placed in `app/context/layout.tsx`, not inside `[projectId]/layout.tsx`. This means the cache survives navigation between Project A → Project B → back to Project A. This is correct per the documented pattern.

### Cache Keys Registered in ContextDataCache

`ContextDataCache.tsx` defines the following cache key types:

| Key Type         | Keyed By    |
| ---------------- | ----------- |
| `project`        | `projectId` |
| `board`          | `projectId` |
| `notes`          | `projectId` |
| `links`          | `projectId` |
| `linkCategories` | `projectId` |
| `ideas`          | `projectId` |
| `owner`          | `projectId` |
| `budgets`        | `projectId` |
| `todos`          | `projectId` |
| `noteDetail`     | `noteId`    |

9 key types total. The `invalidateProject(projectId)` helper clears all keys for a project except `noteDetail` keys.

---

## 2. Pattern Consistency Audit

Pattern reference: `docs/patterns/context-session-cache.md`
Required shape: `*FromCache` → `*Client` → `onRefresh` callback wired to cache invalidation.

### Board Module

**File:** `app/context/[projectId]/board/ContextBoardFromCache.tsx`

- `*FromCache` wrapper: **YES** ✓
- Cache key registered: `board:${projectId}` ✓
- On cache miss: shows `SkeletonBoard`, calls `getBoardInitialData(projectId)`, caches result ✓
- `loadData`: invalidates `board:${projectId}`, refetches, updates cache ✓
- `onRefresh` passed to `ContextBoardClient`: **YES** ✓
- Skeleton loading: uses `SkeletonBoard` ✓

**Board: Pattern compliant.**

---

### Notes Module

**File:** `app/context/[projectId]/notes/ContextNotesFromCache.tsx`

- `*FromCache` wrapper: **YES** ✓
- Cache key registered: `notes:${projectId}` ✓
- On cache miss: shows `SkeletonNotes`, calls `getNotes({ projectId })`, caches result ✓
- `loadData`: invalidates `notes:${projectId}`, refetches ✓
- `onRefresh` passed to `ContextNotesClient`: **YES** ✓

**File:** `app/context/[projectId]/notes/ContextNotesClient.tsx`

- **DEVIATION — Line 102–104:** When `isLoading` is true, renders `<p className="text-sm text-muted-foreground">{t('common.loading')}</p>`. This is a spinner/text fallback, **not a shimmer skeleton**. The `.cursorrules` and pattern docs explicitly ban this: "NEVER use spinners or the text 'Loading...'". The `onRefresh` path triggers this text state while re-fetching.

**Notes: Pattern mostly compliant. One shimmer violation in ContextNotesClient.tsx:103.**

---

### Links Module

**File:** `app/context/[projectId]/links/ContextLinksFromCache.tsx`

- `*FromCache` wrapper: **YES** ✓
- Two cache keys: `links:${projectId}` and `linkCategories:${projectId}` — both registered in `ContextDataCache.tsx` ✓
- Partial cache handling: if only links are cached but not categories, fetches categories independently ✓
- `loadData`: invalidates both keys, fetches both, updates both ✓
- `onRefresh` and `onCategoriesCacheUpdate` passed to `ContextLinksClient` ✓
- Skeleton: `SkeletonLinks` ✓

**File:** `app/context/[projectId]/links/ContextLinksClient.tsx`

- Skeleton guard: `!showList` (line 717) falls back to `<SkeletonLinks />` while categories load — correct ✓
- `handleConfirmDeleteCategory` (line 552–565): after delete, calls `listLinkCategoriesAction()` directly (bypassing onRefresh), then calls `onCategoriesCacheUpdate?.(next)`. This updates the categories cache directly without full invalidation — a slight architectural inconsistency but not a correctness bug.
- `handleSaveEditCategory` (line 567–577): same pattern — direct `listLinkCategoriesAction()` call then `onCategoriesCacheUpdate?.(next)`.

**Links: Pattern compliant with minor cache update inconsistency in ContextLinksClient.**

---

### Ideas Module

**File:** `app/context/[projectId]/ideas/ContextIdeasFromCache.tsx`

- `*FromCache` wrapper: **YES** ✓
- Cache key: `ideas:${projectId}` ✓
- Skeleton: `SkeletonIdeas` ✓
- `onRefresh` passed to `ContextIdeasClient` ✓

**File:** `app/context/[projectId]/ideas/ContextIdeasClient.tsx`

- **DEVIATION — Lines 55–70 (Two-step non-atomic board creation):**
  ```ts
  const result = await createBoardAction(formData); // Step 1: creates board without project_id
  const updateFormData = new FormData();
  updateFormData.set('projectId', projectId);
  await updateBoardAction(updateFormData); // Step 2: links board to project
  ```
  If `createBoardAction` succeeds but `updateBoardAction` fails, a board exists in the database with no `project_id`. This board will be orphaned (not visible in the context ideas tab) but will exist in the user's global idea boards list. Should be a single atomic RPC.

**Ideas: FromCache pattern correct. Non-atomic board creation is a data integrity issue.**

---

### Budgets Module

**File:** `app/context/[projectId]/budgets/ContextBudgetsFromCache.tsx`

- `*FromCache` wrapper: **YES** ✓
- Cache key: `budgets:${projectId}` ✓
- Skeleton: `SkeletonBudgets` ✓
- `onRefresh` passed to `ContextBudgetsClient` ✓

**Budgets: Pattern compliant.**

---

### Todos Module

**File:** `app/context/[projectId]/todos/ContextTodosFromCache.tsx`

- `*FromCache` wrapper: **YES** ✓
- Cache key: `todos:${projectId}` ✓
- Skeleton: `SkeletonTodos` ✓
- **DEVIATION — `onRefresh` is NOT passed to `ContextTodosClient`** (line 62–69):
  ```tsx
  return (
    <ContextTodosClient
      projectId={projectId}
      initialProjectName={data.projectName}
      initialDefaultListId={data.defaultListId}
      initialItems={data.items}
      // onRefresh is missing here
    />
  );
  ```
  After any mutation in `ContextTodosClient` (add/toggle/delete todo item), the todos cache at `todos:${projectId}` is never invalidated. If the user navigates away and back, they see stale cached data until the session ends.

**Todos: Missing `onRefresh` wiring. Cache is never invalidated after mutations.**

---

### Owner Module

**File:** `app/context/[projectId]/owner/ContextOwnerFromCache.tsx`

- `*FromCache` wrapper: **YES** ✓
- Cache key: `owner:${projectId}` ✓
- Skeleton: `SkeletonOwner` ✓
- `onOwnerUpdated={loadData}` passed to `ContextOwnerClient` ✓
- Makes 3 calls on cache miss: `getProjectById`, then parallel `getClientById` + `getBusinessById` — correct use of `Promise.all` ✓

**Owner: Pattern compliant.**

---

## 3. Security Audit

### `lib/auth.ts`

`requireAuth()` calls `supabase.auth.getUser()` (the server-authoritative method) and redirects to `/` if no user. This is correct — `getUser()` validates the JWT with Supabase's server. ✓

`checkIsAdmin()` uses email comparison against an env variable. Admin check is application-level only, not enforced at the database level. No admin-only RLS policies exist in any migration. This is acceptable only if admin operations don't bypass user RLS.

---

### `app/actions/projects.ts` — Security Analysis

| Function                | requireAuth()   | Scopes by owner_id in query                     | Relies on RLS only |
| ----------------------- | --------------- | ----------------------------------------------- | ------------------ |
| `getProjectsForSidebar` | ✓ (line 24)     | ✓ `.eq('owner_id', user.id)`                    | N/A                |
| `getProjectById`        | ✓ (line 38)     | **NO** — only `.eq('id', projectId)` (line 44)  | YES                |
| `createProject`         | ✓ (line 56)     | ✓ `owner_id: user.id` in insert                 | N/A                |
| `updateProject`         | ✓ (line 112)    | **NO** — only `.eq('id', id)` (line 162)        | YES                |
| `linkBusinessToProject` | ✓ (line 194)    | **NO** — only `.eq('id', projectId)` (line 205) | YES                |
| `archiveProject`        | ✓ (line 232)    | **NO** — only `.eq('id', id)` (line 240)        | YES                |
| `unarchiveProject`      | ✓ (line 265)    | **NO** — only `.eq('id', id)` (line 280)        | YES                |
| `deleteProject`         | ✓ (line 309)    | **NO** — only `.eq('id', id)` (line 311)        | YES                |
| `getProjectsList`       | ✓ (line 341)    | ✓ `.eq('owner_id', user.id)`                    | N/A                |
| `recordProjectAccess`   | ✓ (line 409)    | ✓ uses `user_id: user.id`                       | N/A                |
| `getFavoriteProjectIds` | via `getUser()` | ✓ `.eq('user_id', user.id)`                     | N/A                |
| `addProjectFavorite`    | via `getUser()` | ✓ `user_id: user.id`                            | N/A                |
| `removeProjectFavorite` | via `getUser()` | ✓ `.eq('user_id', user.id)`                     | N/A                |

**Finding:** `getProjectById`, `updateProject`, `linkBusinessToProject`, `archiveProject`, `unarchiveProject`, and `deleteProject` do not add `.eq('owner_id', user.id)` to their queries. They rely entirely on Supabase RLS policies for ownership enforcement. RLS is correctly configured (projects table has `owner_id = auth.uid()` on SELECT/UPDATE/DELETE), so these are not exploitable in production — but they violate the defense-in-depth principle described in `docs/patterns/database-queries.md` ("Always scope by owner_id or user_id") and `.cursorrules`. This is a pattern violation, not an active vulnerability.

**No `assertProjectOwnership` utility exists** (`lib/auth.ts` only has `requireAuth()`, `getUser()`, and `checkIsAdmin()`). Multiple actions would benefit from a shared `assertProjectOwnership(userId, projectId)` helper.

---

### `app/notes/actions.ts` — Security Analysis

| Function            | requireAuth() | Scopes by owner_id in query               |
| ------------------- | ------------- | ----------------------------------------- |
| `getNotes` (cached) | ✓ (line 14)   | ✓ `.eq('owner_id', user.id)`              |
| `getNoteById`       | ✓ (line 40)   | **NO** — only `.eq('id', noteId)`         |
| `createNote`        | ✓ (line 57)   | ✓ `owner_id: user.id` in insert           |
| `updateNote`        | ✓ (line 100)  | **NO** — only `.eq('id', noteId)`         |
| `deleteNote`        | ✓ (line 140)  | **NO** — only `.eq('id', noteId)`         |
| `getNoteLinks`      | ✓ (line 165)  | **NO** — only `.eq('note_id', noteId)`    |
| `addNoteLink`       | ✓ (line 179)  | **NO** — only `note_id: noteId` in insert |
| `deleteNoteLink`    | ✓ (line 217)  | **NO** — only `.eq('id', linkId)`         |

The notes table has `owner_id = auth.uid()` RLS, and `note_links` is protected via note→owner join in RLS. All operations are safe in practice. Same defense-in-depth gap as projects.

**Additional finding:** `updateNote` (line 119) and `createNote` (line 78) use `.update(updates as never)` and `.insert(insertPayload as never)`. These `as never` type casts suppress TypeScript's type checking and indicate that the generated Supabase types and the manual type definitions are misaligned.

---

### `app/context/[projectId]/links/actions.ts` — Security Analysis

| Function                            | requireAuth() | Scopes by owner_id                                                   |
| ----------------------------------- | ------------- | -------------------------------------------------------------------- |
| `listProjectLinksAction` (cached)   | ✓             | ✓ `.eq('owner_id', user.id)`                                         |
| `listLinkCategoriesAction` (cached) | ✓             | ✓ `.eq('owner_id', user.id)`                                         |
| `createLinkCategoryAction`          | ✓             | ✓ `owner_id: user.id`                                                |
| `updateLinkCategoryAction`          | ✓             | ✓ `.eq('owner_id', user.id)`                                         |
| `deleteLinkCategoryAction`          | ✓             | ✓ `.eq('owner_id', user.id)` on both tables                          |
| `createProjectLinkAction`           | ✓             | ✓ owner_id + category ownership check                                |
| `updateProjectLinkAction`           | ✓ (line 286)  | Partial — update uses only `.eq('id', id)` (line 349); relies on RLS |
| `archiveProjectLinkAction`          | ✓             | ✓ `.eq('owner_id', user.id)` preflight fetch                         |
| `reorderProjectLinksAction`         | ✓             | ✓ `.eq('owner_id', user.id)` per link                                |

**Finding:** `updateProjectLinkAction` calls `requireAuth()` at line 286 but also calls `requireAuth()` a **second time** at line 321 when `category_id` is being updated (to get `user.id` for the category ownership check). `requireAuth()` in turn calls `getUser()` which calls `supabase.auth.getUser()`. This is two redundant round-trips to Supabase Auth per update that includes a `category_id` change. The first call's user object should be stored and reused.

**Finding:** `listLinkCategoriesAction` is wrapped with `cache()` but contains **INSERT mutations** at lines 100–106 (the category seeding loop). Mutations must never be wrapped in `cache()` per `docs/patterns/data-loading.md`. The `cache()` wrapper ensures this function executes at most once per server-side render cycle, which means category seeding can be silently skipped if the function is called more than once in the same render. This is architecturally incorrect even if the current call sites are all client-side (where React `cache()` doesn't deduplicate).

---

### Storage Policies (`20260214000000_profile_and_branding.sql`)

Storage bucket `user-assets` is **private** (not public). Storage RLS policies enforce path-based ownership:

```sql
(storage.foldername(name))[1] = auth.uid()::text
```

Path convention: `{user_id}/{kind}/{uuid}.{ext}`. This correctly prevents user A from reading/writing user B's assets. ✓

All four storage operations (INSERT, SELECT, UPDATE, DELETE) have policies. ✓

---

### RLS Summary by Table

| Table                | RLS Enabled | SELECT                   | INSERT                      | UPDATE w/CHECK                        | DELETE                   | Notes                                   |
| -------------------- | ----------- | ------------------------ | --------------------------- | ------------------------------------- | ------------------------ | --------------------------------------- |
| `projects`           | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `tasks`              | ✓           | project→owner join       | project→owner join          | project→owner + WITH CHECK            | project→owner            | ✓                                       |
| `todo_lists`         | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `todo_items`         | ✓           | owner_id                 | owner_id + list→owner check | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `ideas`              | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `idea_connections`   | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `idea_project_links` | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `idea_boards`        | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `idea_board_items`   | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `budgets`            | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `budget_categories`  | ✓           | budget→owner             | budget→owner                | budget→owner + WITH CHECK             | budget→owner             | Fixed in 20260216_fix_security          |
| `budget_items`       | ✓           | bc→budget→owner          | bc→budget→owner             | bc→budget→owner + WITH CHECK          | bc→budget→owner          | Fixed in 20260216_fix_security          |
| `clients`            | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `businesses`         | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `business_media`     | ✓           | business→owner           | business→owner              | business→owner + WITH CHECK           | business→owner           | Fixed in 20260216_fix_security          |
| `client_links`       | ✓           | client→owner             | client→owner                | client→owner + WITH CHECK             | client→owner             | ✓                                       |
| `notes`              | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `note_links`         | ✓           | note→owner               | note→owner                  | note→owner + WITH CHECK (both)        | note→owner               | ✓                                       |
| `billings`           | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `project_favorites`  | ✓           | user_id                  | user_id                     | **NO UPDATE POLICY**                  | user_id                  | Intentional (toggle only)               |
| `project_access`     | ✓           | user_id                  | user_id                     | user_id + WITH CHECK                  | **NO DELETE POLICY**     | Gap — stale records can't be cleaned    |
| `project_links`      | ✓           | owner_id + project→owner | owner_id + project→owner    | owner_id + project→owner + WITH CHECK | owner_id + project→owner | Double-enforced ✓                       |
| `link_categories`    | ✓           | owner_id                 | owner_id                    | owner_id + WITH CHECK                 | owner_id                 | ✓                                       |
| `profiles`           | ✓           | user_id                  | user_id                     | user_id + WITH CHECK                  | **NO DELETE POLICY**     | May be intentional                      |
| `user_preferences`   | ✓           | user_id                  | user_id                     | user_id + WITH CHECK                  | **NO DELETE POLICY**     | May be intentional                      |
| `user_assets`        | ✓           | user_id                  | user_id                     | **NO UPDATE POLICY**                  | user_id                  | May be intentional (replace-not-update) |

**Security gaps found:**

- `project_access`: no DELETE policy. Stale access records cannot be cleaned up by the application. Low severity (no data leak, only stale metadata).
- `profiles`, `user_preferences`: no DELETE policies. Low severity if account deletion is handled at the `auth.users` level (CASCADE deletes will propagate).
- `user_assets`: no UPDATE policy. This is likely intentional (assets are replaced, not updated in place), but there is no documentation confirming this decision.

---

## 4. Database & Migration Audit

### Migrations Read (20 total, in order)

| #   | File                     | What it does                                                                                                                    |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `001_initial_schema.sql` | Creates `projects`, `tasks` (task_status enum), basic indexes, `is_admin_user()` function, weak RLS                             |
| 2   | `002_todo_lists.sql`     | Creates `todo_lists`, `todo_items` with proper per-owner RLS                                                                    |
| 3   | `20260118190000`         | Adds `category`, `updated_at` to projects; adds trigger; creates proper FK with CASCADE                                         |
| 4   | `20260119000000`         | Adds `notes` column to projects                                                                                                 |
| 5   | `20260119200000`         | Creates idea graph tables (no RLS yet)                                                                                          |
| 6   | `20260119210000`         | Adds RLS to all idea graph tables                                                                                               |
| 7   | `202601250000`           | Creates budgets, budget_categories, budget_items with weak RLS (`auth.role()`)                                                  |
| 8   | `20260201090000`         | Adds `sort_order` to `budget_items`                                                                                             |
| 9   | `20260208100000`         | Creates `project_favorites`                                                                                                     |
| 10  | `20260208120000`         | Adds `owner_id` to projects, tasks, budgets; replaces weak RLS with proper owner-scoped policies                                |
| 11  | `20260208140000`         | Creates clients, businesses, business_media; adds client_id, business_id to projects                                            |
| 12  | `20260208160000`         | Adds email to businesses; creates client_links table                                                                            |
| 13  | `20260208180000`         | Creates notes and note_links tables                                                                                             |
| 14  | `20260213120000`         | Creates billings table                                                                                                          |
| 15  | `20260213121000`         | Patch: adds client_id FK and overdue trigger to billings (idempotent with previous)                                             |
| 16  | `20260214000000`         | Creates user_assets, profiles, user_preferences; creates storage bucket with path-based RLS                                     |
| 17  | `20260215000000`         | Adds currency column to user_preferences                                                                                        |
| 18  | `20260215000001`         | Adds company_logo_asset_id, cover_image_asset_id to user_preferences                                                            |
| 19  | `20260216_fix_security`  | Adds WITH CHECK to budget and business_media UPDATE policies; adds `reorder_tasks_atomic` and `duplicate_budget_atomic` RPCs    |
| 20  | `20260216000000`         | Adds project_id to idea_boards                                                                                                  |
| 21  | `20260216010000`         | Creates `create_task_atomic`, `create_todo_item_atomic`, `toggle_todo_item_atomic` RPCs                                         |
| 22  | `20260216020000`         | Creates `move_task_atomic` and `get_project_todo_summary` RPCs                                                                  |
| 23  | `20260218100000`         | Creates project_access table                                                                                                    |
| 24  | `20260221100000`         | Creates project_links table with enums                                                                                          |
| 25  | `20260221120000`         | Creates link_categories table; adds category_id to project_links; makes section nullable                                        |
| 26  | `20260221140000`         | Adds tags to tasks; replaces `create_task_atomic` with 7-arg version (still missing project_id scoping in order_index subquery) |
| 27  | `20260222120000`         | Replaces `create_task_atomic` again — fixes project_id scoping for order_index; new tasks go to top                             |

### Critical Bug: `move_task_atomic` — Cross-Project Order Corruption

**File:** `supabase/migrations/20260216020000_sprint3_canonical_backend.sql`, lines 38–67

The `move_task_atomic` function reorders tasks when moving a task to a different status column or different position. The reordering UPDATE statements do **not scope by `project_id`**:

```sql
-- When moving to a different status (line 39):
UPDATE public.tasks
SET order_index = order_index - 1, updated_at = NOW()
WHERE status = current_task.status
  AND order_index > current_task.order_index;
  -- MISSING: AND project_id = current_task.project_id

-- When inserting into new status (line 44):
UPDATE public.tasks
SET order_index = order_index + 1, updated_at = NOW()
WHERE status = in_new_status
  AND order_index >= in_new_order_index
  AND id <> current_task.id;
  -- MISSING: AND project_id = current_task.project_id
```

RLS allows the authenticated user to update their own tasks across all projects. Therefore, when the user moves a task from `backlog` to `next` in Project A, the `order_index` values of tasks with the same status in **all other projects owned by the same user** are corrupted. This is a **data integrity bug affecting all users with more than one project**.

The same-status reorder branches (lines 50–67) have the same missing `project_id` filter.

**Severity: Critical.** This bug causes silent, permanent data corruption each time a task is moved on the Kanban board for users with multiple projects.

---

### Bug: `create_task_atomic` Missing project_id Scope (Fixed in Latest Migration)

**File:** `supabase/migrations/20260216010000_atomic_todo_and_task_creation.sql`, lines 50–54 (original version)
**Also:** `supabase/migrations/20260221140000_tasks_tags.sql`, lines 61–64 (7-arg version)

Both intermediate versions computed `order_index` as:

```sql
SELECT COALESCE(MAX(t.order_index), -1) + 1
FROM public.tasks t
WHERE t.status = in_status
-- MISSING: AND t.project_id = in_project_id
```

This was fixed in `20260222120000_new_tasks_at_top.sql` which correctly scopes by both `project_id` and `status`. The current production version of `create_task_atomic` is correct.

---

### Tables with `updated_at` but No Trigger

| Table                  | Has `updated_at`       | Has Trigger    |
| ---------------------- | ---------------------- | -------------- |
| `project_access`       | NO                     | N/A            |
| `project_favorites`    | NO                     | N/A            |
| `client_links`         | NO                     | N/A            |
| `note_links`           | NO                     | N/A            |
| `idea_connections`     | NO (`created_at` only) | N/A            |
| `idea_project_links`   | NO (`created_at` only) | N/A            |
| `business_media`       | NO (`created_at` only) | N/A            |
| `budget_categories`    | NO (`created_at` only) | N/A            |
| **`ideas`**            | YES                    | **NO TRIGGER** |
| **`idea_boards`**      | YES                    | **NO TRIGGER** |
| **`idea_board_items`** | YES                    | **NO TRIGGER** |

`ideas`, `idea_boards`, and `idea_board_items` have `updated_at` columns but no `BEFORE UPDATE` trigger to auto-update them. The `update_updated_at_column()` function exists but was never applied to these tables. Updates to these rows will leave `updated_at` with the original `created_at` timestamp unless the application code manually sets it.

**The application code for idea_board_items updates positions (x, y) via server actions** — confirm whether those actions manually set `updated_at`. If not, the column is always stale.

---

### Foreign Keys Without CASCADE Rules

| Table                                      | FK Column               | ON DELETE Rule                     |
| ------------------------------------------ | ----------------------- | ---------------------------------- |
| `project_links` → `tasks`                  | `linked_task_id`        | SET NULL ✓                         |
| `project_links` → `link_categories`        | `category_id`           | SET NULL ✓                         |
| `idea_boards` → `projects`                 | `project_id`            | SET NULL ✓                         |
| `billings` → `clients`                     | `client_id`             | SET NULL ✓                         |
| `billings` → `projects`                    | `project_id`            | SET NULL ✓                         |
| `user_preferences` → `user_assets` (logo)  | `company_logo_asset_id` | SET NULL ✓                         |
| `user_preferences` → `user_assets` (cover) | `cover_image_asset_id`  | SET NULL ✓                         |
| `profiles` → `user_assets` (avatar)        | `avatar_asset_id`       | SET NULL ✓                         |
| `budgets` → `projects`                     | `project_id`            | **SET NULL** — orphaned budgets    |
| `todo_lists` → `projects`                  | `project_id`            | **SET NULL** — orphaned todo lists |

`budgets.project_id` and `todo_lists.project_id` use SET NULL on project deletion. This means budgets and todo lists become "unlinked" from the project rather than deleted. This may be intentional (preserving financial records) but is not documented and could result in orphaned records that appear in global views.

---

### Missing Indexes

| Query Pattern                                             | Missing Compound Index                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Tasks by project + status + order_index (board rendering) | `idx_tasks_project_status_order ON tasks(project_id, status, order_index)` — **does not exist** |
| Project links by owner (non-project-scoped)               | `idx_project_links_owner_id` exists ✓                                                           |
| Billings by owner + status                                | `idx_billings_status` exists ✓, `idx_billings_owner_id` exists ✓                                |
| Todos by owner + list                                     | `idx_todo_items_list` exists ✓                                                                  |

The compound index `(project_id, status, order_index)` on `tasks` is missing. The board-rendering query filters by `project_id` and `status` and orders by `order_index`. Without a compound index, Postgres will use `idx_tasks_project_id` or `idx_tasks_status` separately, requiring a sort pass. This was identified in `docs/plans/IMPLEMENTATION_PLAN.md` Task 1.4 but the migration was never created.

---

## 5. Cache Audit

### Module-by-Module Cache Coverage

| Tab     | `*FromCache`                    | Cache Key in ContextDataCache | `onRefresh` Wired                              | Skeleton on Miss  |
| ------- | ------------------------------- | ----------------------------- | ---------------------------------------------- | ----------------- |
| Board   | `ContextBoardFromCache.tsx` ✓   | `board` ✓                     | ✓ to ContextBoardClient                        | SkeletonBoard ✓   |
| Owner   | `ContextOwnerFromCache.tsx` ✓   | `owner` ✓                     | ✓ as `onOwnerUpdated`                          | SkeletonOwner ✓   |
| Notes   | `ContextNotesFromCache.tsx` ✓   | `notes` ✓                     | ✓ to ContextNotesClient                        | SkeletonNotes ✓   |
| Links   | `ContextLinksFromCache.tsx` ✓   | `links` + `linkCategories` ✓  | ✓ to ContextLinksClient                        | SkeletonLinks ✓   |
| Ideas   | `ContextIdeasFromCache.tsx` ✓   | `ideas` ✓                     | ✓ to ContextIdeasClient                        | SkeletonIdeas ✓   |
| Budgets | `ContextBudgetsFromCache.tsx` ✓ | `budgets` ✓                   | ✓ to ContextBudgetsClient                      | SkeletonBudgets ✓ |
| Todos   | `ContextTodosFromCache.tsx` ✓   | `todos` ✓                     | **MISSING** — not passed to ContextTodosClient | SkeletonTodos ✓   |

Additionally, the project itself is cached: `ContextLayoutWrapper.tsx` uses key `project:${projectId}`.
Note detail is cached: key `noteDetail:${noteId}` is defined in `ContextDataCache.tsx` but no `ContextNoteDetailFromCache.tsx` was found that uses it. Confirm whether this key is being populated and by whom.

**Summary:** 6 of 7 tabs have correct cache wiring. Todos is the exception.

---

## 6. Documentation vs Reality Gaps

### `.cursorrules` says: "ALWAYS call `revalidatePath` after mutations — never rely on manual refetch"

**Gap:** Multiple FromCache components use `onRefresh` callbacks that trigger a server action + `cache.set` to update client state without calling `router.refresh()` or relying on `revalidatePath`. This is correct behavior for the context system (where the cache pattern intentionally bypasses page revalidation), but the rule as written is absolutist and contradicts the cache pattern. The `.cursorrules` and `docs/patterns/context-session-cache.md` are inconsistent on this point.

### `.cursorrules` says: "NEVER use spinners or the text 'Loading...'"

**Gap:** `ContextNotesClient.tsx:103` renders `{t('common.loading')}` as a loading state. The text key is `common.loading` which likely translates to "Cargando..." or "Loading...". This directly violates the rule.

### `docs/patterns/data-loading.md` says: "ALWAYS wrap read-only server actions with `cache()`"

**Gap:** `getNoteById` (`app/notes/actions.ts:39`) is a read action that is NOT wrapped with `cache()`. Minor — this function is not called repeatedly in the same render, but it's inconsistent with the stated pattern.

**Gap:** `listLinkCategoriesAction` (`app/context/[projectId]/links/actions.ts:80`) IS wrapped with `cache()` but contains INSERT mutations. The docs explicitly say "Do NOT cache mutations." The function is architecturally wrong.

### `docs/patterns/server-actions.md` says: "ALWAYS call `requireAuth()` at the start"

**Gap:** All audited action files do call `requireAuth()` at the start of protected functions. However, `updateProjectLinkAction` (`app/context/[projectId]/links/actions.ts:321`) calls `requireAuth()` a **second time** inside a conditional branch. This is redundant and adds latency.

### `docs/patterns/database-queries.md` says: "ALWAYS scope by `owner_id` or `user_id` when querying user-owned data"

**Gap:** As documented in Section 3, multiple functions in `app/actions/projects.ts` and `app/notes/actions.ts` do not add explicit `owner_id` scoping to queries that read, update, or delete individual records. They rely on RLS alone.

### `docs/plans/IMPLEMENTATION_PLAN.md` — Phase 1 Tasks Status

| Task                                             | Status                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1.1: Atomic task reorder RPC                | **Done** — `reorder_tasks_atomic` created in 20260216_fix_security. But `move_task_atomic` (20260216020000) still has cross-project corruption bug |
| Task 1.2: Atomic task create RPC                 | **Done** — `create_task_atomic` in 20260216010000, fixed scope in 20260222120000                                                                   |
| Task 1.3: Atomicize `updateBusinessFieldsAction` | **Status unknown** — migration described in plan not found                                                                                         |
| Task 1.4: Add ordering indexes                   | **NOT done** — `idx_tasks_project_status_order` does not appear in any migration                                                                   |

---

## 7. Missing Infrastructure

### No `AGENTS.md` or `CONVENTIONS.md`

There is no `AGENTS.md` file describing how AI agents should interact with this codebase. There is no `CONVENTIONS.md` describing naming conventions, file organization rules, or code style decisions beyond what's in `.cursorrules`. New developers or AI agents have no single source of truth beyond the scattered `docs/patterns/` files.

### No `assertProjectOwnership` Utility

There is no shared function `assertProjectOwnership(userId, projectId)` in `lib/auth.ts` or anywhere else. Six action files repeat the pattern of calling `requireAuth()` and then either relying on RLS or manually checking project ownership via separate queries. A shared utility would enforce the pattern and reduce future security gaps.

### No Shared `getActionUser()` Pattern

`requireAuth()` makes a network call to Supabase Auth on every invocation. In action files that call it multiple times (see `updateProjectLinkAction`), each call is a redundant round-trip. There is no convention for storing the user result at the top of an action and passing it to helpers.

### ESLint Plugin Exists but Its Rules Are Unknown

`package.json` references `eslint-plugin-clear-queue` as a local file plugin (`"file:./eslint-plugin-clear-queue"`). The docs reference this in `docs/reference/eslint-rules-README.md` (which was not read). The rules `no-select-star` and `no-client-supabase-in-components` are mentioned in pattern docs but it's unclear which rules are actually enforced and whether `no-manual-refetch-after-action` is implemented.

### No CI Pipeline Visible

No GitHub Actions workflow files exist in the repository. There is no automated migration validation, no type checking on CI, and no test suite running on push. The `vitest.config.ts` and `playwright.config.ts` exist but there's only one test file (`tests/example.spec.ts`). The IMPLEMENTATION_PLAN.md calls for RLS regression tests (`tests/rls/`) that were never created.

### No Rollback Migrations

`docs/plans/IMPLEMENTATION_PLAN.md` calls for "Every migration gets explicit rollback migration file." No rollback files exist for any migration.

### No `docs/security/rls-policy-intent.md`

Task 3.3 of the implementation plan called for `docs/security/rls-policy-intent.md` documenting the rationale for each RLS policy. It was never created.

### Missing Compound Index for Task Board Queries

`idx_tasks_project_status_order ON tasks(project_id, status, order_index)` is described in `IMPLEMENTATION_PLAN.md` Task 1.4 but no migration creates it. Board rendering will do sequential scans or use single-column indexes.

---

## 8. Module Completion Status

| Module  | Server Actions | Cache Wrapper | Client Component | Empty State | Skeleton Loading    | Optimistic Updates           | Error Handling    | onRefresh Wired |
| ------- | -------------- | ------------- | ---------------- | ----------- | ------------------- | ---------------------------- | ----------------- | --------------- |
| Board   | ✓              | ✓             | ✓                | ✓           | ✓ (SkeletonBoard)   | Partial (reorder)            | Partial           | ✓               |
| Owner   | ✓              | ✓             | ✓                | ✓           | ✓ (SkeletonOwner)   | No                           | Partial           | ✓               |
| Notes   | ✓              | ✓             | ✓                | ✓           | ✓ (SkeletonNotes)   | No                           | Partial (alert()) | ✓               |
| Links   | ✓              | ✓             | ✓                | ✓           | ✓ (SkeletonLinks)   | Yes (optimistic pin/archive) | Partial           | ✓               |
| Ideas   | ✓              | ✓             | ✓                | ✓           | ✓ (SkeletonIdeas)   | No                           | No                | ✓               |
| Budgets | ✓              | ✓             | ✓                | ✓           | ✓ (SkeletonBudgets) | No                           | Unknown           | ✓               |
| Todos   | ✓              | ✓             | ✓                | Unknown     | ✓ (SkeletonTodos)   | No                           | Unknown           | **NO**          |

Notes on the "Error Handling" column: several client components use `alert(error)` as their error display mechanism (e.g. `ContextNotesClient.tsx:90`). This is a raw browser dialog, not the `MutationErrorDialog` component that exists in `components/MutationErrorDialog.tsx`. Inconsistent.

---

## 9. Technical Debt Register

| #     | File                                                                                                                                                | Issue                                                                                                                                                                                                                                                                                | Severity             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| TD-01 | `supabase/migrations/20260216020000_sprint3_canonical_backend.sql:38–67`                                                                            | `move_task_atomic` does not scope reorder UPDATEs by `project_id`. Causes cross-project order_index corruption for users with multiple projects.                                                                                                                                     | **High**             |
| TD-02 | `app/context/[projectId]/todos/ContextTodosFromCache.tsx:62–69`                                                                                     | `onRefresh` not passed to `ContextTodosClient`. Todos cache is never invalidated after mutations; stale data returned on next visit.                                                                                                                                                 | **High**             |
| TD-03 | `app/context/[projectId]/links/actions.ts:80–115`                                                                                                   | `listLinkCategoriesAction` is wrapped with `cache()` but contains INSERT mutations (category seeding loop). Mutations inside cached reads are architecturally wrong.                                                                                                                 | **High**             |
| TD-04 | `app/context/[projectId]/ideas/ContextIdeasClient.tsx:55–70`                                                                                        | Board creation is two non-atomic steps: `createBoardAction` then `updateBoardAction`. A failure between them leaves an orphaned board with no project_id.                                                                                                                            | **Medium**           |
| TD-05 | `app/actions/projects.ts:38–50,161–168,192–227,231–260,263–304,307–327`                                                                             | `getProjectById`, `updateProject`, `linkBusinessToProject`, `archiveProject`, `unarchiveProject`, `deleteProject` do not add explicit `.eq('owner_id', user.id)`. Defense-in-depth violation; RLS protects in practice.                                                              | **Medium**           |
| TD-06 | `app/notes/actions.ts:39–51,100–137,140–158,165–177,179–215,217–238`                                                                                | `getNoteById`, `updateNote`, `deleteNote`, `getNoteLinks`, `addNoteLink`, `deleteNoteLink` do not scope by owner_id. Same pattern violation as TD-05.                                                                                                                                | **Medium**           |
| TD-07 | `app/context/[projectId]/links/actions.ts:317–331`                                                                                                  | `updateProjectLinkAction` calls `requireAuth()` a second time inside a conditional when `category_id` is being changed (line 321). Redundant Supabase Auth round-trip.                                                                                                               | **Low**              |
| TD-08 | `app/context/[projectId]/notes/ContextNotesClient.tsx:102–104`                                                                                      | `isLoading` state renders text `t('common.loading')` instead of a shimmer skeleton. Violates `.cursorrules` loading state rule.                                                                                                                                                      | **Low**              |
| TD-09 | `app/notes/actions.ts:78,119`, `app/actions/projects.ts:86,165,203,238,277,313`, `app/context/[projectId]/links/actions.ts:105,140,165,255,354,387` | `as never` type casts used throughout to work around Supabase TypeScript type mismatches. Suppresses type safety.                                                                                                                                                                    | **Medium**           |
| TD-10 | `supabase/migrations/20260119200000_idea_graph.sql`                                                                                                 | `ideas`, `idea_boards`, `idea_board_items` have `updated_at` columns but no `BEFORE UPDATE` trigger. The column value is always the creation timestamp.                                                                                                                              | **Medium**           |
| TD-11 | `app/notes/actions.ts:39`                                                                                                                           | `getNoteById` is a read action but is not wrapped with `cache()`. Minor inconsistency with the data loading pattern.                                                                                                                                                                 | **Low**              |
| TD-12 | `supabase/migrations/001_initial_schema.sql:55–65`                                                                                                  | Initial RLS for projects and tasks was `auth.uid() IS NOT NULL` — allowed any authenticated user to access any data. Replaced in migration 10, but shows insecure initial design.                                                                                                    | **Low** (historical) |
| TD-13 | `supabase/migrations/202601250000_presupuestos.sql:59–66`                                                                                           | Initial budget RLS was `auth.role() = 'authenticated'` — same issue. Replaced in migration 10.                                                                                                                                                                                       | **Low** (historical) |
| TD-14 | `supabase/migrations/20260218100000_project_access.sql`                                                                                             | `project_access` table has no DELETE policy. Stale access records accumulate and cannot be cleaned by the application layer.                                                                                                                                                         | **Low**              |
| TD-15 | No file                                                                                                                                             | Missing compound index `idx_tasks_project_status_order ON tasks(project_id, status, order_index)`. Board column queries will not use an optimal index.                                                                                                                               | **Medium**           |
| TD-16 | `app/context/[projectId]/links/actions.ts:100–115`                                                                                                  | `listLinkCategoriesAction` seeds default categories with a loop of individual INSERTs (7 calls). Should be a single bulk INSERT.                                                                                                                                                     | **Low**              |
| TD-17 | No file                                                                                                                                             | No `assertProjectOwnership(userId, projectId)` utility exists in `lib/auth.ts`. Pattern inconsistently applied across action files.                                                                                                                                                  | **Medium**           |
| TD-18 | `supabase/migrations/20260213121000_billings_add_client_and_overdue.sql`                                                                            | This migration is a patch on top of `20260213120000_add_billings_module.sql` that re-adds columns/triggers the first migration may or may not have had. Idempotent SQL (`IF NOT EXISTS`, `CREATE OR REPLACE`) makes it safe but indicates the schema management process lacks rigor. | **Low**              |

---

## 10. Recommendations (Prioritized by Impact)

### Priority 1 — Fix the `move_task_atomic` Cross-Project Corruption Bug

**Action:** Create a new migration that replaces `move_task_atomic` with a version that adds `AND project_id = current_task.project_id` to all reorder UPDATE statements.

This is the only production-active bug that silently corrupts user data with no error visible to the user. Every time a user with more than one project drags a task between columns, other projects' task ordering is damaged.

**Files:** New migration `supabase/migrations/YYYYMMDDHHMMSS_fix_move_task_atomic_project_scope.sql`

---

### Priority 2 — Wire `onRefresh` in `ContextTodosFromCache`

**Action:** Pass `onRefresh={loadData}` to `ContextTodosClient` in `app/context/[projectId]/todos/ContextTodosFromCache.tsx`. Confirm `ContextTodosClient` accepts and calls `onRefresh` after mutations.

**File:** `app/context/[projectId]/todos/ContextTodosFromCache.tsx:62–69`

---

### Priority 3 — Add `assertProjectOwnership(userId, projectId)` to `lib/auth.ts`

**Action:** Add a utility function:

```ts
export async function assertProjectOwnership(
  userId: string,
  projectId: string
): Promise<void>;
```

that queries `projects` with both `id` and `owner_id` filters and throws if not found. Use it in `getProjectById`, `updateProject`, `archiveProject`, `unarchiveProject`, `deleteProject`, and `linkBusinessToProject` in `app/actions/projects.ts`.

This replaces 6 instances of RLS-only reliance with defense-in-depth.

**Files:** `lib/auth.ts`, `app/actions/projects.ts`

---

### Priority 4 — Extract Category Seeding from `listLinkCategoriesAction`

**Action:** Move the category seeding logic out of `listLinkCategoriesAction` into a separate uncached function `ensureDefaultLinkCategories(userId)`. Call it once from the component on first mount, not inside a cached read action.

**File:** `app/context/[projectId]/links/actions.ts:80–115`

---

### Priority 5 — Add Missing Compound Index for Task Board Queries

**Action:** Create migration:

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_order
  ON public.tasks(project_id, status, order_index);
```

**File:** New migration `supabase/migrations/YYYYMMDDHHMMSS_idx_tasks_project_status_order.sql`

---

### Priority 6 — Fix `updated_at` Triggers for Idea Tables

**Action:** Create migration applying `update_updated_at_column()` trigger to `ideas`, `idea_boards`, and `idea_board_items`.

**File:** New migration `supabase/migrations/YYYYMMDDHHMMSS_idea_tables_updated_at_triggers.sql`

---

### Priority 7 — Atomicize Board Creation in `ContextIdeasClient`

**Action:** Create an RPC `create_board_for_project(owner_id, name, project_id)` that does both inserts in one transaction. Update `ContextIdeasClient.tsx:55–70` to call it.

**Files:** New migration, `app/ideas/boards/actions.ts`, `app/context/[projectId]/ideas/ContextIdeasClient.tsx`

---

### Priority 8 — Replace `alert()` Error Handling with `MutationErrorDialog`

**Action:** Replace `alert(error)` calls in `ContextNotesClient.tsx:90` (and any other client components using browser `alert()`) with the existing `MutationErrorDialog` component.

**File:** `app/context/[projectId]/notes/ContextNotesClient.tsx:90`

---

### Priority 9 — Fix Loading State in `ContextNotesClient`

**Action:** Replace the loading text on line 103 of `ContextNotesClient.tsx` with `<SkeletonNotes />` to match the shimmer pattern.

**File:** `app/context/[projectId]/notes/ContextNotesClient.tsx:102–104`

---

### Priority 10 — Add `project_access` DELETE Policy

**Action:** Add a DELETE RLS policy to `project_access` so the application can clean up stale records:

```sql
CREATE POLICY "Users can delete own access"
  ON project_access FOR DELETE
  USING (auth.uid() = user_id);
```

**File:** New migration

---

### Priority 11 — Eliminate Redundant `requireAuth()` Call

**Action:** In `updateProjectLinkAction`, call `requireAuth()` once at the top of the function and store the result. Remove the second call at line 321.

**File:** `app/context/[projectId]/links/actions.ts:286–331`

---

### Priority 12 — Wrap `getNoteById` with `cache()`

**Action:** Add `cache()` wrapper to `getNoteById` to be consistent with the data loading pattern.

**File:** `app/notes/actions.ts:39`

---

### Priority 13 — Create `AGENTS.md` and `CONVENTIONS.md`

**Action:** Create `AGENTS.md` at the root describing how AI coding agents should approach this codebase (key patterns, forbidden anti-patterns, migration process). Create `CONVENTIONS.md` describing file naming, action file structure, cache key conventions, and RPC naming standards. Link both from `README.md`.

---

### Priority 14 — Create `tests/rls/` Test Suite

**Action:** As specified in `IMPLEMENTATION_PLAN.md` Task 3.3, create RLS regression tests using the Supabase test client. Minimum: `projects.rls.spec.ts` and `tasks.rls.spec.ts` verifying that user B cannot read/modify user A's data.

---

### Priority 15 — Add CI Pipeline

**Action:** Create `.github/workflows/ci.yml` running `npm run typecheck`, `npm run lint`, and `npm run test` on every push and pull request. Without CI, the existing ESLint rules and TypeScript strict mode have no enforcement gate.
