# CONVENTIONS.md — ClearQueue repo conventions

This document defines **official conventions** for structure, naming, queries, cache, UI/UX, and adding modules. It aligns with `docs/audits/REPO_CONTEXT_PACK.md` (Context Pack) and locks in decisions for all new work.

---

## 0. Layering model (official)

```
UI  →  Application  →  Domain  →  Infrastructure
```

Dependencies must **always point inward**. Outer layers call inner layers; inner layers never import from outer layers.

| Layer              | Where                                                                               | Responsibilities                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **UI**             | `app/**/page.tsx`, `app/**/layout.tsx`, `components/**`                             | Render state, collect input, call server actions, optimistic visual updates only                              |
| **Application**    | `app/actions/*.ts`, `app/context/[id]/<tab>/actions.ts`                             | `requireAuth`, validate inputs, enforce scoping, call domain + DB/RPC, `revalidatePath`, return typed results |
| **Domain**         | `lib/**` (e.g. `lib/board.ts`, `lib/validation/**`, `lib/todo/**`)                  | Business rules, transformations (DB rows → view models), reusable validation helpers                          |
| **Infrastructure** | `lib/supabase/server.ts`, `lib/supabase/types.ts`, `supabase/migrations/**`, Sentry | Persistence, RPC, RLS, indexes, monitoring, platform concerns                                                 |

---

## 1. Folder structure conventions

### app/

- **app/** — All routes and route-scoped UI (Next.js App Router).
- **app/context/** — Project context: picker, layout with cache provider, and `[projectId]` for project-scoped tabs. Do not put the context cache provider under `app/context/[projectId]/`.
- **app/actions/** — Shared server actions used by multiple routes (tasks, projects, notes, budgets, clients, billings, etc.).
- **app/context/[projectId]/&lt;tab&gt;/** — One folder per context tab (e.g. board, notes, links, ideas, budgets, billings, todos, owner). Each has `page.tsx` (requireAuth + *FromCache), optional `Context*FromCache.tsx`, and `Context\*Client.tsx`.
- **app/profile/**, **app/settings/** — Non-context pages; may have their own `actions.ts` and \*PageClient.tsx.
- **app/api/** — Route handlers (e.g. auth callback, set-recovery-session). No page UI here.

### components/

- **components/** — Reusable UI only. No Supabase client usage; no business logic or multi-step workflows. Use server actions and props.
- **components/context/** — ContextShell, ContextTabBar (tabs and “Salir”).
- **components/board/**, **components/projects/**, **components/shared/**, **components/auth/** — Feature or shared UI.
- **components/skeletons/** — Shimmer skeleton components (SkeletonNotes, SkeletonBoard, etc.) for loading states.
- **components/ui/** — Primitives (dialog, button, input, etc.).

### lib/

- **lib/supabase/** — `server.ts` (createClient for server), `client.ts` (browser; not used in components), `types.ts` (Database).
- **lib/auth.ts** — requireAuth, getUser.
- **lib/validation/** — Validation helpers (profile, colors, project-links). No Zod; use trim, length, allowlists.
- **lib/idea-graph/**, **lib/todo/**, **lib/storage/** — Domain helpers. Business logic and multi-step flows that are not a single Supabase call belong here or in server actions that call into lib.

### supabase/migrations/

- All schema changes and RPCs live here. One file per migration. See migration naming below.

---

## 2. Naming conventions

### Server actions (official standard)

- **Exported server actions must be verb-first and must NOT use the `Action` suffix.**
- **Reads:** `get*` (single or list by id/params), `list*` (lists). Examples: `getNotes`, `getProjectById`, `getProjectsList`, `listProjectLinks`.
- **Writes:** `create*`, `update*`, `delete*`, `move*`, `toggle*`, `duplicate*`. Examples: `createTask`, `updateNote`, `deleteNote`, `moveTaskOrder`, `toggleTodoItem`, `duplicateBudget`.
- **Files:** Shared actions in `app/actions/<domain>.ts` (e.g. `tasks.ts`, `notes.ts`). Feature-local in `app/context/[projectId]/<tab>/actions.ts` if needed.
- **Note:** Some existing exports still use the `Action` suffix (e.g. `listProjectLinksAction`). New code must follow the verb-first, no-suffix rule; rename old names in a separate refactor if desired.

### FromCache and Client components

- **FromCache:** `Context*FromCache.tsx` — wrapper that uses context cache (get/set/invalidate), shows skeleton on miss, fetches, then renders \*Client with data and `onRefresh`. Example: `ContextNotesFromCache.tsx`, `ContextBoardFromCache.tsx`.
- **Client (context tab):** `Context*Client.tsx` — receives initial data and `onRefresh` (or equivalent); no useEffect for initial load; calls onRefresh after mutations. Example: `ContextNotesClient.tsx`, `ContextBoardClient.tsx`.
- **Client (non-context page):** `*PageClient.tsx` when it’s the main client for a page (e.g. `ProfilePageClient.tsx`, `AppearancePageClient.tsx`).

### Cache key types

- **Defined in:** `app/context/ContextDataCache.tsx`.
- **Shape:** `{ type: 'project' | 'board' | 'notes' | 'links' | 'linkCategories' | 'ideas' | 'owner' | 'budgets' | 'billings' | 'todos', projectId: string }` or `{ type: 'noteDetail', noteId: string }`.
- **String key:** `type:projectId` or `noteDetail:noteId` (see `cacheKeyToString` in that file). When adding a new context tab, add a new `type` to the `CacheKey` union and use it in the corresponding \*FromCache.

### RPC naming

- **Postgres RPCs:** **snake_case** with **`_atomic`** suffix for multi-step atomic operations.
- **Examples:** `create_task_atomic`, `move_task_atomic`, `duplicate_budget_atomic`, `create_todo_item_atomic`, `toggle_todo_item_atomic`.
- **Usage:** Called from server actions via `supabase.rpc('name' as never, { ... } as never)`. References: `app/actions/tasks.ts`, `app/actions/budgets.ts`, `lib/todo/lists.ts`.

### Migration naming (recommended going forward)

- **Standard:** Use **timestamp-prefix** plus short description: `YYYYMMDDHHMMSS_short_snake_case_description.sql`.
- **Examples:** `20260222180000_tasks_compound_index.sql`, `20260216010000_atomic_todo_and_task_creation.sql`.
- **Older files** use mixed styles (e.g. `001_initial_schema.sql`, `002_todo_lists.sql`). New migrations should use the timestamp format above.

---

## 3. Query conventions (with real examples)

### Standard read

- **Auth first:** Call `requireAuth()` (or `getUser()` for optional auth) at the start.
- **Explicit select:** Always list columns; never `.select('*')`.
- **Scope:** Filter by `owner_id` or `user_id` for user-owned data; by `project_id` for project-scoped data.
- **Caching:** Wrap read-only getters with React `cache()` when they are used in multiple places in the same render.

**Example (list):** `app/actions/notes.ts` — `getNotes`:

```ts
export const getNotes = cache(
  async (options?: { projectId?: string }): Promise<Note[]> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const noteCols =
      'id, owner_id, project_id, title, content, created_at, updated_at';
    let query = supabase
      .from('notes')
      .select(noteCols)
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });
    if (options?.projectId?.trim())
      query = query.eq('project_id', options.projectId.trim());
    const { data, error } = await query;
    // ... return data or []
  }
);
```

**Example (single row):** Same file — `getNoteById`: `.eq('id', noteId).eq('owner_id', user.id).single()`.

### Standard write

- **Auth first;** validate inputs; build payload with `owner_id` / `project_id` as appropriate.
- **Single insert/update/delete** with explicit columns in `.select()` after write if you need to return data.
- **After success:** Call `revalidatePath(...)` for affected routes.
- **Return:** `{ data?, error? }` so the client can update UI or show errors.

**Example:** `app/actions/notes.ts` — `createNote`: requireAuth, validate project_id/title/content, insert with owner_id/project_id/title/content, `.select(...).single()`, revalidatePath('/notes', '/notes/[id]', '/context'), return `{ data }` or `{ error }`.

### Atomic multi-step write (RPC)

- **Policy:** Any multi-step write must be atomic via a Postgres RPC (snake_case + `_atomic`). No client-side “step 1 then step 2” for dependent writes unless explicitly approved.
- **Call site:** Server action only; use `supabase.rpc('name', { ... })` and handle `error`; on success call `revalidatePath`; return `{ data? }` or `{ error? }`.

**Examples:**

- **app/actions/tasks.ts:** `createTask` → `supabase.rpc('create_task_atomic', { in_project_id, in_title, in_status, ... })`. `updateTaskOrder` (moveTaskOrder) → `supabase.rpc('move_task_atomic', { in_task_id, in_new_status, in_new_order_index })`.
- **app/actions/budgets.ts:** `duplicateBudget` → `supabase.rpc('duplicate_budget_atomic', { source_id, new_name })`.
- **lib/todo/lists.ts:** `createTodoItemAtomic`, `toggleTodoItemAtomic` call `create_todo_item_atomic` and `toggle_todo_item_atomic`; used from `app/actions/todo.ts`.

---

## 4. Cache conventions

### Server cache (React `cache()`)

- **Use only for read-only getters** that depend on auth and return the same result for the same arguments within a request. Wrap with `import { cache } from 'react'` and `export const getX = cache(async (...) => { ... })`.
- **Never wrap mutations** (create, update, delete, move, toggle, duplicate) with `cache()`.
- **Reference files:** `app/actions/notes.ts` (getNotes), `app/actions/projects.ts` (getProjectById, getProjectsList, getProjectsForSidebar, getFavoriteProjectIds), `app/actions/tasks.ts` (getTasksByProjectId, getBoardCountsByStatus, getBoardInitialData), `app/profile/actions.ts`, `app/settings/appearance/actions.ts`.

### Context session cache

- **Provider placement (non-negotiable):** `ContextDataCacheProvider` must be in **`app/context/layout.tsx`**, wrapping `{children}`. It must **not** be inside `app/context/[projectId]/layout.tsx`, or the cache is lost when switching projects.
- **Store and API:** `app/context/ContextDataCache.tsx` — `get(key)`, `set(key, value)`, `invalidate(key)`, `invalidateProject(projectId)`. Keys are the `CacheKey` type (see Naming).
- **Refresh flow:** *FromCache exposes `loadData` = invalidate(key) → fetch (server action/getter) → cache.set(key, data) → setState(data). Pass `loadData` to *Client as `onRefresh`. After a mutation, \*Client calls `onRefresh()` so the tab’s cache is invalidated and refetched; do not use `router.refresh()` for context tab updates.

---

## 5. UI/UX conventions

### Loading (skeleton, no spinner)

- Use **shimmer skeleton** components that match the layout of the real content (e.g. `SkeletonNotes`, `SkeletonBoard`). No spinners and no “Loading…” text for loading states. Reference: `components/skeletons/SkeletonNotes.tsx` and usage in `app/context/[projectId]/notes/ContextNotesFromCache.tsx`.

### i18n

- **Keys:** Add strings to `locales/en.json` and `locales/es.json` (nested keys, e.g. `common.save`, `context.notes`).
- **Usage:** In client components, use `useI18n()` from `@/components/shared/I18nProvider` and call `t(key)` or `formatCurrency(amount)`. Reference: `components/context/ContextTabBar.tsx`, `lib/i18n.ts`, `components/shared/I18nProvider.tsx`.

### Error handling (mutation errors)

- **No `alert()`** for mutation errors in core modules. Use a **dialog pattern** with retry and cancel.
- **Reference:** `components/board/MutationErrorDialog.tsx` — props: `open`, `onOpenChange`, `title`, `message`, `onTryAgain`, `onCancel`. Parent holds state (e.g. `errorDialog`) and passes callbacks from the mutation (e.g. `onMoveError`, `onEditError`). Example usage: `app/context/[projectId]/board/ContextBoardClient.tsx` (errorDialog state, MutationErrorDialog in JSX).

---

## 6. How to add a new module

### 6.1 New context tab

1. **Route:** Add `app/context/[projectId]/<slug>/page.tsx` that calls `await requireAuth()` and renders `<Context<Name>FromCache projectId={params.projectId} />`.
2. **Cache key:** In `app/context/ContextDataCache.tsx`, add a new type to the `CacheKey` union (e.g. `{ type: 'mymodule', projectId: string }`) and ensure `cacheKeyToString` handles it.
3. **FromCache:** Create `app/context/[projectId]/<slug>/Context<Name>FromCache.tsx`: use `useContextDataCache()`, get/set/invalidate for the new key, skeleton on miss, fetch via server action/getter, then render `Context<Name>Client` with initial data and `onRefresh={loadData}`.
4. **Client:** Create `Context<Name>Client.tsx` that receives initial data and `onRefresh`; no useEffect for initial load; after mutations call `onRefresh()`.
5. **Tab bar:** In `components/context/ContextTabBar.tsx`, add an entry to the `TABS` array: `{ slug: '<slug>', labelKey: 'context.<key>', icon: Icon }`. Add i18n keys to `locales/en.json` and `locales/es.json`.
6. **Actions:** Add or reuse server actions in `app/actions/<name>.ts` or `app/context/[projectId]/<slug>/actions.ts` (verb-first, no Action suffix; cache() on reads only; revalidatePath after mutations).
7. **Skeleton:** Add a skeleton component in `components/skeletons/` (e.g. `Skeleton<Name>.tsx`) and use it in \*FromCache on cache miss.
8. **Tests:** At least one Playwright happy-path test for the new tab. If you add domain logic in lib, add at least one Vitest test where applicable.
9. **Error handling:** Use MutationErrorDialog-style pattern for mutation errors; do not use alert().

### 6.2 New non-context page

1. **Route:** Add `app/<segment>/page.tsx` (and optional `layout.tsx`). If the page needs auth, call `await requireAuth()` in the page or layout.
2. **Data loading:** Fetch in the server component (page or layout) using cached getters from actions; pass data as props to a \*PageClient or similar. Do not fetch initial data in useEffect.
3. **Actions:** Place in `app/actions/<name>.ts` or `app/<segment>/actions.ts`. Same rules: requireAuth first, explicit select, revalidatePath after mutations, return `{ data?, error? }`.
4. **Client:** If needed, create a client component that receives `initialData` and optional `onRefresh`; no useEffect for initial load.
5. **i18n:** Add keys and use `useI18n().t(key)` in client components.
6. **Tests:** At least one Playwright happy-path test for the new page if it’s user-facing; Vitest for new domain logic in lib.

### 6.3 When to add migrations / RPC

- **New table or column:** Add a migration in `supabase/migrations/` with timestamp name (e.g. `YYYYMMDDHHMMSS_description.sql`). Define RLS (owner*id or project join). Use `update_updated_at_column()` and a trigger `update*<table>\_updated_at`for`updated_at` columns.
- **Multi-step write:** Add a Postgres function **snake_case** + **`_atomic`** and call it from a server action. Do not implement multi-step writes as two client-triggered writes unless explicitly approved.
- **Reference migrations:** `001_initial_schema.sql`, `20260216010000_atomic_todo_and_task_creation.sql`, `20260222140000_fix_move_task_atomic_project_scope.sql`, `20260221120000_link_categories_owned.sql`.

### 6.4 Tests to add

- **Domain logic (lib/):** At least one Vitest test per new or meaningfully changed function (e.g. in `lib/validation/`, `lib/board.ts`).
- **New user-facing module or context tab:** At least one Playwright happy-path test (e.g. open tab, create or edit entity, see updated list). Place in `tests/`.
- **CI:** Quality gate runs `npm run lint`, `npm run build`, `npm run test -- --run`. Playwright workflow runs `npx playwright test`. Ensure both pass.

---

## 7. Quick reference

| Convention          | Location / example                                                                  |
| ------------------- | ----------------------------------------------------------------------------------- |
| Server action names | Verb-first, no Action suffix: getNotes, createTask, listProjectLinks                |
| FromCache           | Context*FromCache.tsx; cache get/set/invalidate, skeleton, onRefresh to *Client     |
| Client              | Context*Client.tsx or *PageClient.tsx; props + onRefresh, no useEffect initial load |
| Cache provider      | app/context/layout.tsx only                                                         |
| Cache keys          | app/context/ContextDataCache.tsx — CacheKey type                                    |
| RPCs                | snake_case + \_atomic; e.g. create_task_atomic in app/actions/tasks.ts              |
| Migrations          | supabase/migrations/YYYYMMDDHHMMSS_description.sql                                  |
| Reads               | cache() on getters; explicit select; owner_id/project_id scope                      |
| Writes              | revalidatePath after; return { data?, error? }; multi-step → RPC                    |
| Error UI            | components/board/MutationErrorDialog.tsx pattern; no alert()                        |
| Loading             | Shimmer skeletons in components/skeletons/                                          |
| i18n                | useI18n().t(key), locales/en.json, locales/es.json                                  |
