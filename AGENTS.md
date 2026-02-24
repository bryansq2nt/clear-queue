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

- **Do** use `captureWithContext` from `@/lib/sentry` (not bare `Sentry.captureException`) in every server action and API route error path. Always include `module`, `action`, `userIntent`, and `expected`. Reference: `app/actions/documents.ts`.

---

## 1b. Browser / Client-side API rules (CRITICAL)

### window.open() with async URL fetching

**Never** pre-open a blank window and navigate it after an `await`.

When `noopener` or `noreferrer` is in the features string, `window.open()` returns
`null` per the HTML spec. Setting `location.href` on that null reference is a silent
no-op — the tab opens blank and stays blank. On some desktop browsers it triggers a
Google search for `about:blank`.

```ts
// ❌ NEVER DO THIS — win is always null when noopener is set
const win = window.open('', '_blank', 'noopener,noreferrer');
const { url } = await fetchSignedUrl(id);
win.location.href = url; // no-op
```

**Rule:** If the URL is synchronously available, call `window.open(url, '_blank', 'noopener,noreferrer')` once.
If the URL requires an async fetch, create a Next.js API route that authenticates
server-side and returns a `302` redirect. The click handler opens the route URL
synchronously — no async inside the gesture, no popup blocking.

```ts
// ✅ API route handles the async work server-side
export async function GET(_req, { params }) {
  const user = await getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  return NextResponse.redirect(data.signedUrl, 302);
}

// ✅ Component — synchronous, one line
const handleOpen = () => {
  window.open(`/api/resource/${id}/view`, '_blank', 'noopener,noreferrer');
};
```

**Real example:** `app/api/documents/[fileId]/view/route.ts` + `components/context/documents/DocumentRow.tsx`

---

## 1c. Pre-flight — required before writing any code

Before generating or editing any code, complete this checklist in order.

**1. Identify which layers are touched.**
UI / Application / Domain / Infrastructure — dependencies must point inward only. If a component needs data, it calls a server action, not the DB directly.

**2. Find the reference implementation to follow — do not invent patterns.**

| What you are building    | Reference to read first                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| New context tab          | `app/context/[projectId]/notes/` (ContextNotesFromCache + ContextNotesClient) |
| New server action        | `app/actions/notes.ts`, `app/actions/documents.ts`                            |
| Multi-step write         | `app/actions/tasks.ts` → `create_task_atomic` RPC                             |
| Error dialog             | `components/board/MutationErrorDialog.tsx`                                    |
| Skeleton / loading state | `components/skeletons/SkeletonNotes.tsx`                                      |
| File upload              | `lib/storage/upload.ts`                                                       |
| API route                | `app/api/documents/[fileId]/view/route.ts`                                    |

**3. List every file that will change before touching any of them.**
If the list is longer than expected, the scope is probably too large — break it up.

**4. Define the test plan.**

- New logic in `lib/**` → add or update a Vitest test.
- New context tab or user-facing module → add at least one Playwright happy-path test.
- Bug caught by E2E → add a lower-level unit/integration test where feasible.

**5. Identify DB impact.**

- Schema change → migration (`YYYYMMDDHHMMSS_description.sql`) with RLS + indexes + `updated_at` trigger (see CONVENTIONS.md migration checklist).
- Multi-step write → Postgres RPC with `_atomic` suffix; no client-side two-step sequences.

---

## 1d. Performance contracts (non-negotiable)

| Operation                           | Max DB round trips | Rule                |
| ----------------------------------- | ------------------ | ------------------- |
| Context tab initial load or refresh | **3**              | Architecture rule   |
| Detail page load                    | **2**              | Architecture rule   |
| Single insert / update / delete     | **1**              | One query, one call |
| Multi-step write                    | **1 RPC call**     | Atomicity invariant |

**Never** issue a DB call per item in a list loop. If you need related data for every row, use a JOIN, a nested Supabase select, a view, or an RPC that returns the full shape. A loop over a list that calls the DB per item is always wrong and will be flagged in review.

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

## 4b. Self-audit — run this on your own output before declaring done

The Definition of Done (section 4) is a final confirmation pass. This self-audit
is different: it requires actively looking for failure modes in the code you just
wrote, not just confirming a checklist.

After writing any implementation, ask each question out loud and answer it:

### Data & queries

- [ ] **N+1 check:** Does any function call the DB inside a loop over a list? If yes → replace with JOIN, nested select, view, or RPC.
- [ ] **Explicit select check:** Does every `.select()` call have an explicit column list? Any `.select()` with no arguments or `'*'` is a violation.
- [ ] **Scope check:** Does every query filter by `owner_id` or `user_id` AND by `project_id` where applicable? A query scoped only by one of these is likely wrong.
- [ ] **Round-trip count:** How many DB calls does this feature make on initial load? If > 3 for a tab or > 2 for a detail page — refactor before shipping.

### Writes & atomicity

- [ ] **Multi-step write check:** If this feature performs 2+ writes that must both succeed, is it using a `_atomic` RPC? Two sequential awaits that each call the DB is always wrong.
- [ ] **Revalidation check:** Does every mutation call `revalidatePath` (or `revalidateTag`) after success?
- [ ] **Return data check:** Does the server action return the created/updated row so the UI can update without a refetch? If it returns nothing after a write, the client must refetch — which is a rule violation.

### Security

- [ ] **Auth check:** Is `requireAuth()` (or `getUser()`) the very first call in every server action and API route handler?
- [ ] **Client Supabase check:** Does any component or `*Client.tsx` file import from `@/lib/supabase/client` for data access? That is always wrong.
- [ ] **Input validation check:** Is every user-supplied value (from FormData, query params, or request body) validated and trimmed before it reaches the DB?

### UI & UX

- [ ] **Loading state check:** Is every async operation covered by a shimmer skeleton — not a spinner, not "Loading…" text?
- [ ] **Error handling check:** Are mutation errors shown via `MutationErrorDialog` (or equivalent), not `alert()` or bare `console.error`?
- [ ] **Optimistic update check:** After a mutation succeeds, does the UI update from the returned data — not from a `router.refresh()` or a full page reload?

### Observability

- [ ] **Sentry check:** Does every error path in server actions and API routes call `captureWithContext` with `module`, `action`, `userIntent`, and `expected`?

### Browser APIs

- [ ] **window.open() check:** If any code opens a new tab, is the URL passed synchronously to `window.open()`? Any pattern that opens a blank window and navigates it after an `await` is broken (see section 1b).

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

## 6b. Known tech debt — do not copy these patterns

The following are **known violations** of the rules in this file. They are documented in `docs/audits/AUDIT_SUMMARY.md` and exist because they predate the current standards. They are not fixed yet. **Do not copy them. Do not make them worse.**

| Location                                                       | Violation                                             | Correct approach                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `app/context/[projectId]/links/actions.ts:413`                 | N+1 loop — one `UPDATE` per link in reorder           | Must be a `reorder_links_atomic` RPC (one call)                                    |
| Task ordering (multiple actions files)                         | Non-atomic reorder; concurrent `max(sort_order)` race | Correct pattern is `move_task_atomic` RPC — already used in `app/actions/tasks.ts` |
| `revalidatePath('/dashboard')` in several actions              | Path does not exist in the router                     | New code revalidates only real paths: `/`, `/context`, `/context/${projectId}`     |
| Exports suffixed with `Action` (e.g. `listProjectLinksAction`) | Naming convention violation                           | New code: verb-first, no suffix (e.g. `listProjectLinks`)                          |

**If you open one of these files as a reference implementation, read it for structure only — do not copy the specific pattern flagged above.**

---

## 7. Quick reference

### Code references

| Topic                | Reference file(s)                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Context tab          | `app/context/[projectId]/notes/ContextNotesFromCache.tsx`, `ContextNotesClient.tsx`                |
| Cache provider       | `app/context/layout.tsx`, `app/context/ContextDataCache.tsx`                                       |
| Server actions       | `app/actions/notes.ts`, `app/actions/tasks.ts`, `app/actions/projects.ts`                          |
| RPC usage            | `app/actions/tasks.ts`, `app/actions/budgets.ts`, `lib/todo/lists.ts`                              |
| Error dialog         | `app/context/[projectId]/board/ContextBoardClient.tsx`, `components/board/MutationErrorDialog.tsx` |
| Tabs + i18n          | `components/context/ContextTabBar.tsx`, `components/shared/I18nProvider.tsx`, `lib/i18n.ts`        |
| File upload          | `lib/storage/upload.ts`                                                                            |
| API route (redirect) | `app/api/documents/[fileId]/view/route.ts`                                                         |
| Sentry context       | `app/actions/documents.ts` (captureWithContext usage throughout)                                   |
| Full audit           | `docs/audits/REPO_CONTEXT_PACK.md`, `docs/audits/AUDIT_SUMMARY.md`                                 |

### Pattern deep-dives (read before implementing)

| Before you build…                       | Read this pattern doc first              |
| --------------------------------------- | ---------------------------------------- |
| Any data loading (page, tab, component) | `docs/patterns/data-loading.md`          |
| Any server action (read or write)       | `docs/patterns/server-actions.md`        |
| Any Supabase query                      | `docs/patterns/database-queries.md`      |
| Any multi-step write                    | `docs/patterns/transactions.md`          |
| Any context tab with caching            | `docs/patterns/context-session-cache.md` |
