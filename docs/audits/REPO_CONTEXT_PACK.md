# Repo Context Pack — ClearQueue (current codebase)

**Purpose:** Discovery-only audit for writing AGENTS.md, CONVENTIONS.md, and CURSOR_RULES.md that match reality. No code changes.

---

# 1) Repo identity (current)

**Product description:** ClearQueue is a task and project management app (Mutech Labs Task Manager). Authenticated users land on a project picker at `/`; after choosing a project they enter a project-scoped “context” with tabs: Etapas (board), Responsable del proyecto (owner), Notas, Enlaces, Ideas, Presupuestos, Facturación, and Tareas. Data is owner- and project-scoped; the UI avoids full-page refresh after mutations by using returned data, optimistic updates, and a client-side session cache when returning to already-visited context tabs.

**Tech stack:**

- **Next.js:** 14.2.35 (App Router).
- **Supabase:** `@supabase/ssr` 0.8.x, `@supabase/supabase-js` 2.39.x. Server-only data access via `createClient()` from `@/lib/supabase/server`; middleware uses `createServerClient` from `@supabase/ssr` for auth. No Supabase in client components (enforced by custom ESLint rule).
- **Auth:** Cookie-based sessions via Supabase Auth; `requireAuth()` / `getUser()` from `@/lib/auth`; protected routes guarded in `middleware.ts` by path prefix; unauthenticated users redirect to `/`.
- **Storage:** Supabase Storage used from server (e.g. `lib/storage/upload.ts`).
- **Deployment:** Not specified in repo (Vercel implied by `@vercel/analytics`).
- **Other:** Sentry (`@sentry/nextjs`), Radix UI, Tailwind, Vitest, Playwright, custom ESLint plugin `eslint-plugin-clear-queue`.

**New folder map (top 2 levels):**

```
app/                    # Routes and route-scoped UI
  context/              # Project context (picker, layout, [projectId]/tabs)
  profile/
  settings/
  actions/              # Shared server actions (tasks, projects, notes, etc.)
  api/                  # Auth callback, set-recovery-session
  page.tsx, layout.tsx, global-error.tsx
  signup/, forgot-password/, reset-password/, sentry-example-page/
components/             # Reusable UI (board, context, shared, skeletons, ui, auth, projects)
lib/                    # Supabase clients, auth, i18n, validation, domain helpers
  supabase/, auth.ts, i18n.ts, validation/, idea-graph/, todo/, storage/
supabase/               # Migrations only (no local config in audit scope)
  migrations/
docs/, templates/, eslint-plugin-clear-queue/, tests/, .github/
```

---

# 2) Architecture boundaries (what lives where)

**UI routes (where page/layout live):**

- **Folder:** `app/` — all routes are under App Router.
- **Key files:** `app/page.tsx` (home: project picker or login), `app/layout.tsx`, `app/context/page.tsx` (redirects to `/`), `app/context/[projectId]/page.tsx` (redirects to `.../board`), `app/context/[projectId]/board/page.tsx`, `app/context/[projectId]/notes/page.tsx`, `app/context/[projectId]/links/page.tsx`, `app/context/[projectId]/ideas/page.tsx`, `app/context/[projectId]/budgets/page.tsx`, `app/context/[projectId]/billings/page.tsx`, `app/context/[projectId]/todos/page.tsx`, `app/context/[projectId]/owner/page.tsx`, `app/profile/page.tsx`, `app/settings/appearance/page.tsx`, `app/signup/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`.

**Components (reusable UI):**

- **Folder:** `components/` — shared across routes.
- **Key files:** `components/context/ContextShell.tsx`, `components/context/ContextTabBar.tsx`, `components/board/KanbanBoard.tsx`, `components/board/MutationErrorDialog.tsx`, `components/board/EditTaskModal.tsx`, `components/board/AddTaskModal.tsx`, `components/projects/AddProjectModal.tsx`, `components/projects/EditProjectModal.tsx`, `components/shared/TopBar.tsx`, `components/shared/I18nProvider.tsx`, `components/skeletons/SkeletonNotes.tsx` (and other Skeleton*), `components/ui/*` (dialog, button, input, etc.).

**Business logic (domain layer):**

- **Folders:** `lib/` for domain helpers; some logic inside `app/actions/` (e.g. task status/board types in `lib/board.ts`).
- **Key files:** `lib/board.ts`, `lib/idea-graph/boards.ts`, `lib/idea-graph/ideas.ts`, `lib/idea-graph/connections.ts`, `lib/idea-graph/project-links.ts`, `lib/todo/lists.ts`, `lib/projects.ts`, `lib/auth.ts`, `lib/kanban/optimistic.ts`.

**Data access layer (Supabase server/client creation):**

- **Folder:** `lib/supabase/`.
- **Key files:** `lib/supabase/server.ts` (async `createClient()` used everywhere for DB), `lib/supabase/client.ts` (browser client — not used in components; ESLint forbids it in `components/**` and `app/**/*Client.tsx`), `lib/supabase/types.ts` (Database types). All server actions and server-side code use `createClient` from `@/lib/supabase/server`.

**Validation layer:**

- **Folder:** `lib/validation/`.
- **Key files:** `lib/validation/profile.ts` (display_name, timezone, locale), `lib/validation/colors.ts`, `lib/validation/project-links.ts`. No Zod; validation is ad-hoc (trim, length, allowlists) and these helpers. Some actions do inline checks (e.g. `notes` actions: project_id, title, content required).

**Shared utilities:**

- **Folder:** `lib/` (non-Supabase, non-auth).
- **Key files:** `lib/utils.ts`, `lib/i18n.ts`, `lib/constants.ts`, `lib/formatPhone.ts`, `lib/sentry.ts`, `lib/ui/toast.ts`, `lib/theme.ts`.

---

# 3) Golden paths (copy-worthy reference implementations)

| File path                                                                                           | Pattern                                                                                                                     | Why reference                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `app/context/[projectId]/notes/ContextNotesFromCache.tsx`                                           | Context tab wrapper: *FromCache → *Client, cache get/set, loadData = invalidate + refetch + set, onRefresh passed to client | Canonical FromCache: cache hit → render client with data; miss → SkeletonNotes, getNotes(), cache.set, then ContextNotesClient with onRefresh={loadData}.                             |
| `app/context/[projectId]/notes/ContextNotesClient.tsx`                                              | Context tab client: receives initialNotes + onRefresh, no useEffect for initial load                                        | Receives data as props; calls onRefresh after mutations.                                                                                                                              |
| `app/context/layout.tsx`                                                                            | Context session cache provider placement                                                                                    | Wraps all context routes with ContextDataCacheProvider so cache persists when switching projects.                                                                                     |
| `app/context/ContextDataCache.tsx`                                                                  | Cache key types and API (get, set, invalidate, invalidateProject)                                                           | Single source of cache key shape: `{ type, projectId }` or `{ type: 'noteDetail', noteId }`; key string = `type:projectId` or `noteDetail:noteId`.                                    |
| `app/actions/notes.ts`                                                                              | Server actions: 'use server', requireAuth, cache() on reads only, explicit select, revalidatePath, return { data?, error? } | getNotes cached; createNote/updateNote/deleteNote validate, insert/update/delete with explicit columns, revalidatePath('/notes', '/notes/[id]', '/context'), return typed result.     |
| `app/actions/tasks.ts`                                                                              | RPC for multi-step write (create_task_atomic, move_task_atomic), revalidatePath, return { data? } or { error? }             | createTask/moveTaskOrder use supabase.rpc('create_task_atomic'                                                                                                                        | 'move_task_atomic'); auth first; revalidatePath('/dashboard','/context'); no cache() on mutations. |
| `app/actions/projects.ts`                                                                           | Read actions with cache(): getProjectsForSidebar, getProjectById, getProjectsList, getFavoriteProjectIds                    | All reads wrapped in cache(); requireAuth; explicit select; used by layout wrapper and home.                                                                                          |
| `components/context/ContextTabBar.tsx`                                                              | Tab definitions and i18n for context navigation                                                                             | TABS array (board, owner, notes, links, ideas, budgets, billings, todos); links to `/context/${projectId}` or `.../${slug}`; uses useI18n().t(labelKey).                              |
| `components/shared/I18nProvider.tsx` + `lib/i18n.ts`                                                | i18n usage: provider with t(), formatCurrency, locale/currency from profile/preferences + localStorage                      | Client components use useI18n() from I18nProvider; t(key) and formatCurrency(amount); keys in locales/en.json, locales/es.json.                                                       |
| `app/context/[projectId]/board/ContextBoardClient.tsx` + `components/board/MutationErrorDialog.tsx` | Error handling for mutations (board move/edit)                                                                              | ContextBoardClient keeps errorDialog state, passes onMoveError/onEditError to KanbanBoard/EditTaskModal; renders MutationErrorDialog with open, title, message, onTryAgain, onCancel. |
| `app/actions/tasks.ts` (createTask, updateTaskOrder)                                                | RPC usage for atomic operations                                                                                             | create_task_atomic and move_task_atomic called via supabase.rpc(); project scoping and ordering done in DB function.                                                                  |
| `app/actions/budgets.ts` (duplicateBudget)                                                          | RPC for multi-entity atomic (duplicate_budget_atomic)                                                                       | Single RPC duplicates budget + categories + items; no client-side multi-step writes.                                                                                                  |
| `lib/todo/lists.ts` (createTodoItemAtomic, toggleTodoItemAtomic)                                    | RPC from lib (create_todo_item_atomic, toggle_todo_item_atomic)                                                             | Todo list mutations go through RPC; called from app/actions/todo.ts.                                                                                                                  |
| `app/profile/page.tsx` + `app/profile/ProfilePageClient.tsx`                                        | Server page fetches, client receives initialData (no context cache)                                                         | Page uses getProfileWithAvatar(); passes to ProfilePageClient; no useEffect for initial fetch (per data-loading pattern).                                                             |
| `app/context/[projectId]/ContextLayoutWrapper.tsx`                                                  | Project-scoped layout: cache get(project), else getProjectById, then ContextLayoutClient                                    | Uses context cache for project row; sessionStorage for display name before fetch; redirects to `/` if project not found.                                                              |

**Must-include coverage:**

- **Context tab wrapper:** ContextNotesFromCache → ContextNotesClient with onRefresh (see above).
- **Server actions:** notes.ts and tasks.ts (auth first, validation, typed returns, revalidatePath).
- **i18n:** I18nProvider + useI18n() + lib/i18n.ts + locales/\*.json.
- **Error handling:** MutationErrorDialog used in ContextBoardClient; other views still use alert() in places (see Sharp edges).
- **RPC:** create_task_atomic, move_task_atomic in app/actions/tasks.ts; duplicate_budget_atomic in app/actions/budgets.ts; create_todo_item_atomic, toggle_todo_item_atomic in lib/todo/lists.ts (invoked via app/actions/todo.ts).
- **Cache:** Server: cache() on read-only getters in app/actions/*.ts and app/profile/actions.ts, app/settings/appearance/actions.ts. Client: ContextDataCache in app/context/ContextDataCache.tsx, provider in app/context/layout.tsx; keys and refresh in *FromCache components.

---

# 4) Navigation system (current reality)

**Current navigation architecture:**

- **Entry:** `/` — if not logged in, login form; if logged in, project picker (ContextProjectPicker) with project list from getProjectsList().
- **Context entry:** User selects project → navigation to `/context/[projectId]/board` (default tab). The route `/context` redirects to `/`; `/context/[projectId]` redirects to `/context/[projectId]/board` (both in app/context/page.tsx and app/context/[projectId]/page.tsx).
- **Context tabs:** Defined in `components/context/ContextTabBar.tsx`: board (Etapas), owner, notes, links, ideas, budgets, billings, todos, plus “Salir” (exit) to `/`. Board is at `base`; others at `${base}/${slug}`. No sidebar; all project-scoped views under one header + tab bar (ContextShell in ContextLayoutClient).
- **Route redirects:** `app/context/page.tsx` → `redirect('/')`. `app/context/[projectId]/page.tsx` → `redirect(\`/context/${params.projectId}/board\`)`. Middleware: `middleware.ts`redirects unauthenticated users from protected prefixes to`/`; `/signup`if user →`/`; `/settings/profile`→`/profile`.

**Legacy navigation remnants:**

- **Path references only:** Actions still call `revalidatePath('/dashboard')` (e.g. app/actions/projects.ts, app/actions/tasks.ts). There is **no** `app/dashboard/` route in the repo (no app/dashboard/page.tsx). So “dashboard” is a legacy path kept for cache invalidation only.
- **Middleware protected prefixes** include `/dashboard`, `/project`, `/projects`, `/ideas`, `/todo`, `/budgets`, `/clients`, `/businesses`, `/notes`, `/billings`, `/context`, `/profile`, `/settings` — some of these routes may not exist (e.g. dashboard, project); middleware is broader than current route set.
- **Docs:** `docs/audits/navigation-modules-vs-context-audit-2026-02-22.md` describes the shift from module-based (sidebar) to context-based navigation; current app tree has no dashboard or projects page under app/.

**Context navigation (project-scoped) and tab definition:**

- **Layout chain:** `app/context/layout.tsx` → ContextDataCacheProvider. `app/context/[projectId]/layout.tsx` → requireAuth + ContextLayoutWrapper(projectId). ContextLayoutWrapper loads project (cache or getProjectById), then ContextLayoutClient(projectId, projectName) → ContextShell(projectId, projectName) which renders ContextTabBar + children.
- **Tab content:** Each tab route (e.g. notes, links) has a page.tsx that calls requireAuth and renders the corresponding \*FromCache component (e.g. ContextNotesFromCache). Exact files: `app/context/[projectId]/board/page.tsx`, owner/page.tsx, notes/page.tsx, links/page.tsx, ideas/page.tsx, budgets/page.tsx, billings/page.tsx, todos/page.tsx`; plus notes/new/page.tsx, notes/[noteId]/page.tsx, ideas/board/[boardId]/page.tsx, budgets/[budgetId]/page.tsx.

---

# 5) Data loading + cache (current rules and implementations)

**Where server `cache()` is used (files + functions):**

- `app/settings/appearance/actions.ts`: getPreferences, getPreferencesOptional
- `app/profile/actions.ts`: getProfileOptional, getProfile, getProfileWithAvatar, getAssetSignedUrl
- `app/actions/projects.ts`: getProjectsForSidebar, getProjectById, getProjectsList, getFavoriteProjectIds
- `app/actions/budgets.ts`: getBudgets, getBudgetsByProjectId, getBudgetProjectId, getProjects
- `app/actions/clients.ts`: getClients, getBusinesses
- `app/actions/notes.ts`: getNotes
- `app/actions/billings.ts`: getBillings, getBillingsByProjectId
- `app/context/[projectId]/links/actions.ts`: listProjectLinksAction (comment states mutations in same file are not cached)
- `app/actions/tasks.ts`: getDashboardData, getTasksByProjectId, getBoardCountsByStatus, getBoardInitialData

**Official rule (what can/can’t be cached):**

- **Can:** Read-only server actions (getters) that depend on auth and return the same result for the same request. Wrap with React `cache()` so duplicate calls in the same render are deduplicated.
- **Cannot:** Mutations (create, update, delete). Never wrap mutations with cache().

**Context/session cache provider:**

- **Mounted in:** `app/context/layout.tsx` (not inside [projectId]). ContextDataCacheProvider wraps `{children}` so it stays mounted when switching between projects and tabs; cache persists for the session.

**Cache key conventions:**

- **Defined in:** `app/context/ContextDataCache.tsx`. Type: `CacheKey = { type: 'project'|'board'|'notes'|'links'|'linkCategories'|'ideas'|'owner'|'budgets'|'billings'|'todos', projectId: string } | { type: 'noteDetail', noteId: string }`. String key: `type:projectId` or `noteDetail:noteId` (see cacheKeyToString).

**Refresh/invalidation pattern:**

- **FromCache components:** On cache miss, they fetch (server action or getter), then cache.set(key, data) and set local state. They expose a loadData callback that: cache.invalidate(key), fetch, cache.set(key, data), setState(data). That callback is passed to the \*Client as onRefresh (or onOwnerUpdated for owner). After a mutation, the client calls onRefresh() so the wrapper invalidates, refetches, and updates cache and state — no router.refresh() for context tabs.
- **Server revalidation:** Mutations still call revalidatePath(...) so other entry points (e.g. direct load of the same path) see fresh data; context tabs rely on onRefresh + cache for their own view.

---

# 6) Database + RLS + RPC conventions (current reality)

**Migrations folder and naming:**

- **Folder:** `supabase/migrations/`.
- **Naming:** Timestamp-prefix or descriptive: e.g. `001_initial_schema.sql`, `20260118190000_add_project_categories_and_editing.sql`, `20260222180000_tasks_compound_index.sql`, `20260216010000_atomic_todo_and_task_creation.sql`. Mix of `YYYYMMDD...` and short prefixes.

**RPCs referenced in code and where called:**

- `create_task_atomic`: `app/actions/tasks.ts` (createTask).
- `move_task_atomic`: `app/actions/tasks.ts` (updateTaskOrder).
- `duplicate_budget_atomic`: `app/actions/budgets.ts` (duplicateBudget).
- `create_todo_item_atomic`: `lib/todo/lists.ts` (createTodoItemAtomic); invoked via app/actions/todo.ts.
- `toggle_todo_item_atomic`: `lib/todo/lists.ts` (toggleTodoItemAtomic); invoked via app/actions/todo.ts.

**RLS strategy:**

- **owner_id pattern:** User-owned tables (e.g. profiles, user_preferences, link_categories, clients) use RLS with `owner_id = auth.uid()`. Example: `supabase/migrations/20260221120000_link_categories_owned.sql` — policies “Users can select/insert/update/delete own link_categories” with USING/WITH CHECK on owner_id.
- **Parent-join / project scope:** Tasks and project-scoped data: RPCs and policies often join to `projects` and check `projects.owner_id = auth.uid()` so that only the project owner can modify. Example: `supabase/migrations/20260222140000_fix_move_task_atomic_project_scope.sql` — move_task_atomic joins tasks to projects and checks `p.owner_id = auth.uid()`; peer UPDATEs also filter by `project_id = current_task.project_id`.
- **Migrations to cite:** 001_initial_schema.sql (base tables/triggers), 20260208120000_multi_user_projects_tasks_budgets.sql, 20260218100000_project_access.sql, 20260221120000_link_categories_owned.sql, 20260222140000_fix_move_task_atomic_project_scope.sql.

**updated_at trigger convention:**

- **Function:** `update_updated_at_column()` — defined in `supabase/migrations/001_initial_schema.sql` and reused in `202601250000_presupuestos.sql`; sets `NEW.updated_at = NOW()`.
- **Trigger names:** Typically `update_<table>_updated_at` or `update_<table_name>_updated_at`, e.g. update_ideas_updated_at, update_idea_boards_updated_at, update_link_categories_updated_at, update_project_links_updated_at (see 20260222160000_idea_tables_updated_at_triggers.sql, 20260221120000_link_categories_owned.sql, 20260221100000_project_links_link_vault.sql).

---

# 7) Query patterns (how we do reads/writes)

**Standard read query (single):**

- **Example:** `app/actions/notes.ts` — getNotes. requireAuth(); supabase.from('notes').select('id, owner_id, project_id, title, content, created_at, updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false }); optional .eq('project_id', options.projectId). Returns array; no .single().
- **Example (single row):** getNoteById in same file: .eq('id', noteId).eq('owner_id', user.id).single().

**Standard write query (single):**

- **Example:** `app/actions/notes.ts` — createNote. requireAuth(); build insert payload with owner_id, project_id, title, content; supabase.from('notes').insert(...).select(...).single(); then revalidatePath; return { data } or { error }.

**Double query / multi-step write — atomicity and failure policy:**

- **How atomicity is ensured:** Multi-step writes that must be atomic use RPCs (e.g. create_task_atomic, move_task_atomic, duplicate_budget_atomic, create_todo_item_atomic, toggle_todo_item_atomic). The repo does not use ad-hoc client-side “run two inserts then update”; the second step is inside the DB function.
- **If step 2 fails:** With RPCs, the whole operation succeeds or fails in the DB. Actions return { error: error.message } (or throw) and do not revalidate on error. Client either shows error (MutationErrorDialog on board, or alert() in some other clients) and may retry or revert optimistic state.
- **Real examples:** createTask in app/actions/tasks.ts calls create_task_atomic once; on error returns { error }. moveTaskOrder calls move_task_atomic; on error returns { error }. duplicateBudget in app/actions/budgets.ts calls duplicate_budget_atomic; on error throws. lib/todo/lists.ts createTodoItemAtomic/toggleTodoItemAtomic call RPC and return { data, error }.

---

# 8) Naming conventions (enforced vs informal)

**Server action naming:**

- **Informal:** Mix of verb-only (createTask, updateTask, getNotes, getProjectById) and *Action suffix (listProjectLinksAction, getProjectTodoBoardAction). No single enforced rule; *Action appears in context-facing actions (e.g. todo, links).

**File naming:**

- **actions:** Co-located `actions.ts` under a feature (e.g. app/context/[projectId]/links/actions.ts) or shared under app/actions/ (tasks.ts, projects.ts, notes.ts, budgets.ts, etc.).
- **Types:** Often inferred from Database types in lib/supabase/types.ts; some feature-level types in actions or components. No strict types.ts convention in every folder.
- **Client components:** \*Client.tsx for route-level client UI (ContextNotesClient, ContextBoardClient, ProfilePageClient, AppearancePageClient).
- **FromCache wrappers:** \*FromCache.tsx (ContextNotesFromCache, ContextBoardFromCache, etc.).

**Module/route naming:**

- **Folders:** kebab or single word (context, profile, settings); dynamic segment [projectId], [noteId], [budgetId], [boardId].
- **Routes:** /context/[projectId]/board, /context/[projectId]/notes, etc.; no trailing slash convention documented.

**Lint rules enforcing naming or query behavior:**

- **.eslintrc.js** + **eslint-plugin-clear-queue**: `clear-queue/no-select-star` — forbids .select('_'). `clear-queue/no-manual-refetch-after-action` — forbids calling a load_() after an *Action in the same function. `clear-queue/no-client-supabase-in-components` — forbids createClient() from @/lib/supabase/client in components/** and app/**/*Client.tsx. React/Next rules: react-hooks/exhaustive-deps, react/no-unescaped-entities, @next/next/no-html-link-for-pages.

---

# 9) Testing + CI reality

**Test frameworks and location:**

- **Unit:** Vitest (vitest 4.x, @vitejs/plugin-react, jsdom). Config: `vitest.config.ts` — environment jsdom, exclude node_modules/dist/tests, passWithNoTests: true, alias @ to repo root.
- **E2E:** Playwright (@playwright/test). Tests live under `tests/` (e.g. tests/example.spec.ts). No app-level _\.test.ts or _\.spec.ts files found under app/ or components/.

**CI workflows:**

- **.github/workflows/quality-gates.yml:** On PR to main/master. Steps: checkout, setup Node (lts), npm ci, npm run lint (ESLint), npm run build (Next.js), npm run test -- --run (Vitest).
- **.github/workflows/playwright.yml:** On push/PR to main/master. npm ci, npx playwright install --with-deps, npx playwright test; upload playwright-report artifact.

**Minimal recommended tests for new modules:**

- Based on current setup: add Vitest unit tests for pure logic (e.g. lib/validation, lib/board) if adding new behavior; add Playwright e2e under tests/ for critical user flows. Repo has passWithNoTests: true and one example.spec.ts; no mandated coverage level.

---

# 10) Sharp edges / foot-guns (top 12)

1. **Using createClient() from @/lib/supabase/client in a component** — Exposes anon key and bypasses server RLS. **Files:** Any under components/ or app/**/\*Client.tsx. **Convention:\*\* ESLint rule `clear-queue/no-client-supabase-in-components`; use server actions or server components with server client only.

2. **Putting the context cache provider inside [projectId] layout** — Cache would reset when leaving the project. **Files:** app/context/[projectId]/layout.tsx. **Convention:** Provider lives in app/context/layout.tsx (docs/patterns/context-session-cache.md).

3. **Forgetting onRefresh in a *FromCache → *Client** — Mutations won’t invalidate cache; stale data on next visit. **Files:** app/context/[projectId]/todos/ContextTodosFromCache.tsx was noted in audit as missing onRefresh to ContextTodosClient (may be fixed); any new tab must pass onRefresh. **Convention:** Every *FromCache that has mutations must pass onRefresh (or equivalent) to *Client.

4. **Using .select('\*')** — Overfetch and brittle API. **Files:** Any Supabase query. **Convention:** ESLint `clear-queue/no-select-star`; explicit column lists.

5. **Calling load*() after an *Action in the same handler** — Duplicates refresh logic and can desync. **Files:** Any client that calls server actions. **Convention:** ESLint `clear-queue/no-manual-refetch-after-action`; use returned data or onRefresh instead.

6. **Wrapping a mutation with cache()** — Mutation would be cached and not re-execute as expected. **Files:** app/actions/\*.ts. **Convention:** cache() only on read-only getters (docs/patterns/data-loading.md).

7. **Fetching initial page data in useEffect in a client** — Slower, spinners, no request dedup. **Files:** Any *Client or page client. **Convention:** Data loading pattern: fetch in server component or *FromCache on miss; pass as props (docs/patterns/data-loading.md).

8. **Relying on router.refresh() after mutations in context tabs** — Conflicts with session cache; full reload. **Files:** Context \*Client components. **Convention:** Use returned data or onRefresh(); no router.refresh() for context tab updates (.cursorrules, context-session-cache.md).

9. **Using alert() for mutation errors** — Inconsistent UX vs MutationErrorDialog. **Files:** e.g. ContextNotesClient (alert in docs), ContextBillingsClient (alert on save error). **Convention:** Prefer MutationErrorDialog (or same pattern) for retry/cancel UX.

10. **Multi-step writes without RPC** — Risk of partial success (e.g. insert then update; second fails). **Files:** Any new feature that does two dependent writes. **Convention:** Use RPC for atomic multi-step ops (docs reference RPC; templates in templates/).

11. **Forgetting revalidatePath after a mutation** — Other entry points (e.g. direct URL load) may see stale data. **Files:** All server actions that mutate. **Convention:** .cursorrules and server-actions.md: always revalidatePath (or revalidateTag) after mutations.

12. **Querying without scoping by owner_id or project_id** — Can leak or corrupt data across users/projects. **Files:** Any Supabase query in actions or lib. **Convention:** .cursorrules: always scope by project_id for task-like data and owner_id/user_id for user-owned data; RLS backs this but explicit scope is required in queries.

---

# 11) “How to add a new module” (as the repo is NOW)

1. **Routes:** Add under `app/` following existing structure. For a new **context tab:** add `app/context/[projectId]/<tab>/page.tsx` that calls `requireAuth()` and renders your \*FromCache component. For a non-context page (e.g. settings): add under app/<segment>/page.tsx and optional layout.

2. **Actions:** Place in `app/actions/<name>.ts` (shared) or next to the feature, e.g. `app/context/[projectId]/<tab>/actions.ts`. Use `'use server'`; `createClient()` from `@/lib/supabase/server`; `requireAuth()` first; explicit `.select(...)`; for reads used in multiple places wrap with `cache()`. After mutations call `revalidatePath(...)` and return `{ data?, error? }`.

3. **Domain logic:** Put in `lib/` (e.g. lib/validation, lib/<domain>) if shared or complex; keep simple validation inline in actions.

4. **Caching:** For a **new context tab:** Add a cache key type in `app/context/ContextDataCache.tsx` (e.g. `type: 'mymodule', projectId`). Create `ContextMymoduleFromCache.tsx` that uses useContextDataCache(), get/set/invalidate that key, shows a Skeleton on miss, fetches via server action, then renders `ContextMymoduleClient` with initialData and `onRefresh={loadData}`. Ensure provider remains in `app/context/layout.tsx` (not under [projectId]).

5. **Navigation:** If it’s a context tab, add the tab to the TABS array in `components/context/ContextTabBar.tsx` (slug, labelKey, icon) and add the route under `app/context/[projectId]/<slug>/`.

6. **Migration/RPC:** If you need a new table or RPC: add a migration under `supabase/migrations/` with timestamp or sequential name; define RLS (owner*id or project join); use `update_updated_at_column()` and trigger `update*<table>\_updated_at` for updated_at. For multi-step writes, add an RPC and call it from the action instead of multiple client-side writes.

7. **Tests:** Add Vitest tests for lib/ or pure logic; add or extend Playwright e2e under `tests/` for critical flows. Run `npm run lint`, `npm run build`, `npm run test -- --run` (and Playwright if applicable) before merge.

8. **i18n:** Add keys to `locales/en.json` and `locales/es.json`; use `useI18n().t(key)` in client components. Ensure I18nProvider is in the layout that wraps your UI (root layout or context).

9. **Error handling:** For mutation errors in a client, prefer the same pattern as ContextBoardClient: state for error dialog, callbacks (onTryAgain, onCancel), render MutationErrorDialog (or equivalent) instead of alert().

10. **Loading state:** Use a shimmer skeleton (e.g. duplicate SkeletonNotes pattern or add SkeletonMymodule) for cache miss; do not use spinners or “Loading…” text (per .cursorrules).
