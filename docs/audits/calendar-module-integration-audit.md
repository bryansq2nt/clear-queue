# Calendar Module Integration Audit (Read-only)

**Date:** 2026-02-28  
**Scope:** Date/time concepts, modules, architecture insertion points, and risks for a future Calendar module. No implementation.

---

## A) System Map

### Modules and primary routes

| Module       | Route(s)                                                  | Primary page / data source                                  |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| Context home | `/context`                                                | `app/context/page.tsx` — project picker                     |
| Board        | `/context/[projectId]/board`                              | `ContextBoardFromCache` → tasks by project                  |
| Owner        | `/context/[projectId]/owner`                              | `ContextOwnerFromCache` — project, client, business         |
| Documents    | `/context/[projectId]/documents`                          | `ContextDocumentsFromCache` — project_files                 |
| Notes        | `/context/[projectId]/notes`                              | `ContextNotesFromCache` — notes                             |
| Links        | `/context/[projectId]/links`                              | `ContextLinksFromCache` — project_links                     |
| Ideas        | `/context/[projectId]/ideas`, `.../ideas/board/[boardId]` | Ideas, idea_boards, idea_board_items                        |
| Budgets      | `/context/[projectId]/budgets`, `.../budgets/[budgetId]`  | Budgets, budget_items, budget_categories                    |
| Billings     | `/context/[projectId]/billings`                           | `ContextBillingsFromCache` — billings by project            |
| Todos        | `/context/[projectId]/todos`                              | Todo board (tab currently commented out in `ContextTabBar`) |

Other routes: `/`, `/profile`, `/settings`, `/signup`, `/forgot-password`, `/reset-password`, `/api/*`.

### Where “active context” is determined

- **Project context:** URL param `[projectId]` from `app/context/[projectId]/layout.tsx`. Layout calls `requireAuth()` and wraps children with `ContextLayoutWrapper` passing `projectId`. All context tabs are under `/context/[projectId]/...`.
- **Cache:** `ContextDataCacheProvider` lives in `app/context/layout.tsx` (parent of `[projectId]`), so cache persists when switching projects. Cache keys are project-scoped (e.g. `{ type: 'board', projectId }`, `{ type: 'billings', projectId }`) plus `noteDetail` by `noteId`. See `app/context/ContextDataCache.tsx`.
- **Project list / picker:** `ContextProjectPicker` in `ContextShell`; initial projects from server (e.g. home or context page). No separate “client id” or “business id” as top-level context — client/business are project attributes (project has `client_id`, `business_id`).
- **Ownership:** Tasks and project-scoped data are accessed via project ownership (RLS). Billings and todo lists are owner-scoped (`owner_id`); billings also have optional `project_id` and `client_id`.

---

## B) Date/Time Inventory

| Entity / table                               | Time-related fields                                                       | Who writes it                                                                                       | Who reads it                                                                     | RLS / policy notes                                                                           | Indexes / gaps                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tasks**                                    | `due_date` (DATE), `created_at`, `updated_at`                             | `app/actions/tasks.ts`: `createTask` (RPC `create_task_atomic`), `updateTask`                       | `ContextBoardClient`, `KanbanBoard`, `TaskCard`, `EditTaskModal`, `AddTaskModal` | RLS: “Users can select/insert/update/delete tasks in own projects” (via `projects.owner_id`) | `idx_tasks_project_id`, `idx_tasks_status`, `idx_tasks_order_index`, `idx_tasks_project_status_order`. **No index on `due_date`** (or `(project_id, due_date)`). |
| **billings**                                 | `due_date` (date), `paid_at` (timestamptz), `created_at`, `updated_at`    | `app/actions/billings.ts`: `createBilling`, `updateBilling`, `updateBillingStatus` (sets `paid_at`) | `ContextBillingsClient`                                                          | RLS: all policies scoped by `owner_id`                                                       | `idx_billings_due_date`, `idx_billings_owner_id`, `idx_billings_project_id`, etc.                                                                                |
| **todo_items**                               | `due_date` (date), `created_at`, `updated_at`                             | `app/actions/todo.ts` → `lib/todo/lists.ts`: `createTodoItemAtomic`, `updateTodoItem`               | Todo board UI (`useProjectTodoBoard`, project todo views)                        | RLS: `owner_id` on `todo_items`; list must belong to owner                                   | `idx_todo_items_list`, `idx_todo_items_owner`. **No index on `due_date`** (or `(owner_id, due_date)`).                                                           |
| **todo_lists**                               | `created_at`, `updated_at`                                                | Server actions in `app/actions/todo.ts`                                                             | Todo module                                                                      | RLS: `owner_id`                                                                              | `idx_todo_lists_owner`, `idx_todo_lists_project`.                                                                                                                |
| **project_access**                           | `last_accessed_at` (timestamptz)                                          | Updated when user opens a project (project picker / context)                                        | Used for “recently opened” sorting                                               | RLS: `user_id = auth.uid()`                                                                  | `idx_project_access_user_id`.                                                                                                                                    |
| **notes**                                    | `last_opened_at`, `created_at`, `updated_at`                              | `app/actions/notes.ts`: `updateNoteLastOpenedAt`, updateNote                                        | `ContextNotesClient`, sorting                                                    | RLS: via `owner_id` (notes)                                                                  | `idx_notes_project_folder_updated`, `idx_notes_last_opened`.                                                                                                     |
| **project_files**                            | `last_opened_at`, `created_at`, `updated_at`, `archived_at`, `deleted_at` | `app/actions/documents.ts`: upload, update, archive, delete, view route                             | `ContextDocumentsClient`, `DocumentRow`                                          | RLS: `owner_id`                                                                              | Indexes on `project_id`, `last_opened_at`, etc.                                                                                                                  |
| **profiles**                                 | `timezone`, `created_at`, `updated_at`                                    | Profile actions; timezone from `lib/validation/profile.ts` (`validateTimezone`)                     | `I18nProvider`, profile/settings UIs                                             | RLS: own profile only                                                                        | N/A (single row per user).                                                                                                                                       |
| **user_preferences**                         | `created_at`, `updated_at`                                                | Settings / appearance                                                                               | Theme, currency, locale                                                          | RLS: own preferences                                                                         | N/A.                                                                                                                                                             |
| **budgets, budget_items, budget_categories** | `created_at`, `updated_at` only (no due/milestone)                        | `app/actions/budgets.ts`, `app/actions/budget-detail.ts`                                            | Budget list and detail                                                           | RLS: `owner_id` on budgets                                                                   | Various.                                                                                                                                                         |
| **ideas, idea_boards, idea_board_items**     | `created_at`, `updated_at` only                                           | Idea actions, idea-boards                                                                           | Ideas UI                                                                         | RLS: `owner_id`                                                                              | Various.                                                                                                                                                         |
| **clients, businesses**                      | `created_at`, `updated_at`                                                | `app/actions/clients.ts`, businesses                                                                | Owner, project header                                                            | RLS: `owner_id`                                                                              | N/A.                                                                                                                                                             |

**Summary:** The only **user-facing date/time fields** that are natural “calendar” inputs are:

- **tasks.due_date** (date only; no time)
- **billings.due_date** (date) and **billings.paid_at** (timestamptz)
- **todo_items.due_date** (date only)

There are **no** dedicated “reminder”, “milestone”, “meeting”, or “inspection date” fields in the current schema. `last_opened_at` / `last_accessed_at` are for UX (recent items), not scheduling.

---

## C) Workflow Touchpoints

### Workflows that should generate or surface calendar items

1. **Task due dates** — Board tasks with `due_date`; create/edit in `AddTaskModal`, `EditTaskModal`; display on `TaskCard` (including overdue styling). Source: `tasks` table.
2. **Billing due and paid** — Billings have `due_date` and `paid_at`; create/edit in `ContextBillingsClient`; list and filter by status (overdue is auto-set by DB trigger). Source: `billings` table.
3. **Todo item due dates** — Todo items can have `due_date`; managed via todo actions and `lib/todo/lists.ts`. Source: `todo_items` table.
4. **Project-level scheduling** — No current entity for “project milestone”, “meeting”, “site visit”, or “inspection date”. These would be new concepts or attributes.

### Existing UI patterns to reuse

- **Modals:** `components/ui/dialog.tsx`; used by `AddTaskModal`, `EditTaskModal`, budget/item modals, `CreateBusinessModal`, etc. Calendar event create/edit can follow the same pattern.
- **Forms:** FormData-based server actions with client state (e.g. `EditTaskModal` with local state, submit via action). Date inputs: raw `<input type="date">` in task and billing UIs (no shared date picker component).
- **Tabs / context shell:** `ContextTabBar` + `ContextShell`; new “Calendar” tab would fit as another tab under `/context/[projectId]/calendar` with its own `*FromCache` + `*Client` and cache key `{ type: 'calendar', projectId }` (if project-scoped) or a user-level calendar key.
- **Lists and cards:** List-by-date or week/month views would be new layouts; existing list patterns in billings (table-like) and board (columns) can inform structure.
- **No command palette** found in the codebase for quick “add event” or “go to date”.

### Notification mechanisms

- **No** dedicated notification system (no in-app reminders, push, or email for due dates). Error/feedback uses `MutationErrorDialog` or `alert()` in places (see AGENTS.md; `alert()` is discouraged for core mutation errors). Calendar reminders would require new infrastructure (e.g. cron + email/push, or client-side scheduling).

---

## D) Architecture Recommendations (no code)

### Data ownership: Calendar as lens vs source of truth

- **Recommendation: Calendar as a lens over existing and minimal new data.**  
  Keep **tasks.due_date**, **billings.due_date**, **todo_items.due_date** (and **billings.paid_at**) as the **source of truth**. Introduce a **calendar view** that aggregates these by date (and optionally time). For “pure” calendar events (meetings, milestones, reminders with no task/billing/todo), add a **minimal** `calendar_items` (or `calendar_events`) table owned by the user and optionally linked to a project.

- **Why not duplicate:** Storing “due date” only in a calendar table would duplicate task/billing/todo data and create sync and RLS complexity. Prefer **read from source tables** for task/billing/todo dates and **write only to those tables** when editing from the calendar (e.g. “change task due date” updates `tasks.due_date`).

### Suggested minimal schema shape for calendar-specific data

- **Table: `calendar_items` (or `calendar_events`)**
  - **Identity:** `id`, `owner_id` (user), optional `project_id` (nullable for “personal” events).
  - **Time:** `start_at` (timestamptz), optional `end_at` (timestamptz), or all-day flag.
  - **Display:** `title`, optional `description`, optional `location`.
  - **Link to source (optional):** `source_type` (e.g. `'task' | 'billing' | 'todo_item' | 'event'`), `source_id` (uuid). For tasks/billings/todo, the calendar can **derive** items from existing tables and not store duplicates; `source_type`/`source_id` then refer to the canonical row. For standalone events, `source_type = 'event'` and `source_id` could be self or null.
  - **Audit:** `created_at`, `updated_at`.
  - **RLS:** All policies scoped by `owner_id`; if `project_id` is set, optionally restrict to projects the user owns (join to `projects`).

- **Linking strategy:**
  - **Tasks:** Calendar reads `tasks` where `project_id IN (user's projects)` and `due_date IS NOT NULL`; no separate row in `calendar_items` unless you want a “pinned” or “custom time” override. If override is needed, one row in `calendar_items` with `source_type = 'task'`, `source_id = task.id` and `start_at`/`end_at` override.
  - **Billings:** Same idea: read `billings` by `owner_id` and optional `project_id`; use `due_date` (and optionally `paid_at`) for calendar display; optional override row in `calendar_items`.
  - **Todo items:** Read `todo_items` by `owner_id` (and optionally by list/project); use `due_date`.
  - **Standalone events:** Rows in `calendar_items` with `source_type = 'event'` (or no source), `project_id` optional.

- **Sync strategy (placeholders):**
  - **Google Calendar / external:** Add columns or a separate table for `external_id`, `external_source` (e.g. `'google'`), `sync_token` (or equivalent) and sync via background job; keep `owner_id` and same RLS.
  - **ICS feed:** Export: build feed from `calendar_items` + derived task/billing/todo dates (read-only). Import: parse into `calendar_items` with `source_type = 'event'` and `owner_id`.  
    No implementation detail here; only that ownership and project-scoping should stay consistent with existing patterns.

---

## E) Risk List

### Data duplication and consistency

- **Risk:** If calendar stores its own copy of “task due date” or “billing due date”, edits in Board or Billings can get out of sync. **Mitigation:** Treat tasks/billings/todo as source of truth; calendar as read (and write-through to those tables when editing from calendar).
- **Risk:** Multiple UIs (task modal, billing form, calendar) editing the same date with different validation or formats could produce inconsistent values. **Mitigation:** Introduce shared validation (e.g. `lib/validation/dates.ts`) and a single date/time format contract (e.g. ISO date for date-only, ISO 8601 for timestamptz).

### Validation gaps

- **No shared date validation:** Tasks, billings, and todo accept `due_date` as string from FormData; there is no `lib/validation` for “valid date” or “date not in past” (see `lib/validation/profile.ts` for timezone/locale only). Risk of invalid or timezone-ambiguous strings. **Recommendation:** Add shared date (and optional time) validation and use it in all server actions that set due_date/paid_at/start_at/end_at.
- **Time zones:** `tasks.due_date` and `billings.due_date` are DATE; display uses browser/local. User `timezone` in `profiles` exists for preferences but is not consistently applied to calendar or due-date display. Clarify whether “due date” is always local-date or stored in UTC; document and align.

### Security and RLS

- **Cross-entity calendar view:** A calendar that shows tasks + billings + todo in one view must enforce: (1) tasks via project ownership, (2) billings via `owner_id`, (3) todo via `owner_id`. A single “get calendar items” RPC or view that joins these must apply the same RLS logic (e.g. only tasks in projects owned by the user, only billings/todo for the user). **Risk:** One mis-scoped query could leak another user’s tasks or billings.
- **project_id on calendar_items:** If `calendar_items` has optional `project_id`, RLS should ensure the user can only attach to projects they own (e.g. `EXISTS (SELECT 1 FROM projects p WHERE p.id = calendar_items.project_id AND p.owner_id = auth.uid())`).
- **External sync:** Google/ICS import would create rows with `owner_id`; ensure no path allows setting `owner_id` from client input; server must set it from `auth.uid()`.

### Performance and N+1

- **Missing indexes:** `tasks.due_date` and `todo_items.due_date` are not indexed. Range queries (e.g. “all tasks with due_date in March”) will do table/index scans. **Recommendation:** Add `idx_tasks_due_date` and/or `idx_tasks_project_id_due_date`, and `idx_todo_items_due_date` and/or `idx_todo_items_owner_id_due_date` if calendar queries filter by date.
- **N+1:** Current patterns avoid per-row DB calls in list UIs (e.g. `getBillingsByProjectId` batches projects and clients). Calendar aggregation should use a single query or RPC that returns all relevant items (tasks, billings, todo, and optionally `calendar_items`) in one or a few round trips (≤3 for initial load per AGENTS.md).
- **Client-side Supabase:** ESLint rule `clear-queue/no-client-supabase-in-components` prevents direct Supabase in components; calendar must use server actions or server components for data. No exception for calendar.

### Other

- **Todos tab:** Todos are commented out in `ContextTabBar` (`//{ slug: 'todos', ... }`). If calendar surfaces todo due dates, confirm whether the todos module is going to be re-enabled and how it relates to project vs global todo lists.
- **Overdue logic:** Billings have a trigger `set_billing_overdue_if_due()` that sets `status = 'overdue'` when `due_date < current_date`. Tasks only show overdue in the UI (e.g. `TaskCard`); no DB state change. Calendar should align with these semantics for “overdue” display and any future reminders.

---

## File reference (key paths)

| Area             | Paths                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context layout   | `app/context/layout.tsx`, `app/context/[projectId]/layout.tsx`                                                                                          |
| Cache            | `app/context/ContextDataCache.tsx`                                                                                                                      |
| Tabs             | `components/context/ContextTabBar.tsx`                                                                                                                  |
| Task due date    | `app/actions/tasks.ts`, `components/board/EditTaskModal.tsx`, `components/board/AddTaskModal.tsx`, `components/board/TaskCard.tsx`                      |
| Billing due/paid | `app/actions/billings.ts`, `app/context/[projectId]/billings/ContextBillingsClient.tsx`                                                                 |
| Todo due date    | `app/actions/todo.ts`, `lib/todo/lists.ts`                                                                                                              |
| Migrations       | `supabase/migrations/001_initial_schema.sql`, `20260213120000_add_billings_module.sql`, `002_todo_lists.sql`, `20260222180000_tasks_compound_index.sql` |
| Profile timezone | `supabase/migrations/20260214000000_profile_and_branding.sql`, `lib/validation/profile.ts`                                                              |
| RLS (tasks)      | `supabase/migrations/20260208120000_multi_user_projects_tasks_budgets.sql`, `20260222140000_fix_move_task_atomic_project_scope.sql`                     |
