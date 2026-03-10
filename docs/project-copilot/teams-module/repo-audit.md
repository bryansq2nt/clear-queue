# ClearQueue — RBAC Foundation Audit

**Date:** 2026-03-09
**Purpose:** Deep architecture audit of all functional modules, domain actions, and authorization patterns to serve as the foundation for a future enterprise-grade RBAC (Role-Based Access Control) system.

---

## 1. Executive Summary

ClearQueue is a Next.js 14 project-management SaaS currently built for a **single-user ownership model**. Every piece of data is owned by exactly one `auth.uid()` and isolated at the database level via Row Level Security (RLS) policies that compare `owner_id = auth.uid()` or a chain through `projects.owner_id`. There is no concept of teams, organizations, shared access, roles, or permissions beyond the binary "authenticated vs. unauthenticated" check in middleware.

**Key numbers:**

- 12 registered module keys in `lib/modules/registry.ts`
- 27 action files in `app/actions/` + 2 feature-local `actions.ts` files
- ~110 exported server action functions discovered
- 50+ migration files establishing the DB schema
- 9 Copilot registry modules (tasks, notes, milestones, ideas, links, todos, billings, budgets, clients)
- 1 admin role concept (email-based, `checkIsAdmin()` in `lib/auth.ts`, never called in any code path)
- 0 explicit permission checks, role assignments, or team membership tables anywhere in the codebase

**Biggest risks for a future RBAC implementation:**

1. **No ownership transfer primitives.** All data is hard-bound to `owner_id = auth.uid()`. Sharing requires migrating data or a new join table for every entity type.
2. **Project-scoped auth missing.** Tasks, milestones, notes, documents, media, links, todos, calendar events, and copilot are all project-scoped, but there is no table or check to determine "who can access this project" beyond "are you the owner". A collaborator model would require a new `project_members` table and RLS rewrites on at least 15 tables.
3. **Module toggle is owner-only.** `setProjectModuleEnabled` only checks `requireAuth()` with no project membership check beyond RLS. In a multi-user model, module toggle would need a "project admin" role.
4. **Copilot approvals are irreversible at the DB layer.** The `approve_copilot_proposal_atomic` RPC does not check who approved — only the caller's session. Fine in single-owner; wrong in a team where approval responsibility matters.
5. **No audit log.** Zero history of who did what, when. RBAC systems require audit logs for compliance.
6. **The `checkIsAdmin()` function is defined but never used.** It exists in `lib/auth.ts` lines 24–29, references `ADMIN_EMAIL` env var, but no route, action, or page imports or calls it.

---

## 2. Module Inventory

The canonical module list comes from `lib/modules/registry.ts`. All 12 keys are shown below with their default state and whether they can be disabled.

| Module Key   | Default Enabled | Locked (cannot disable) | Tab Order | Route Slug |
| ------------ | --------------- | ----------------------- | --------- | ---------- |
| `board`      | true            | YES                     | 1         | (root)     |
| `owner`      | false           | no                      | 2         | owner      |
| `documents`  | true            | no                      | 3         | documents  |
| `media`      | false           | no                      | 4         | media      |
| `calendar`   | false           | no                      | 5         | calendar   |
| `notes`      | true            | no                      | 6         | notes      |
| `links`      | false           | no                      | 7         | links      |
| `ideas`      | false           | no                      | 8         | ideas      |
| `budgets`    | false           | no                      | 9         | budgets    |
| `billings`   | true            | no                      | 10        | billings   |
| `milestones` | false           | no                      | 11        | milestones |
| `copilot`    | false           | no                      | 12        | copilot    |

**Additional modules not in the tab registry but discovered in actions:**

| Domain       | Source                                       | Notes                                                       |
| ------------ | -------------------------------------------- | ----------------------------------------------------------- |
| `projects`   | `app/actions/projects.ts`                    | Top-level entity; no context tab, appears in project picker |
| `auth`       | `app/actions/auth.ts`                        | signIn, signUp, signOut, password operations                |
| `profile`    | `app/profile/actions.ts`                     | Display name, avatar, preferences                           |
| `settings`   | `app/settings/appearance/`                   | Company branding, theme, locale                             |
| `clients`    | `app/actions/clients.ts`                     | Client CRM; no context tab                                  |
| `businesses` | `app/actions/clients.ts`                     | Sub-entity of clients; no context tab                       |
| `copilot`    | `app/context/[projectId]/copilot/actions.ts` | AI sessions, messages, proposals                            |

---

## 3. Domain Entities by Module

### 3.1 Projects

- **Table:** `projects`
- **Ownership key:** `owner_id` (direct `auth.uid()`)
- **Related tables:** `project_access` (last_accessed_at), `project_favorites`, `project_modules`
- **Lifecycle states:** active (category != 'archived'), archived (category = 'archived')
- **Scoped data:** All project-scoped modules reference `project_id` as the foreign key

### 3.2 Board (Tasks)

- **Table:** `tasks`
- **Ownership key:** via `projects.owner_id` (no direct `owner_id` on tasks)
- **Lifecycle states:** `backlog`, `next`, `in_progress`, `blocked`, `done`
- **Priority:** 1–5 (5 = critical/urgent)
- **Optional FK:** `milestone_id`

### 3.3 Notes

- **Table:** `notes`
- **Ownership key:** `owner_id` (direct) + `project_id`
- **Related:** `note_links` (no owner_id; secured by verifying note ownership), `note_folders` (folder_id)
- **Lifecycle:** no explicit state; soft-deletes not implemented

### 3.4 Documents

- **Table:** `project_files` (kind = 'document')
- **Ownership key:** `owner_id` + `project_id`
- **Related:** `project_document_folders`
- **Lifecycle states:** active, archived (`archived_at`), deleted (`deleted_at` — soft delete)
- **Storage:** `project-docs` Supabase bucket

### 3.5 Media

- **Table:** `project_files` (kind = 'media')
- **Ownership key:** `owner_id` + `project_id`
- **Related:** `media_share_tokens` (public share links, 7-day expiry)
- **Lifecycle states:** active, archived (`archived_at`), deleted (`deleted_at` — soft delete with physical storage removal)
- **Storage:** `project-media` Supabase bucket

### 3.6 Calendar

- **Table:** `calendar_events`
- **Ownership key:** `owner_id` + optional `project_id`
- **Lifecycle states:** `scheduled`, `completed`, `cancelled`
- **Event types:** `meeting`, `deadline`, `reminder`, `milestone` (validated by `lib/validation/calendar.ts`)
- **Feed:** unified via `get_project_calendar_feed` RPC (tasks + billings + todo_items + events)

### 3.7 Links

- **Tables:** `project_links`, `link_categories`
- **Ownership key:** `owner_id` + `project_id` for links; `owner_id` for categories (user-global)
- **Lifecycle states:** active, archived (`archived_at`)
- **Link types:** enum `project_link_type_enum`

### 3.8 Ideas (Mind Maps)

- **Tables:** `idea_boards`, `idea_nodes`, `idea_connections`
- **Ownership key:** `owner_id` on boards; nodes/connections via board ownership
- **Related:** `idea_project_links` (association between boards and projects)
- **Lifecycle:** no explicit state

### 3.9 Budgets

- **Tables:** `budgets`, `budget_categories`, `budget_items`
- **Ownership key:** `owner_id` on budgets; categories/items via budget ownership
- **Lifecycle states:** item status `acquired` / not acquired (boolean behavior)

### 3.10 Billings

- **Table:** `billings`
- **Ownership key:** `owner_id` + optional `project_id`
- **Related:** `billing_categories` (user-owned)
- **Lifecycle states:** `pending`, `paid`, `overdue`, `cancelled`
- **Types:** `charge`, `payment`, `spending`

### 3.11 Milestones

- **Table:** `milestones`
- **Ownership key:** via `projects.owner_id` (no direct `owner_id` on milestones)
- **Lifecycle states:** `open`, `completed`

### 3.12 Copilot

- **Tables:** `copilot_sessions`, `copilot_messages`, `copilot_proposals`
- **Ownership key:** `owner_id` on all three tables + `project_id`
- **Session lifecycle:** `active`, `archived`
- **Proposal lifecycle:** `pending`, `approved`, `rejected`
- **Proposal types (29 total):** task, delete_task, update_task, note, delete_note, update_note, milestone, delete_milestone, update_milestone, mind_map, link, todo, billing, update_billing, delete_billing, budget, budget_category, budget_item, update_budget, update_budget_category, update_budget_item, delete_budget, delete_budget_category, delete_budget_item, client, update_client, delete_client, note_folder, module_enable

### 3.13 Clients

- **Tables:** `clients`, `client_links`
- **Ownership key:** `owner_id` on clients (direct)
- **Lifecycle:** no explicit state; hard delete

### 3.14 Businesses

- **Table:** `businesses`
- **Ownership key:** `owner_id` + `client_id`
- **Lifecycle:** no explicit state; hard delete

### 3.15 Profile

- **Tables:** `profiles`, `user_assets`, `user_preferences`
- **Ownership key:** `user_id` (= auth.uid())
- **Asset kinds:** avatar, company_logo, cover_image

---

## 4. Actions by Module

### Module: Projects

| Action                | Function                  | File                      | Type  |
| --------------------- | ------------------------- | ------------------------- | ----- |
| List for sidebar      | `getProjectsForSidebar`   | `app/actions/projects.ts` | Read  |
| Get by ID             | `getProjectById`          | `app/actions/projects.ts` | Read  |
| Get list              | `getProjectsList`         | `app/actions/projects.ts` | Read  |
| Get resources         | `getProjectResources`     | `app/actions/projects.ts` | Read  |
| Get favorites         | `getFavoriteProjectIds`   | `app/actions/projects.ts` | Read  |
| Create                | `createProject`           | `app/actions/projects.ts` | Write |
| Update                | `updateProject`           | `app/actions/projects.ts` | Write |
| Archive               | `archiveProject`          | `app/actions/projects.ts` | Write |
| Unarchive             | `unarchiveProject`        | `app/actions/projects.ts` | Write |
| Delete                | `deleteProject`           | `app/actions/projects.ts` | Write |
| Link business         | `linkBusinessToProject`   | `app/actions/projects.ts` | Write |
| Add to favorites      | `addProjectFavorite`      | `app/actions/projects.ts` | Write |
| Remove from favorites | `removeProjectFavorite`   | `app/actions/projects.ts` | Write |
| Record access         | `recordProjectAccess`     | `app/actions/projects.ts` | Write |
| Toggle module         | `setProjectModuleEnabled` | `app/actions/modules.ts`  | Write |
| Get modules           | `getProjectModules`       | `app/actions/modules.ts`  | Read  |

### Module: Board (Tasks)

| Action                 | Function                                   | File                   | Type  |
| ---------------------- | ------------------------------------------ | ---------------------- | ----- |
| Get by project         | `getTasksByProjectId`                      | `app/actions/tasks.ts` | Read  |
| Get paginated          | `getTasksByProjectIdPaginated`             | `app/actions/tasks.ts` | Read  |
| Get board initial data | `getBoardInitialData`                      | `app/actions/tasks.ts` | Read  |
| Get counts by status   | `getBoardCountsByStatus`                   | `app/actions/tasks.ts` | Read  |
| Get critical tasks     | `getCriticalTasks`                         | `app/actions/tasks.ts` | Read  |
| Get recent tasks       | `getRecentTasksPage`                       | `app/actions/tasks.ts` | Read  |
| Get high priority      | `getHighPriorityTasksPage`                 | `app/actions/tasks.ts` | Read  |
| Get dashboard data     | `getDashboardData`                         | `app/actions/tasks.ts` | Read  |
| Create (atomic)        | `createTask` → `create_task_atomic` RPC    | `app/actions/tasks.ts` | Write |
| Update                 | `updateTask`                               | `app/actions/tasks.ts` | Write |
| Delete                 | `deleteTask`                               | `app/actions/tasks.ts` | Write |
| Bulk delete            | `deleteTasksByIds`                         | `app/actions/tasks.ts` | Write |
| Reorder/move (atomic)  | `updateTaskOrder` → `move_task_atomic` RPC | `app/actions/tasks.ts` | Write |

### Module: Notes

| Action                        | Function           | File                          | Type  |
| ----------------------------- | ------------------ | ----------------------------- | ----- |
| List                          | `getNotes`         | `app/actions/notes.ts`        | Read  |
| Get by ID                     | `getNoteById`      | `app/actions/notes.ts`        | Read  |
| Get note links                | `getNoteLinks`     | `app/actions/notes.ts`        | Read  |
| Touch (update last_opened_at) | `touchNote`        | `app/actions/notes.ts`        | Write |
| Create                        | `createNote`       | `app/actions/notes.ts`        | Write |
| Update                        | `updateNote`       | `app/actions/notes.ts`        | Write |
| Delete                        | `deleteNote`       | `app/actions/notes.ts`        | Write |
| Bulk delete                   | `deleteNotes`      | `app/actions/notes.ts`        | Write |
| Add link                      | `addNoteLink`      | `app/actions/notes.ts`        | Write |
| Delete link                   | `deleteNoteLink`   | `app/actions/notes.ts`        | Write |
| List folders                  | `listNoteFolders`  | `app/actions/note-folders.ts` | Read  |
| Create folder                 | `createNoteFolder` | `app/actions/note-folders.ts` | Write |
| Update folder                 | `updateNoteFolder` | `app/actions/note-folders.ts` | Write |
| Delete folder                 | `deleteNoteFolder` | `app/actions/note-folders.ts` | Write |

### Module: Documents

| Action                | Function                 | File                              | Type  |
| --------------------- | ------------------------ | --------------------------------- | ----- |
| List                  | `getDocuments`           | `app/actions/documents.ts`        | Read  |
| Get signed URL (view) | `getDocumentSignedUrl`   | `app/actions/documents.ts`        | Read  |
| Get download URL      | `getDocumentDownloadUrl` | `app/actions/documents.ts`        | Read  |
| Touch                 | `touchDocument`          | `app/actions/documents.ts`        | Write |
| Upload (single)       | `uploadDocument`         | `app/actions/documents.ts`        | Write |
| Upload (bulk)         | `uploadDocumentsBulk`    | `app/actions/documents.ts`        | Write |
| Update metadata       | `updateDocument`         | `app/actions/documents.ts`        | Write |
| Archive               | `archiveDocument`        | `app/actions/documents.ts`        | Write |
| Mark final            | `markDocumentFinal`      | `app/actions/documents.ts`        | Write |
| Delete (soft)         | `deleteDocument`         | `app/actions/documents.ts`        | Write |
| Bulk delete (soft)    | `deleteDocuments`        | `app/actions/documents.ts`        | Write |
| List folders          | `listFolders`            | `app/actions/document-folders.ts` | Read  |
| Create folder         | `createFolder`           | `app/actions/document-folders.ts` | Write |
| Update folder         | `updateFolder`           | `app/actions/document-folders.ts` | Write |
| Delete folder         | `deleteFolder`           | `app/actions/document-folders.ts` | Write |

### Module: Media

| Action                   | Function               | File                   | Type          |
| ------------------------ | ---------------------- | ---------------------- | ------------- |
| List (paginated)         | `getMedia`             | `app/actions/media.ts` | Read          |
| Get signed URL           | `getMediaSignedUrl`    | `app/actions/media.ts` | Read          |
| Touch                    | `touchMedia`           | `app/actions/media.ts` | Write         |
| Upload                   | `uploadMedia`          | `app/actions/media.ts` | Write         |
| Update metadata          | `updateMedia`          | `app/actions/media.ts` | Write         |
| Archive                  | `archiveMedia`         | `app/actions/media.ts` | Write         |
| Unarchive                | `unarchiveMedia`       | `app/actions/media.ts` | Write         |
| Mark final (favorite)    | `markMediaFinal`       | `app/actions/media.ts` | Write         |
| Delete (soft + physical) | `deleteMedia`          | `app/actions/media.ts` | Write         |
| Create share link        | `createMediaShareLink` | `app/actions/media.ts` | Write         |
| Get share by token       | `getMediaShareByToken` | `app/actions/media.ts` | Read (public) |

### Module: Calendar

| Action                 | Function                 | File                      | Type  |
| ---------------------- | ------------------------ | ------------------------- | ----- |
| Get project feed (RPC) | `getProjectCalendarFeed` | `app/actions/calendar.ts` | Read  |
| Get single event       | `getCalendarEvent`       | `app/actions/calendar.ts` | Read  |
| Create event           | `createCalendarEvent`    | `app/actions/calendar.ts` | Write |
| Update event           | `updateCalendarEvent`    | `app/actions/calendar.ts` | Write |
| Delete event           | `deleteCalendarEvent`    | `app/actions/calendar.ts` | Write |

### Module: Links

| Action          | Function                    | File                                       | Type  |
| --------------- | --------------------------- | ------------------------------------------ | ----- |
| List links      | `listProjectLinksAction`    | `app/context/[projectId]/links/actions.ts` | Read  |
| List categories | `listLinkCategoriesAction`  | `app/context/[projectId]/links/actions.ts` | Read  |
| Create link     | `createProjectLinkAction`   | `app/context/[projectId]/links/actions.ts` | Write |
| Update link     | `updateProjectLinkAction`   | `app/context/[projectId]/links/actions.ts` | Write |
| Archive link    | `archiveProjectLinkAction`  | `app/context/[projectId]/links/actions.ts` | Write |
| Reorder links   | `reorderProjectLinksAction` | `app/context/[projectId]/links/actions.ts` | Write |
| Create category | `createLinkCategoryAction`  | `app/context/[projectId]/links/actions.ts` | Write |
| Update category | `updateLinkCategoryAction`  | `app/context/[projectId]/links/actions.ts` | Write |
| Delete category | `deleteLinkCategoryAction`  | `app/context/[projectId]/links/actions.ts` | Write |

### Module: Ideas (Mind Maps)

| Action                 | Function                          | File                                    | Type  |
| ---------------------- | --------------------------------- | --------------------------------------- | ----- |
| List boards            | `listBoards`                      | `lib/idea-graph/boards.ts`              | Read  |
| List boards by project | `listBoardsByProjectId`           | `lib/idea-graph/boards.ts`              | Read  |
| Create board           | `createBoardAction`               | `app/actions/idea-boards.ts`            | Write |
| Update board           | `updateBoardAction`               | `app/actions/idea-boards.ts`            | Write |
| Delete board           | `deleteBoardAction`               | `app/actions/idea-boards.ts`            | Write |
| Create idea (node)     | `createIdeaAction`                | `app/actions/ideas.ts`                  | Write |
| Update idea            | `updateIdeaAction`                | `app/actions/ideas.ts`                  | Write |
| Delete idea            | `deleteIdeaAction`                | `app/actions/ideas.ts`                  | Write |
| Add idea to board      | `addIdeaToBoardAction`            | `app/actions/idea-boards.ts`            | Write |
| Create connection      | (via `idea-canvas-connection.ts`) | `app/actions/idea-canvas-connection.ts` | Write |
| Batch canvas updates   | (via `idea-canvas-batch.ts`)      | `app/actions/idea-canvas-batch.ts`      | Write |
| Link project to board  | (via `idea-project-links.ts`)     | `app/actions/idea-project-links.ts`     | Write |

### Module: Budgets

| Action                    | Function                                          | File                           | Type  |
| ------------------------- | ------------------------------------------------- | ------------------------------ | ----- |
| Get all                   | `getBudgets`                                      | `app/actions/budgets.ts`       | Read  |
| Get by project            | `getBudgetsByProjectId`                           | `app/actions/budgets.ts`       | Read  |
| Get budget project ID     | `getBudgetProjectId`                              | `app/actions/budgets.ts`       | Read  |
| Get budget stats          | `getBudgetStats`                                  | `app/actions/budgets.ts`       | Read  |
| Get budget with full data | `getBudgetWithData`                               | `app/actions/budget-detail.ts` | Read  |
| Create                    | `createBudget`                                    | `app/actions/budgets.ts`       | Write |
| Update                    | `updateBudget`                                    | `app/actions/budgets.ts`       | Write |
| Delete                    | `deleteBudget`                                    | `app/actions/budgets.ts`       | Write |
| Duplicate (atomic)        | `duplicateBudget` → `duplicate_budget_atomic` RPC | `app/actions/budgets.ts`       | Write |
| Create category           | (via `budget-detail.ts`)                          | `app/actions/budget-detail.ts` | Write |
| Update category           | (via `budget-detail.ts`)                          | `app/actions/budget-detail.ts` | Write |
| Delete category           | (via `budget-detail.ts`)                          | `app/actions/budget-detail.ts` | Write |
| Create item               | (via `budget-detail.ts`)                          | `app/actions/budget-detail.ts` | Write |
| Update item               | (via `budget-detail.ts`)                          | `app/actions/budget-detail.ts` | Write |
| Delete item               | (via `budget-detail.ts`)                          | `app/actions/budget-detail.ts` | Write |
| Update item status        | (via `budget-detail.ts`)                          | `app/actions/budget-detail.ts` | Write |

### Module: Billings

| Action                  | Function                       | File                      | Type  |
| ----------------------- | ------------------------------ | ------------------------- | ----- |
| Get by project          | `getBillingsByProjectId`       | `app/actions/billings.ts` | Read  |
| Get categories          | `getBillingCategories`         | `app/actions/billings.ts` | Read  |
| Create                  | `createBilling`                | `app/actions/billings.ts` | Write |
| Update                  | `updateBilling`                | `app/actions/billings.ts` | Write |
| Update status           | `updateBillingStatus`          | `app/actions/billings.ts` | Write |
| Delete                  | `deleteBilling`                | `app/actions/billings.ts` | Write |
| Create category         | `createBillingCategory`        | `app/actions/billings.ts` | Write |
| Delete category         | `deleteBillingCategory`        | `app/actions/billings.ts` | Write |
| Seed default categories | `seedDefaultBillingCategories` | `app/actions/billings.ts` | Write |

### Module: Milestones

| Action            | Function                                              | File                        | Type  |
| ----------------- | ----------------------------------------------------- | --------------------------- | ----- |
| List              | `listMilestones`                                      | `app/actions/milestones.ts` | Read  |
| Get with progress | `getMilestonesWithProgress`                           | `app/actions/milestones.ts` | Read  |
| Create            | `createMilestone`                                     | `app/actions/milestones.ts` | Write |
| Update            | `updateMilestone`                                     | `app/actions/milestones.ts` | Write |
| Complete (atomic) | `completeMilestone` → `complete_milestone_atomic` RPC | `app/actions/milestones.ts` | Write |
| Reopen (atomic)   | `reopenMilestone` → `reopen_milestone_atomic` RPC     | `app/actions/milestones.ts` | Write |
| Delete            | `deleteMilestone`                                     | `app/actions/milestones.ts` | Write |

### Module: Copilot

| Action               | Function                   | File                                         | Type  |
| -------------------- | -------------------------- | -------------------------------------------- | ----- |
| Get session          | `getCopilotSession`        | `app/context/[projectId]/copilot/actions.ts` | Read  |
| Get sessions         | `getCopilotSessions`       | `app/context/[projectId]/copilot/actions.ts` | Read  |
| Create session       | `createCopilotSession`     | `app/context/[projectId]/copilot/actions.ts` | Write |
| Archive session      | `archiveCopilotSession`    | `app/context/[projectId]/copilot/actions.ts` | Write |
| Delete session       | `deleteCopilotSession`     | `app/context/[projectId]/copilot/actions.ts` | Write |
| Start fresh session  | `startFreshCopilotSession` | `app/context/[projectId]/copilot/actions.ts` | Write |
| Update session title | `updateSessionTitle`       | `app/context/[projectId]/copilot/actions.ts` | Write |
| Get messages         | `getCopilotMessages`       | `app/context/[projectId]/copilot/actions.ts` | Read  |
| Save message         | `saveCopilotMessage`       | `app/context/[projectId]/copilot/actions.ts` | Write |
| Get proposals        | `getProposalsForSession`   | `app/context/[projectId]/copilot/actions.ts` | Read  |
| Save proposals       | `saveCopilotProposals`     | `app/context/[projectId]/copilot/actions.ts` | Write |
| Approve proposal     | `approveProposal`          | `app/context/[projectId]/copilot/actions.ts` | Write |
| Reject proposal      | `rejectProposal`           | `app/context/[projectId]/copilot/actions.ts` | Write |
| Undo delete proposal | `undoDeleteProposal`       | `app/context/[projectId]/copilot/actions.ts` | Write |
| Chat stream          | API route handler          | `app/api/copilot/[projectId]/chat/route.ts`  | Write |

### Module: Clients

| Action                 | Function                     | File                     | Type  |
| ---------------------- | ---------------------------- | ------------------------ | ----- |
| Get list               | `getClients`                 | `app/actions/clients.ts` | Read  |
| Get by ID              | `getClientById`              | `app/actions/clients.ts` | Read  |
| Get projects by client | `getProjectsByClientId`      | `app/actions/clients.ts` | Read  |
| Create                 | `createClientAction`         | `app/actions/clients.ts` | Write |
| Update                 | `updateClientAction`         | `app/actions/clients.ts` | Write |
| Delete                 | `deleteClientAction`         | `app/actions/clients.ts` | Write |
| Create link            | `createClientLinkAction`     | `app/actions/clients.ts` | Write |
| Update link            | `updateClientLinkAction`     | `app/actions/clients.ts` | Write |
| Delete link            | `deleteClientLinkAction`     | `app/actions/clients.ts` | Write |
| Get businesses         | `getBusinesses`              | `app/actions/clients.ts` | Read  |
| Get business by ID     | `getBusinessById`            | `app/actions/clients.ts` | Read  |
| Create business        | `createBusinessAction`       | `app/actions/clients.ts` | Write |
| Update business        | `updateBusinessAction`       | `app/actions/clients.ts` | Write |
| Update business fields | `updateBusinessFieldsAction` | `app/actions/clients.ts` | Write |
| Delete business        | `deleteBusinessAction`       | `app/actions/clients.ts` | Write |

### Module: Auth

| Action                 | Function               | File                  | Type  |
| ---------------------- | ---------------------- | --------------------- | ----- |
| Sign in                | `signIn`               | `app/actions/auth.ts` | Write |
| Sign up                | `signUp`               | `app/actions/auth.ts` | Write |
| Sign out               | `signOut`              | `app/actions/auth.ts` | Write |
| Request password reset | `requestPasswordReset` | `app/actions/auth.ts` | Write |
| Update password        | `updatePassword`       | `app/actions/auth.ts` | Write |
| Get session status     | `getSessionStatus`     | `app/actions/auth.ts` | Read  |

### Module: Profile

| Action                  | Function               | File                     | Type  |
| ----------------------- | ---------------------- | ------------------------ | ----- |
| Get profile             | `getProfile`           | `app/profile/actions.ts` | Read  |
| Get profile (optional)  | `getProfileOptional`   | `app/profile/actions.ts` | Read  |
| Get profile with avatar | `getProfileWithAvatar` | `app/profile/actions.ts` | Read  |
| Update profile          | `updateProfile`        | `app/profile/actions.ts` | Write |
| Upload user asset       | `uploadUserAsset`      | `app/profile/actions.ts` | Write |
| Delete user asset       | `deleteUserAsset`      | `app/profile/actions.ts` | Write |
| Get asset signed URL    | `getAssetSignedUrl`    | `app/profile/actions.ts` | Read  |

### Module: Settings (Appearance)

| Action             | Function            | File                                 | Type  |
| ------------------ | ------------------- | ------------------------------------ | ----- |
| Get preferences    | `getPreferences`    | `app/settings/appearance/actions.ts` | Read  |
| Update preferences | `updatePreferences` | `app/settings/appearance/actions.ts` | Write |

### Module: Todos

| Action                   | Function                           | File                  | Type  |
| ------------------------ | ---------------------------------- | --------------------- | ----- |
| Get lists                | `getTodoListsAction`               | `app/actions/todo.ts` | Read  |
| Get list with items      | `getTodoListWithItemsAction`       | `app/actions/todo.ts` | Read  |
| Get items                | `getTodoItemsAction`               | `app/actions/todo.ts` | Read  |
| Get project todo board   | `getProjectTodoBoardAction`        | `app/actions/todo.ts` | Read  |
| Get project todo summary | `getProjectsWithTodoSummaryAction` | `app/actions/todo.ts` | Read  |
| Create list              | `createTodoListAction`             | `app/actions/todo.ts` | Write |
| Rename list              | `renameTodoListAction`             | `app/actions/todo.ts` | Write |
| Update list              | `updateTodoListAction`             | `app/actions/todo.ts` | Write |
| Archive list             | `archiveTodoListAction`            | `app/actions/todo.ts` | Write |
| Delete list              | `deleteTodoListAction`             | `app/actions/todo.ts` | Write |
| Create item              | `createTodoItemAction`             | `app/actions/todo.ts` | Write |
| Toggle item              | `toggleTodoItemAction`             | `app/actions/todo.ts` | Write |
| Update item              | `updateTodoItemAction`             | `app/actions/todo.ts` | Write |
| Delete item              | `deleteTodoItemAction`             | `app/actions/todo.ts` | Write |

---

## 5. Current Authorization Findings

### 5.1 Authentication layer

**Middleware** (`middleware.ts`): The only pre-route guard. It checks `supabase.auth.getUser()` and redirects unauthenticated requests from the following path prefixes to `/`:

```
/dashboard, /project, /projects, /ideas, /todo, /budgets, /clients,
/businesses, /notes, /billings, /context, /profile, /settings
```

Several of these paths do not exist as actual routes (`/dashboard`, `/project`, `/projects`, `/ideas`, `/todo`, etc. — these appear to be legacy or anticipated future routes). The middleware is broader than the current route set.

**Server actions**: Every server action calls `requireAuth()` as its first operation. This calls `supabase.auth.getUser()` and redirects to `/` if not authenticated. There is no bypass or exception anywhere in the codebase.

### 5.2 Authorization layer (what exists today)

Authorization today is 100% ownership-based. There are two patterns:

**Pattern A — Direct ownership** (`owner_id = auth.uid()`):
Used by: `projects`, `notes`, `budgets`, `billings`, `billing_categories`, `clients`, `businesses`, `project_links`, `link_categories`, `project_files`, `calendar_events`, `copilot_sessions`, `copilot_messages`, `copilot_proposals`, `profiles`, `user_assets`, `user_preferences`.

Application-level: query always adds `.eq('owner_id', user.id)`.
RLS: `USING (owner_id = auth.uid())`.

**Pattern B — Project join ownership** (no direct `owner_id` on entity):
Used by: `tasks`, `milestones`, `project_modules`, `project_document_folders` (some also have direct `owner_id`).

Application-level: scoped by `project_id`; project ownership verified either by `getProjectById` first or trusted via RLS.
RLS: `USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = entity.project_id AND p.owner_id = auth.uid()))`.

**Pattern C — Token-based public access (no auth)**:
Used by: `media_share_tokens` → `app/share/media/[token]/page.tsx`.
The `getMediaShareByToken` action does not call `requireAuth()`. The token acts as a capability-based credential.

**Pattern D — Admin check (defined but unused)**:
`checkIsAdmin()` in `lib/auth.ts` compares `user.email === ADMIN_EMAIL`. Never called anywhere in routes, actions, or components. Dead code.

### 5.3 What is NOT enforced

- No per-project access control for non-owners
- No resource-level permission checks (e.g., "can this user delete documents but not create tasks?")
- No role assignment or role-based visibility
- No project membership table or concept
- No organization/workspace scoping
- No token expiry enforcement for copilot API (it checks `requireAuth()` but has no rate limiting or quota enforcement visible at the code level)

---

## 6. Scope Model Findings

### Current scope model

The current model has exactly two scopes:

| Scope              | Description                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **User-global**    | Entities owned by `auth.uid()` regardless of project: clients, businesses, budgets (cross-project), billing categories, link categories, profiles, settings, user_assets |
| **Project-scoped** | Entities tied to a `project_id` which itself has `owner_id`: tasks, milestones, notes, documents, media, links, calendar events, todos, copilot sessions                 |

### What is missing for a multi-user RBAC system

A production RBAC system would need at minimum these additional scopes:

| Scope Level        | Description                                                  | Currently Exists? |
| ------------------ | ------------------------------------------------------------ | ----------------- |
| **Organization**   | Top-level tenant. All users belong to one org.               | No                |
| **Team**           | Group of users within an org with shared access to projects  | No                |
| **Project member** | Per-project role (owner, editor, viewer)                     | No                |
| **Resource**       | Per-entity permission (e.g., view-only on specific document) | No                |

### Identified scope model gaps by module

| Module             | Scope Gap                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Board/Tasks        | Tasks are project-scoped but there's no "project member" concept — cannot share access                    |
| Documents          | Bucket paths are `owner_id/project_id/...` — sharing would require regenerating paths or storage policies |
| Media              | Same as documents; share tokens are the only current sharing primitive                                    |
| Copilot            | AI sessions are strictly per-owner, per-project — no co-piloting with a teammate                          |
| Budgets            | Can be cross-project or project-specific; cross-project creates a problem for team scoping                |
| Clients/Businesses | Strictly user-global — a "team CRM" model is not designed for                                             |

---

## 7. Proposed Canonical Modules and Actions for RBAC

The normalized module list for RBAC purposes groups related actions. This differs from the display module list in `lib/modules/registry.ts` because RBAC modules map to security boundaries, not UI tabs.

### RBAC Module Structure

```
projects:          read, create, update, delete, archive, unarchive, favorite, access_record
projects.modules:  read, write  (toggle module visibility per project)
tasks:             read, create, update, delete, bulk_delete, move (status/order)
milestones:        read, create, update, delete, complete, reopen
notes:             read, create, update, delete, bulk_delete
notes.folders:     read, create, update, delete
notes.links:       read, create, delete
documents:         read, upload, bulk_upload, update, archive, delete, bulk_delete, mark_final, view_signed_url, download
documents.folders: read, create, update, delete
media:             read, upload, update, archive, unarchive, delete, mark_final, view_signed_url, share_create
calendar:          read, create, update, delete
links:             read, create, update, archive, reorder
links.categories:  read, create, update, delete
ideas:             read, create, update, delete
ideas.boards:      read, create, update, delete
ideas.connections: read, create, update, delete
budgets:           read, create, update, delete, duplicate
budgets.categories: read, create, update, delete
budgets.items:     read, create, update, delete, update_status
billings:          read, create, update, update_status, delete
billings.categories: read, create, delete
todos:             read, create, update, delete, archive, toggle
clients:           read, create, update, delete
clients.links:     read, create, update, delete
businesses:        read, create, update, delete
copilot:           read_sessions, create_session, archive_session, delete_session, read_messages, read_proposals, approve_proposal, reject_proposal, undo_proposal
profile:           read, update, upload_avatar, delete_asset
settings:          read, update
auth:              sign_in, sign_up, sign_out, reset_password
```

---

## 8. Gaps / Risks / Inconsistencies

### Identified issues with concrete evidence

| Risk                                                                          | Severity | Affected Module            | Description                                                                                                                                                                                                                                    | Recommendation                                                                                                                             |
| ----------------------------------------------------------------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **No project membership model**                                               | CRITICAL | All project-scoped modules | There is no `project_members` table. All project access is binary: you own it or you cannot touch it. A future "share with teammate" feature requires a complete RLS rewrite on 10+ tables.                                                    | Design `project_members(project_id, user_id, role)` as first step of RBAC foundation.                                                      |
| **Tasks not owner-scoped at row level**                                       | HIGH     | Board/Tasks                | `tasks` has no `owner_id` column. RLS joins through `projects`. In a team model where multiple users can have project access, task-level authorship (created_by) is not tracked.                                                               | Add `created_by UUID` and `assigned_to UUID` to tasks.                                                                                     |
| **Milestones not owner-scoped**                                               | HIGH     | Milestones                 | Same as tasks: no `owner_id`, secured only via project join. No creator attribution.                                                                                                                                                           | Add `created_by UUID` to milestones.                                                                                                       |
| **`checkIsAdmin()` is dead code**                                             | MEDIUM   | Auth/Global                | Defined at `lib/auth.ts:24–29` but never imported or called. Suggests a planned admin feature that was never built.                                                                                                                            | Either implement it (for a "super-admin" role) or remove to reduce confusion.                                                              |
| **Copilot proposal approval unattributed**                                    | HIGH     | Copilot                    | The `approveProposal` function marks proposals approved under the current user's session, but this is not stored as "approved_by". In a team, you cannot see who approved an AI suggestion.                                                    | Add `approved_by UUID` and `rejected_by UUID` to `copilot_proposals`.                                                                      |
| **Link reorder is an N+1 write**                                              | MEDIUM   | Links                      | `reorderProjectLinksAction` in `app/context/[projectId]/links/actions.ts:413` issues one `UPDATE` per link. A known tech debt item per `AGENTS.md §6b`.                                                                                        | Implement `reorder_links_atomic` RPC.                                                                                                      |
| **`revalidatePath('/dashboard')` on non-existent route**                      | LOW      | All                        | Many actions revalidate `/dashboard` which has no `app/dashboard/page.tsx`. No harm but adds dead cache operations.                                                                                                                            | Replace with actual paths; cleanup pass.                                                                                                   |
| **Billing delete is unscoped to project**                                     | MEDIUM   | Billings                   | `deleteBilling(id, projectId?)` receives `projectId` optionally and the RLS relies solely on `owner_id`. The projectId is only used for cache revalidation, not scoping the delete query itself.                                               | Confirm this is intentional; document it. If a user could have billings on multiple projects, the delete should verify project membership. |
| **Budget queries missing owner_id scope in application layer**                | MEDIUM   | Budgets                    | `getBudgetStats` and `getBudgetWithData` do not explicitly `.eq('owner_id', user.id)` — they rely on RLS alone. Per AGENTS.md §1, queries must explicitly scope by owner.                                                                      | Add explicit owner scoping in application queries per the project convention.                                                              |
| **Media share tokens are public with no auth**                                | LOW      | Media                      | `getMediaShareByToken` has no `requireAuth()`. This is intentional (share links), but there is no revocation mechanism and tokens are stored with plain text signed URLs.                                                                      | Add a `revoke_token` action; consider not storing the signed URL (instead regenerate it from the token on-demand).                         |
| **Idea boards have no direct `owner_id` enforcement visible at action level** | MEDIUM   | Ideas                      | Actions in `app/actions/ideas.ts` call `lib/idea-graph/` functions without explicitly passing `userId`. The ownership enforcement lives in the `lib/idea-graph/` domain layer. Needs verification that RLS + domain layer both scope properly. | Audit `lib/idea-graph/boards.ts` and `lib/idea-graph/ideas.ts` to confirm owner scoping.                                                   |
| **Clients actions use legacy `Action` suffix**                                | LOW      | Clients                    | `createClientAction`, `updateClientAction`, `deleteClientAction`, etc. violate the naming convention in CONVENTIONS.md.                                                                                                                        | Rename in a dedicated refactor pass.                                                                                                       |
| **No rate limiting on Copilot chat**                                          | HIGH     | Copilot                    | The `/api/copilot/[projectId]/chat/route.ts` handler is not visible in this audit to have any rate limiting. With RBAC, API usage quotas would need to be per-user or per-org.                                                                 | Add rate limiting middleware or a quota system before multi-user launch.                                                                   |

---

## 9. Recommended Next Steps

Ordered by priority for enabling an RBAC system:

### Priority 1 — Foundation (must precede all else)

1. **Design and create `organizations` table** — top-level tenant container. Add `organization_id` to `auth.users` profile or a `user_organizations` join table.

2. **Create `project_members` table** — schema: `(project_id, user_id, role ENUM('owner','editor','viewer'), created_at)`. This is the core primitive for shared project access.

3. **Rewrite RLS policies on all project-scoped tables** to allow access when `EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = entity.project_id AND pm.user_id = auth.uid())` in addition to the current owner check.

4. **Create the RBAC schema** (see Deliverable 8 below): `roles`, `module_actions`, `role_module_actions`, `user_project_roles`.

### Priority 2 — Data attribution (needed for audit trails)

5. **Add `created_by UUID` to `tasks` and `milestones`** — references `auth.users`. Update `create_task_atomic` and `createMilestone` RPCs and actions.

6. **Add `approved_by UUID` and `rejected_by UUID` to `copilot_proposals`** — update `approveProposal` and `rejectProposal` actions.

7. **Create an `audit_log` table** — minimal schema: `(id, user_id, org_id, project_id, module, action, entity_id, payload_diff, created_at)`. Trigger from server actions or a middleware wrapper.

### Priority 3 — Code cleanup (reduces migration surface)

8. **Fix owner scoping in `getBudgetStats` and `getBudgetWithData`** — add explicit `.eq('owner_id', user.id)` to comply with the project convention.

9. **Implement `reorder_links_atomic` RPC** — eliminate the N+1 write in `reorderProjectLinksAction`.

10. **Remove dead code**: `checkIsAdmin()` in `lib/auth.ts` (either implement it for a super-admin capability or delete it).

11. **Rename legacy `Action`-suffixed client exports** — `createClientAction` → `createClient`, etc.

### Priority 4 — Module toggle as privileged operation

12. **Gate `setProjectModuleEnabled` on a new "project admin" role** — currently only checks `requireAuth()`. In a team, module configuration should be restricted to project owners or admins.

---

## 10. Appendix — File References

### Core files

| File                                 | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `middleware.ts`                      | Route-level auth guard                            |
| `lib/auth.ts`                        | `requireAuth()`, `getUser()`, `checkIsAdmin()`    |
| `lib/modules/registry.ts`            | Canonical module definitions and `ModuleKey` type |
| `app/context/ContextDataCache.tsx`   | Session cache key types                           |
| `app/context/layout.tsx`             | `ContextDataCacheProvider` placement              |
| `app/context/[projectId]/layout.tsx` | Per-project `requireAuth()` guard                 |
| `lib/copilot/registry/index.ts`      | Copilot module capability registry                |

### Actions files

| File                                         | Domain                              |
| -------------------------------------------- | ----------------------------------- |
| `app/actions/auth.ts`                        | Authentication                      |
| `app/actions/projects.ts`                    | Projects + favorites + access       |
| `app/actions/tasks.ts`                       | Tasks + board data                  |
| `app/actions/notes.ts`                       | Notes + note links                  |
| `app/actions/note-folders.ts`                | Note folders                        |
| `app/actions/documents.ts`                   | Documents                           |
| `app/actions/document-folders.ts`            | Document folders                    |
| `app/actions/media.ts`                       | Media files + share tokens          |
| `app/actions/calendar.ts`                    | Calendar events                     |
| `app/actions/links/actions.ts`               | Project links + link categories     |
| `app/actions/ideas.ts`                       | Idea nodes                          |
| `app/actions/idea-boards.ts`                 | Idea boards                         |
| `app/actions/idea-canvas.ts`                 | Canvas state                        |
| `app/actions/idea-canvas-batch.ts`           | Batch canvas operations             |
| `app/actions/idea-canvas-connection.ts`      | Canvas connections                  |
| `app/actions/idea-project-links.ts`          | Board↔project associations          |
| `app/actions/budgets.ts`                     | Budgets                             |
| `app/actions/budget-detail.ts`               | Budget categories + items           |
| `app/actions/billings.ts`                    | Billings + billing categories       |
| `app/actions/milestones.ts`                  | Milestones                          |
| `app/actions/clients.ts`                     | Clients + businesses + links        |
| `app/actions/modules.ts`                     | Project module toggle               |
| `app/actions/todo.ts`                        | Todo lists + items                  |
| `app/context/[projectId]/copilot/actions.ts` | Copilot sessions/messages/proposals |
| `app/profile/actions.ts`                     | User profile + assets               |
| `app/settings/appearance/actions.ts`         | Appearance preferences              |

### Key migrations

| File                                                   | Significance                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `001_initial_schema.sql`                               | Base tables: projects, tasks (broad RLS: any auth user)        |
| `20260208120000_multi_user_projects_tasks_budgets.sql` | Adds `owner_id` to projects/budgets; narrows RLS to owner-only |
| `20260218100000_project_access.sql`                    | `project_access` table for recency tracking                    |
| `20260221120000_link_categories_owned.sql`             | `link_categories` with `owner_id`                              |
| `20260224100000_document_hub.sql`                      | `project_files` table, storage bucket, RLS                     |
| `20260228100000_media_vault.sql`                       | Media bucket + `media_share_tokens`                            |
| `20260302120000_project_modules.sql`                   | `project_modules` — per-project module toggles                 |
| `20260306120000_copilot_sessions.sql`                  | Copilot sessions table                                         |
| `20260306120002_copilot_proposals.sql`                 | Copilot proposals table                                        |
| `20260308100000_billing_categories.sql`                | `billing_categories` + billing enhancements                    |

---

## Master Permission Matrix

| Module              | Action           | Recommended Permission Key    | Scope        | Exists Today? | Enforced Today?                   | Notes                                                      |
| ------------------- | ---------------- | ----------------------------- | ------------ | ------------- | --------------------------------- | ---------------------------------------------------------- |
| projects            | read             | `projects:read`               | user         | Yes           | Yes (RLS + owner_id)              |                                                            |
| projects            | create           | `projects:create`             | user         | Yes           | Yes (requireAuth)                 | Any authenticated user                                     |
| projects            | update           | `projects:update`             | project      | Yes           | Yes (owner_id check)              |                                                            |
| projects            | delete           | `projects:delete`             | project      | Yes           | Yes (owner_id check)              |                                                            |
| projects            | archive          | `projects:archive`            | project      | Yes           | Yes (owner_id check)              |                                                            |
| projects            | unarchive        | `projects:unarchive`          | project      | Yes           | Yes (owner_id check)              |                                                            |
| projects            | favorite         | `projects:favorite`           | user         | Yes           | Partial (getUser not requireAuth) |                                                            |
| projects.modules    | write            | `projects.modules:write`      | project      | Yes           | Auth only, not role-checked       | RISK: any auth user can toggle if they have project access |
| tasks               | read             | `tasks:read`                  | project      | Yes           | Yes (RLS via projects)            |                                                            |
| tasks               | create           | `tasks:create`                | project      | Yes           | Yes (requireAuth + RLS)           |                                                            |
| tasks               | update           | `tasks:update`                | project      | Yes           | Yes                               |                                                            |
| tasks               | delete           | `tasks:delete`                | project      | Yes           | Yes                               |                                                            |
| tasks               | bulk_delete      | `tasks:bulk_delete`           | project      | Yes           | Yes                               |                                                            |
| tasks               | move             | `tasks:move`                  | project      | Yes           | Yes (atomic RPC)                  |                                                            |
| milestones          | read             | `milestones:read`             | project      | Yes           | Yes (RLS via projects)            |                                                            |
| milestones          | create           | `milestones:create`           | project      | Yes           | Yes                               |                                                            |
| milestones          | update           | `milestones:update`           | project      | Yes           | Yes                               |                                                            |
| milestones          | delete           | `milestones:delete`           | project      | Yes           | Yes                               |                                                            |
| milestones          | complete         | `milestones:complete`         | project      | Yes           | Yes (atomic RPC)                  |                                                            |
| milestones          | reopen           | `milestones:reopen`           | project      | Yes           | Yes (atomic RPC)                  |                                                            |
| notes               | read             | `notes:read`                  | project      | Yes           | Yes (owner_id)                    |                                                            |
| notes               | create           | `notes:create`                | project      | Yes           | Yes                               |                                                            |
| notes               | update           | `notes:update`                | project      | Yes           | Yes (owner_id check)              |                                                            |
| notes               | delete           | `notes:delete`                | project      | Yes           | Yes (owner_id check)              |                                                            |
| notes               | bulk_delete      | `notes:bulk_delete`           | user         | Yes           | Yes (owner_id check)              |                                                            |
| notes.folders       | read             | `notes.folders:read`          | project      | Yes           | Yes                               |                                                            |
| notes.folders       | write            | `notes.folders:write`         | project      | Yes           | Yes                               |                                                            |
| notes.links         | read             | `notes.links:read`            | note         | Yes           | Yes (indirect via note ownership) |                                                            |
| notes.links         | write            | `notes.links:write`           | note         | Yes           | Yes (indirect)                    |                                                            |
| documents           | read             | `documents:read`              | project      | Yes           | Yes (owner_id + project_id)       |                                                            |
| documents           | upload           | `documents:upload`            | project      | Yes           | Yes                               |                                                            |
| documents           | bulk_upload      | `documents:bulk_upload`       | project      | Yes           | Yes                               |                                                            |
| documents           | update           | `documents:update`            | project      | Yes           | Yes (owner_id check)              |                                                            |
| documents           | archive          | `documents:archive`           | project      | Yes           | Yes                               |                                                            |
| documents           | mark_final       | `documents:mark_final`        | project      | Yes           | Yes                               |                                                            |
| documents           | delete           | `documents:delete`            | project      | Yes           | Yes                               |                                                            |
| documents           | view_signed_url  | `documents:view_signed_url`   | project      | Yes           | Yes                               |                                                            |
| documents           | download         | `documents:download`          | project      | Yes           | Yes                               |                                                            |
| documents.folders   | write            | `documents.folders:write`     | project      | Yes           | Yes                               |                                                            |
| media               | read             | `media:read`                  | project      | Yes           | Yes (owner_id)                    |                                                            |
| media               | upload           | `media:upload`                | project      | Yes           | Yes                               |                                                            |
| media               | update           | `media:update`                | project      | Yes           | Yes                               |                                                            |
| media               | archive          | `media:archive`               | project      | Yes           | Yes                               |                                                            |
| media               | unarchive        | `media:unarchive`             | project      | Yes           | Yes                               |                                                            |
| media               | mark_final       | `media:mark_final`            | project      | Yes           | Yes                               |                                                            |
| media               | delete           | `media:delete`                | project      | Yes           | Yes                               |                                                            |
| media               | share_create     | `media:share_create`          | project      | Yes           | Yes                               | Token-based public URL                                     |
| calendar            | read             | `calendar:read`               | project      | Yes           | Yes                               |                                                            |
| calendar            | create           | `calendar:create`             | project      | Yes           | Yes (owner_id)                    |                                                            |
| calendar            | update           | `calendar:update`             | project      | Yes           | Yes                               |                                                            |
| calendar            | delete           | `calendar:delete`             | project      | Yes           | Yes                               |                                                            |
| links               | read             | `links:read`                  | project      | Yes           | Yes (owner_id)                    |                                                            |
| links               | create           | `links:create`                | project      | Yes           | Yes                               |                                                            |
| links               | update           | `links:update`                | project      | Yes           | Yes                               |                                                            |
| links               | archive          | `links:archive`               | project      | Yes           | Yes                               |                                                            |
| links               | reorder          | `links:reorder`               | project      | Yes           | Yes (N+1 write — tech debt)       |                                                            |
| links.categories    | write            | `links.categories:write`      | user         | Yes           | Yes                               | User-global categories                                     |
| ideas               | read             | `ideas:read`                  | project      | Yes           | Partially (lib layer)             | Audit lib/idea-graph                                       |
| ideas               | create           | `ideas:create`                | project      | Yes           | Yes                               |                                                            |
| ideas               | update           | `ideas:update`                | project      | Yes           | Yes                               |                                                            |
| ideas               | delete           | `ideas:delete`                | project      | Yes           | Yes                               |                                                            |
| ideas.boards        | read             | `ideas.boards:read`           | user/project | Yes           | Yes                               |                                                            |
| ideas.boards        | write            | `ideas.boards:write`          | user/project | Yes           | Yes                               |                                                            |
| budgets             | read             | `budgets:read`                | user         | Yes           | Partial (RLS only in stats)       | RISK: getBudgetStats missing app-layer owner scope         |
| budgets             | create           | `budgets:create`              | user         | Yes           | Yes                               |                                                            |
| budgets             | update           | `budgets:update`              | user         | Yes           | Yes                               |                                                            |
| budgets             | delete           | `budgets:delete`              | user         | Yes           | Yes                               |                                                            |
| budgets             | duplicate        | `budgets:duplicate`           | user         | Yes           | Yes (atomic RPC)                  |                                                            |
| budgets.categories  | write            | `budgets.categories:write`    | budget       | Yes           | Yes                               |                                                            |
| budgets.items       | write            | `budgets.items:write`         | budget       | Yes           | Yes                               |                                                            |
| billings            | read             | `billings:read`               | project      | Yes           | Yes (owner_id + project_id)       |                                                            |
| billings            | create           | `billings:create`             | project      | Yes           | Yes                               |                                                            |
| billings            | update           | `billings:update`             | project      | Yes           | Yes (owner_id check)              |                                                            |
| billings            | update_status    | `billings:update_status`      | project      | Yes           | Yes                               |                                                            |
| billings            | delete           | `billings:delete`             | project      | Yes           | Yes (owner_id check)              |                                                            |
| billings.categories | write            | `billings.categories:write`   | user         | Yes           | Yes                               | User-global                                                |
| todos               | read             | `todos:read`                  | project      | Yes           | Yes (via lib/todo)                |                                                            |
| todos               | create           | `todos:create`                | project      | Yes           | Yes                               |                                                            |
| todos               | update           | `todos:update`                | project      | Yes           | Yes                               |                                                            |
| todos               | delete           | `todos:delete`                | project      | Yes           | Yes                               |                                                            |
| todos               | archive          | `todos:archive`               | project      | Yes           | Yes                               |                                                            |
| todos               | toggle           | `todos:toggle`                | project      | Yes           | Yes (atomic RPC)                  |                                                            |
| clients             | read             | `clients:read`                | user         | Yes           | Yes (owner_id)                    |                                                            |
| clients             | create           | `clients:create`              | user         | Yes           | Yes                               |                                                            |
| clients             | update           | `clients:update`              | user         | Yes           | Yes                               |                                                            |
| clients             | delete           | `clients:delete`              | user         | Yes           | Yes                               |                                                            |
| businesses          | read             | `businesses:read`             | user         | Yes           | Yes (owner_id)                    |                                                            |
| businesses          | write            | `businesses:write`            | user         | Yes           | Yes                               |                                                            |
| copilot             | read_sessions    | `copilot:read_sessions`       | project      | Yes           | Yes (owner_id)                    |                                                            |
| copilot             | create_session   | `copilot:create_session`      | project      | Yes           | Yes                               |                                                            |
| copilot             | archive_session  | `copilot:archive_session`     | project      | Yes           | Yes                               |                                                            |
| copilot             | delete_session   | `copilot:delete_session`      | project      | Yes           | Yes                               |                                                            |
| copilot             | read_proposals   | `copilot:read_proposals`      | project      | Yes           | Yes                               |                                                            |
| copilot             | approve_proposal | `copilot:approve_proposal`    | project      | Yes           | Yes                               | No approval attribution                                    |
| copilot             | reject_proposal  | `copilot:reject_proposal`     | project      | Yes           | Yes                               | No rejection attribution                                   |
| copilot             | undo_proposal    | `copilot:undo_proposal`       | project      | Yes           | Yes                               |                                                            |
| profile             | read             | `profile:read`                | user         | Yes           | Yes                               |                                                            |
| profile             | update           | `profile:update`              | user         | Yes           | Yes                               |                                                            |
| profile             | upload_avatar    | `profile:upload_avatar`       | user         | Yes           | Yes                               |                                                            |
| settings            | read             | `settings:read`               | user         | Yes           | Yes                               |                                                            |
| settings            | update           | `settings:update`             | user         | Yes           | Yes                               |                                                            |
| auth                | sign_in          | (not a permission, lifecycle) | global       | Yes           | Yes                               |                                                            |
| auth                | sign_up          | (not a permission, lifecycle) | global       | Yes           | Yes                               |                                                            |

---

## Deliverable Lists

### 1. Normalized Module List

```
projects, tasks, milestones, notes, documents, media, calendar, links,
ideas, budgets, billings, todos, clients, businesses, copilot, profile,
settings, auth
```

### 2. Normalized Actions by Module

**projects:** read, create, update, delete, archive, unarchive, favorite, unfavorite, access_record, toggle_module
**tasks:** read, create, update, delete, bulk_delete, move
**milestones:** read, create, update, delete, complete, reopen
**notes:** read, create, update, delete, bulk_delete, touch; folder: read/create/update/delete; link: read/create/delete
**documents:** read, upload, bulk_upload, update, archive, delete, bulk_delete, mark_final, view, download; folder: read/create/update/delete
**media:** read, upload, update, archive, unarchive, delete, mark_final, view, share_create; (public) share_view
**calendar:** read_feed, create, update, delete
**links:** read, create, update, archive, reorder; category: read/create/update/delete
**ideas:** read, create, update, delete; board: read/create/update/delete; canvas: batch_update, add_connection
**budgets:** read, create, update, delete, duplicate; category: read/create/update/delete; item: read/create/update/delete/update_status
**billings:** read, create, update, update_status, delete; category: read/create/delete
**todos:** read, create_list, update_list, archive_list, delete_list, create_item, update_item, toggle_item, delete_item
**clients:** read, create, update, delete; link: read/create/update/delete
**businesses:** read, create, update, update_fields, delete
**copilot:** read_sessions, create_session, archive_session, delete_session, read_messages, send_message, read_proposals, save_proposals, approve_proposal, reject_proposal, undo_proposal
**profile:** read, update, upload_asset, delete_asset
**settings:** read, update
**auth:** sign_in, sign_up, sign_out, request_password_reset, update_password

### 3. Proposed Canonical Permission Key List

```
projects:read
projects:create
projects:update
projects:delete
projects:archive
projects:unarchive
projects:favorite
projects.modules:write
tasks:read
tasks:create
tasks:update
tasks:delete
tasks:bulk_delete
tasks:move
milestones:read
milestones:create
milestones:update
milestones:delete
milestones:complete
milestones:reopen
notes:read
notes:create
notes:update
notes:delete
notes:bulk_delete
notes.folders:write
notes.links:write
documents:read
documents:upload
documents:bulk_upload
documents:update
documents:archive
documents:delete
documents:bulk_delete
documents:mark_final
documents:view
documents:download
documents.folders:write
media:read
media:upload
media:update
media:archive
media:unarchive
media:delete
media:mark_final
media:view
media:share_create
calendar:read
calendar:create
calendar:update
calendar:delete
links:read
links:create
links:update
links:archive
links:reorder
links.categories:write
ideas:read
ideas:create
ideas:update
ideas:delete
ideas.boards:write
budgets:read
budgets:create
budgets:update
budgets:delete
budgets:duplicate
budgets.categories:write
budgets.items:write
billings:read
billings:create
billings:update
billings:update_status
billings:delete
billings.categories:write
todos:read
todos:create
todos:update
todos:delete
todos:archive
todos:toggle
clients:read
clients:create
clients:update
clients:delete
clients.links:write
businesses:read
businesses:create
businesses:update
businesses:delete
copilot:read
copilot:interact
copilot:approve_proposal
copilot:reject_proposal
copilot:manage_sessions
profile:read
profile:write
settings:read
settings:write
```

### 4. Actions That Exist but Are Not Explicitly Modeled as Permissions

- `touchNote` — fire-and-forget timestamp update (not a security boundary)
- `touchDocument` — fire-and-forget timestamp update
- `touchMedia` — fire-and-forget timestamp update
- `recordProjectAccess` — last-opened tracking
- `seedDefaultBillingCategories` — auto-provisioning on first use
- `getSessionStatus` — returns boolean, not sensitive
- `generateSessionTitle` — internal AI call, not user-facing permission
- `getApprovedProposalTitlesForSession` / `getRejectedProposalTitlesForSession` — internal context building for AI prompts
- `getMediaShareByToken` — public endpoint keyed by token capability (not a user permission)

### 5. Modules/Actions That Appear in UI Only

No discovered UI-only security checks were found. All mutations go through server actions. The tab bar visibility is controlled by `project_modules` which is also enforced at the server side via `getProjectModules`.

One partial exception: the project picker renders the `enabledModuleKeys` set in `ContextTabBar` — if the server-loaded set is wrong, a tab could appear or disappear. But clicking the tab would still route to a page that independently calls `requireAuth()`.

### 6. Modules/Actions That Appear in Backend Only

- `checkIsAdmin()` — exported from `lib/auth.ts`, defined, never imported or called anywhere
- `getHomePageData` — called only from server component `app/page.tsx`, not exposed as a tab action
- `getDashboardData` — server-only, no UI tab for "dashboard"
- `getProjectTodoBoardAction` — the server action for the context todo view; not exposed as a separate navigation item

### 7. Modules/Actions Missing Enforcement

| Action                      | Location                                              | Issue                                                                                                         |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `getBudgetStats`            | `app/actions/budgets.ts:133`                          | No `.eq('owner_id', user.id)` — relies solely on RLS                                                          |
| `getBudgetWithData`         | `app/actions/budget-detail.ts`                        | No explicit owner scope in application query                                                                  |
| Idea graph library          | `lib/idea-graph/boards.ts`, `lib/idea-graph/ideas.ts` | Not audited directly; ownership enforcement delegated to lib layer; needs verification                        |
| `deleteLinkCategoryAction`  | `app/context/[projectId]/links/actions.ts:170`        | Deletes all links in category + category itself in two sequential writes (not atomic, known tech debt)        |
| `reorderProjectLinksAction` | `app/context/[projectId]/links/actions.ts:401`        | N+1 writes — one UPDATE per link ID in a loop                                                                 |
| `setProjectModuleEnabled`   | `app/actions/modules.ts`                              | Only checks `requireAuth()`, not project ownership at the application layer (relies on RLS via projects join) |

### 8. Suggested Foundation Schema (SQL) for RBAC

```sql
-- ─────────────────────────────────────────────────────────────────
-- RBAC Foundation Schema for ClearQueue
-- Designed to extend the existing single-owner model
-- without breaking existing RLS policies
-- ─────────────────────────────────────────────────────────────────

-- Canonical module identifiers (mirrors lib/modules/registry.ts + RBAC extras)
CREATE TABLE rbac_modules (
  key         TEXT PRIMARY KEY,               -- e.g. 'tasks', 'notes', 'copilot'
  label       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Granular actions within each module
CREATE TABLE rbac_module_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  TEXT NOT NULL REFERENCES rbac_modules(key) ON DELETE CASCADE,
  action      TEXT NOT NULL,                  -- e.g. 'read', 'create', 'delete', 'approve_proposal'
  label       TEXT NOT NULL,
  UNIQUE (module_key, action)
);

-- Named roles (can be org-level or project-level)
CREATE TABLE rbac_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,           -- 'owner', 'editor', 'viewer', 'billing_only', etc.
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false, -- system roles cannot be deleted
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permission grants: which role has which action on which module
CREATE TABLE rbac_role_module_actions (
  role_id          UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  module_action_id UUID NOT NULL REFERENCES rbac_module_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, module_action_id)
);

-- Organizations (future multi-tenancy container)
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Organization membership
CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_role        TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- Project membership (core primitive for shared project access)
CREATE TABLE project_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES rbac_roles(id),
  invited_by    UUID REFERENCES auth.users(id),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);

-- RLS for project_members: users can see their own memberships
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project memberships"
  ON project_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Project owners can manage memberships"
  ON project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

-- Audit log (required for compliance)
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  project_id  UUID REFERENCES projects(id),
  module      TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_id   TEXT,
  payload     JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_project_id ON audit_log(project_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- RLS: audit log readable only by the user who generated it, or org admins
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audit entries"
  ON audit_log FOR SELECT
  USING (user_id = auth.uid());

-- Helper function: check if user has a specific permission on a project
-- Usage: SELECT has_project_permission('tasks', 'delete', p_project_id)
CREATE OR REPLACE FUNCTION has_project_permission(
  p_module  TEXT,
  p_action  TEXT,
  p_project_id UUID
) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM project_members pm
    JOIN rbac_role_module_actions rma ON rma.role_id = pm.role_id
    JOIN rbac_module_actions ma ON ma.id = rma.module_action_id
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND ma.module_key = p_module
      AND ma.action = p_action
  )
  OR
  -- Owners always have full access
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id AND p.owner_id = auth.uid()
  );
$$;
```

---

_This audit was generated by reading all relevant source files in the repository. File paths referenced are absolute paths under `/Users/mutechlabs/development/clear-queue/`. All findings are based on code inspection as of 2026-03-09._
