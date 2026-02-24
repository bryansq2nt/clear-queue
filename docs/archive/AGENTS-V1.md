# AGENTS.md — ClearQueue Engineering Governance

This file is the short, non-negotiable contract for humans and AI agents working in ClearQueue.
Long-form implementation details live in:

- docs/engineering/CONVENTIONS.md
- docs/engineering/CURSOR_RULES.md

## Core principles (invariants)

### Layering (dependency direction)

UI → Application → Domain → Infrastructure

- UI must not contain business rules.
- Application coordinates use-cases (server actions).
- Domain expresses business logic and reusable rules.
- Infrastructure is DB/SDK/platform plumbing (Supabase, Next.js, Sentry, etc.).
  Dependencies must point inward only.

### Project-scoped isolation

Every “context” operation is project-scoped. No cross-project reads/writes.

### Atomicity by default

Any multi-step write must be atomic at the database boundary (RPC) or a single SQL statement. No partial state.

### Cache correctness > cache cleverness

Caching is allowed only when it cannot create stale or inconsistent UX. Invalidation is explicit and centralized.

### Security is defense in depth

RLS is the final guard, but application queries must still scope by owner/project and validate inputs.

## Repo map (what lives where)

- app/
  - context/ (project context tabs + context session cache provider)
  - actions/ (shared server actions)
  - profile/, settings/, api/ (non-context routes)
- components/ (reusable UI only)
- lib/ (domain logic, validation, auth helpers, Supabase client factories)
- supabase/migrations/ (schema + RLS + RPCs)
- tests/ (Playwright E2E)

Reference implementations:

- Context cache provider: app/context/layout.tsx
- Context cache keys: app/context/ContextDataCache.tsx
- Notes tab wrapper: app/context/[projectId]/notes/ContextNotesFromCache.tsx
- Server actions style: app/actions/notes.ts, app/actions/tasks.ts
- Tab definitions: components/context/ContextTabBar.tsx
- Mutation error standard: components/board/MutationErrorDialog.tsx

## Non-negotiable rules

### Data access and security

- Never use the browser Supabase client from components/ or app/\**/*Client.tsx.
- All authenticated mutations and sensitive reads happen via server actions using lib/supabase/server.ts.
- Every server action starts with: const user = await requireAuth();
- Every query is scoped:
  - user-owned tables: owner_id/user_id
  - project-scoped tables: project_id + ownership constraints
- Never rely on RLS as a _filter_. Always add explicit filters in queries.

### Queries (performance + N+1 prevention)

- No per-row DB calls in loops. If you need related data:
  - fetch via joins/nesting in a single query, or
  - create a view, or
  - create an RPC that returns a table shape.
- Always select explicit columns (never select '\*').
- Always paginate list endpoints when results can grow.

### Mutations

- Single-table writes can be single insert/update/delete.
- Multi-step writes must be implemented as an atomic RPC (\*\_atomic).
- After any successful mutation, call revalidation (revalidatePath and/or revalidateTag) for the affected routes.

### Caching

- React cache() is for pure reads only.
- Never wrap a mutation in cache().
- Context tabs must follow the pattern:
  ContextXFromCache → ContextXClient (props: initialData + onRefresh)
- Do not use router.refresh() as the primary way to update context tab UX.

### UI/UX consistency

- Loading states use skeletons (components/skeletons/\*). Avoid spinners or "Loading..." text.
- Mutation errors use the standard dialog pattern (MutationErrorDialog) with retry/cancel.
- User-facing strings go through i18n (lib/i18n.ts + I18nProvider + locales/\*.json).

### Testing (minimum bar)

- Domain logic change (lib/\*\*): add or update a Vitest test.
- New module/tab: add at least one Playwright happy-path E2E test.

## Definition of Done (DoD)

A change is done only when:

- Architecture: follows layering rules; no parallel patterns introduced
- Security: auth + scoping + RLS alignment verified
- Performance: no N+1 introduced; queries are paginated where needed; indexes considered
- Correctness: caching/invalidation is correct; atomicity preserved
- Tests: appropriate Vitest/Playwright tests added/updated
- CI: npm run lint, npm run build, npm run test -- --run pass

## When unsure

Do not guess.
Write a short audit note under docs/audits/ explaining:

- the uncertainty
- files examined
- the minimal safe next step
