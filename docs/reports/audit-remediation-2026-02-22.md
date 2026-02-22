# Audit Remediation Report — 2026-02-22

**Source audit:** `docs/reports/codebase-audit-2026-02-22.md`
**Committed:** `85450fd` — _codebase audit fixes: TD-01 through TD-06, TD-10, TD-15_
**Migrations added:** 3 (must be deployed via `supabase db push`)
**Items fixed:** 8 of 18 technical debt items (TD-01 – TD-06, TD-10, TD-15)
**Items remaining:** 10 (TD-07 – TD-09, TD-11 – TD-14, TD-16 – TD-18)

---

## Fixes Applied

---

### TD-01 — `move_task_atomic` cross-project order corruption ✅ FIXED

**Severity:** Critical (data corruption in production)

**Problem:** The `move_task_atomic` PostgreSQL function shifted `order_index` values
across all projects owned by the same user, not just the project being reordered. Any
drag-and-drop on the Kanban board silently corrupted task ordering in every other
project belonging to that user. All four peer-shift `UPDATE` statements filtered by
`status` and `order_index` but were missing `AND project_id = current_task.project_id`.
RLS allowed the updates because RLS only checks ownership, not project scope.

**Fix:**

- New migration: `supabase/migrations/20260222140000_fix_move_task_atomic_project_scope.sql`
- `CREATE OR REPLACE FUNCTION public.move_task_atomic(...)` — adds
  `.AND project_id = current_task.project_id` to all four UPDATE statements.
- No GRANT needed; `CREATE OR REPLACE` preserves existing grants.

**Before (all 4 UPDATE blocks):**

```sql
UPDATE public.tasks
SET order_index = order_index - 1, updated_at = NOW()
WHERE status = current_task.status
  AND order_index > current_task.order_index;
  -- MISSING: AND project_id = current_task.project_id
```

**After:**

```sql
UPDATE public.tasks
SET order_index = order_index - 1, updated_at = NOW()
WHERE project_id = current_task.project_id   -- added
  AND status = current_task.status
  AND order_index > current_task.order_index;
```

---

### TD-02 — Todos cache never invalidated after mutations ✅ FIXED

**Severity:** High

**Problem:** `ContextTodosFromCache.tsx` had a `loadData` callback (cache invalidate +
refetch) but never passed it to `ContextTodosClient`. After any mutation (add, toggle,
update, delete todo item), the `todos:${projectId}` session cache entry was never
updated. On the next tab visit, stale data was shown.

**Fix:**

- `app/context/[projectId]/todos/ContextTodosFromCache.tsx` — added `onRefresh={loadData}`
  to the `<ContextTodosClient>` render.
- `app/context/[projectId]/todos/ContextTodosClient.tsx` — added
  `onRefresh?: () => void | Promise<void>` to props; calls `onRefresh?.()` after
  `createItem`, and wraps `toggleItem`, `updateItem`, `deleteItem` callbacks in
  `TaskRow` to also call `onRefresh?.()`.

This matches the established pattern used by Notes, Links, Ideas, Budgets, and Owner tabs.

---

### TD-03 — INSERT mutations inside `cache()` wrapper ✅ FIXED

**Severity:** High

**Problem:** `listLinkCategoriesAction` in `app/context/[projectId]/links/actions.ts`
was wrapped with React's `cache()`. This function contains a 7-iteration INSERT loop
that seeds default link categories for new users. React's `cache()` memoizes the
function's return value per render pass, meaning mutations inside it can be silently
skipped if the function is called more than once in the same render cycle. `cache()`
must only wrap pure, side-effect-free reads.

**Fix:**

- Removed `cache()` wrapper from `listLinkCategoriesAction`.
- Converted `export const listLinkCategoriesAction = cache(async () => {...})` to
  `export async function listLinkCategoriesAction() {...}`.
- Body is unchanged. The `import { cache }` is retained because
  `listProjectLinksAction` still uses it.

---

### TD-04 — Non-atomic board creation in `ContextIdeasClient` ✅ FIXED

**Severity:** Medium

**Problem:** Creating a board from the Ideas context tab called two separate server
actions in sequence:

1. `createBoardAction(formData)` — INSERT into `idea_boards` with no `project_id`
2. `updateBoardAction(updateFormData)` — UPDATE to set `project_id`

If the second call failed (network error, server error), a board existed with
`project_id = null`. This orphaned board was invisible in the context Ideas tab
(which queries `WHERE project_id = ?`) but appeared in the global `/ideas/boards` list.

**Fix:**

- `app/ideas/boards/actions.ts` — added `createBoardWithProjectAction(name, projectId)`.
  Single `INSERT … RETURNING` that sets `owner_id`, `name`, `project_id`, and
  `updated_at` in one query. Added `import { createClient }` since the action uses
  Supabase directly.
- `app/context/[projectId]/ideas/ContextIdeasClient.tsx` — replaced the two-step
  sequence with a single `createBoardWithProjectAction(name, projectId)` call.
  Removed the `updateBoardAction` import.

The original `createBoardAction` and `updateBoardAction` are unchanged and still used
elsewhere in the ideas module.

---

### TD-05 — `app/actions/projects.ts` missing `owner_id` scoping ✅ FIXED

**Severity:** Medium (defense-in-depth violation; RLS enforces in practice)

**Problem:** Six functions called `requireAuth()` but discarded the returned user,
then queried only by the record `id`. They relied entirely on Supabase RLS for
ownership enforcement. Per `docs/patterns/database-queries.md`, queries must always
scope by `owner_id` in the query layer as well (defense-in-depth).

**Functions fixed:**

| Function                | Change                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| `getProjectById`        | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on SELECT |
| `updateProject`         | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on UPDATE |
| `linkBusinessToProject` | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on UPDATE |
| `archiveProject`        | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on UPDATE |
| `unarchiveProject`      | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on UPDATE |
| `deleteProject`         | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on DELETE |

---

### TD-06 — `app/notes/actions.ts` missing `owner_id` scoping ✅ FIXED

**Severity:** Medium (defense-in-depth violation; RLS enforces in practice)

**Problem:** Same pattern violation as TD-05 but in the notes module. Six functions
relied on RLS alone. `notes` has an `owner_id` column; `note_links` does not (ownership
flows through `note_links.note_id → notes.owner_id`).

**Functions fixed:**

| Function         | Change                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| `getNoteById`    | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on SELECT               |
| `updateNote`     | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on UPDATE               |
| `deleteNote`     | `const user = await requireAuth()` + `.eq('owner_id', user.id)` on DELETE               |
| `getNoteLinks`   | `const user = await requireAuth()` + note-ownership preflight before fetching links     |
| `addNoteLink`    | `const user = await requireAuth()` + note-ownership preflight before INSERT             |
| `deleteNoteLink` | `const user = await requireAuth()` + fetch link → verify `notes.owner_id` before DELETE |

For `note_links` functions, a preflight query checks `notes WHERE id = noteId AND owner_id = user.id`
before operating. `deleteNoteLink` fetches the `note_links` row first (to get `note_id`),
then verifies note ownership.

**TypeScript note:** Supabase's query builder infers partial-select results as `never`
for `note_links` (generated types issue). The `deleteNoteLink` preflight fetch casts
`rawLink as NoteLink | null` — consistent with the existing `as NoteLink[]` and
`as Note` casts already present throughout the file.

---

### TD-10 — Missing `updated_at` triggers on idea tables ✅ FIXED

**Severity:** Medium

**Problem:** `ideas`, `idea_boards`, and `idea_board_items` all have `updated_at`
columns but no `BEFORE UPDATE` trigger. The shared `update_updated_at_column()`
function (defined in `001_initial_schema.sql`) was never applied to these tables.
Any code that updated these rows without manually setting `updated_at` left stale
timestamps. `lib/idea-graph/boards.ts` manually sets `updated_at: new Date().toISOString()`
on every write, but direct SQL updates or future code paths would silently skip it.

**Fix:**

- New migration: `supabase/migrations/20260222160000_idea_tables_updated_at_triggers.sql`
- Three `BEFORE UPDATE FOR EACH ROW` triggers, one per table, all calling
  `update_updated_at_column()`.
- Each preceded by `DROP TRIGGER IF EXISTS` for idempotent re-application.

---

### TD-15 — Missing compound index on `tasks(project_id, status, order_index)` ✅ FIXED

**Severity:** Medium

**Problem:** Every Kanban column load queries:

```sql
SELECT * FROM tasks
WHERE project_id = $1 AND status = $2
ORDER BY order_index ASC
LIMIT n;
```

Without a compound index, Postgres uses single-column indexes and requires a separate
sort pass. The `move_task_atomic` peer-shift UPDATEs also filter on all three columns.
This index was described in `docs/plans/IMPLEMENTATION_PLAN.md` Task 1.4 but the
migration was never created.

**Fix:**

- New migration: `supabase/migrations/20260222180000_tasks_compound_index.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_order
  ON public.tasks (project_id, status, order_index);
```

---

## Remaining Technical Debt

The following items from the audit were **not** addressed in this remediation pass.
They are listed in priority order from the original audit.

| ID    | Severity         | File                                                           | Issue                                                                                                                                                                                   |
| ----- | ---------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TD-07 | Low              | `app/context/[projectId]/links/actions.ts:321`                 | `updateProjectLinkAction` calls `requireAuth()` twice — redundant auth round-trip when `category_id` is being changed                                                                   |
| TD-08 | Low              | `app/context/[projectId]/notes/ContextNotesClient.tsx:102–104` | Loading state renders `t('common.loading')` text instead of `<SkeletonNotes />` — violates `.cursorrules` shimmer rule                                                                  |
| TD-09 | Medium           | Multiple files                                                 | `as never` type casts throughout to work around Supabase TypeScript type mismatches (`app/notes/actions.ts`, `app/actions/projects.ts`, `links/actions.ts`, `lib/idea-graph/boards.ts`) |
| TD-11 | Low              | `app/notes/actions.ts:39`                                      | `getNoteById` is not wrapped with `cache()` — minor inconsistency with data loading pattern                                                                                             |
| TD-12 | Low (historical) | `001_initial_schema.sql`                                       | Initial RLS was `auth.uid() IS NOT NULL` (any authenticated user could access any data). Fixed in migration 10. Historical only.                                                        |
| TD-13 | Low (historical) | `202601250000_presupuestos.sql`                                | Initial budget RLS was `auth.role() = 'authenticated'`. Fixed in migration 10. Historical only.                                                                                         |
| TD-14 | Low              | `supabase/migrations/20260218100000_project_access.sql`        | `project_access` table has no DELETE policy — stale access records accumulate                                                                                                           |
| TD-16 | Low              | `app/context/[projectId]/links/actions.ts:100–115`             | Default category seeding uses 7 individual INSERTs instead of one bulk INSERT                                                                                                           |
| TD-17 | Medium           | `lib/auth.ts`                                                  | No `assertProjectOwnership(userId, projectId)` utility exists — ownership pattern applied manually across action files                                                                  |
| TD-18 | Low              | `supabase/migrations/20260213121000_*`                         | Billing patch migration re-adds columns from prior migration — indicates loose schema management process                                                                                |

---

## Deployment Checklist

Three new migrations must be applied to production before this commit is fully live:

```bash
supabase db push
```

| Migration                                               | Safe to re-run?                           | Downtime risk?                       |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| `20260222140000_fix_move_task_atomic_project_scope.sql` | Yes (`CREATE OR REPLACE`)                 | No                                   |
| `20260222160000_idea_tables_updated_at_triggers.sql`    | Yes (`DROP TRIGGER IF EXISTS` + `CREATE`) | No                                   |
| `20260222180000_tasks_compound_index.sql`               | Yes (`CREATE INDEX IF NOT EXISTS`)        | No (concurrent-safe on small tables) |

---

## Architecture Notes for Future AI Agents

### Patterns that must not be broken

1. **`cache()` only on pure reads.** Never wrap a function containing INSERT/UPDATE/DELETE in React's `cache()`. This file documents TD-03 as an example of what happens when violated.

2. **`*FromCache` → `*Client` → `onRefresh` wiring.** Every context tab must pass `onRefresh={loadData}` from the `*FromCache` component to the `*Client` component. `loadData` must: call `cache.invalidate`, re-fetch, call `cache.set`, and `setData`. See `ContextNotesFromCache.tsx` as the reference implementation.

3. **Defense-in-depth ownership scoping.** Every server action that reads, updates, or deletes a user-owned record must include `.eq('owner_id', user.id)` (or equivalent FK chain check) in the query — even though RLS enforces the same constraint. Tables without `owner_id` (like `note_links`) require a preflight ownership check through their parent table.

4. **Atomic operations for multi-step writes.** Any operation that requires two or more database writes must use either a PostgreSQL RPC (for complex operations) or a single `INSERT … RETURNING` with all fields (for simple creates). Never use a create-then-update pattern from the application layer.

5. **Shared `update_updated_at_column()` trigger function** is defined in `001_initial_schema.sql` and is the canonical way to wire `updated_at` auto-update behavior on any table. Apply via `CREATE TRIGGER … EXECUTE FUNCTION update_updated_at_column()`.

### Key files

| File                                                      | Role                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/actions/projects.ts`                                 | All project CRUD server actions                                                          |
| `app/notes/actions.ts`                                    | Notes and note_links server actions                                                      |
| `app/context/[projectId]/links/actions.ts`                | Project links + link categories server actions                                           |
| `app/ideas/boards/actions.ts`                             | Idea board server actions (includes new `createBoardWithProjectAction`)                  |
| `app/context/[projectId]/todos/ContextTodosFromCache.tsx` | Todos cache wrapper                                                                      |
| `app/context/[projectId]/todos/ContextTodosClient.tsx`    | Todos UI (now calls `onRefresh` after all mutations)                                     |
| `app/context/ContextDataCache.tsx`                        | Client-side session cache — 9 key types, `invalidateProject` helper                      |
| `lib/auth.ts`                                             | `requireAuth()`, `getUser()`, `checkIsAdmin()` — no `assertProjectOwnership` yet (TD-17) |
| `supabase/migrations/`                                    | 28 migrations total after this remediation pass                                          |
