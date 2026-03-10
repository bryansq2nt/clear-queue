> **Note:** This plan is based on the repository audit at `docs/project-copilot/teams-module/repo-audit.md`
> and is intended to transform the current owner-centric authorization model into a normalized
> RBAC + scoped-access system. Do not modify this plan without re-validating against the audit.

# RBAC Normalization & Implementation Plan

**Date:** 2026-03-09
**Author:** Architecture review based on `docs/project-copilot/teams-module/repo-audit.md`
**Status:** Draft — ready for engineering review

---

## Section 1 — Executive Summary

### What Is Being Built

ClearQueue is adding a Role-Based Access Control (RBAC) system that will transform the app from a strictly single-user, owner-gated product into a multi-user, team-collaborative workspace. This plan covers the complete journey: from the current binary authenticated/not-authenticated model to a normalized roles, modules, and fine-grained action permission system enforced at three layers — application (server actions), database (Row Level Security), and UI (conditional rendering).

### Current State

Every piece of data in ClearQueue is bound to a single user via `owner_id = auth.uid()` at both the application layer (`.eq('owner_id', user.id)` in every query) and the database layer (RLS policies that compare `owner_id = auth.uid()` or traverse the `projects.owner_id` join for project-scoped entities). There are no teams, no organizations, no project membership tables, no roles, and no permission checks beyond "is this user authenticated?" The sole exception is `checkIsAdmin()` in `lib/auth.ts`, which checks an email env var — but this function is never called anywhere in the codebase and represents dead code. The audit found 110+ exported server actions across 27 action files, all following this same binary pattern.

### Target State

The target is a three-layer permission model. At the top sits an `organizations` table (workspace/tenant). Each user belongs to one or more organizations with an organization-level role. Each project has a `project_members` table linking users to project-specific roles. Roles are defined in `rbac_roles` and expanded into granted action keys via `rbac_role_module_actions`. A call to `hasPermission(userId, 'tasks.create', { projectId })` resolves membership, expands roles, and returns a boolean. Server actions call this helper immediately after `requireAuth()`. RLS policies at the database layer enforce the same membership logic independently as defense-in-depth.

### Estimated Scope

- **Phases:** 10 (including Phase 0 which is already complete)
- **New tables:** 8 (`organizations`, `organization_members`, `project_members`, `rbac_roles`, `rbac_modules`, `rbac_module_actions`, `rbac_role_module_actions`, `audit_log`)
- **Existing tables modified:** 8+ (tasks, milestones, copilot_proposals, projects, budgets, notes, documents, billings)
- **Migrations required:** minimum 6 non-breaking attribution migrations + 2 large structural migrations + RLS rewrite migrations per table (~15 tables)
- **Server actions to refactor:** ~110 functions across 27 files

### Top 5 Risks

1. **RLS rewrite on 15+ tables is the highest blast-radius change in the codebase.** Any error in the membership join logic silently exposes or blocks data for all users. This cannot be partially rolled back.
2. **All existing data has no organization.** Every `projects`, `clients`, `businesses`, `budgets`, and `billings` row was created before organizations exist. A migration that adds `org_id NOT NULL` cannot backfill from thin air. The first user to log in after the migration effectively becomes the org owner, but the org itself must be created by the migration or a signup flow.
3. **Storage bucket paths embed `owner_id`.** The `project-docs` and `project-media` buckets use `owner_id/project_id/filename` paths. Sharing a project with a teammate does not grant them storage access unless bucket policies are also rewritten. This is not a database problem — it is a Supabase Storage policy problem that RLS does not solve.
4. **Copilot proposals approved without attribution cannot be retroactively attributed.** Once the `approved_by` column is added, historical proposals cannot be backfilled unless the approval timestamp is correlated with `copilot_messages`.
5. **The N+1 write in `reorderProjectLinksAction` becomes a correctness problem under concurrent team usage.** Today it is a performance issue. With multiple team members reordering simultaneously, the per-row UPDATEs without atomic ordering create race conditions that corrupt `sort_order`.

---

## Section 2 — Current State Summary

### Current Authorization Model

The model is binary: authenticated (via `requireAuth()`) or not. There is no concept of what an authenticated user is allowed to do beyond owning the resource. Any authenticated user who knows a `project_id` and passes `requireAuth()` can, in theory, read or write that project's data — but RLS blocks them because they do not own the project. There is no shared access mechanism whatsoever.

### How Ownership Works Today

Every server action calls `requireAuth()` first, which calls `supabase.auth.getUser()` and redirects to `/` if the session is invalid. After authentication, queries scope data in one of two ways:

- **Pattern A (direct ownership):** `.eq('owner_id', user.id)` on tables that carry `owner_id` directly: `projects`, `notes`, `budgets`, `billings`, `billing_categories`, `clients`, `businesses`, `project_links`, `link_categories`, `project_files`, `calendar_events`, `copilot_sessions`, `copilot_messages`, `copilot_proposals`, `profiles`, `user_assets`, `user_preferences`.
- **Pattern B (project-join ownership):** Tables without `owner_id` (notably `tasks` and `milestones`) are scoped by `project_id`, with RLS joining through `projects.owner_id = auth.uid()`.

### What Admin Concept Exists

`lib/auth.ts` defines `checkIsAdmin()` at lines 24–29. It reads `ADMIN_EMAIL` from the environment and returns `true` if `user.email === ADMIN_EMAIL`. This function is never imported or called anywhere in the codebase — no route, action, page, or middleware uses it. It is dead code representing an abandoned or deferred feature.

### What Is Missing

- No `organizations` or `workspaces` table
- No `project_members` table (no shared project access)
- No `rbac_roles`, `rbac_modules`, or permission action tables
- No `audit_log` (zero history of who did what)
- No `created_by` on `tasks` or `milestones`
- No `approved_by` / `rejected_by` on `copilot_proposals`
- No `org_id` on any existing table
- No rate limiting on the Copilot API route

### Key Numbers From the Audit

- 12 registered UI module keys in `lib/modules/registry.ts`
- 27 action files + 2 feature-local `actions.ts` files
- ~110 exported server action functions
- 50+ migration files
- 9 Copilot registry modules
- 0 permission checks, role assignments, or team membership tables
- 1 dead admin check (`checkIsAdmin()` — never called)

---

## Section 3 — Target Authorization Model

### Role → Modules → Actions → Scope

The target model is a four-layer hierarchy:

```
Organization
  └── Role (e.g., org_admin, org_member)
        └── Project
              └── Project Role (e.g., project_owner, project_editor, project_viewer)
                    └── Granted module actions (e.g., tasks.create, tasks.delete)
```

A **role** is a named collection of granted module actions. Roles are defined globally (system roles) or per-organization (custom roles). A user holds a role within a context: either at the organization level (`organization_members.role`) or at the project level (`project_members.role`). A project-level role overrides the organization-level role for that specific project.

### Context-Based Role Assignment

Roles are always contextual — they are not user attributes. A user can be `project_editor` on Project A and `project_viewer` on Project B, while simultaneously being `org_admin` at the organization level. Role resolution must always ask: "What role does this user hold in THIS context?"

### How Scopes Work

| Scope          | Meaning                                            | DB Column                                            | Example Actions                                 |
| -------------- | -------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `own`          | Resource created by or assigned to requesting user | `owner_id = auth.uid()` or `created_by = auth.uid()` | `profile.update`, `notes.delete` (own notes)    |
| `project`      | Any member of the project with sufficient role     | `project_members(project_id, user_id)` join          | `tasks.create`, `documents.upload`              |
| `organization` | Any member of the organization                     | `organization_members(org_id, user_id)` join         | `clients.read`, `budgets.read` (org-wide CRM)   |
| `global`       | System-wide, admin only                            | No row filter; system role only                      | `settings.update_danger_zone`, `audit_log.read` |

### Resolution Order

```
1. Is the user authenticated? (requireAuth) → No: reject 401
2. What is the context? (projectId? orgId?) → extract from params
3. Does a project_members row exist for (user_id, project_id)? → resolve project role
4. Does an organization_members row exist for (user_id, org_id)? → resolve org role
5. Effective role = project_members.role ?? organization_members.role ?? null
6. Expand effective role → set of granted action keys
7. Does granted set include required_permission_key? → Yes: allow / No: deny 403
8. RLS at DB layer enforces membership independently (defense-in-depth)
```

### Enforcement at Three Layers

- **Application layer (server actions):** `requirePermission(userId, 'tasks.create', { projectId })` called after `requireAuth()`. Returns `{ denied: true }` or throws a redirect. This is the primary enforcement layer for business logic.
- **Database layer (RLS):** Policies rewritten to join through `project_members` or `organization_members` instead of checking `owner_id` directly. This layer cannot be bypassed by any application code.
- **UI layer (conditional rendering):** Components receive permission flags as props and conditionally render action buttons. This is a UX layer only — it does not enforce security. Never rely on the UI layer alone.

---

## Section 4 — Canonical RBAC Modules

The following canonical module list is the authoritative definition for RBAC purposes. It differs from the UI tab registry (`lib/modules/registry.ts`) because RBAC modules map to security boundaries, not display tabs.

### Decisions on Contested Modules

**`board` vs `tasks`:** The UI registry uses `board` as the key (it is the root tab, locked enabled). For RBAC, the security boundary is tasks — the board is merely a view of tasks. Permission keys will use `tasks.*`. The UI module key `board` maps to RBAC module `tasks`. No merge needed — they coexist at different layers.

**`media` vs `documents`:** Both use the same underlying table (`project_files`) with a `kind` discriminator (`media` or `document`). However, they have distinct storage buckets (`project-media` vs `project-docs`), distinct categories, distinct actions (`media.share_create` has no documents equivalent), and distinct UI tabs. They remain separate RBAC modules with separate permission keys.

**`copilot`:** Copilot is a distinct RBAC module. It encompasses AI sessions, message history, and the ability to approve/reject proposals that create or delete real data. The approve action is effectively a write on whatever the proposal targets — but the permission gate is at the copilot layer (`copilot.approve_proposal`), not re-gated on the underlying module. Future fine-grained control can require that the approving user also hold the relevant module permission (e.g., must have `tasks.create` to approve a `task` proposal).

**`settings`:** Split into `profile` (user-personal, always scoped to `own`) and `workspace` (org-level settings, scoped to `organization` or `global`). The current `app/settings/appearance/` maps to `profile` scope in RBAC terms because it controls per-user preferences. A future workspace billing or danger-zone page maps to `workspace`.

**`clients` and `businesses`:** They remain separate RBAC modules. `businesses` is a sub-entity of `clients` (a business always belongs to a client), but they have distinct CRUD actions and distinct tables. Merging them into a single `contacts` module is architecturally cleaner but creates a naming discontinuity with the existing codebase. They stay separate for now, with a note that they can be unified in a future `contacts` module refactor.

**`todos`:** The audit found `todos` in the Copilot registry but not in the main tab registry as a named key. It exists as a context tab. It is a distinct RBAC module covering todo lists and items.

### Canonical Module Definitions

| Module Key   | Display Name       | Description                                         | Scope       | Parent |
| ------------ | ------------------ | --------------------------------------------------- | ----------- | ------ |
| `tasks`      | Board / Tasks      | Kanban board tasks, statuses, priorities, ordering  | project     | —      |
| `milestones` | Milestones         | Project milestones with task progress tracking      | project     | —      |
| `notes`      | Notes              | Rich-text project notes with folders and links      | project     | —      |
| `documents`  | Documents          | Uploaded project files (contracts, briefs, reports) | project     | —      |
| `media`      | Media              | Uploaded project images and media assets            | project     | —      |
| `calendar`   | Calendar           | Project calendar events and deadlines               | project     | —      |
| `links`      | Links              | Project reference links with categories             | project     | —      |
| `ideas`      | Ideas / Mind Maps  | Idea boards, nodes, and canvas connections          | project     | —      |
| `budgets`    | Budgets            | Budget envelopes with categories and items          | project/org | —      |
| `billings`   | Billings           | Invoices, payments, and billing records             | project     | —      |
| `todos`      | To-do Lists        | Checklist-style todo lists and items                | project     | —      |
| `copilot`    | Copilot AI         | AI assistant sessions, messages, and proposals      | project     | —      |
| `projects`   | Projects           | Project CRUD, archiving, module toggle              | org         | —      |
| `clients`    | Clients            | Client CRM records and contact info                 | org         | —      |
| `businesses` | Businesses         | Business entities linked to clients                 | org         | —      |
| `teams`      | Teams & Members    | Org and project membership management               | org/global  | —      |
| `profile`    | Profile            | User profile, avatar, personal preferences          | own         | —      |
| `workspace`  | Workspace Settings | Organization name, branding, billing, danger zone   | org/global  | —      |

---

## Section 5 — Canonical Actions by Module

The naming convention is `module.action` using dot notation throughout. Where a broad action would obscure meaningful permission granularity, it is split. Transitional keys are marked `[TRANSITIONAL]`.

### tasks

| Action Key               | Description                            | Scope   | Why This Action Exists     | Notes                                       |
| ------------------------ | -------------------------------------- | ------- | -------------------------- | ------------------------------------------- |
| `tasks.read`             | Read tasks in a project                | project | List and view board tasks  |                                             |
| `tasks.create`           | Create a new task                      | project | Add task to any column     | Uses `create_task_atomic` RPC               |
| `tasks.update_title`     | Edit a task's title                    | project | Rename tasks               | Split from broad update                     |
| `tasks.update_status`    | Move task to another status column     | project | Drag/drop or status select | Uses `move_task_atomic` RPC                 |
| `tasks.update_priority`  | Change task priority (1–5)             | project | Priority triage            | Split: priority changes are audit-sensitive |
| `tasks.update_due_date`  | Set or clear the due date              | project | Deadline management        |                                             |
| `tasks.update_notes`     | Edit task notes/description            | project | Task documentation         |                                             |
| `tasks.update_tags`      | Add or remove tags                     | project | Task categorization        |                                             |
| `tasks.update_milestone` | Assign or remove milestone link        | project | Milestone planning         |                                             |
| `tasks.assign`           | Assign task to a user                  | project | Team assignment (future)   | Column not yet in schema                    |
| `tasks.unassign`         | Remove user assignment                 | project | Unassign from task         | Requires `assigned_to` column               |
| `tasks.delete`           | Delete a single task                   | project | Remove a task permanently  |                                             |
| `tasks.bulk_delete`      | Delete multiple tasks                  | project | Batch cleanup              | Higher risk than single delete              |
| `tasks.reorder`          | Reorder tasks within or across columns | project | Drag-drop ordering         | Uses `move_task_atomic` RPC                 |
| `tasks.duplicate`        | Duplicate an existing task             | project | Quick task cloning         | Not yet implemented; placeholder            |

### milestones

| Action Key            | Description                            | Scope   | Why This Action Exists                         | Notes                                |
| --------------------- | -------------------------------------- | ------- | ---------------------------------------------- | ------------------------------------ |
| `milestones.read`     | List and view milestones               | project | Display milestone progress                     |                                      |
| `milestones.create`   | Create a milestone                     | project | Project planning                               |                                      |
| `milestones.update`   | Edit milestone title/description/dates | project | [TRANSITIONAL] Split if due_date gating needed |                                      |
| `milestones.delete`   | Delete a milestone                     | project | Remove milestone and unlink tasks              |                                      |
| `milestones.complete` | Mark a milestone complete              | project | Status transition via RPC                      | Uses `complete_milestone_atomic` RPC |
| `milestones.reopen`   | Reopen a completed milestone           | project | Status reversion via RPC                       | Uses `reopen_milestone_atomic` RPC   |

### notes

| Action Key             | Description                         | Scope   | Why This Action Exists | Notes                                                             |
| ---------------------- | ----------------------------------- | ------- | ---------------------- | ----------------------------------------------------------------- |
| `notes.read`           | List and open notes                 | project | View notes in the tab  |                                                                   |
| `notes.create`         | Create a note                       | project | New note in project    |                                                                   |
| `notes.update_title`   | Edit note title                     | project | Rename                 | Split: title is often edited without content                      |
| `notes.update_content` | Edit note body/content              | project | Text editing           | Content edits are the most frequent action                        |
| `notes.delete`         | Delete a note                       | project | Remove single note     |                                                                   |
| `notes.bulk_delete`    | Delete multiple notes               | project | Batch removal          |                                                                   |
| `notes.add_link`       | Add a reference link to a note      | project | Note enrichment        | `note_links` table                                                |
| `notes.delete_link`    | Remove a link from a note           | project | Link cleanup           |                                                                   |
| `notes.manage_folders` | Create, rename, delete note folders | project | Organization structure | Covers `createNoteFolder`, `updateNoteFolder`, `deleteNoteFolder` |

### documents

| Action Key                  | Description                              | Scope   | Why This Action Exists        | Notes                                                  |
| --------------------------- | ---------------------------------------- | ------- | ----------------------------- | ------------------------------------------------------ |
| `documents.read`            | List documents and metadata              | project | Browse the documents tab      |                                                        |
| `documents.view_signed_url` | Generate a signed URL to view a document | project | Open in browser via API route | Distinct from read — creates a time-limited credential |
| `documents.download`        | Generate a download URL                  | project | Download file                 |                                                        |
| `documents.upload`          | Upload a new document                    | project | Add file to project           | Single or bulk                                         |
| `documents.update_metadata` | Edit title, description, category, tags  | project | Metadata management           |                                                        |
| `documents.archive`         | Archive a document                       | project | Soft-hide without delete      |                                                        |
| `documents.mark_final`      | Mark as final version                    | project | Approval workflow             | Semantically meaningful status change                  |
| `documents.delete`          | Soft-delete a document                   | project | Remove from project           | Soft delete only                                       |
| `documents.bulk_delete`     | Soft-delete multiple documents           | project | Batch cleanup                 |                                                        |
| `documents.manage_folders`  | Create, rename, delete document folders  | project | Organization structure        |                                                        |

### media

| Action Key              | Description                       | Scope   | Why This Action Exists  | Notes                            |
| ----------------------- | --------------------------------- | ------- | ----------------------- | -------------------------------- |
| `media.read`            | List media and metadata           | project | Browse the media tab    |                                  |
| `media.view_signed_url` | Generate signed URL to view media | project | Open in browser         |                                  |
| `media.upload`          | Upload media file                 | project | Add to project          |                                  |
| `media.update_metadata` | Edit caption, category, tags      | project | Metadata management     |                                  |
| `media.archive`         | Archive a media item              | project | Soft-hide               |                                  |
| `media.unarchive`       | Restore archived media            | project | Undo archive            |                                  |
| `media.mark_final`      | Mark as favorite/final            | project | Quality flag            |                                  |
| `media.delete`          | Soft+physical delete of media     | project | Remove file permanently | Physical deletion from storage   |
| `media.share_create`    | Create a public share token       | project | External sharing        | Generates public URL with expiry |

### calendar

| Action Key        | Description                | Scope   | Why This Action Exists                      | Notes                                |
| ----------------- | -------------------------- | ------- | ------------------------------------------- | ------------------------------------ |
| `calendar.read`   | Read project calendar feed | project | View events, tasks, billings, todos         | Uses `get_project_calendar_feed` RPC |
| `calendar.create` | Create a calendar event    | project | Schedule meetings, visits, etc.             |                                      |
| `calendar.update` | Edit event details         | project | [TRANSITIONAL] Covers all event field edits | Split if status vs. details matter   |
| `calendar.delete` | Delete an event            | project | Remove from calendar                        |                                      |

### links

| Action Key                | Description                                     | Scope   | Why This Action Exists              | Notes                                                             |
| ------------------------- | ----------------------------------------------- | ------- | ----------------------------------- | ----------------------------------------------------------------- |
| `links.read`              | List project links and categories               | project | Browse the links tab                |                                                                   |
| `links.create`            | Create a new link                               | project | Add reference URL                   |                                                                   |
| `links.update`            | Edit link metadata (title, URL, category, tags) | project | [TRANSITIONAL] Single update action |                                                                   |
| `links.archive`           | Archive a link                                  | project | Hide without delete                 |                                                                   |
| `links.reorder`           | Reorder links                                   | project | Sort ordering                       | N+1 write tech debt — requires `reorder_links_atomic` before RBAC |
| `links.manage_categories` | Create, update, delete link categories          | user    | User-global categories              | `link_categories` is owner-scoped, not project-scoped             |

### ideas

| Action Key                 | Description                                | Scope   | Why This Action Exists     | Notes                            |
| -------------------------- | ------------------------------------------ | ------- | -------------------------- | -------------------------------- |
| `ideas.read`               | List idea boards and nodes                 | project | View mind maps             |                                  |
| `ideas.create_board`       | Create an idea board                       | project | New mind map               |                                  |
| `ideas.update_board`       | Rename or describe a board                 | project | Board metadata             |                                  |
| `ideas.delete_board`       | Delete an idea board                       | project | Remove board and nodes     |                                  |
| `ideas.create_node`        | Create an idea node                        | project | Add concept to board       |                                  |
| `ideas.update_node`        | Edit node content                          | project | Modify concept             |                                  |
| `ideas.delete_node`        | Delete an idea node                        | project | Remove concept             |                                  |
| `ideas.manage_connections` | Create or delete connections between nodes | project | Graph editing              | Covers canvas connection actions |
| `ideas.batch_update`       | Batch canvas updates (drag/positions)      | project | Canvas layout saves        | Covers `idea-canvas-batch.ts`    |
| `ideas.link_project`       | Associate board with a project             | project | Project↔board relationship |                                  |

### budgets

| Action Key                  | Description                                        | Scope       | Why This Action Exists          | Notes                                                           |
| --------------------------- | -------------------------------------------------- | ----------- | ------------------------------- | --------------------------------------------------------------- |
| `budgets.read`              | List budgets and stats                             | project/org | View budgets tab                | `getBudgetStats` currently missing app-layer owner scope — RISK |
| `budgets.create`            | Create a budget envelope                           | project     | New budget                      |                                                                 |
| `budgets.update`            | Edit budget name/description                       | project     | [TRANSITIONAL]                  |                                                                 |
| `budgets.delete`            | Delete a budget                                    | project     | Remove budget and cascade items |                                                                 |
| `budgets.duplicate`         | Duplicate a budget                                 | project     | Template from existing          | Uses `duplicate_budget_atomic` RPC                              |
| `budgets.manage_categories` | Create, update, delete budget categories           | budget      | Within-budget structure         |                                                                 |
| `budgets.manage_items`      | Create, update, delete, status-change budget items | budget      | Line-item management            |                                                                 |

### billings

| Action Key                    | Description                                            | Scope   | Why This Action Exists       | Notes                                                                    |
| ----------------------------- | ------------------------------------------------------ | ------- | ---------------------------- | ------------------------------------------------------------------------ |
| `billings.read`               | List billing records                                   | project | View billings tab            |                                                                          |
| `billings.create`             | Create a billing record                                | project | New invoice/payment/spending |                                                                          |
| `billings.update_amount`      | Change billing amount or currency                      | project | Financial correction         | Split: amount changes need stricter audit trail                          |
| `billings.update_status`      | Change billing status (pending/paid/overdue/cancelled) | project | Payment workflow             | Most frequent write — distinct from full edit                            |
| `billings.update_description` | Edit title, notes, dates, payment fields               | project | Record annotation            | [TRANSITIONAL] — could split further                                     |
| `billings.delete`             | Delete a billing record                                | project | Remove record                | `deleteBilling` currently only scopes by owner_id, not project_id — RISK |
| `billings.manage_categories`  | Create or delete billing categories                    | user    | User-global categories       | `billing_categories` is owner-scoped                                     |

### clients

| Action Key                | Description                                   | Scope | Why This Action Exists | Notes                                         |
| ------------------------- | --------------------------------------------- | ----- | ---------------------- | --------------------------------------------- |
| `clients.read`            | List clients and their details                | org   | CRM visibility         |                                               |
| `clients.create`          | Create a client record                        | org   | Add to CRM             |                                               |
| `clients.update`          | Edit client fields                            | org   | [TRANSITIONAL]         |                                               |
| `clients.delete`          | Hard-delete a client                          | org   | Remove from CRM        | Cascades to businesses                        |
| `clients.manage_links`    | Create, update, delete client reference links | org   | Client link management | Covers `createClientLinkAction` etc.          |
| `clients.link_to_project` | Associate a client with a project             | org   | Project CRM connection | Via `linkBusinessToProject` or project update |

### businesses

| Action Key                | Description                        | Scope | Why This Action Exists    | Notes                                                          |
| ------------------------- | ---------------------------------- | ----- | ------------------------- | -------------------------------------------------------------- |
| `businesses.read`         | List businesses linked to a client | org   | CRM sub-entity            |                                                                |
| `businesses.create`       | Create a business record           | org   | New business under client |                                                                |
| `businesses.update`       | Edit business fields               | org   | [TRANSITIONAL]            | Covers `updateBusinessAction` and `updateBusinessFieldsAction` |
| `businesses.delete`       | Delete a business record           | org   | Remove from CRM           |                                                                |
| `businesses.manage_media` | Upload or delete business media    | org   | Brand assets              | `business_media` table                                         |

### projects

| Action Key                | Description                                        | Scope   | Why This Action Exists           | Notes                                          |
| ------------------------- | -------------------------------------------------- | ------- | -------------------------------- | ---------------------------------------------- |
| `projects.read`           | List and read project details                      | org     | Sidebar and project picker       |                                                |
| `projects.create`         | Create a new project                               | org     | Start a project                  |                                                |
| `projects.update`         | Edit project name, color, category, notes          | project | Project settings                 |                                                |
| `projects.delete`         | Hard-delete a project                              | project | Remove project and all data      | High-risk action                               |
| `projects.archive`        | Archive a project                                  | project | Retire from active list          |                                                |
| `projects.unarchive`      | Restore archived project                           | project | Reactivate                       |                                                |
| `projects.link_client`    | Link a client/business to a project                | project | CRM association                  |                                                |
| `projects.toggle_module`  | Enable or disable a project module (tab)           | project | Per-project feature toggle       | Currently gated only by `requireAuth()` — RISK |
| `projects.manage_members` | Invite, remove, or change roles of project members | project | Team management for this project | Requires `project_members` table               |

### copilot

| Action Key                 | Description                              | Scope   | Why This Action Exists | Notes                             |
| -------------------------- | ---------------------------------------- | ------- | ---------------------- | --------------------------------- |
| `copilot.read_sessions`    | List and read copilot sessions           | project | Session history        |                                   |
| `copilot.create_session`   | Start a new AI session                   | project | Begin conversation     |                                   |
| `copilot.archive_session`  | Archive a session                        | project | Clean up history       |                                   |
| `copilot.delete_session`   | Permanently delete a session             | project | Remove history         |                                   |
| `copilot.send_message`     | Send a message to the AI                 | project | Chat interaction       | Calls the streaming API route     |
| `copilot.read_proposals`   | View AI-generated proposals              | project | Review suggestions     |                                   |
| `copilot.approve_proposal` | Approve a proposal (executes the action) | project | Apply AI suggestion    | Creates/updates/deletes real data |
| `copilot.reject_proposal`  | Reject a proposal                        | project | Dismiss AI suggestion  |                                   |
| `copilot.undo_proposal`    | Undo an approved delete proposal         | project | Rollback               | Uses snapshot mechanism           |
| `copilot.bulk_approve`     | Approve all pending proposals            | project | Batch acceptance       | Higher risk than single approve   |
| `copilot.bulk_reject`      | Reject all pending proposals             | project | Batch dismissal        |                                   |

### teams

| Action Key                 | Description                                | Scope | Why This Action Exists     | Notes                 |
| -------------------------- | ------------------------------------------ | ----- | -------------------------- | --------------------- |
| `teams.read_members`       | List org and project members               | org   | Team visibility            |                       |
| `teams.invite_member`      | Send org or project invitation             | org   | Onboard new members        | Requires invite flow  |
| `teams.remove_member`      | Remove a member from org or project        | org   | Access revocation          |                       |
| `teams.update_member_role` | Change a member's role                     | org   | Role management            | High privilege action |
| `teams.read_roles`         | List available roles and their permissions | org   | Role discovery             |                       |
| `teams.create_custom_role` | Create a custom org role                   | org   | Custom permission profiles |                       |
| `teams.update_custom_role` | Edit a custom org role's permissions       | org   | Role modification          |                       |
| `teams.delete_custom_role` | Delete a custom org role                   | org   | Role cleanup               |                       |

### profile

| Action Key                    | Description                               | Scope | Why This Action Exists | Notes |
| ----------------------------- | ----------------------------------------- | ----- | ---------------------- | ----- |
| `profile.read`                | Read own profile                          | own   | Profile page view      |       |
| `profile.update_display_name` | Change display name                       | own   | Identity update        |       |
| `profile.update_phone`        | Change phone number                       | own   | Contact info           |       |
| `profile.update_timezone`     | Change timezone preference                | own   | Locale settings        |       |
| `profile.upload_avatar`       | Upload a new avatar image                 | own   | Profile picture        |       |
| `profile.delete_asset`        | Delete a user asset (avatar, logo, cover) | own   | Asset cleanup          |       |

### workspace

| Action Key                      | Description                               | Scope  | Why This Action Exists  | Notes                                              |
| ------------------------------- | ----------------------------------------- | ------ | ----------------------- | -------------------------------------------------- |
| `workspace.read`                | Read workspace/org settings               | org    | Settings page           |                                                    |
| `workspace.update_appearance`   | Update theme, colors, logo, locale        | own    | Appearance preferences  | Currently `app/settings/appearance/` — user-scoped |
| `workspace.update_name`         | Change organization name                  | org    | Org branding            |                                                    |
| `workspace.update_branding`     | Upload company logo or cover image        | org    | Org branding            |                                                    |
| `workspace.manage_billing_plan` | Manage subscription and plan              | global | SaaS billing            | Requires external billing integration              |
| `workspace.danger_zone`         | Delete organization or transfer ownership | global | Irreversible operations | Highest-privilege action                           |

---

## Section 6 — Scope Model

### The Four Supported Scopes

**1. `own`**
The resource belongs exclusively to the requesting user. No sharing possible. Used for: profile, user preferences, avatars, and user-created categories (link_categories, billing_categories) that are not intended to be project-shared.

DB enforcement: `owner_id = auth.uid()` or `user_id = auth.uid()`. RLS policy: `USING (owner_id = auth.uid())`. Application layer: `.eq('owner_id', user.id)`.

**2. `project`**
Any member of the project with a sufficient role can access. This is the primary scope for all project-scoped content (tasks, milestones, notes, documents, media, calendar events, links, ideas, budgets, billings, todos, copilot).

DB enforcement: `EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = entity.project_id AND pm.user_id = auth.uid() AND pm.role IN (...allowed_roles...))`. Application layer: `hasPermission(userId, 'tasks.create', { projectId })`.

**3. `organization`**
Any member of the organization. Used for org-level entities: clients, businesses, and eventually workspace settings. Also governs who can see and create projects within an org.

DB enforcement: `EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = entity.org_id AND om.user_id = auth.uid())`. Application layer: `hasPermission(userId, 'clients.read', { orgId })`.

**4. `global`**
System-wide operations, accessible only to users with a system-level admin role. Used for danger-zone operations, audit log access, and system role management. Maps to the current (unused) `checkIsAdmin()` concept.

DB enforcement: A `is_system_admin` boolean on `organization_members` or a separate `system_admins` table. No row filter — access is gated by role membership alone.

### Scope-Per-Module Matrix

| Module             | own                 | project         | organization  | global      |
| ------------------ | ------------------- | --------------- | ------------- | ----------- |
| tasks              | —                   | primary         | —             | —           |
| milestones         | —                   | primary         | —             | —           |
| notes              | —                   | primary         | —             | —           |
| documents          | —                   | primary         | —             | —           |
| media              | —                   | primary         | —             | —           |
| calendar           | —                   | primary         | —             | —           |
| links              | —                   | primary         | —             | —           |
| ideas              | —                   | primary         | —             | —           |
| budgets            | —                   | primary         | —             | —           |
| billings           | —                   | primary         | —             | —           |
| todos              | —                   | primary         | —             | —           |
| copilot            | —                   | primary         | —             | —           |
| projects           | —                   | update/delete   | create/read   | —           |
| clients            | —                   | —               | primary       | —           |
| businesses         | —                   | —               | primary       | —           |
| teams              | —                   | project members | org members   | role mgmt   |
| profile            | primary             | —               | —             | —           |
| workspace          | user for appearance | —               | name/branding | danger zone |
| link_categories    | primary             | —               | —             | —           |
| billing_categories | primary             | —               | —             | —           |

---

## Section 7 — Required Database Foundations

These are the minimum tables that must exist before any dynamic role-checking can work. They must be created before Phase 4 (authorization layer). All tables require RLS enabled with appropriate policies.

### 7.1 `organizations`

**Purpose:** Top-level tenant/workspace container. Every user belongs to at least one organization. All org-scoped entities (clients, businesses) will gain an `org_id` FK pointing here.

```sql
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,          -- URL-safe identifier
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan TEXT NOT NULL DEFAULT 'free',  -- subscription tier
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indexes: `(owner_user_id)`, `(slug)`. RLS: any `organization_members` row with `user_id = auth.uid()` grants read. Only `owner_user_id` can update or delete.

### 7.2 `organization_members`

**Purpose:** Maps users to organizations with an org-level role. This is the foundation for all organization-scoped permissions.

```sql
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);
```

Indexes: `(org_id, user_id)`, `(user_id)`. RLS: members can read their own org membership; org admins can read all.

### 7.3 `project_members`

**Purpose:** Maps users to projects with a project-level role. This is the core primitive for shared project access and the primary replacement for the `owner_id`-only model on project-scoped data.

```sql
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'owner' | 'editor' | 'viewer'
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);
```

Indexes: `(project_id, user_id)`, `(user_id)`. RLS: a user can read their own project memberships; project owners can read all members.

### 7.4 `rbac_roles`

**Purpose:** Defines named roles that can be assigned. System roles (`is_system_role = true`) are immutable and seeded by migration. Custom roles (`org_id NOT NULL`) are org-specific.

```sql
CREATE TABLE public.rbac_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, org_id)  -- allows same name in different orgs; system roles have null org_id
);
```

Seeded system roles: `org_owner`, `org_admin`, `org_member`, `project_owner`, `project_editor`, `project_viewer`.

### 7.5 `rbac_modules`

**Purpose:** Seeded reference table of canonical module keys. Acts as a foreign key anchor for module actions. Prevents orphaned permission keys.

```sql
CREATE TABLE public.rbac_modules (
  key TEXT PRIMARY KEY,  -- e.g., 'tasks', 'notes', 'copilot'
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seeded with all 17 canonical modules from Section 4.

### 7.6 `rbac_module_actions`

**Purpose:** Seeded reference table of all canonical action keys per module. Acts as a registry of every permission that can be granted.

```sql
CREATE TABLE public.rbac_module_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL REFERENCES public.rbac_modules(key) ON DELETE CASCADE,
  action_key TEXT NOT NULL,   -- e.g., 'tasks.create'
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (action_key)
);
```

Seeded with all canonical action keys from Section 5.

### 7.7 `rbac_role_module_actions`

**Purpose:** Join table that defines which action keys a role grants. This is the core permission grant table.

```sql
CREATE TABLE public.rbac_role_module_actions (
  role_id UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.rbac_module_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, action_id)
);
```

Seeded grants for system roles: `project_viewer` → all `.read` keys; `project_editor` → viewer + create/update/delete; `project_owner` → editor + manage_members/toggle_module.

### 7.8 `audit_log`

**Purpose:** Immutable record of all significant writes. Required for RBAC compliance — without it, you cannot investigate misuse or trace changes in a multi-user environment.

```sql
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  module TEXT NOT NULL,           -- module key
  action TEXT NOT NULL,           -- action key
  entity_id TEXT,                 -- UUID of affected entity
  entity_type TEXT,               -- table name
  payload_summary JSONB,          -- diff or summary (no PII)
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indexes: `(user_id, created_at DESC)`, `(project_id, created_at DESC)`, `(org_id, created_at DESC)`. RLS: audit log is read-only for org admins; no user can update or delete rows.

---

## Section 8 — Required Schema Changes to Existing Tables

### `tasks`

| Column        | Type                             | Purpose                            | Blocking?             | Migration Notes                                         |
| ------------- | -------------------------------- | ---------------------------------- | --------------------- | ------------------------------------------------------- |
| `created_by`  | `UUID REFERENCES auth.users(id)` | Attribution — who created the task | Blocking for audit    | Nullable; backfill with project owner_id as best-effort |
| `assigned_to` | `UUID REFERENCES auth.users(id)` | Task assignment to a team member   | Non-blocking (future) | Nullable; no backfill needed                            |
| `updated_by`  | `UUID REFERENCES auth.users(id)` | Last editor attribution            | Non-blocking          | Nullable; no backfill possible                          |

**Impact:** `create_task_atomic` RPC must be updated to accept `in_created_by UUID`. Migration is non-breaking (nullable columns).

### `milestones`

| Column         | Type                             | Purpose          | Blocking?          | Migration Notes                                     |
| -------------- | -------------------------------- | ---------------- | ------------------ | --------------------------------------------------- |
| `created_by`   | `UUID REFERENCES auth.users(id)` | Attribution      | Blocking for audit | Nullable; backfill from project owner via migration |
| `completed_by` | `UUID REFERENCES auth.users(id)` | Who completed it | Non-blocking       | Nullable; no backfill                               |

**Impact:** `complete_milestone_atomic` and `createMilestone` must pass the acting user.

### `copilot_proposals`

| Column        | Type                             | Purpose                       | Blocking?                | Migration Notes                                |
| ------------- | -------------------------------- | ----------------------------- | ------------------------ | ---------------------------------------------- |
| `approved_by` | `UUID REFERENCES auth.users(id)` | Accountability for approvals  | Blocking for team safety | Nullable; historical rows cannot be backfilled |
| `rejected_by` | `UUID REFERENCES auth.users(id)` | Accountability for rejections | Blocking for team safety | Nullable; no backfill                          |

**Impact:** `approveProposal` and `rejectProposal` server actions must write `auth.uid()` into these columns. The `approve_copilot_proposal_atomic` RPC must also be updated to accept and store `in_approved_by`.

### `projects`

| Column   | Type                                       | Purpose        | Blocking?                                  | Migration Notes                                                                                                    |
| -------- | ------------------------------------------ | -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `org_id` | `UUID REFERENCES public.organizations(id)` | Tenant scoping | BLOCKING — required before org model works | Nullable initially; backfill requires creating an org per existing owner. Must become non-nullable after backfill. |

**Impact:** All project queries must eventually add `.eq('org_id', orgId)`. This is a major query change across 20+ server actions.

### `clients`

| Column   | Type                                       | Purpose               | Blocking?              | Migration Notes                     |
| -------- | ------------------------------------------ | --------------------- | ---------------------- | ----------------------------------- |
| `org_id` | `UUID REFERENCES public.organizations(id)` | Org-level CRM scoping | Blocking for org model | Same backfill challenge as projects |

### `businesses`

| Column   | Type                                       | Purpose           | Blocking?              | Migration Notes                            |
| -------- | ------------------------------------------ | ----------------- | ---------------------- | ------------------------------------------ |
| `org_id` | `UUID REFERENCES public.organizations(id)` | Org-level scoping | Blocking for org model | Derivable from client.org_id via migration |

### `budgets`

| Column   | Type                                       | Purpose           | Blocking?    | Migration Notes                                                      |
| -------- | ------------------------------------------ | ----------------- | ------------ | -------------------------------------------------------------------- |
| `org_id` | `UUID REFERENCES public.organizations(id)` | Org-level scoping | Non-blocking | Nullable; budgets can remain user-scoped until org model is enforced |

**Note:** `getBudgetStats` and `getBudgetWithData` currently rely on RLS alone without explicit `.eq('owner_id', user.id)`. This is a pre-existing AGENTS.md violation that must be fixed before RBAC to avoid confusion during the migration.

### `notes`

No structural changes required. The existing `owner_id` + `project_id` pattern will be migrated to project membership semantics in Phase 5.

### `billings`

| Column              | Type | Purpose | Blocking? | Migration Notes                                                                                                                           |
| ------------------- | ---- | ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| (none new required) | —    | —       | —         | The `deleteBilling` action must be audited: it currently does not scope by project_id at the application layer. Fix required before RBAC. |

### `copilot_sessions`, `copilot_messages`

No structural changes required beyond the proposals attribution above.

---

## Section 9 — RLS Migration Strategy

### Current State

Every table with project-scoped data uses one of two RLS patterns:

```sql
-- Pattern A (direct ownership):
USING (owner_id = auth.uid())

-- Pattern B (project join):
USING (EXISTS (
  SELECT 1 FROM projects p
  WHERE p.id = entity.project_id AND p.owner_id = auth.uid()
))
```

Both patterns are binary: you are the owner or you have no access.

### Why This Is Insufficient

Pattern A and Pattern B cannot grant access to a second user without either transferring ownership or sharing the credential. A teammate invited to a project has no `owner_id` claim on any data in that project. Adding `project_members` has zero effect until the RLS policies are rewritten to consult it.

### Target Policy Pattern

```sql
-- Target pattern for project-scoped tables:
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = entity.project_id
      AND pm.user_id = auth.uid()
  )
)

-- During transition (OR logic preserves existing owner access):
USING (
  owner_id = auth.uid()   -- existing owners keep access
  OR
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = entity.project_id
      AND pm.user_id = auth.uid()
  )
)
```

### Which Tables Can Keep Owner Semantics

Personal data that is never shared should keep strict `owner_id = auth.uid()` semantics permanently:

- `profiles`, `user_assets`, `user_preferences` — strictly personal
- `link_categories`, `billing_categories` — user-global categories; consider org migration later
- `project_access`, `project_favorites` — user-specific tracking

### Which Tables Need Membership Semantics

These tables must be rewritten to the membership pattern in Phase 5:

`tasks`, `milestones`, `notes`, `note_links`, `project_note_folders`, `project_links`, `project_document_folders`, `project_files`, `calendar_events`, `todo_lists`, `todo_items`, `idea_boards`, `idea_board_items`, `idea_connections`, `copilot_sessions`, `copilot_messages`, `copilot_proposals`, `budgets`, `budget_categories`, `budget_items`, `billings`

### Transition Strategy

Apply the OR transition logic (owner_id OR membership) first. After `project_members` is populated for all existing projects (migration: insert the current project owner as role `owner`), validate that existing data is accessible. Then in Phase 9, remove the `owner_id` OR clause and enforce strict membership-only access.

### Timing

RLS rewrites cannot happen until:

1. `project_members` table exists (Phase 1)
2. All existing project owners are inserted as `project_members` rows with role `owner` (Phase 1 migration)
3. Index on `(project_id, user_id)` exists on `project_members` (critical for performance)

### Performance Risk

A membership JOIN in every RLS policy is executed on every row returned by every query. Without proper indexes, a project with 1000 tasks will perform 1000 `project_members` lookups. Required indexes before any RLS rewrite:

```sql
CREATE INDEX project_members_lookup ON public.project_members (project_id, user_id);
CREATE INDEX organization_members_lookup ON public.organization_members (org_id, user_id);
```

Additionally, Postgres can cache the membership check within a query using `SET enable_seqscan = off` at the query level or by materializing membership into a stable function. Consider a `has_project_access(project_id UUID)` security-definer function to encapsulate the join and allow Postgres to cache it.

---

## Section 10 — Authorization Resolution Model

### Runtime Flow

```
Incoming request to server action
  │
  ├── requireAuth()                         → unauthenticated: redirect to /
  │       returns User
  │
  ├── Extract context from params           → { projectId?, orgId? }
  │
  ├── hasPermission(user.id, 'tasks.create', { projectId })
  │       │
  │       ├── Query project_members WHERE project_id = projectId AND user_id = user.id
  │       │       → project_role = 'editor'
  │       │
  │       ├── Expand project_role via rbac_role_module_actions
  │       │       → granted = Set['tasks.read', 'tasks.create', 'tasks.update_status', ...]
  │       │
  │       └── granted.has('tasks.create') → true
  │
  ├── Execute Supabase query (scoped by project_id + membership)
  │
  ├── RLS independently validates membership at DB layer
  │       → If application layer has a bug, RLS blocks the query
  │
  └── Return { data?, error? }
```

### Helper Function Signature

```typescript
// lib/rbac/permissions.ts
export async function hasPermission(
  userId: string,
  permissionKey: string,
  context: { projectId?: string; orgId?: string }
): Promise<boolean>;

// Convenience guard — throws redirect or returns { denied: true }
export async function requirePermission(
  userId: string,
  permissionKey: string,
  context: { projectId?: string; orgId?: string }
): Promise<void>;
```

`hasPermission` is the read-only check for conditional rendering data. `requirePermission` is the enforcing guard in server actions — it throws or redirects on denial.

### Where Checks Live

- **Server actions:** Immediately after `requireAuth()`, call `requirePermission(user.id, 'module.action', { projectId })`. This is the primary enforcement point.
- **API routes:** Same pattern — `requireAuth()` then `hasPermission()`.
- **Components:** Receive a `permissions` prop (pre-resolved booleans). Use for conditional rendering only. Never make security decisions in components.
- **Not in:** middleware (too early, no context), `lib/**` domain functions (called from server actions that already checked), RLS (implicit — handles it independently).

### UI Permission Gating

The *FromCache component resolves permissions server-side and passes them as props to the *Client. For example:

```typescript
// ContextBoardFromCache.tsx (server component)
const canCreateTask = await hasPermission(user.id, 'tasks.create', { projectId });
const canDeleteTask = await hasPermission(user.id, 'tasks.delete', { projectId });

return <ContextBoardClient ... permissions={{ canCreateTask, canDeleteTask }} />;
```

The \*Client renders the "Add task" button only if `permissions.canCreateTask` is true. This is purely UX — the server action will reject the request even if the button is somehow triggered.

### Defense-in-Depth

The application layer and the RLS layer are independent. A bug in `hasPermission` (e.g., returning `true` too broadly) will not expose data if the RLS policy is correct. A misconfigured RLS policy (e.g., too permissive) will not expose data if `requirePermission` correctly blocks the query before it reaches the DB. Both layers must be correct for the system to be secure.

---

## Section 11 — Phased Implementation Plan

### Phase Summary Table

| Phase | Name                  | Objective                                               | Key Dependencies      | Success Criteria                                          |
| ----- | --------------------- | ------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| 0     | Audit validation      | Establish truth baseline                                | —                     | Audit document exists                                     |
| 1     | Membership foundation | Create org + project membership tables                  | Phase 0               | Existing owners inserted as project_members               |
| 2     | Schema attribution    | Add created_by, approved_by, org_id to existing tables  | Phase 1               | All nullable columns added; no broken queries             |
| 3     | RBAC metadata         | Create roles/modules/actions tables + seed              | Phase 1               | System roles fully seeded                                 |
| 4     | Authorization layer   | `hasPermission` helper + refactor server actions        | Phase 3               | All server actions call requirePermission                 |
| 5     | RLS rewrite           | Migrate RLS from owner-only to membership-aware         | Phases 1, 4           | All project-scoped tables use membership join             |
| 6     | Teams UI              | Invite members, manage roles, project member management | Phase 4               | Users can invite and manage team members                  |
| 7     | Copilot module gating | Copilot respects team permissions                       | Phase 4               | Proposals require both copilot + target module permission |
| 8     | Audit logging         | Audit_log + logging in server actions                   | Phase 4               | All writes produce audit_log rows                         |
| 9     | Hardening             | Remove legacy OR policies; strict membership RLS        | Phase 5, full testing | No owner_id OR clause in any project-scoped policy        |

---

### Phase 1 — Foundational Membership Model

**Objective:** Create the minimum relational foundation for shared access: organizations and project membership tables. Migrate all existing projects to have their current owner as a project_member with the `owner` role.

**Concrete tasks:**

1. Write migration `YYYYMMDDHHMMSS_organizations.sql`: create `organizations` table, indexes, RLS, `updated_at` trigger.
2. Write migration `YYYYMMDDHHMMSS_organization_members.sql`: create `organization_members` table, indexes, RLS, unique constraint.
3. Write migration `YYYYMMDDHHMMSS_project_members.sql`: create `project_members` table, indexes, RLS, unique constraint.
4. Write data migration to insert one `organizations` row per distinct `projects.owner_id` currently in the DB (can be a Supabase function or edge function invoked once).
5. Write data migration to insert one `project_members` row (role = 'owner') per existing project, mapping `projects.id` + `projects.owner_id`.
6. Add index `project_members_lookup ON project_members (project_id, user_id)`.
7. Add index `organization_members_lookup ON organization_members (org_id, user_id)`.

**Dependencies:** Phase 0 (audit exists — complete).

**Risks:**

- Existing users who have no email may be hard to auto-assign to an org.
- Multi-device users with multiple sessions must all receive org membership.
- The data migration must run atomically or partial state creates orphaned projects.

**Success criteria:**

- All existing projects have at least one `project_members` row.
- All existing users have at least one `organization_members` row.
- `npm run test -- --run` still passes.
- `npm run build` passes.

---

### Phase 2 — Schema Attribution

**Objective:** Add attribution columns (`created_by`, `updated_by`, `approved_by`, `rejected_by`, `org_id`) to existing tables via non-breaking nullable migrations. Update the RPCs and server actions that create/update these entities to write the acting user's ID.

**Concrete tasks:**

1. Migration: add `created_by UUID REFERENCES auth.users(id)` to `tasks` (nullable).
2. Migration: add `assigned_to UUID REFERENCES auth.users(id)` to `tasks` (nullable).
3. Migration: add `created_by UUID` to `milestones` (nullable).
4. Migration: add `completed_by UUID` to `milestones` (nullable).
5. Migration: add `approved_by UUID` and `rejected_by UUID` to `copilot_proposals` (nullable).
6. Migration: add `org_id UUID REFERENCES organizations(id)` to `projects` (nullable first, not-null after backfill).
7. Update `create_task_atomic` RPC to accept and set `in_created_by`.
8. Update `app/actions/tasks.ts`: pass `user.id` as `in_created_by` in `createTask`.
9. Update `app/actions/milestones.ts`: pass `user.id` in `createMilestone`, `completeMilestone`.
10. Update copilot `approveProposal` and `rejectProposal` to write `user.id` into the new columns.
11. Fix `getBudgetStats` and `getBudgetWithData` to add explicit `.eq('owner_id', user.id)` — pre-existing AGENTS.md violation.
12. Fix `deleteBilling` to scope by project_id in the application query, not just rely on owner_id RLS.
13. Update `lib/supabase/types.ts` to reflect new columns.

**Dependencies:** Phase 1 (org and membership tables exist).

**Risks:**

- The `create_task_atomic` RPC update is a Postgres migration — it must be backward compatible or the existing app breaks until the action is also updated. Deploy RPC update and action update together.
- `types.ts` update is large; regenerate from Supabase type generation tool rather than editing manually.

**Success criteria:**

- All migrations run without error.
- `createTask`, `createMilestone`, `approveProposal`, `rejectProposal` write attribution correctly.
- Tests pass; build passes.

---

### Phase 3 — RBAC Metadata Tables

**Objective:** Create the roles/modules/actions/grants tables and seed them with the canonical system roles and all permission keys from Section 5.

**Concrete tasks:**

1. Migration: create `rbac_roles` with system roles seeded in the same migration.
2. Migration: create `rbac_modules` seeded with all 17 module keys.
3. Migration: create `rbac_module_actions` seeded with all ~100 canonical action keys from Section 5.
4. Migration: create `rbac_role_module_actions` seeded with grants for all system roles:
   - `project_viewer`: all `*.read` keys
   - `project_editor`: viewer + `*.create`, `*.update*`, `*.delete` (single, not bulk), `*.archive`, `*.manage_*`
   - `project_owner`: editor + `projects.toggle_module`, `projects.manage_members`, `tasks.bulk_delete`, `documents.bulk_delete`, `tasks.reorder`
   - `org_member`: `clients.read`, `businesses.read`, `projects.read`
   - `org_admin`: org_member + `clients.*`, `businesses.*`, `projects.create`, `teams.*`
   - `org_owner`: org_admin + `workspace.*`
5. Seed script must be idempotent (ON CONFLICT DO NOTHING) so it can be re-run.

**Dependencies:** Phase 1.

**Risks:**

- Over-permissioning system roles at seed time gives too much access by default. Err on the side of restrictive for the first seed; permissions can be added but not easily removed from existing data.
- The full action key list (~100 keys) must be stable before seeding. Any rename after seeding requires a data migration.

**Success criteria:**

- All 17 modules seeded in `rbac_modules`.
- All canonical action keys present in `rbac_module_actions`.
- System role grants match the intended access model.
- No migration errors.

---

### Phase 4 — Authorization Layer

**Objective:** Build the `hasPermission` and `requirePermission` helpers. Refactor all ~110 server actions to call `requirePermission` immediately after `requireAuth()`.

**Concrete tasks:**

1. Create `lib/rbac/permissions.ts` with `hasPermission` and `requirePermission`.
2. Create `lib/rbac/cache.ts` — a per-request cache for permission lookups (avoid N+1 DB calls when multiple checks run in one server action).
3. Refactor `app/actions/tasks.ts`: add `requirePermission(user.id, 'tasks.create', { projectId })` to `createTask`, etc.
4. Refactor all 27 action files with the appropriate permission keys.
5. Refactor `app/api/copilot/[projectId]/chat/route.ts`: add `hasPermission` check for `copilot.send_message`.
6. Add Vitest tests for `hasPermission` with mocked Supabase client covering: granted, denied, missing membership, invalid context.
7. Gate `setProjectModuleEnabled` on `projects.toggle_module` permission (currently only `requireAuth()` — HIGH RISK).

**Dependencies:** Phase 3 (roles and actions tables seeded).

**Risks:**

- Refactoring 110 server actions is high-surface-area work. Any missed action is a security gap.
- The per-request permission cache must be request-scoped (not module-scoped) to avoid cross-request data leakage in the Next.js server.
- Performance: `hasPermission` makes 2 DB queries (membership lookup + role expansion). Batch resolution where multiple checks are needed in one action.

**Success criteria:**

- Every server action and API route calls `requirePermission` (or `hasPermission`) after `requireAuth`.
- Vitest tests for `hasPermission` pass.
- Existing 74+ tests still pass.
- Build passes.

---

### Phase 5 — RLS Rewrite

**Objective:** Migrate all project-scoped RLS policies from `owner_id = auth.uid()` to the membership join pattern, using OR transition logic to avoid breaking existing access.

**Concrete tasks:**

1. Write migration for `tasks` RLS: replace project join with membership join (OR transition).
2. Write migrations for `milestones`, `notes`, `note_links`, `project_note_folders`.
3. Write migrations for `project_links`, `link_categories` (keep `owner_id` for link_categories as they remain user-global).
4. Write migrations for `project_files`, `project_document_folders`.
5. Write migrations for `calendar_events`, `todo_lists`, `todo_items`.
6. Write migrations for `idea_boards`, `idea_board_items`, `idea_connections`.
7. Write migrations for `copilot_sessions`, `copilot_messages`, `copilot_proposals`.
8. Write migrations for `budgets`, `budget_categories`, `budget_items`.
9. Write migrations for `billings`.
10. Validate with integration tests: project owner can still read own data; invited member (with editor role) can read and write; viewer cannot write; non-member gets empty set.

**Dependencies:** Phase 1 (project_members populated), Phase 4 (application layer validated so RLS is defense-in-depth not primary enforcement).

**Risks:**

- A single wrong policy on `tasks` blocks the entire board for all users. Each table must be tested in isolation before the next.
- Supabase RLS changes take effect immediately. There is no staging mode.
- Storage bucket policies (for `project-docs` and `project-media`) are separate from table RLS and are not addressed by this phase. Document this gap explicitly.

**Success criteria:**

- Existing project owners can access all their data identically to before.
- A second user added as `project_editor` via `project_members` can read and write project-scoped data.
- A user with no `project_members` row for a project gets zero rows back on all project-scoped queries.
- Playwright tests for board, notes, documents, and billings pass with a two-user test scenario.

---

### Phase 6 — Teams UI

**Objective:** Build the UI for inviting members, managing roles, and viewing team membership for both organizations and projects.

**Concrete tasks:**

1. Create `app/context/[projectId]/owner/` page updates or a new team management section within the Owner tab.
2. Create server actions: `inviteProjectMember`, `removeProjectMember`, `updateProjectMemberRole` under `app/actions/teams.ts`.
3. Create server actions: `inviteOrgMember`, `removeOrgMember`, `updateOrgMemberRole`.
4. Add i18n keys to `locales/en.json` and `locales/es.json` for all teams-related strings.
5. Create `SkeletonTeams.tsx` shimmer skeleton.
6. Build `TeamsClient.tsx` following the `Context*Client` pattern.
7. All mutations use `MutationErrorDialog` pattern — no `alert()`.
8. Add Playwright happy-path test: project owner invites user → user sees project in sidebar.

**Dependencies:** Phase 4 (permissions enforced before UI is built).

**Risks:**

- Invitation flow requires email delivery (Supabase Auth invite or custom flow). This is a net-new infrastructure requirement not currently in the codebase.

**Success criteria:**

- Project owner can invite a user by email and assign a role.
- Invited user can access the project after accepting.
- Non-owner cannot access the teams management UI (gated by `projects.manage_members`).

---

### Phase 7 — Copilot Module Gating

**Objective:** Ensure copilot proposals respect team permissions. Approving a `task` proposal requires `tasks.create`. Approving a `delete_task` proposal requires `tasks.delete`. The copilot registry dispatch must check both `copilot.approve_proposal` and the target module's action key.

**Concrete tasks:**

1. Update `app/context/[projectId]/copilot/actions.ts`: `approveProposal` checks `copilot.approve_proposal` + the target capability's required permission key.
2. Add a `requiredPermission` field to each `CopilotModuleCapability` in `lib/copilot/registry/types.ts`.
3. Populate `requiredPermission` for all 29 proposal types across all 9 registry modules.
4. Ensure `approved_by` is written to `copilot_proposals` on every approval (Phase 2 prerequisite).
5. Add Vitest tests for the dispatch guard: user without `tasks.create` cannot approve a `task` proposal.

**Dependencies:** Phase 4 (authorization layer), Phase 2 (approved_by column).

**Risks:**

- The registry modules currently use `ctx.supabase` directly rather than calling server actions. The permission check must happen in `approveProposal` (the server action), not inside the registry module's `approve` function — or the check is bypassed.

**Success criteria:**

- A `project_viewer` cannot approve any copilot proposal that creates or modifies data.
- A `project_editor` can approve create and update proposals but not bulk_delete proposals.
- Tests pass.

---

### Phase 8 — Audit Logging

**Objective:** Write an `audit_log` row for every significant write in every server action.

**Concrete tasks:**

1. Create `lib/rbac/audit.ts` with `logAuditEvent(event: AuditEvent): Promise<void>`.
2. Integrate `logAuditEvent` into every write server action (create, update, delete, approve, reject).
3. Ensure `logAuditEvent` never throws — it catches its own errors and logs to Sentry but does not block the main operation.
4. Build a simple read UI for org admins to view their org's audit log (basic list, date filter).
5. Add i18n keys for audit log display.

**Dependencies:** Phase 4 (user and context are available), Phase 1 (org_id is available).

**Risks:**

- If `logAuditEvent` is synchronous and the insert fails, it must not fail the parent transaction. Use a fire-and-forget pattern with error capture via `captureWithContext`.
- The `payload_summary` field must never include passwords, tokens, or PII beyond what the privacy policy allows.

**Success criteria:**

- Every create/update/delete action produces a row in `audit_log`.
- Org admins can view their org's audit log.
- Performance of server actions is not measurably degraded (log insert is non-blocking).

---

### Phase 9 — Hardening and Rollout

**Objective:** Remove all legacy OR transition logic from RLS policies. Enforce strict membership-only access. Validate that no existing functionality is broken.

**Concrete tasks:**

1. Run full E2E Playwright test suite with two-user scenarios for every context tab.
2. Remove `owner_id = auth.uid()` OR clause from all project-scoped RLS policies (tasks, milestones, notes, documents, media, calendar, links, ideas, budgets, billings, todos, copilot).
3. Update storage bucket policies for `project-docs` and `project-media` to allow access by project members.
4. Run load test to validate RLS membership join performance at scale (simulate 100 concurrent project members).
5. Address `reorder_links_atomic` RPC — the N+1 write in `reorderProjectLinksAction` is a correctness risk under concurrent team usage and must be resolved before hardening.
6. Remove `checkIsAdmin()` from `lib/auth.ts` or implement it properly as `is_system_admin` check.
7. Document all known remaining gaps in `docs/audits/rbac-gaps-post-hardening.md`.

**Dependencies:** All previous phases complete and validated.

**Risks:**

- Removing the owner_id OR clause is irreversible without a re-migration. Ensure all project owners have `project_members` rows before this step.
- Storage bucket policy changes affect all existing signed URLs. Regeneration may be required.

**Success criteria:**

- All Playwright tests pass with strict membership RLS.
- No authenticated user can access a project they are not a member of via any server action.
- Load test shows RLS membership check adds less than 5ms per query at P95.
- `reorder_links_atomic` RPC is implemented and replaces the N+1 loop.

---

## Section 12 — Risks, Breaking Changes, and Compatibility Concerns

| Risk                                                               | Severity | Affected Area                       | Description                                                                                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                  |
| ------------------------------------------------------------------ | -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS performance degradation from membership joins                  | High     | All project-scoped tables (15+)     | Every query that returns multiple rows will now execute a `project_members` EXISTS subquery per row. Without indexes, this is O(n) per result set.                                                                                                                                       | Create compound index `(project_id, user_id)` on `project_members` before any RLS rewrite. Consider a `has_project_access(uuid)` security-definer function to memoize within a transaction. |
| Backfill failures for `org_id` on projects                         | High     | `projects`, `clients`, `businesses` | Existing rows have no `org_id`. Adding `org_id NOT NULL` requires all rows to be backfilled atomically. If the backfill script has a bug, the migration cannot be rolled back without data corruption.                                                                                   | Add `org_id` as nullable first. Run backfill as a separate script. Validate 100% coverage. Add NOT NULL constraint only after validation.                                                   |
| All existing data has no organization                              | High     | Entire data model                   | The organization concept does not exist for any historical data. The first migration must synthesize one org per owner. This is a complex bootstrapping problem for existing production data.                                                                                            | Create a "personal workspace" org for every existing user automatically. Name it from the user's display_name or email. This org contains all their existing projects.                      |
| copilot proposals unattributed retroactively                       | Medium   | `copilot_proposals`                 | Historical proposals cannot have `approved_by` / `rejected_by` populated after the fact.                                                                                                                                                                                                 | Accept that historical rows have NULL in these columns. Treat NULL as "approved by original owner (pre-RBAC)" in display logic.                                                             |
| `checkIsAdmin()` dead code creates confusion                       | Low      | `lib/auth.ts`                       | The function exists, never runs, and looks like a placeholder for a system admin role. In Phase 4, engineers may accidentally call it thinking it's the permission check.                                                                                                                | Remove it in Phase 4 and replace with the `is_system_admin` check on `organization_members`.                                                                                                |
| N+1 write in `reorderProjectLinksAction`                           | Medium   | Links module                        | One UPDATE per link per reorder operation. Under concurrent team usage, two members reordering simultaneously will corrupt `sort_order`.                                                                                                                                                 | Must be resolved before Phase 9. Implement `reorder_links_atomic` RPC as noted in `AGENTS.md §6b`.                                                                                          |
| Owner semantics vs. membership semantics conflict during migration | High     | All project-scoped tables           | During the transition period (Phase 5), the OR policy means both the owner check AND the membership check must work. This doubles the complexity of testing. Any migration that incorrectly drops the owner_id check before all project_members rows exist will lock out existing users. | Use a strict deployment order: add membership join FIRST (OR logic), validate, then remove owner_id clause (Phase 9). Never do both in a single migration.                                  |
| Broad permission keys in early phases allowing over-permissioning  | Medium   | All modules                         | If `[TRANSITIONAL]` broad keys like `milestones.update` or `calendar.update` are used in the initial seed, they cannot easily be split later without migrating all existing role grants.                                                                                                 | Prefer specific keys from the start. Only mark keys `[TRANSITIONAL]` where splitting requires new schema that does not yet exist. Revisit all transitional keys before Phase 9.             |
| Storage bucket policy gap                                          | High     | Documents, Media                    | Table RLS is rewritten but Supabase Storage bucket policies still check `owner_id` path prefix. Team members cannot view documents even if project RLS grants access.                                                                                                                    | Explicitly document this as a known gap after Phase 5. Address storage policies separately in Phase 9 — this requires Supabase Storage policy rewriting, not SQL migrations.                |
| Copilot API route rate limiting                                    | High     | Copilot                             | The `/api/copilot/[projectId]/chat/route.ts` has no rate limiting. In a multi-user team, every member can make unlimited AI calls under the same API key.                                                                                                                                | Add rate limiting middleware before multi-user launch. Use a per-org or per-user quota enforced at the application layer or via Supabase Edge Functions.                                    |

---

## Section 13 — Recommended Immediate Next Steps

The following steps are ordered by dependency. Steps marked `[BLOCKING]` are prerequisites for every phase that follows them.

1. **[BLOCKING] Design and finalize the `organizations` table schema**, including the org creation flow during user signup. Every existing user must be assigned to a personal organization. Decide: single-org per user initially, or allow multi-org? This decision affects the `organization_members` join table complexity. Commit the schema before writing migrations.

2. **[BLOCKING] Write and run Phase 1 migrations** (`organizations`, `organization_members`, `project_members`). Include the data migration that seeds one org per existing owner and one `project_members` row (role = 'owner') per existing project. Validate in a staging environment before production.

3. **Fix the two pre-existing AGENTS.md violations** before RBAC work begins: (a) Add `.eq('owner_id', user.id)` to `getBudgetStats` and `getBudgetWithData`. (b) Add project-level scope to `deleteBilling`. These violations become security bugs the moment membership semantics are introduced.

4. **Implement `reorder_links_atomic` RPC** to eliminate the N+1 write in `reorderProjectLinksAction`. This must be done before Phase 9 hardening and is a blocking correctness issue under concurrent team usage. The implementation pattern is identical to `move_task_atomic`.

5. **[BLOCKING] Write Phase 3 migrations** (RBAC metadata tables) and seed all module keys, action keys, and system role grants. The seed data must be reviewed by the product team to confirm which actions each system role grants. Lock the canonical action key list before seeding — renaming keys after seeding requires data migrations.

6. **[BLOCKING] Implement `lib/rbac/permissions.ts`** (`hasPermission`, `requirePermission`). Include a per-request cache. Write Vitest tests covering the grant path, deny path, missing membership, and invalid context. This function is called in every server action in Phase 4.

7. **Audit all ~110 server actions and create a checklist** mapping each function to its required permission key. Do this before Phase 4 to surface any ambiguities in the canonical key list. Any action that maps to an ambiguous key needs product clarification before code is written.

8. **Remove or implement `checkIsAdmin()`** in `lib/auth.ts`. Either delete it and replace with a `is_system_admin` lookup on `organization_members`, or document precisely when it will be called. Leaving dead code in a security-critical file is a maintenance risk.

9. **Add Playwright two-user test infrastructure**. Current tests run as a single authenticated user. Phase 5 RLS testing requires a second user account in the test environment, ability to create `project_members` rows in test setup, and assertions that a non-member gets empty results. Build this test harness before Phase 5 begins.

10. **Document the storage bucket policy gap explicitly**. Create `docs/audits/storage-rbac-gap-YYYYMMDD.md` noting that `project-docs` and `project-media` bucket policies are not addressed by table RLS rewrites and require a separate migration to Supabase Storage policies referencing `project_members`.

---

## Section 14 — Appendix: Transitional Mapping from Audit Findings

The audit's Master Permission Matrix (Section 10 of `repo-audit.md`) used colon notation (`module:action`). The canonical standard for this codebase is dot notation (`module.action`). The table below maps every audit finding to normalized, split permission keys with rationale.

| Audit Finding    | Audit Action Key                                  | Normalized Permission Keys                                                                                                                                         | Split Reason                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tasks            | `tasks:update`                                    | `tasks.update_title`, `tasks.update_status`, `tasks.update_priority`, `tasks.update_due_date`, `tasks.update_notes`, `tasks.update_tags`, `tasks.update_milestone` | Status changes (board moves) are the most frequent operation; priority changes are audit-sensitive; due date changes affect project timelines. All benefit from distinct audit trail entries.                                                                               |
| tasks            | `tasks:move`                                      | `tasks.update_status`, `tasks.reorder`                                                                                                                             | Move covers two distinct semantics: changing the column (status) and reordering within a column (order_index). A viewer might need to see status but not reorder.                                                                                                           |
| tasks            | `tasks:bulk_delete`                               | `tasks.bulk_delete`                                                                                                                                                | Kept separate from `tasks.delete` because bulk delete is a higher-risk operation requiring a distinct, more restrictive grant.                                                                                                                                              |
| milestones       | `milestones:update`                               | `milestones.update` [TRANSITIONAL]                                                                                                                                 | Title, description, and date edits are always done together. No meaningful split currently. Revisit if due-date-gating is added.                                                                                                                                            |
| milestones       | `milestones:complete`, `milestones:reopen`        | `milestones.complete`, `milestones.reopen`                                                                                                                         | Status transitions via RPCs are distinct from metadata edits; important for workflow control.                                                                                                                                                                               |
| notes            | `notes:update`                                    | `notes.update_title`, `notes.update_content`                                                                                                                       | Title is edited frequently without content changes (renaming). Content edits are the primary write operation. Split allows read-only users to still have metadata visibility without edit access.                                                                           |
| notes            | `notes.links:write`                               | `notes.add_link`, `notes.delete_link`                                                                                                                              | Adding and removing links are distinct in intent. A viewer might add a link but not delete one.                                                                                                                                                                             |
| notes            | `notes.folders:write`                             | `notes.manage_folders`                                                                                                                                             | Folder management (create/update/delete) is one conceptual action at a permissions level. [TRANSITIONAL]                                                                                                                                                                    |
| documents        | `documents:upload` + `documents:bulk_upload`      | `documents.upload`                                                                                                                                                 | Collapsed to one key — bulk upload is an optimization of single upload, same permission semantics.                                                                                                                                                                          |
| documents        | `documents:update`                                | `documents.update_metadata`                                                                                                                                        | Renamed for clarity — this covers title, description, category, tags. Not a document content edit.                                                                                                                                                                          |
| documents        | `documents:view_signed_url`                       | `documents.view_signed_url`                                                                                                                                        | Kept separate from `documents.read` — generating a signed URL creates a time-limited credential and uses Supabase Storage, distinct from reading metadata.                                                                                                                  |
| documents        | `documents:mark_final`                            | `documents.mark_final`                                                                                                                                             | Distinct semantic: marks a version as approved. Should require a higher role than `update_metadata`.                                                                                                                                                                        |
| documents        | `documents.folders:write`                         | `documents.manage_folders`                                                                                                                                         | [TRANSITIONAL] Same pattern as notes.                                                                                                                                                                                                                                       |
| media            | `media:share_create`                              | `media.share_create`                                                                                                                                               | Creating a public share token is a distinct, elevated action — it creates a public URL with no further auth. Kept completely separate from `media.read`.                                                                                                                    |
| links            | `links:reorder`                                   | `links.reorder`                                                                                                                                                    | Kept separate — requires `reorder_links_atomic` RPC implementation. Under concurrent team usage, reorder is the most race-condition-prone operation.                                                                                                                        |
| links            | `links.categories:write`                          | `links.manage_categories`                                                                                                                                          | Collapsed create/update/delete into one key. Scope is user-global (link_categories has owner_id, not project_id).                                                                                                                                                           |
| billings         | `billings:update`                                 | `billings.update_amount`, `billings.update_status`, `billings.update_description`                                                                                  | Amount changes are financial corrections needing audit; status changes (paid/pending/overdue) are the core workflow action; description is the lowest-risk edit. All three produce separate audit entries.                                                                  |
| budgets          | `budgets.categories:write`, `budgets.items:write` | `budgets.manage_categories`, `budgets.manage_items`                                                                                                                | [TRANSITIONAL] Both are collapsed. Split when category management needs to be restricted to project owners only.                                                                                                                                                            |
| clients          | `clients:write` (implicit)                        | `clients.create`, `clients.update`, `clients.delete`, `clients.manage_links`, `clients.link_to_project`                                                            | Clients actions use legacy `Action` suffix in code — cleaned up in naming. Client links are a sub-entity with distinct semantics.                                                                                                                                           |
| copilot          | `copilot:approve_proposal`                        | `copilot.approve_proposal` + target module's action key                                                                                                            | Approval is not just a copilot permission — it executes writes on the target module. Phase 7 adds dual-permission check: user must hold both `copilot.approve_proposal` AND the target module's write action.                                                               |
| members          | (does not exist today)                            | `teams.invite_member`, `teams.remove_member`, `teams.update_member_role`, `teams.read_members`                                                                     | No action exists today. These are net-new actions for Phase 6. Named under `teams` module to be distinct from `projects.manage_members` which is a project-level convenience action.                                                                                        |
| settings         | `settings:update`                                 | `workspace.update_appearance`, `workspace.update_name`, `workspace.manage_billing_plan`, `workspace.danger_zone`                                                   | The current `settings` is a single user-preference page. Split into `profile` (own) and `workspace` (org) scopes. Each workspace action has a different risk profile requiring different role grants.                                                                       |
| projects.modules | `projects.modules:write`                          | `projects.toggle_module`                                                                                                                                           | Currently gated only by `requireAuth()`. In RBAC, this must require `project_owner` or higher. High risk: any authenticated user could currently toggle modules if they can reach the action (RLS blocks the underlying change, but the action itself is not role-checked). |

---

_End of RBAC Normalization & Implementation Plan._
_Next review: after Phase 1 migrations are drafted for team validation._
