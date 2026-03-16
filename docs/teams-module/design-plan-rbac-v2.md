# RBAC v2 — Design Plan

**Created:** 2026-03-15
**Source:** `docs/teams-module/rbac-audit-2026-03-15.md`
**Status:** In progress

---

## Overview

This document defines the phased plan for bringing every module in ClearQueue
to full RBAC compliance. Phases must be executed in order — each phase is a
prerequisite for the next.

---

## Phase 1 — Critical Fixes (execute immediately)

Unprotected writes that any project member can trigger today.

### 1A — Owner module (clients & businesses)

**Problem:** `app/actions/clients.ts` and `app/actions/businesses.ts` have zero
`requireCan()` calls. No `owner.*` action keys exist in the system.

**Deliverables:**

1. Migration `YYYYMMDDHHMMSS_owner_rbac.sql`:
   - Register `owner.*` action keys in `rbac_module_actions`
   - Seed `project_owner` role with all `owner.*` keys
   - Seed `project_editor` role with `owner.read` + manage keys (view + edit client/business)
   - Seed `project_viewer` role with `owner.read` only
2. Add `requireCan()` to every write function in `clients.ts` and `businesses.ts`
3. Add `owner.*` entries to `MODULE_PERMISSIONS` in `ContextTeamClient.tsx`

**Action keys to register:**

```
owner.read
owner.create_client
owner.update_client
owner.delete_client
owner.create_business
owner.update_business
owner.delete_business
```

**Files changed:** migration file, `app/actions/clients.ts`,
`app/actions/businesses.ts`, `app/context/[projectId]/team/ContextTeamClient.tsx`

---

### 1B — Billing categories

**Problem:** `createBillingCategory`, `deleteBillingCategory`,
`seedDefaultBillingCategories` in `app/actions/billings.ts` have no
`requireCan()` gate. Action key `billings.manage_categories` already exists in
`rbac_module_actions` and is seeded to `project_editor` — it just isn't called.

**Deliverables:**

1. Add `requireCan(user.id, 'billings.manage_categories', ...)` to the three
   unprotected functions in `app/actions/billings.ts`

**Files changed:** `app/actions/billings.ts`

---

## Phase 2 — High: Module Visibility + UI Permission Gating

Each module is treated as a self-contained unit with its own audit doc, design
notes, and execution. Work through modules one at a time.

### 2A — Tab visibility gates (quick fixes, do first)

**Problem:** Board and Milestones pages do not call `getCanViewModule()`.

**Deliverables:**

1. Add `getCanViewModule(projectId, 'board')` to `app/context/[projectId]/board/page.tsx`
2. Add `getCanViewModule(projectId, 'milestones')` to `app/context/[projectId]/milestones/page.tsx`

These are 5-line changes and do not require a per-module doc.

---

### 2B — Per-module UI permission gating

**Pattern (established by media module):**

```
page.tsx         → calls get<Module>Permissions(projectId), passes to FromCache
*FromCache.tsx   → receives permissions prop, passes to *Client
*Client.tsx      → receives permissions prop, gates buttons conditionally
app/actions/*.ts → exports get<Module>Permissions() returning typed object
```

**Module execution order (suggested — most used first):**

| #   | Module      | Doc                                      | Status      |
| --- | ----------- | ---------------------------------------- | ----------- |
| 1   | Board/Tasks | `docs/teams-module/module-board.md`      | Not started |
| 2   | Notes       | `docs/teams-module/module-notes.md`      | Not started |
| 3   | Documents   | `docs/teams-module/module-documents.md`  | Not started |
| 4   | Links       | `docs/teams-module/module-links.md`      | Not started |
| 5   | Budgets     | `docs/teams-module/module-budgets.md`    | Not started |
| 6   | Billings    | `docs/teams-module/module-billings.md`   | Not started |
| 7   | Calendar    | `docs/teams-module/module-calendar.md`   | Not started |
| 8   | Milestones  | `docs/teams-module/module-milestones.md` | Not started |
| 9   | Ideas       | `docs/teams-module/module-ideas.md`      | Not started |
| 10  | Owner       | `docs/teams-module/module-owner.md`      | Not started |

**Each module doc contains:**

- Current state (what works, what is missing)
- Full list of permission keys for that module
- Files that change and exactly how
- Implementation checklist

---

## Phase 3 — Sub-Teams Feature

**Prerequisite:** Phase 1 and Phase 2 complete.

**What it enables:** `*.read.team`, `*.edit.team`, `*.delete.team`,
`tasks.assign.team` permission tiers.

### Core concepts

- A **project** has **sub-teams** (e.g., "Developers", "UX/UI", "Legal")
- A **sub-team** has exactly one **team manager** and any number of **members**
- A **project manager** can create sub-teams and assign members to them
- A **team manager** can assign tasks (and other actions) to their own team members
- Sub-team membership determines what `*.read.team` resolves to

### Data model (new tables)

```sql
project_teams          -- sub-teams within a project
  id, project_id, name, created_by, created_at

project_team_members   -- membership in a sub-team
  team_id, user_id, role (member | manager), joined_at
```

### New role concepts

The current flat role model (`project_viewer`, `project_editor`, `project_owner`)
expands to include:

| Role name         | Scope    | Description                                        |
| ----------------- | -------- | -------------------------------------------------- |
| `project_viewer`  | Project  | Read-only access to permitted modules              |
| `project_member`  | Project  | Can create/edit own records, see own data          |
| `team_manager`    | Sub-team | Can see and manage team data, assign to team       |
| `project_manager` | Project  | Can see all project data, assign across teams      |
| `project_owner`   | Project  | Full access including team and settings management |

### New action keys (examples)

```
project_teams.create
project_teams.manage_members
project_teams.delete

tasks.assign.team    -- assign task to any member of your own team
tasks.assign.project -- assign task to any project member
```

**Design doc:** `docs/teams-module/design-sub-teams.md` (to be written when Phase 2 is complete)

---

## Phase 4 — Read Scope Enforcement

**Prerequisite:** Phase 3 (sub-teams) complete.

**What it enables:** Per-module `read.own`, `read.team`, `read.project` tiers
that control which records a member sees when they open a module.

### Permission key schema

```
<module>.read.own      -- only see records assigned to / created by you
<module>.read.team     -- see records for all members of your sub-team
<module>.read.project  -- see all records across the project

<module>.edit.own      -- edit only your own records
<module>.edit.team     -- edit records belonging to your team
<module>.edit.project  -- edit any record in the project

<module>.delete.own    -- delete only your own records
<module>.delete.team   -- delete records belonging to your team
<module>.delete.project -- delete any record in the project
```

### Tasks special case

For tasks, "own" = tasks currently assigned to you (not created by you).
When a team member creates a task, it auto-assigns to them, making it visible.
If a manager reassigns the task to someone else, it leaves the creator's view.

```
tasks.read.own      -- see tasks assigned to me
tasks.read.team     -- see tasks assigned to any of my team members
tasks.read.project  -- see all project tasks

tasks.assign.team    -- reassign within my team
tasks.assign.project -- reassign to anyone in the project
```

### Implementation approach (per module)

Each module's server action query gains a scope filter:

```typescript
// Example: getMedia with scope awareness
const scope = await getReadScope(user.id, projectId, 'media');
// scope = 'own' | 'team' | 'project'

if (scope === 'own') query = query.eq('owner_id', user.id);
else if (scope === 'team') query = query.in('owner_id', teamMemberIds);
// 'project' = no extra filter
```

`getReadScope()` checks `user_project_action_grants` for the highest-level
`*.read.*` key the user holds for the module.

---

## Phase 5 — Copilot Permissions Alignment

**Prerequisite:** Phases 1–4 complete.

**What it enables:** Copilot proposals are bounded by the acting user's
per-module permissions, including read scope.

**Design doc:** `docs/teams-module/design-copilot-permissions.md` (to be written when Phase 4 is complete)

**Core rule:** Before the Copilot registry executes any capability, it checks
`can(userId, requiredAction, resource)`. If the check fails, the proposal is
rejected at approval time with a clear error — it is never silently executed.

---

## Execution Checklist

### Phase 1 — Critical (now)

- [x] 1A: `owner.*` migration + `requireCan` in clients.ts + businesses.ts + MODULE_PERMISSIONS
- [x] 1B: `requireCan` in billing category functions

### Phase 2 — High

- [x] 2A: Board and Milestones `getCanViewModule` gates
- [x] 2B-1: Board/Tasks module doc + implementation
- [x] 2B-2: Notes module doc + implementation
- [x] 2B-3: Documents module doc + implementation
- [x] 2B-4: Links module doc + implementation
- [x] 2B-5: Budgets module doc + implementation
- [x] 2B-6: Billings module doc + implementation
- [x] 2B-7: Calendar module doc + implementation
- [x] 2B-8: Milestones module doc + implementation
- [x] 2B-9: Ideas module doc + implementation
- [x] 2B-10: Owner module doc + implementation

### Phase 3 — Sub-teams

- [x] Design doc: `design-sub-teams.md`
- [x] Migration: `project_teams` + `project_team_members`
- [x] New role seeds + action keys
- [x] Team management UI in Teams tab
- [x] Server actions for team CRUD

### Phase 4 — Read scope

- [x] Design doc: `design-read-scope.md`
- [x] Migration: new `*.read.own/team/project` action keys per module
- [x] `getReadScope()` helper in `lib/rbac/`
- [x] Update server actions per module to apply scope filter
- [x] Update MODULE_PERMISSIONS with new keys (UI settings panel)
- [x] Calendar feed scope via RPC migration (`20260319210000_calendar_feed_scope.sql`)

### Phase 5 — Copilot

- [x] Design doc: `design-copilot-permissions.md`
- [x] Audit copilot registry per capability (`requiredAction` on all 36 capabilities)
- [x] Add `can()` check before each capability execution (`approveProposal`)
- [x] Propagate user read scope to copilot context fetchers (`ownerFilter` pattern)
