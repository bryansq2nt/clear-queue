# CONVENTIONS.md — ClearQueue Engineering Conventions

This document defines the “one right way” to add modules/features in ClearQueue.

## Layering model (official)

UI → Application → Domain → Infrastructure

### UI layer

- app/**/page.tsx and app/**/layout.tsx (composition only)
- components/\*\* (reusable UI; no DB access)
  Responsibilities:
- render state
- collect user input
- call server actions
- optimistic UI (visual), but not business truth

### Application layer (server actions)

- app/actions/\*.ts
- feature-local app/context/[projectId]/<tab>/actions.ts when needed
  Responsibilities:
- authenticate (requireAuth)
- validate inputs
- enforce query scoping (owner/project)
- call domain functions and DB/RPC
- revalidate caches (revalidatePath/revalidateTag)
- return typed action results

### Domain layer

- lib/** (e.g. lib/todo/**, lib/idea-graph/**, lib/validation/**, lib/kanban/\*\*)
  Responsibilities:
- business rules
- transformations (DB rows → view models)
- reusable validation helpers

### Infrastructure layer

- lib/supabase/server.ts, lib/supabase/types.ts, supabase/migrations/\*\*
- monitoring (Sentry)
  Responsibilities:
- persistence, RPC, RLS, indexes
- environment and platform concerns

## Folder structure (repo-specific)

- app/context/
  - layout.tsx: ContextDataCacheProvider (must stay here)
  - ContextDataCache.tsx: cache key union + helpers
  - [projectId]/
    - layout.tsx: auth guard + ContextLayoutWrapper
    - <tab>/
      - page.tsx: requireAuth + Context<Tab>FromCache
      - Context<Tab>FromCache.tsx
      - Context<Tab>Client.tsx
- app/actions/: shared server actions (tasks, notes, projects, budgets, billings, clients)
- components/context/: ContextShell, ContextTabBar
- components/board/: KanbanBoard, MutationErrorDialog, modals
- components/skeletons/: Skeleton\* loading components
- lib/validation/: shared validators
- supabase/migrations/: schema, RLS, RPC

## Naming (official)

### Server actions (exported)

Verb-first, no `Action` suffix.

Reads:

- get\* (single or filtered list)
- list\* (lists)

Writes:

- create*, update*, delete*, move*, toggle*, duplicate*, archive*, unarchive*

File names:

- app/actions/<domain>.ts preferred (e.g. tasks.ts, notes.ts)
- feature-local actions.ts allowed for context tabs (e.g. app/context/[projectId]/links/actions.ts)

### Context tab components

- Context<Tab>FromCache.tsx
- Context<Tab>Client.tsx

### Cache keys

Defined only in app/context/ContextDataCache.tsx.
Adding a new tab requires adding a new CacheKey type entry.

### RPCs

snake_case.
Multi-step writes use \_atomic suffix:

- create_task_atomic
- move_task_atomic
- duplicate_budget_atomic
- create_todo_item_atomic
- toggle_todo_item_atomic

## Query patterns (repo-specific)

### Standard read (server action)

Rules:

- requireAuth first
- explicit select columns (never '\*')
- scope by owner_id/user_id and/or project_id
- wrap in React cache() only if pure read and benefits from deduplication

Example outline (based on app/actions/notes.ts):

- getNotes({ projectId? }) → notes list ordered by updated_at desc, scoped by owner_id (+ optional project_id).

### Standard write (server action)

Rules:

- requireAuth first
- validate inputs (prefer lib/validation for reusable rules)
- single insert/update/delete when possible
- return { data?, error? } (typed)
- after success, revalidate affected routes (revalidatePath/revalidateTag)

Example outline:

- createNote({ projectId, title, content }) → insert + select explicit cols + revalidate context paths.

### Atomic multi-step write (RPC)

Rules:

- if step 2 can fail, you must use an RPC
- RPC should handle ordering/consistency inside the DB transaction
- server action calls supabase.rpc('name', { ... })

Example:

- createTask → supabase.rpc('create_task_atomic', {...})
- moveTaskOrder → supabase.rpc('move_task_atomic', {...})

### Preventing N+1 (enterprise rule)

Banned:

- for each item in a list, calling another DB action to fetch related data

Required alternatives:

- use join/nesting select to fetch related data in one query
- create a view for a read model
- create an RPC returning a table type for complex reads

Query budget guidelines (soft limits):

- Context tab initial load: ≤ 3 DB round trips
- Tab refresh: ≤ 3 DB round trips
- Detail pages: ≤ 2 DB round trips

## Caching conventions

### Server memoization (React cache)

- Only for pure reads used multiple times during a server render.
- Never used for writes or reads with side effects.

### Context session cache

- Provider must remain in app/context/layout.tsx
- \*FromCache wrappers must:
  - cache.get(key) → render immediately if hit
  - on miss: show Skeleton\*, fetch data, cache.set(key, data), render
  - expose onRefresh: invalidate key → refetch → cache.set → setState

### Revalidation

- After server mutations, use:
  - revalidatePath for path-based invalidation
  - revalidateTag for tag-based invalidation (when you adopt tagging)
- Context tabs rely on onRefresh for immediate UX, but revalidation keeps other entry points consistent.

## Error handling

Standard mutation errors:

- Use components/board/MutationErrorDialog.tsx pattern
- Provide Retry and Cancel
- No alert() for core module mutations

Use Next.js error boundaries for unexpected errors:

- segment-level error.tsx where needed
- app/global-error.tsx as last resort

## i18n

- All user-facing strings go in locales/en.json and locales/es.json
- Client components use useI18n() from components/shared/I18nProvider.tsx
- Currency formatting uses formatCurrency from provider

## Database conventions (Supabase/Postgres)

### Migrations

- One logical change per migration file.
- Filename standard going forward:
  YYYYMMDDHHMMSS_short_description.sql
- Every new table must ship with:
  - RLS enabled + policies
  - indexes matching query patterns
  - updated_at trigger if updated_at exists

### RLS

- Must exist for all user/project data.
- Policy shape:
  - owner tables: owner_id = auth.uid()
  - project scope: join to projects and check ownership
- Even with RLS, application queries must add explicit filters.

### Functions/RPC

- Prefer SECURITY INVOKER (default).
- If SECURITY DEFINER is required, set a safe search_path and schema-qualify objects.

## Module blueprint (how to add new work)

### Add a new context tab

Checklist:

1. Add route folder:
   app/context/[projectId]/<tab>/
   page.tsx (requireAuth + <ContextTabFromCache />)
   Context<Tab>FromCache.tsx
   Context<Tab>Client.tsx
2. Add cache key in app/context/ContextDataCache.tsx:
   - extend CacheKey union with type: '<tab>'
3. FromCache implementation:
   - cache.get(key) fast path
   - Skeleton on miss
   - fetch with server action
   - cache.set(key, data)
   - pass onRefresh to Client
4. Add tab entry in components/context/ContextTabBar.tsx (slug + label key)
5. Define server actions:
   - app/actions/<domain>.ts preferred, or feature-local actions.ts
   - requireAuth first, validate, scoped query, explicit selects
   - atomic RPC for multi-step writes
6. Add tests:
   - 1 Vitest test if domain logic in lib/\*\*
   - 1 Playwright happy-path E2E

### Add a non-context page

- Create app/<segment>/page.tsx + \*PageClient.tsx
- Fetch initial data on server, pass as props
- Follow the same actions/domain split

## Testing strategy (repo-specific)

### Vitest template (domain)

- Tests for lib/validation/\*\* and any pure domain rules.

Template:

- Place tests near code (e.g. lib/validation/colors.test.ts)
- Use deterministic inputs and no network.

### Playwright template (E2E)

- One happy-path per module/tab.
- Use stable selectors:
  - add data-testid attributes to critical interactive elements
- Avoid brittle text-only selectors when i18n is present.

## Auditability and documentation

- Architecture audits live in docs/audits/
- Reports live in docs/reports/
- Every significant refactor requires:
  - a short audit note
  - a rollback plan (if DB involved)
