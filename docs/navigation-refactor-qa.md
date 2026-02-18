# Navigation Refactor QA Checklist

## Pages to test

1. Project entry
   - `/projects`
   - Click a project card -> `/project/[id]` (Overview)

2. Project context tabs
   - `/project/[id]`
   - `/project/[id]/tasks`
   - `/project/[id]/budget`
   - `/project/[id]/ideas`
   - `/project/[id]/crm`
   - `/project/[id]/notes`
   - `/project/[id]/files`

3. Back navigation
   - From any project tab, use `← Todos los proyectos` and confirm return to `/projects`.

## Visual invariants (should remain unchanged)

- Dark theme colors/tokens remain consistent (`bg-background`, `bg-card`, `border-border`, typography scale).
- Existing spacing rhythm and card patterns remain consistent with current app style.
- Module content (kanban, lists, links) should preserve existing interaction behavior.

## Regression checks

### Auth / route guards

- Unauthenticated user must still be blocked by existing `requireAuth` checks on project routes.
- Existing authenticated flows to global modules still function.

### Data scope + RLS assumptions

- Project tab pages should only show project-related data where module is project-scoped:
  - Tasks by `project_id`
  - Notes by `project_id`
  - Budgets filtered to `project_id`
  - Idea boards filtered to `project_id`
  - CRM links based on project `client_id` / `business_id`
- No schema changes or policy changes required.

### Server actions / business logic

- Task operations in `/project/[id]/tasks` still use existing server actions.
- Existing edit-project action/modal from header should still submit successfully.
- Existing global module routes (`/ideas`, `/budgets`, `/notes`, etc.) remain available and unaffected.

## Build-time verification

- `npm run typecheck`
- `npm run lint`
- `npm run build`
