# Context Navigation — Design & Implementation Plan

**Status:** Design (pre-implementation)  
**Goal:** Add a second way to navigate the app — **by project context** (project-first + tab bar) — without changing or removing the existing sidebar navigation. Once the new flow is stable, we can remove the sidebar path.

---

## 1. Current vs desired behavior

### Current (module-first / sidebar)

- User opens **sidebar** → picks a **module** (Dashboard, Projects, Ideas, Todo, Budgets, Clients, Notes, etc.).
- To work on a project: go to **Projects** → open a project → see Kanban (and optionally a resources panel that links out to Notes/Budgets/etc.).
- To see **project notes**: leave project, go to **Notes** module, then filter by project (or use resources panel links).
- Same for budgets, ideas, to-dos, client, business: each is a **module**; user must switch module and then find the project-related item.

### Desired (context-first / tab bar)

- **Home = Projects.** User picks the project they want to work on.
- After choosing a project, user enters **project context**: one project is “focused”; navigation is a **tab bar** (no sidebar in this mode).
- Tabs: **Board (Kanban)** | **Project owner** (client + business in one tab) | **Notes** | **Ideas** | **Budgets** | **To-dos**.
- Each tab shows **only** that project’s data:
  - **Project owner**: client and business linked to the project (`project.client_id`, `project.business_id`) in one section — or empty state to link them.
  - **Notes**: notes where `project_id = current project`.
  - **Ideas**: idea boards/ideas linked to this project.
  - **Budgets**: budgets where `project_id = current project`.
  - **To-dos**: todo lists where `project_id = current project`.
- All existing **views** (note list/detail, budget detail, client detail, etc.) are **reused**; only the **navigation and data scope** change.

---

## 2. Separation rule: two parallel navigation paths

- **Do not modify** existing sidebar routes or layout for this feature. Sidebar flow stays as-is.
- **Add** a new route tree and layout that implement context navigation.
- **Reuse** server actions and UI components (lists, detail views, modals) where possible; new code only for:
  - New routes and layout (context shell + tab bar).
  - Project-scoped data loading for each tab (often existing actions with `projectId`).
- When the new flow is validated, we can **remove** the sidebar path in a later phase (not in this plan).

---

## 3. Route structure (new only)

All new routes live under a single prefix so they are easy to isolate and later swap as the “default” or remove the old path.

Suggested prefix: **`/context`** (alternatives: `/workspace`, `/project-view`).

```
/context                          → Project picker (list of projects; “home” for context mode)
/context/[projectId]              → Redirect to default tab, e.g. /context/[projectId]/board
/context/[projectId]/board         → Kanban (ContextBoardClient + KanbanBoard; vista principal del proyecto)
/context/[projectId]/owner        → Project owner: client + business for this project (one tab, reuse client/business detail or summary)
/context/[projectId]/notes        → Notes for this project only (reuse notes list + detail)
/context/[projectId]/notes/[noteId]  → Note detail (reuse)
/context/[projectId]/ideas        → Idea boards/ideas for this project (reuse ideas views)
/context/[projectId]/budgets      → Budgets for this project only (reuse budget list + detail)
/context/[projectId]/budgets/[budgetId]  → Budget detail (reuse)
/context/[projectId]/todos        → Todo lists for this project (reuse todo views)
```

- **Entry:** Sidebar and all project links now go to `/context/[projectId]/board`. The route `/project/[id]` redirects to `/context/[id]/board`.
- **Exit context:** Tab or header action “All projects” → `/context`; optional “Back to app” → `/dashboard` or `/projects` (sidebar flow).

---

## 4. Layout and shell (new components only)

- **Context layout** (`app/context/layout.tsx` or nested under `app/context/[projectId]/layout.tsx`):
  - No sidebar.
  - Header: project name + “All projects” (→ `/context`) + optional “Back to app” (→ `/dashboard`).
  - **Tab bar** (only when `[projectId]` is set): horizontal tabs for Board | Project owner | Notes | Ideas | Budgets | To-dos. Active tab from URL.
- **New components (isolated):**
  - `ContextShell` or `ContextLayoutClient`: header + tab bar + `children`.
  - `ContextTabBar`: tabs linking to `/context/[projectId]/board`, `.../owner`, `.../notes`, etc.
- Reuse: `GlobalHeader` only if it can accept a “no sidebar” mode and custom title/actions; otherwise a small variant or new header for context.

---

## 5. Data loading (follow existing patterns)

- **docs/patterns/data-loading.md:** Fetch in Server Components (page.tsx), pass to client as props; wrap read-only actions with `cache()`.
- **docs/patterns/database-queries.md:** Explicit column lists, scope by `project_id` (and `owner_id` / RLS) as applicable.
- **docs/patterns/server-actions.md:** Use existing actions where they accept `projectId`; add thin wrappers or new cached read actions only when needed (e.g. “project + client + business for context header”).

Per tab:

- **Board:** Reuse `getProjectById`, `getTasksByProjectId` (and any existing project-scoped task actions).
- **Project owner (one tab):** `getProjectById` → `client_id`, `business_id`; if set, fetch client and business with existing actions. One view shows both; empty state to link in project settings.
- **Notes:** Existing `getNotes({ projectId })` — already project-scoped.
- **Ideas:** Use existing idea/board actions filtered by `project_id` or idea_project_links.
- **Budgets:** Existing budget list action filtered by `project_id` (or new cached `getBudgetsByProjectId`).
- **To-dos:** Existing todo list actions filtered by `project_id`.

No duplication of mutation logic: keep using the same server actions (create note, update budget, etc.); only the **pages** that call them are new (context pages).

---

## 6. Reuse strategy for views

- **Board:** `ContextBoardClient` uses `KanbanBoard` (no sidebar, no ProjectResourcesPanel). Optimistic updates and error dialog live in this view.
- **Notes:** Reuse notes list UI and note detail UI; context notes page gets `initialNotes` from `getNotes({ projectId })` and renders the same list/detail components. Links stay under `/context/[projectId]/notes` and `/context/[projectId]/notes/[noteId]`.
- **Budgets:** Same: reuse list + `BudgetDetailClient`; data from project-scoped budget fetch; URLs under `/context/[projectId]/budgets`.
- **Project owner:** One tab showing both client and business. Reuse `ClientDetailClient` / `BusinessDetailClient` (or read-only summaries) with ids from `project.client_id` / `project.business_id`. If neither linked, show empty state “Link a client/business in project settings”.
- **Ideas:** Reuse existing idea/board components; filter by project (and optional sub-routes under `/context/[projectId]/ideas/...`).
- **To-dos:** Reuse todo list/board components; filter by `project_id`.

Where a view today expects “sidebar + full module list”, we pass “project-scoped data only” and hide or replace the sidebar (e.g. via a prop like `contextMode={true}` or a separate wrapper component).

---

## 7. Implementation order (phases)

1. **Phase 1 — Routes and shell (no sidebar)**
   - Add `app/context/page.tsx` → project picker (reuse projects list UI or a slim version).
   - Add `app/context/[projectId]/layout.tsx` (server layout) + client layout that renders `ContextShell` (header + tab bar).
   - Add stub tabs: Board, Project owner, Notes, Ideas, Budgets, To-dos (pages can be “Coming soon” or minimal).
   - Ensure “All projects” and optional “Back to app” work. No changes to existing sidebar or existing routes.

2. **Phase 2 — Board tab** ✅
   - Implement `/context/[projectId]/board` using existing Kanban/board components (no sidebar, no resources panel, or panel that uses tab bar links).
   - Data: existing `getProjectById`, `getTasksByProjectId`. Follow data-loading pattern (server fetch, pass as props).
   - Task mutations revalidate `/context` so the context board stays in sync.

3. **Phase 3 — Notes tab** ✅
   - Implement `/context/[projectId]/notes` and `/context/[projectId]/notes/[noteId]` using existing notes list and detail; data from `getNotes({ projectId })`, `getNoteById`. Revalidate on mutations per server-actions pattern.
   - Added `/context/[projectId]/notes/new`; NoteEditor supports optional `listHref` / `getDetailHref` for context redirects. Notes actions revalidate `/context`.

4. **Phase 4 — Budgets tab** ✅
   - Implement `/context/[projectId]/budgets` and `/context/[projectId]/budgets/[budgetId]` with project-scoped budget list and existing `BudgetDetailClient`.
   - Added `getBudgetsByProjectId`, `getBudgetProjectId`; `BudgetDetailClient` accepts `backHref`, `BudgetCard` accepts `getDetailHref`, `CreateBudgetModal` accepts `defaultProjectId`. All budget mutations revalidate `/context`.

5. **Phase 5 — Project owner tab** ✅
   - Implement single “Project owner” tab: load project → if `client_id`/`business_id` present, load client and business and render both in one view (reuse detail/summary components); else empty state with link to project settings.

6. **Phase 6 — Ideas and To-dos tabs** ✅
   - Wire ideas and todo list views under `/context/[projectId]/ideas` and `/context/[projectId]/todos` with project-scoped data; reuse existing components.
   - **Ideas:** `listBoardsByProjectId(projectId)` in lib/idea-graph/boards; context ideas page loads boards for project + listIdeas + listProjectsForPicker; ContextIdeasClient renders IdeasDashboardClient (project-scoped boards only). All idea/board mutations revalidate `/context`.
   - **To-dos:** Context todos page uses `getProjectTodoBoardAction(projectId)`; ContextTodosClient uses useProjectTodoBoard and same task list UI as project todo board (no sidebar/topbar). All todo mutations revalidate `/context`.

7. **Phase 7 — Entry points and cleanup**
   - Add “Open in context view” (or “Focus project”) from projects list and/or from `/project/[id]` → navigate to `/context/[projectId]`.
   - Optional: feature flag or user preference to default to context flow. No deletion of sidebar code in this phase.

---

## 8. Files to add (summary)

- **Routes:** `app/context/page.tsx`, `app/context/[projectId]/layout.tsx`, `app/context/[projectId]/board/page.tsx`, `app/context/[projectId]/owner/page.tsx`, `app/context/[projectId]/notes/page.tsx`, `app/context/[projectId]/notes/[noteId]/page.tsx`, `app/context/[projectId]/ideas/page.tsx`, `app/context/[projectId]/budgets/page.tsx`, `app/context/[projectId]/budgets/[budgetId]/page.tsx`, `app/context/[projectId]/todos/page.tsx` (and any nested idea/todo routes as needed).
- **New components:** `ContextShell` (or `ContextLayoutClient`), `ContextTabBar`, optional `ContextProjectPicker` if different from projects list.
- **Optional:** Thin server actions or cached getters for “project + client + business for context” if not already covered by `getProjectById` + one client/business fetch.

---

## 9. Files not to change (until later)

- All existing `app/dashboard`, `app/projects`, `app/notes`, `app/budgets`, `app/clients`, `app/businesses`, `app/ideas`, `app/todo` routes and their page clients.
- `components/Sidebar.tsx`, `components/AppShell.tsx` (unchanged).
- Existing server actions (only add new ones or thin wrappers if needed).

---

## 10. Success criteria

- User can go to `/context`, pick a project, and use only the tab bar to switch between Board, Client, Business, Notes, Ideas, Budgets, To-dos — all scoped to that project.
- No regression in existing sidebar navigation.
- Data loading follows project rules (server fetch, cache for reads, revalidate after mutations).
- When we are ready, we can remove the sidebar path without touching the context route tree (except possibly making `/context` the default home and redirecting `/dashboard` or `/projects` to it).

---

## 11. Open decisions

- **URL prefix:** Confirm `/context` vs `/workspace` vs other.
- **Default tab:** Board vs Overview (summary) when entering a project.
- **Empty states:** Copy and links for “No client linked”, “No budgets”, etc., and whether to link to “Edit project” (sidebar flow) or a future in-context project edit.
- **i18n:** New keys for “Context”, “All projects”, tab labels in context (can reuse sidebar labels initially).

If this plan is confirmed, the next step is Phase 1 (routes + context layout + tab bar, no sidebar).
