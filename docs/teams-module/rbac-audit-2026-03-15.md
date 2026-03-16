# RBAC & Permissions Audit — ClearQueue

**Date:** 2026-03-15
**Scope:** All project modules — tab visibility, server-side enforcement, UI permission gates
**Prepared for:** Teams module redesign & granular permission model implementation

---

## Executive Summary

The RBAC infrastructure is solid at the **data layer** (RLS on all tables, `user_role_assignments`, `user_project_action_grants`, `rbac_role_module_actions`). Server-side **write** operations are well-protected via `requireCan()` in most modules. However, two critical layers are almost entirely missing across the system:

1. **UI permission gating** — action buttons (create, edit, delete, upload) are visible to ALL project members regardless of their granted actions. **Media is the only module that gates UI elements by permission.** Every other module shows all buttons to everyone.

2. **Read-scope enforcement** — there is no concept of `read.own` vs `read.project`. All members who can access a module see ALL project data in that module. There is no filtering by ownership, creator, or assignment.

Additionally, three modules have no tab-visibility gate, and one module (Owner/Clients) has no server-side write protection at all.

---

## Layer 1 — Tab / Module Visibility Gate

> Gate: `getCanViewModule(projectId, moduleKey)` called in `page.tsx`
> Effect: hides the tab and shows "module disabled" view to unauthorized users

| Module                   | `getCanViewModule` called | Status                                                                       |
| ------------------------ | ------------------------- | ---------------------------------------------------------------------------- |
| Board/Tasks              | ❌ No                     | **GAP** — tab always visible regardless of project settings or member access |
| Notes                    | ✅ Yes                    | OK                                                                           |
| Documents                | ✅ Yes                    | OK                                                                           |
| Media                    | ✅ Yes                    | OK                                                                           |
| Links                    | ✅ Yes                    | OK                                                                           |
| Budgets                  | ✅ Yes                    | OK                                                                           |
| Billings                 | ✅ Yes                    | OK                                                                           |
| Calendar                 | ✅ Yes                    | OK                                                                           |
| Milestones               | ❌ No                     | **GAP** — tab always visible                                                 |
| Ideas                    | ✅ Yes                    | OK                                                                           |
| Owner (clients/business) | ✅ Yes                    | OK                                                                           |
| Copilot                  | ✅ Yes                    | OK                                                                           |
| Todos                    | ❌ No                     | Moot — module being removed                                                  |
| Team                     | N/A                       | Access managed separately (project membership)                               |

**Files to fix:** `app/context/[projectId]/board/page.tsx`, `app/context/[projectId]/milestones/page.tsx`

---

## Layer 2 — Server-Side Write Protection

> Gate: `requireCan(user.id, 'action.key', resource)` inside server actions
> Effect: throws Forbidden if user lacks the action — cannot be bypassed from UI

### Board / Tasks (`app/actions/tasks.ts`)

| Action                            | `requireCan` call | Action key                       |
| --------------------------------- | ----------------- | -------------------------------- |
| `createTask`                      | ✅ Yes            | `tasks.create`                   |
| `updateTask` / title              | ✅ Yes            | `tasks.update_title`             |
| `updateTask` / status             | ✅ Yes            | `tasks.update_status`            |
| `updateTask` / priority           | ✅ Yes            | `tasks.update_priority`          |
| `updateTask` / due date           | ✅ Yes            | `tasks.update_due_date`          |
| `updateTask` / notes              | ✅ Yes            | `tasks.update_notes`             |
| `deleteTask`                      | ✅ Yes            | `tasks.delete`                   |
| `getTasksByProjectId`             | ❌ No requireCan  | Intentional — RLS gates data     |
| `getBoardInitialData`             | ❌ No requireCan  | Intentional — RLS gates data     |
| Task assignment (assign/unassign) | ✅ Yes            | `tasks.assign`, `tasks.unassign` |

**Gap:** No filtering by ownership. All members with `tasks.read` see ALL project tasks.

### Notes (`app/actions/notes.ts`)

| Action               | `requireCan` call | Action key                   |
| -------------------- | ----------------- | ---------------------------- |
| `createNote`         | ✅ Yes            | `notes.create`               |
| `updateNote` title   | ✅ Yes            | `notes.update_title`         |
| `updateNote` content | ✅ Yes            | `notes.update_content`       |
| `deleteNote`         | ✅ Yes            | `notes.delete`               |
| `getNotes`           | ❌ No requireCan  | Intentional — RLS gates data |
| `getNoteById`        | ❌ No requireCan  | Intentional — RLS gates data |

**Gap:** No `read.own` scope. Notes are scoped by `owner_id = auth.uid()` in the DB query, which means notes IS effectively "own" already — **members can only see their own notes today**. However this is hardcoded in the query, not RBAC-controlled. A `notes.read.project` permission to see all team notes does not exist.

### Documents (`app/actions/documents.ts`)

| Action                   | `requireCan` call | Action key                         |
| ------------------------ | ----------------- | ---------------------------------- |
| `uploadDocument`         | ✅ Yes            | `documents.upload`                 |
| `updateDocumentMetadata` | ✅ Yes            | `documents.update_metadata`        |
| `archiveDocument`        | ✅ Yes            | `documents.archive`                |
| `unarchiveDocument`      | ✅ Yes            | `documents.unarchive`              |
| `deleteDocument`         | ✅ Yes            | `documents.delete`                 |
| `getDocuments`           | ❌ No requireCan  | Intentional — RLS + owner_id scope |

**Gap:** Documents query scopes by `owner_id = auth.uid()`, same as notes. Members see only their own documents. No `read.project` permission to see all project documents exists.

### Media (`app/actions/media.ts`)

| Action                 | `requireCan` call | Action key                   |
| ---------------------- | ----------------- | ---------------------------- |
| `uploadMedia`          | ✅ Yes            | `media.upload`               |
| `updateMedia`          | ✅ Yes            | `media.update_metadata`      |
| `archiveMedia`         | ✅ Yes            | `media.archive`              |
| `unarchiveMedia`       | ✅ Yes            | `media.unarchive`            |
| `deleteMedia`          | ✅ Yes            | `media.delete`               |
| `markMediaFinal`       | ✅ Yes            | `media.mark_final`           |
| `createMediaShareLink` | ✅ Yes            | `media.share_create`         |
| `getMedia`             | ❌ No requireCan  | Intentional — RLS gates data |
| `getMediaSignedUrl`    | ❌ No requireCan  | Intentional — RLS gates data |

**Note:** Media was recently fixed (2026-03-15). The query scopes by `project_id` only — all project members with RLS access see ALL project media. This is correct for `read.project` level but `read.own` is not yet implemented.

### Links (`app/context/[projectId]/links/actions.ts`)

| Action                                  | `requireCan` call     | Action key                |
| --------------------------------------- | --------------------- | ------------------------- |
| `createProjectLinkAction`               | ✅ Yes                | `links.create`            |
| `updateProjectLinkAction`               | ✅ Yes                | `links.update`            |
| `archiveProjectLinkAction`              | ✅ Yes                | `links.archive`           |
| `reorderProjectLinksAction`             | ✅ Yes                | `links.reorder`           |
| Category actions (create/update/delete) | ⚠️ Needs verification | `links.manage_categories` |
| `listLinkCategoriesAction`              | ❌ No requireCan      | Intentional               |

**Gap:** No read-scope filtering. Members see all project links. Link category management permissions need verification.

### Budgets (`app/actions/budgets.ts`)

| Action                          | `requireCan` call | Action key                                          |
| ------------------------------- | ----------------- | --------------------------------------------------- |
| `createBudget`                  | ✅ Yes            | `budgets.create`                                    |
| `updateBudget`                  | ✅ Yes            | `budgets.update`                                    |
| `deleteBudget`                  | ✅ Yes            | `budgets.delete`                                    |
| `duplicateBudget`               | ✅ Yes            | `budgets.duplicate`                                 |
| Budget items / categories       | ✅ Yes            | `budgets.manage_items`, `budgets.manage_categories` |
| `getBudgets` / `getBudgetStats` | ❌ No requireCan  | Intentional                                         |

**Gap:** No read-scope filtering. All members see all project budgets.

### Billings (`app/actions/billings.ts`)

| Action                         | `requireCan` call    | Action key                      |
| ------------------------------ | -------------------- | ------------------------------- |
| `createBilling`                | ✅ Yes               | `billings.create`               |
| `updateBilling` (description)  | ✅ Yes               | `billings.update_description`   |
| `updateBillingStatus`          | ✅ Yes               | `billings.update_status`        |
| `deleteBilling`                | ✅ Yes               | `billings.delete`               |
| `createBillingCategory`        | ❌ **No requireCan** | **GAP — unprotected write**     |
| `deleteBillingCategory`        | ❌ **No requireCan** | **GAP — unprotected write**     |
| `seedDefaultBillingCategories` | ❌ **No requireCan** | **GAP — any member can reseed** |

**Gap:** Billing category management is completely unprotected at server level. Any project member can create or delete billing categories. Also no read-scope filtering.

### Calendar (`app/actions/calendar.ts`)

| Action                | `requireCan` call | Action key        |
| --------------------- | ----------------- | ----------------- |
| `createCalendarEvent` | ✅ Yes            | `calendar.create` |
| `updateCalendarEvent` | ✅ Yes            | `calendar.update` |
| `deleteCalendarEvent` | ✅ Yes            | `calendar.delete` |
| `getCalendarEvents`   | ❌ No requireCan  | Intentional       |

**Gap:** No read-scope filtering. All members see all project calendar events.

### Milestones (`app/actions/milestones.ts`)

| Action                      | `requireCan` call | Action key            |
| --------------------------- | ----------------- | --------------------- |
| `createMilestone`           | ✅ Yes            | `milestones.create`   |
| `updateMilestone`           | ✅ Yes            | `milestones.update`   |
| `completeMilestone`         | ✅ Yes            | `milestones.complete` |
| `reopenMilestone`           | ✅ Yes            | `milestones.reopen`   |
| `deleteMilestone`           | ✅ Yes            | `milestones.delete`   |
| `getMilestonesWithProgress` | ❌ No requireCan  | Intentional           |

**Gap:** Tab not gated (see Layer 1). No read-scope filtering.

### Ideas / Mind Maps (`app/actions/idea-boards.ts`)

| Action                   | `requireCan` call | Action key                               |
| ------------------------ | ----------------- | ---------------------------------------- |
| `createBoardWithProject` | ✅ Yes            | `ideas.create_board`                     |
| `updateBoard`            | ✅ Yes            | `ideas.update_board`                     |
| `deleteBoard`            | ✅ Yes            | `ideas.delete_board`                     |
| `addIdeaToBoard`         | ✅ Yes            | `ideas.create_node`                      |
| Node update/delete       | ✅ Yes            | `ideas.update_node`, `ideas.delete_node` |
| `getBoardsByProjectId`   | ❌ No requireCan  | Intentional                              |

**Gap:** No read-scope filtering. All members see all mind maps.

### Owner — Clients & Businesses (`app/actions/clients.ts`, `app/actions/businesses.ts`)

| Action                      | `requireCan` call             | Action key       |
| --------------------------- | ----------------------------- | ---------------- |
| All client/business actions | ❌ **No requireCan anywhere** | **CRITICAL GAP** |

**This is the most serious gap found.** The owner module (clients, businesses) has zero RBAC protection at the server action level. Any authenticated project member who navigates directly to the owner tab URL can read AND write client/business data regardless of their role. The tab visibility gate (`getCanViewModule`) only prevents seeing the tab in the nav — it does not protect direct URL access.

**No `owner.*` action keys appear in `MODULE_PERMISSIONS` in the team invite UI.** This module is effectively invisible to the permission system.

### Copilot (`app/context/[projectId]/copilot/actions.ts`)

| Action                       | `requireCan` call | Action key                       |
| ---------------------------- | ----------------- | -------------------------------- |
| `createCopilotSession`       | ✅ Yes            | `copilot.create_session`         |
| `archiveCopilotSession`      | ✅ Yes            | `copilot.archive_session`        |
| `deleteCopilotSession`       | ✅ Yes            | `copilot.delete_session`         |
| `saveCopilotMessage`         | ✅ Yes            | `copilot.send_message`           |
| Proposal approve/reject/undo | ✅ Yes            | `copilot.approve_proposal`, etc. |
| `getCopilotSessions`         | ❌ No requireCan  | Intentional                      |

**Gap:** Copilot does NOT check whether the user has access to the modules it acts on. A user with `copilot.approve_proposal` can approve a task creation proposal even if they lack `tasks.create`. Copilot actions bypass module-level permission checks. This needs a permissions-propagation layer.

---

## Layer 3 — UI Permission Gating (Client Components)

> Gate: Conditional rendering of action buttons based on user permissions
> Effect: Users only see buttons for actions they are allowed to perform

| Module      | UI Permission Gating | Detail                                                                                                                     |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Media**   | ✅ **Full**          | `MediaPermissions` prop passed server→client; upload FAB, edit, delete, archive, share, mark-final buttons all conditional |
| Board/Tasks | ❌ **None**          | "Add task" button, edit/delete options visible to all members                                                              |
| Notes       | ❌ **None**          | "New note" button, edit/delete visible to all                                                                              |
| Documents   | ❌ **None**          | "Upload" button, edit/delete/archive visible to all                                                                        |
| Links       | ❌ **None**          | "Add link" button, edit/delete/archive visible to all                                                                      |
| Budgets     | ❌ **None**          | "Create budget" button, edit/delete/duplicate visible to all                                                               |
| Billings    | ❌ **None**          | "Add billing record" button, edit/delete/status change visible to all                                                      |
| Calendar    | ❌ **None**          | "Add event" button, edit/delete visible to all                                                                             |
| Milestones  | ❌ **None**          | "Add milestone" button, complete/reopen/delete visible to all                                                              |
| Ideas       | ❌ **None**          | "Create board" button, add/edit/delete nodes visible to all                                                                |
| Owner       | ❌ **None**          | Add/edit client and business buttons visible to all (and no server protection)                                             |
| Copilot     | ❌ **None**          | All copilot actions visible regardless of underlying module permissions                                                    |
| Team        | ✅ Partial           | Invite and manage buttons visible only to project owners                                                                   |

**Media is the only module that follows the full permissions pattern.** For every other module, a member with read-only access sees the same UI as a project owner — the server action will reject the write, but the UI provides no feedback about what they are allowed to do.

---

## Layer 4 — Read Scope (own vs. team vs. project)

> This layer does **not yet exist** in the system.
> The current model is binary: access to a module = access to ALL data in that module.

### Current read-scope behavior per module (hardcoded, not RBAC-controlled)

| Module     | Current read scope                              | Notes                                        |
| ---------- | ----------------------------------------------- | -------------------------------------------- |
| Tasks      | All project tasks                               | No ownership filter in queries               |
| Notes      | **Own only** (`owner_id = auth.uid()` in query) | Effectively `notes.read.own` — hardcoded     |
| Documents  | **Own only** (`owner_id = auth.uid()` in query) | Effectively `documents.read.own` — hardcoded |
| Media      | All project media                               | After 2026-03-15 fix; previously own-only    |
| Links      | All project links                               |                                              |
| Budgets    | All project budgets                             |                                              |
| Billings   | All project billings                            |                                              |
| Calendar   | All project events                              |                                              |
| Milestones | All project milestones                          |                                              |
| Ideas      | All project mind maps                           |                                              |
| Owner      | All clients & businesses                        |                                              |

### Required scopes (future design — see design doc)

The new model requires three tiers per module:

- **`*.read.own`** — see only records you created (or, for tasks, assigned to you)
- **`*.read.team`** — see records belonging to your sub-team (requires sub-team feature)
- **`*.read.project`** — see all records across the project

Same tiers needed for edit and delete:

- **`*.edit.own`** / **`*.edit.team`** / **`*.edit.project`**
- **`*.delete.own`** / **`*.delete.team`** / **`*.delete.project`**

---

## Action Key Inventory — Registered vs. Exposed

### Keys in `rbac_module_actions` (DB) but NOT in `MODULE_PERMISSIONS` (team UI)

These permissions exist in the system but cannot be granted via the invite flow. Orphaned.

| Module     | Orphaned action keys                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| tasks      | `tasks.update_tags`, `tasks.update_milestone`, `tasks.bulk_delete`, `tasks.reorder`, `tasks.duplicate`                                               |
| notes      | `notes.bulk_delete`, `notes.add_link`, `notes.delete_link`, `notes.manage_folders`                                                                   |
| documents  | `documents.view_signed_url`, `documents.archive`, `documents.unarchive`, `documents.mark_final`, `documents.bulk_delete`, `documents.manage_folders` |
| media      | `media.view_signed_url`, `media.archive`, `media.unarchive`, `media.mark_final`, `media.share_create`                                                |
| links      | `links.archive`, `links.reorder`, `links.manage_categories`                                                                                          |
| milestones | `milestones.reopen`                                                                                                                                  |
| budgets    | `budgets.duplicate`, `budgets.manage_categories`                                                                                                     |
| billings   | `billings.manage_categories`                                                                                                                         |
| ideas      | `ideas.manage_connections`, `ideas.batch_update`, `ideas.link_project`                                                                               |
| todos      | `todos.update_list`, `todos.delete_list`, `todos.reorder_items`                                                                                      |
| copilot    | `copilot.archive_session`, `copilot.delete_session`, `copilot.send_message`, `copilot.undo_proposal`                                                 |

### Keys in `MODULE_PERMISSIONS` (team UI) with no apparent registration issues

These are exposed in the invite UI. Cross-reference passed — all appear in `rbac_module_actions` seed.

### Missing entirely from both DB and UI (needed for future design)

- `owner.*` — no action keys exist for the owner/clients/business module
- All `*.read.own` / `*.read.team` / `*.read.project` scoped variants
- All `*.edit.own` / `*.edit.team` / `*.edit.project` scoped variants
- All `*.delete.own` / `*.delete.team` / `*.delete.project` scoped variants
- `tasks.assign.team` / `tasks.assign.project` (assign scope)
- Sub-team management keys (create_team, manage_team, assign_team_member, etc.)

---

## Summary of Gaps by Severity

### Critical

1. **Owner module has zero server-side protection** — `clients.ts` and `businesses.ts` have no `requireCan()` calls. Any project member can write client/business data by hitting the URL directly. No `owner.*` action keys exist in the permission system at all.

2. **Billing category management is unprotected** — `createBillingCategory`, `deleteBillingCategory`, `seedDefaultBillingCategories` in `billings.ts` have no `requireCan()` gate.

### High

3. **UI permission gating is missing in all modules except media** — Members with read-only access see action buttons for create/edit/delete/upload in every module. While the server rejects unauthorized writes, members get confusing error states instead of a hidden button. Needs a `getXPermissions()` function per module (like `getMediaPermissions`) passed server→client.

4. **Board and Milestones pages skip `getCanViewModule`** — These tabs are always visible regardless of whether the module is enabled for the project or whether the member has access.

5. **Copilot bypasses module permissions** — Approving a copilot proposal (e.g., create task) does not verify the member has `tasks.create`. Copilot must inherit and enforce the user's per-module permissions.

### Medium

6. **Read scope is not RBAC-controlled** — Notes and documents have hardcoded `owner_id` scope (effectively "own only") while tasks, media, links, budgets etc. show all project data. There is no mechanism to grant a member wider read scope without code changes.

7. **MODULE_PERMISSIONS is incomplete** — 30+ action keys registered in the DB are not exposed in the team invite UI. The invite flow cannot grant these permissions to members, making them unusable.

### Low / Future

8. **Sub-team concept does not exist** — `*.read.team`, `*.edit.team`, `*.delete.team`, and `tasks.assign.team` require a sub-teams table, team membership, and team manager roles. This is foundational for the permission tiers and needs to be designed and built before those permission keys are useful.

9. **Todos module active but planned for removal** — Currently has full server-side RBAC but no `getCanViewModule` gate. Remove when tasks module covers the use case.

---

## Files That Need Changes (by layer)

### Layer 1 — Add `getCanViewModule`

- `app/context/[projectId]/board/page.tsx`
- `app/context/[projectId]/milestones/page.tsx`

### Layer 2 — Add `requireCan` to server actions

- `app/actions/billings.ts` → `createBillingCategory`, `deleteBillingCategory`, `seedDefaultBillingCategories`
- `app/actions/clients.ts` → all write functions
- `app/actions/businesses.ts` → all write functions

### Layer 3 — Add UI permission gating (new pattern, like media)

Every module needs:

1. A `get<Module>Permissions(projectId)` server function returning a typed permissions object
2. The `page.tsx` to call it and pass it down
3. The `*FromCache.tsx` to forward it
4. The `*Client.tsx` to gate UI elements conditionally

Modules needing full treatment:

- Board/Tasks, Notes, Documents, Links, Budgets, Billings, Calendar, Milestones, Ideas, Owner, Copilot

### Layer 4 — Read scope enforcement (requires new RBAC design)

All modules. Requires:

1. New action key schema (`*.read.own`, `*.read.team`, `*.read.project`)
2. DB migration adding new action keys and updating role seeds
3. Server action query logic branching on which read scope the user has
4. Sub-team table and membership model (for `*.team` scope)
5. Update `MODULE_PERMISSIONS` in `ContextTeamClient.tsx`
6. Update `COPILOT_REGISTRY` to propagate user's read scope to copilot proposals

---

_This audit documents current state only. See design spec (separate document) for implementation plan._
