# Navigation Refactor Plan: Project-Context Navigation

## Current navigation map (as implemented today)

### Global shell + sidebar

- `components/AppShell.tsx` composes `GlobalHeader` + overlay `Sidebar` + page content.
- `components/Sidebar.tsx` is the primary module switcher (`/dashboard`, `/projects`, `/ideas`, `/todo`, `/budgets`, `/clients`, `/businesses`, `/billings`, `/notes`, `/profile`, `/settings/...`).
- Many module pages mount `AppShell` and therefore depend on sidebar for module changes.

### Project entry + current project detail

- Projects list: `app/projects/page.tsx` -> `app/projects/ProjectsPageClient.tsx`.
- Clicking a project card routes to `/project/[id]`.
- Current `/project/[id]` renders task/kanban view directly (`app/project/[id]/page.tsx` -> `components/ProjectKanbanClient.tsx`).
- `ProjectKanbanClient` currently includes `TopBar` and still coexists with sidebar-driven global module navigation.

### Existing module routes relevant to project context

- Tasks (project-specific today): `/project/[id]`.
- Todo project board: `/todo/project/[projectId]`.
- Budgets: `/budgets` and detail `/budgets/[id]`.
- Ideas: `/ideas`, `/ideas/boards`, `/ideas/boards/[id]`.
- Notes: `/notes`, `/notes/[id]`, `/notes/new` (supports `projectId` filtering/selection).
- CRM-like modules: `/clients`, `/clients/[id]`, `/businesses`, `/businesses/[id]`.

## Target navigation map

### New project-scoped hierarchy

- `app/project/[id]/layout.tsx`
  - Persistent **Project Context Header**:
    - Back: `← Todos los proyectos` (to `/projects`)
    - Project name in center/primary title area
    - Existing right-side actions where available (edit)
  - Persistent **Context Tabs**:
    - `Overview` -> `/project/[id]`
    - `Tasks` -> `/project/[id]/tasks`
    - `Budget` -> `/project/[id]/budget`
    - `Ideas` -> `/project/[id]/ideas`
    - `CRM` -> `/project/[id]/crm`
    - `Notes` -> `/project/[id]/notes`
    - `Files` -> `/project/[id]/files`
- Sidebar remains available for global navigation elsewhere, but not required for in-project module switching.

### Route responsibility after refactor

- `/project/[id]`: project overview landing.
- `/project/[id]/tasks`: existing kanban task experience reused.
- Other tabs: project-scoped views with data filtered to current `project_id` where applicable.

## Step-by-step implementation plan (with checkpoints)

1. **Create project context primitives**
   - Add reusable header/tabs component(s) for project context nav.
   - Add `app/project/[id]/layout.tsx` that loads project + renders header/tabs + child content.
   - Checkpoint: typecheck/lint.

2. **Re-scope tasks route**
   - Move current kanban view from `/project/[id]` to `/project/[id]/tasks`.
   - Keep `ProjectKanbanClient` functionality intact; only remove duplicated top header when rendered inside project layout.
   - Checkpoint: typecheck/lint/build.

3. **Implement project-scoped tab pages**
   - Build `/project/[id]` overview page.
   - Build `/project/[id]/budget`, `/ideas`, `/crm`, `/notes`, `/files` pages using existing data/actions and filtered project context.
   - Keep business logic unchanged; only compose and filter at route layer.
   - Checkpoint: typecheck/lint/build.

4. **Regression hardening**
   - Validate auth guards, existing server actions, and links/back nav.
   - Update QA checklist doc with explicit manual checks.
   - Final checkpoint: typecheck/lint/build all green.
