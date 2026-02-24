# AGENTS.md — How to work in ClearQueue

This document guides **humans and AI agents** working in the repo. It is the single source of working rules alongside `CONVENTIONS.md`. The factual basis is `docs/audits/REPO_CONTEXT_PACK.md` (Context Pack).

---

## 0. Core invariants (never compromise)

These are the architectural laws of ClearQueue. Every rule below follows from them.

| Invariant                                                 | What it means                                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Layering — UI → Application → Domain → Infrastructure** | Dependencies point inward only. UI must not contain business rules. Application (server actions) coordinates use-cases. Domain (`lib/**`) expresses business logic. Infrastructure is DB/SDK plumbing. |
| **Project-scoped isolation**                              | Every "context" operation is project-scoped. No cross-project reads or writes.                                                                                                                         |
| **Atomicity by default**                                  | Any multi-step write must be atomic at the DB boundary (`_atomic` RPC) or a single SQL statement. No partial state ever reaches the client.                                                            |
| **Cache correctness > cache cleverness**                  | Caching is allowed only when it cannot create stale or inconsistent UX. Invalidation is explicit and centralized.                                                                                      |
| **Security is defense in depth**                          | RLS is the final guard, but application queries must still scope by owner/project and validate inputs. Never rely on RLS as the only filter.                                                           |

---

## 1. How to work here (rules for everyone)

- **Do not** use `createClient()` from `@/lib/supabase/client` in any component under `components/` or in any file matching `app/**/*Client.tsx`. Data access and mutations run only in server actions or server components using `@/lib/supabase/server`. (Enforced by ESLint: `clear-queue/no-client-supabase-in-components`.)

- **Do not** use `.select('*')` in Supabase queries. Use explicit column lists. (Enforced: `clear-queue/no-select-star`.)

- **Do not** call a `load*` function after calling an `*Action` (or any server action) in the same handler. Update UI from the action’s return value or via `onRefresh` from the context cache. (Enforced: `clear-queue/no-manual-refetch-after-action`.)

- **Do** fetch initial page data on the server (in `page.tsx` or in a \*FromCache on cache miss). **Do not** fetch initial page data in `useEffect` in a client component.

- **Do** call `revalidatePath` (or `revalidateTag`) after every mutation in server actions. Context tabs may also use `onRefresh` for their own view; that does not replace revalidatePath.

- **Do not** use `router.refresh()` as the way to update context tab data after a mutation. Use returned data or `onRefresh()` from the \*FromCache wrapper.

- **Do not** use `alert()` for mutation errors in core modules. Use the standard error dialog pattern (see Error handling below).

- **Do** scope all task/project and user-owned queries: by `project_id` for project-scoped data and by `owner_id` or `user_id` for user-owned data. RLS is defense-in-depth; explicit scoping in queries is required.

- **Do** use Postgres RPCs (snake_case, `_atomic` suffix) for any multi-step write. No client-side two-step writes unless explicitly approved.

- **Do** name exported server actions **verb-first** and **without** the `Action` suffix (see CONVENTIONS.md). Reads: `get*` / `list*`. Writes: `create*` / `update*` / `delete*` / `move*` / `toggle*` / `duplicate*`.

---

## 2. Repo architecture map

Based on the Context Pack folder map:

```
app/                        # Routes and route-scoped UI
  context/                  # Project context
    layout.tsx              # ← ContextDataCacheProvider (non-negotiable: here, not under [projectId])
    page.tsx                # redirects to /
    ContextDataCache.tsx    # cache key types + get/set/invalidate
    ContextProjectPicker.tsx
    [projectId]/
      layout.tsx            # requireAuth + ContextLayoutWrapper
      page.tsx              # redirects to .../board
      ContextLayoutWrapper.tsx
      ContextLayoutClient.tsx
      board/, notes/, links/, ideas/, budgets/, billings/, todos/, owner/
        page.tsx            # requireAuth + *FromCache
        Context*FromCache.tsx
        Context*Client.tsx
  actions/                  # Shared server actions (tasks, projects, notes, budgets, …)
  profile/, settings/, api/
  page.tsx, layout.tsx, global-error.tsx
  signup/, forgot-password/, reset-password/

components/                 # Reusable UI (no Supabase, no business logic)
  context/                  # ContextShell, ContextTabBar
  board/                   # KanbanBoard, MutationErrorDialog, EditTaskModal, AddTaskModal
  shared/                  # TopBar, I18nProvider
  skeletons/               # SkeletonNotes, SkeletonBoard, …
  ui/                      # dialog, button, input, …

lib/                       # Supabase clients, auth, domain, validation
  supabase/                # server.ts, client.ts, types.ts
  auth.ts                  # requireAuth, getUser
  i18n.ts                  # t(), formatCurrency
  validation/              # profile, colors, project-links
  idea-graph/, todo/, storage/

supabase/migrations/       # All schema and RPC changes
docs/, templates/, tests/, .github/
```

**Boundaries:**

- **UI routes:** `app/**/page.tsx`, `app/**/layout.tsx`.
- **Reusable UI:** `components/` — no direct Supabase, no multi-step workflows; use server actions and props.
- **Business logic:** `lib/**` (e.g. `lib/board.ts`, `lib/todo/lists.ts`, `lib/validation/*`).
- **Data access & mutations:** Server actions in `app/actions/**` or feature-local `actions.ts`; all use `createClient()` from `@/lib/supabase/server`.

---

## 3. Golden paths (reference implementations)

### Context tab pattern: *FromCache → *Client → onRefresh + skeletons

- **Reference:** `app/context/[projectId]/notes/ContextNotesFromCache.tsx` → `ContextNotesClient.tsx`.
- **Flow:** *FromCache uses `useContextDataCache()`. Cache hit → render *Client with cached data and `onRefresh={loadData}`. Cache miss → show skeleton (e.g. `SkeletonNotes`), fetch via server action/getter, `cache.set(key, data)`, then render \*Client with data and `onRefresh`. `loadData` = `cache.invalidate(key)` + fetch + `cache.set` + setState.
- **Critical:** Every *FromCache that has mutations must pass `onRefresh` (or equivalent, e.g. `onOwnerUpdated`) to the *Client so the cache is invalidated after mutations.
- **Skeletons:** Use shimmer skeletons (e.g. `components/skeletons/SkeletonNotes.tsx`). No spinners or “Loading…” for loading states.

### Server actions pattern

- **Reference:** `app/actions/notes.ts`, `app/actions/tasks.ts`.
- **Rules:** `'use server'`; `createClient()` from `@/lib/supabase/server`; **requireAuth() first**; explicit `.select(...)` (no `*`); validate inputs; return typed `{ data?, error? }`; after mutations call **revalidatePath** (and optionally revalidateTag).
- **Reads:** Wrap read-only getters with React `cache()` (e.g. `getNotes`, `getProjectById` in `app/actions/notes.ts`, `app/actions/projects.ts`). **Never** wrap mutations with `cache()`.

### Cache rules

- **Server cache:** Only **read-only** getters may be wrapped with `cache()`. Mutations must never be cached.
- **Context session cache:** The **ContextDataCacheProvider** must live in **`app/context/layout.tsx`** (the layout that wraps both `/context` and `/context/[projectId]/...`). It must **not** be placed inside `app/context/[projectId]/layout.tsx`, or the cache is lost when switching projects.
- **Refresh:** In context tabs, after a mutation the *Client calls `onRefresh()` from the *FromCache; that invalidates the cache key, refetches, and updates state. Do not rely on `router.refresh()` for context tab updates.

### RPC atomic policy for multi-step writes

- **Policy:** Any multi-step write must be atomic via a Postgres RPC. RPC naming: **snake_case** with **`_atomic`** suffix (e.g. `create_task_atomic`, `move_task_atomic`, `duplicate_budget_atomic`, `create_todo_item_atomic`, `toggle_todo_item_atomic`).
- **No** client-side “run two writes in sequence” for dependent steps unless explicitly approved.
- **References:** `app/actions/tasks.ts` (createTask → `create_task_atomic`, updateTaskOrder → `move_task_atomic`), `app/actions/budgets.ts` (duplicateBudget → `duplicate_budget_atomic`), `lib/todo/lists.ts` (createTodoItemAtomic, toggleTodoItemAtomic); invoked from `app/actions/todo.ts`.

### Security rules

- **No client Supabase in components:** Only server actions or server components may create and use the Supabase client for DB. (ESLint applies to `components/**` and `app/**/*Client.tsx`.)
- **Ownership scoping:** Always scope queries by `owner_id` or `user_id` for user-owned data, and by `project_id` for project-scoped data. See RLS in migrations (e.g. `20260221120000_link_categories_owned.sql`, `20260222140000_fix_move_task_atomic_project_scope.sql`).
- **RLS:** RLS is defense-in-depth; application queries must still explicitly filter by owner/project.

---

## 4. Definition of Done checklist

Before considering a change “done”:

- [ ] No `createClient()` from `@/lib/supabase/client` in components or \*Client.tsx.
- [ ] No `.select('*')`; all Supabase selects use explicit column lists.
- [ ] No `load*()` called in the same handler after a server action; use returned data or `onRefresh`.
- [ ] Initial page data is not fetched in `useEffect`; it is fetched server-side or via \*FromCache on miss.
- [ ] Mutations call `revalidatePath` (or `revalidateTag`) after success.
- [ ] Context tab mutations use `onRefresh` (or equivalent) for the tab’s view; no `router.refresh()` for that.
- [ ] Multi-step writes use an RPC (`_atomic`) or a single-step write; no unapproved client-side two-step writes.
- [ ] Server action names are verb-first and **do not** use the `Action` suffix (see CONVENTIONS.md).
- [ ] Mutation errors in core modules are not shown with `alert()`; use the error dialog pattern (e.g. `MutationErrorDialog`).
- [ ] New/changed domain logic has at least one Vitest test if applicable.
- [ ] New user-facing modules/tabs have at least one Playwright happy-path test.
- [ ] `npm run lint`, `npm run build`, and `npm run test -- --run` pass.

---

## 5. When unsure, write an audit note

- If you are unsure whether a pattern is allowed, or you find a deviation from these rules, **do not guess**. Add a short audit note so the team can decide.
- **Where audits live:** `docs/audits/`. Use a descriptive filename (e.g. `docs/audits/<topic>-YYYY-MM-DD.md`).
- In the note: what you found, file paths, and a short “unknown / needs decision” or “TODO: align with AGENTS.md” so it can be triaged.

---

## 6. Transitional notes (legacy remnants)

- **`revalidatePath('/dashboard')`:** Several server actions (e.g. `app/actions/projects.ts`, `app/actions/tasks.ts`) still call `revalidatePath('/dashboard')`. There is **no** `app/dashboard/` route in the repo (no `app/dashboard/page.tsx`). This is a legacy path kept for cache invalidation. New code should revalidate the paths that actually exist (e.g. `/`, `/context`, `/context/${projectId}`); keeping `/dashboard` in existing actions is acceptable until a cleanup pass.
- **Middleware protected prefixes:** `middleware.ts` protects paths like `/dashboard`, `/project`, `/projects`, `/ideas`, `/todo`, `/budgets`, `/clients`, `/businesses`, `/notes`, `/billings`, `/context`, `/profile`, `/settings`. Some of these routes may not exist (e.g. dashboard, project). Middleware is broader than the current route set; no need to change it for every new route.
- **Existing \*Action names:** Some exports still use the `Action` suffix (e.g. `listProjectLinksAction`, `getProjectTodoBoardAction`). The **new** convention is verb-first, no suffix. New code must follow CONVENTIONS.md; existing names can be renamed in a separate refactor.

---

## 7. Quick reference

| Topic          | Reference file(s)                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Context tab    | `app/context/[projectId]/notes/ContextNotesFromCache.tsx`, `ContextNotesClient.tsx`                |
| Cache provider | `app/context/layout.tsx`, `app/context/ContextDataCache.tsx`                                       |
| Server actions | `app/actions/notes.ts`, `app/actions/tasks.ts`, `app/actions/projects.ts`                          |
| RPC usage      | `app/actions/tasks.ts`, `app/actions/budgets.ts`, `lib/todo/lists.ts`                              |
| Error dialog   | `app/context/[projectId]/board/ContextBoardClient.tsx`, `components/board/MutationErrorDialog.tsx` |
| Tabs + i18n    | `components/context/ContextTabBar.tsx`, `components/shared/I18nProvider.tsx`, `lib/i18n.ts`        |
| Data loading   | `app/profile/page.tsx`, `app/profile/ProfilePageClient.tsx`                                        |
| Full audit     | `docs/audits/REPO_CONTEXT_PACK.md`                                                                 |
