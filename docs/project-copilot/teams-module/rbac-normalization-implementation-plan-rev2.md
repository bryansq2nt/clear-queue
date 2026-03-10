> **Revision 2** of the RBAC Normalization & Implementation Plan.
> Based on `docs/project-copilot/teams-module/repo-audit.md` and
> `docs/project-copilot/teams-module/rbac-normalization-implementation-plan.md` (Revision 1).
> This document supersedes Revision 1 where they conflict.
> **Live system constraint:** 2 users, ~15 projects, all data owned by the admin user.
> Migration must be zero-data-loss and backward-compatible with the running application.

# RBAC Normalization & Implementation Plan — Revision 2

**Date:** 2026-03-10
**Status:** Architecture review — ready for engineering execution
**Supersedes:** `rbac-normalization-implementation-plan.md` (Revision 1)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problems Identified in Revision 1](#2-problems-identified-in-revision-1)
3. [Permission Key Strategy](#3-permission-key-strategy)
4. [Multi-Role Assignment Model](#4-multi-role-assignment-model)
5. [Module Boundary Definitions](#5-module-boundary-definitions)
6. [RBAC Schema Design](#6-rbac-schema-design)
7. [Role and Permission Resolution](#7-role-and-permission-resolution)
8. [RLS Integration Strategy](#8-rls-integration-strategy)
9. [Safe Migration Strategy](#9-safe-migration-strategy)
10. [Final Architecture Summary](#10-final-architecture-summary)

---

## 1. Executive Summary

### What This Revision Fixes

Revision 1 established the correct conceptual foundation: modules, canonical action keys, phased
implementation, and the need to move from owner-only access to a membership-aware model. However,
four structural problems in Revision 1 must be corrected before any schema work begins:

1. **Roles are stored as free text.** `project_members.role TEXT` and `organization_members.role TEXT`
   store role names as strings. This means roles are not foreign-keyed to the `rbac_roles` table,
   they cannot carry permissions from `rbac_role_module_actions`, and duplicate/misspelled values
   are undetectable. This defeats the entire purpose of a normalized RBAC system.

2. **One role per user per context.** The Revision 1 schema allows only one role assignment per
   user per project. The product requirement is explicit: a user may hold multiple roles within
   the same context (e.g., `developer + researcher + notes_editor`). The effective permission set
   must be the **union** of all granted actions across all assigned roles.

3. **Module boundary ambiguity.** `projects.manage_members` and `teams.*` overlap. Both claim
   membership management. This creates undefined behavior for future role seeding and UI routing.
   The boundary must be cleanly defined before the RBAC metadata tables are seeded.

4. **Safe migration plan is underspecified.** Revision 1 describes the migration concept
   ("create one org per owner") but does not address the live system reality: one admin user,
   ~15 real projects, one test user, and zero tolerance for data loss. Revision 2 provides
   a step-by-step, rollback-annotated migration plan for this exact situation.

### Current System State (recap)

- 2 users: admin user (owns everything) + 1 test user
- ~15 projects, all owned by the admin user
- All project-scoped data (tasks, notes, milestones, links, documents, budgets, billings, etc.)
  is attached to those projects via `project_id`
- Authorization: binary — `owner_id = auth.uid()` everywhere
- No organizations, no membership tables, no roles

### Target State After Revision 2

```
Organization: "Default Organization"
  ├── Owner: admin user
  ├── Member: test user
  │
  ├── Projects (all 15, attached to org)
  │     └── Each project has a project_members row:
  │           admin user → [role: project_owner]
  │           test user  → [role: project_viewer]  (default — can be changed)
  │
  └── RBAC:
        Roles defined in rbac_roles (UUID FK, never free text)
        Actions defined in rbac_module_actions
        Grants in rbac_role_module_actions
        User assignments in user_role_assignments (allows multiple roles per user)
```

All existing data survives migration intact. No record is orphaned.

---

## 2. Problems Identified in Revision 1

### Problem 1 — Roles Stored as Free Text

**Revision 1 schema:**

```sql
-- In project_members:
role TEXT NOT NULL DEFAULT 'viewer'  -- 'owner' | 'editor' | 'viewer'

-- In organization_members:
role TEXT NOT NULL DEFAULT 'member'  -- 'owner' | 'admin' | 'member'
```

**Why this is wrong:**

- `role TEXT` has no FK to `rbac_roles`. The permission system cannot resolve what a role grants
  without a join to `rbac_roles → rbac_role_module_actions`.
- String values are unconstrained: `'owner'` vs `'Owner'` vs `'project_owner'` are silently different.
- Adding a new role requires zero DB change — just start inserting a new string. There is no
  registry to update, which means the permission expansion logic breaks silently.
- Custom org roles are impossible because the role is a free string with no FK to the role's
  permission set.

**Revision 2 fix:** Roles are always stored as FKs to `rbac_roles.id`. The `project_members` and
`organization_members` tables do **not** carry a role column. Instead, a separate
`user_role_assignments` table maps (user, context) → role_id. This table supports multiple rows
per user per context, enabling multi-role assignment natively.

---

### Problem 2 — Single Role Per User Per Context

**Revision 1 resolution logic:**

```
Effective role = project_members.role ?? organization_members.role ?? null
```

This returns a single role string. If a user has multiple roles, the system has no way to
represent or resolve them. The product requirement states a user can hold `developer + researcher

- notes_editor` simultaneously.

**Revision 2 fix:** Resolution fetches **all** role assignments for the user in the given context,
expands each role into its granted action keys, and returns the **union** of all action sets.
A user is permitted if any one of their roles grants the requested action key.

---

### Problem 3 — Module Boundary Ambiguity

**Revision 1 conflict:**

| Module     | Action                     | Which module owns it? |
| ---------- | -------------------------- | --------------------- |
| `projects` | `projects.manage_members`  | projects module       |
| `teams`    | `teams.invite_member`      | teams module          |
| `teams`    | `teams.remove_member`      | teams module          |
| `teams`    | `teams.update_member_role` | teams module          |

`projects.manage_members` is described as "Invite, remove, or change roles of project members."
That is exactly what `teams.invite_member`, `teams.remove_member`, and `teams.update_member_role`
do. The overlap is complete.

**Revision 2 fix:** `projects.manage_members` is **removed**. The `teams` module owns all
membership management, including project-level membership. The distinction is captured via scope:

- `teams.invite_project_member` — scope: project
- `teams.remove_project_member` — scope: project
- `teams.update_project_member_roles` — scope: project
- `teams.invite_org_member` — scope: organization
- `teams.remove_org_member` — scope: organization
- `teams.update_org_member_roles` — scope: organization

The `projects` module handles project lifecycle only (create, read, update, archive, delete,
link client, toggle modules).

---

### Problem 4 — Safe Migration Plan Underspecified

Revision 1 says: "Create one org per owner as a data migration." This description is insufficient
for a production system with real data. Revision 2 Section 9 replaces this with a step-by-step,
transaction-annotated, rollback-safe migration plan for the actual system state.

---

### Problem 5 — Permission Resolution Leaves a Gap During Transition

Revision 1 describes the OR transition for RLS:

```sql
USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM project_members ...))
```

However, it does not address what happens to existing server actions between the time
`project_members` rows are created (Phase 1) and the time `hasPermission()` is wired into
server actions (Phase 4). During Phases 2–3, existing server actions still use the old
`requireAuth() + .eq('owner_id', user.id)` pattern. For the two-user system, this is safe
because only the admin user has data. But the plan must state this explicitly, because any
Phase 1 migration that grants the test user membership would give them RLS access to data
they cannot yet reach via server actions. Revision 2 clarifies this sequencing.

---

## 3. Permission Key Strategy

### Decision: Option B — Explicit Scope-Encoded Permission Keys

Revision 2 adopts **Option B** throughout. Every permission key encodes both the action and
its effective scope directly in the key string.

**Format:** `module.verb_detail` or `module.verb_scope`

**Examples:**

```
tasks.read            (reads all tasks in the project context — scope is project)
tasks.create
tasks.update_status
tasks.update_title
tasks.update_priority
tasks.update_due_date
tasks.update_notes
tasks.assign
tasks.unassign
tasks.delete
tasks.bulk_delete
tasks.reorder
```

### Why Option B Over Option A

**Option A** would store: action = `tasks.read`, scope = `project` as separate fields, requiring
a composite lookup: `(action_key, scope) → granted boolean`.

**Option B** stores: `tasks.read` as a single string in `rbac_module_actions.action_key`. The
grant check is a simple set membership: `granted_keys.includes('tasks.read')`.

**Reasons Option B is correct for this system:**

1. **Simpler grant table.** `rbac_role_module_actions` is a join of `(role_id, action_id)` — no
   scope column needed. A granted action key either exists in the set or it doesn't.

2. **Scope is implicitly enforced by RLS.** The `project` scope is not a runtime parameter
   passed to the permission check — it is enforced by the fact that `project_members` rows exist
   only for authorized users of that project. The key `tasks.read` means "read tasks in the
   project context you are currently accessing," and RLS ensures you can only access a project's
   tasks if you are a member.

3. **Cleaner audit log entries.** An audit event with `action_key = 'tasks.update_status'` is
   self-documenting. An event with `action = 'tasks.update'` and `scope = 'project'` requires
   interpretation.

4. **Existing Revision 1 keys already follow Option B.** No migration of key naming is needed.

### Key Naming Convention

```
<module>.<verb>
<module>.<verb>_<noun>     -- when the verb alone is ambiguous
<module>.<verb>_<scope>    -- only when read_own and read_project are meaningfully different
```

| Pattern              | Example                   | When to use                                                           |
| -------------------- | ------------------------- | --------------------------------------------------------------------- |
| `module.verb`        | `tasks.create`            | Single unambiguous action                                             |
| `module.verb_noun`   | `tasks.update_status`     | Multiple update variants with different risk profiles                 |
| `module.verb_scope`  | `profile.read`            | Own-only actions that can never apply to other users                  |
| `module.manage_noun` | `links.manage_categories` | Collapsed CRUD on a sub-entity where splitting adds no security value |

### Stable Keys

All keys defined in Section 5 of Revision 1 are **retained unchanged** in Revision 2 with two
modifications:

1. `projects.manage_members` is **removed** (absorbed by `teams.*`).
2. `teams.*` keys are split into `teams.*_project_member` and `teams.*_org_member` forms for
   unambiguous scope encoding (see Section 5).

---

## 4. Multi-Role Assignment Model

### Core Principle

A user holds **zero or more roles within a context**. A context is either:

- An organization: `(user_id, org_id)` → N roles
- A project: `(user_id, project_id)` → N roles

The effective permission set for a user in a context is the **union** of all action keys
granted by all their roles in that context, plus all action keys granted by all their roles
at the parent organization level.

### Assignment Table

```sql
CREATE TABLE public.user_role_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,

  -- Context: exactly one of these must be non-null
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id      UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce: exactly one context column must be set
  CONSTRAINT context_xor CHECK (
    (project_id IS NOT NULL AND org_id IS NULL) OR
    (project_id IS NULL AND org_id IS NOT NULL)
  ),
  -- Prevent duplicate role assignment in the same context
  UNIQUE (user_id, role_id, project_id),
  UNIQUE (user_id, role_id, org_id)
);

CREATE INDEX ura_user_project ON public.user_role_assignments (user_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX ura_user_org ON public.user_role_assignments (user_id, org_id)
  WHERE org_id IS NOT NULL;
```

### What This Replaces

Revision 1 had:

- `project_members.role TEXT` — single role per user per project
- `organization_members.role TEXT` — single role per user per org

Revision 2 has:

- `project_members` — tracks **membership** (who is in the project), with no role field
- `organization_members` — tracks **membership** (who is in the org), with no role field
- `user_role_assignments` — tracks **roles** separately, allowing multiple per context

### Multi-Role Examples

```
User: alice
Context: project-alpha

user_role_assignments rows:
  alice → developer (project-alpha)
  alice → researcher (project-alpha)
  alice → notes_editor (project-alpha)

Role grants:
  developer     → tasks.create, tasks.update_status, tasks.update_priority,
                  tasks.update_due_date, milestones.read
  researcher    → notes.read, notes.create, notes.update_content,
                  links.read, links.create, ideas.read, ideas.create_board
  notes_editor  → notes.read, notes.create, notes.update_title, notes.update_content,
                  notes.delete, notes.manage_folders

Effective permissions for alice in project-alpha (UNION):
  tasks.create, tasks.update_status, tasks.update_priority, tasks.update_due_date,
  milestones.read, notes.read, notes.create, notes.update_title, notes.update_content,
  notes.delete, notes.manage_folders, links.read, links.create,
  ideas.read, ideas.create_board
```

### Resolution Rule

```
Permission check: does user X have permission 'tasks.create' in project P?

1. Fetch all role_ids for (user_id = X, project_id = P) from user_role_assignments
2. Also fetch all role_ids for (user_id = X, org_id = P's org_id) from user_role_assignments
3. Union: all_role_ids = project_roles ∪ org_roles
4. Expand: granted_actions = SELECT action_key FROM rbac_module_actions
             JOIN rbac_role_module_actions USING (id)
             WHERE role_id IN (all_role_ids)
5. Return: granted_actions.includes('tasks.create')
```

**Important:** Project-level roles take precedence in the sense that they are included first.
However, there is no override — both sets are always unioned. A project_viewer role at the
project level does **not** suppress an org_admin role's granted actions. If you want to restrict
a user below their org role for a specific project, you simply do not grant them elevated project
roles; the org role still applies unless overridden by a `project_override` flag (out of scope
for this revision).

### Conflict-Free by Design

Because the system uses union semantics, there are no conflicts between roles. There is no concept
of "role A blocks role B." If you want to restrict access, you simply do not grant the
permission — you cannot accidentally grant access by combining two restricted roles.

---

## 5. Module Boundary Definitions

This section is the authoritative definition of which module owns which responsibility.
No action should appear in two modules.

### Module Boundaries (Authoritative)

| Module       | Owns                                                                                        | Does NOT Own                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks`      | Task CRUD, status transitions, priority, assignment, ordering                               | Project structure, milestone linking UI (milestone association is a tasks action)                                                                           |
| `milestones` | Milestone CRUD, completion state, task progress aggregation                                 | Task creation inside milestones (that is tasks.create)                                                                                                      |
| `notes`      | Note CRUD, note folders, note-level links                                                   | Note categories (future), note sharing (out of scope)                                                                                                       |
| `documents`  | Document upload, metadata, archiving, folder structure, signed URLs                         | Media uploads (separate bucket, separate module)                                                                                                            |
| `media`      | Media upload, metadata, archiving, share tokens                                             | Document uploads                                                                                                                                            |
| `calendar`   | Calendar event CRUD                                                                         | Task due dates appearing on calendar (read-only feed, no distinct permission needed beyond tasks.read)                                                      |
| `links`      | Project link CRUD, link ordering, link categories                                           | Note-level links (owned by notes module)                                                                                                                    |
| `ideas`      | Idea board CRUD, node CRUD, canvas connections, batch position saves                        | Idea-to-task linking (tasks.update_milestone equivalent — if added, lives in ideas)                                                                         |
| `budgets`    | Budget envelope CRUD, budget categories, budget items, duplicate, stats                     | Billing records (separate table, separate module)                                                                                                           |
| `billings`   | Billing record CRUD, billing categories, status transitions                                 | Budget items                                                                                                                                                |
| `todos`      | Todo list CRUD, todo item CRUD, item completion                                             | Task management (todos are checklist-style, tasks are Kanban-style — different UX and schema)                                                               |
| `copilot`    | AI session CRUD, message sending, proposal read/approve/reject/undo                         | Executing the side effects of approved proposals (those are owned by the target module — RBAC gate lives in copilot.approve_proposal + target module check) |
| `projects`   | Project CRUD, archiving, client linking, module toggle, project settings                    | Membership management (owned by teams module)                                                                                                               |
| `clients`    | Client CRM CRUD, client-level reference links                                               | Business entities under a client (owned by businesses module)                                                                                               |
| `businesses` | Business entity CRUD, business media assets                                                 | Client records                                                                                                                                              |
| `teams`      | ALL membership operations — org membership + project membership, role assignment, role CRUD | Project lifecycle (owned by projects module)                                                                                                                |
| `profile`    | User profile fields, avatar, personal preferences (appearance, locale, timezone)            | Org settings                                                                                                                                                |
| `workspace`  | Org name, org branding, subscription plan, org deletion/transfer                            | User profile                                                                                                                                                |

### The projects ↔ teams Boundary (Definitive)

The clean split is:

- **`projects` module** = "What is this project and how is it configured?"
  - `projects.create`, `projects.read`, `projects.update`, `projects.archive`, `projects.unarchive`,
    `projects.delete`, `projects.link_client`, `projects.toggle_module`

- **`teams` module** = "Who is in this project (or org) and what can they do?"
  - `teams.read_project_members`, `teams.invite_project_member`, `teams.remove_project_member`,
    `teams.update_project_member_roles`, `teams.read_org_members`, `teams.invite_org_member`,
    `teams.remove_org_member`, `teams.update_org_member_roles`, `teams.read_roles`,
    `teams.create_custom_role`, `teams.update_custom_role`, `teams.delete_custom_role`

`projects.manage_members` from Revision 1 is **removed entirely**. It is replaced by
`teams.invite_project_member`, `teams.remove_project_member`, and
`teams.update_project_member_roles` — all in the `teams` module.

### Updated Canonical Module List

The canonical module list from Revision 1 is retained with one change: the `board` note is
clarified. `board` remains a UI/display concept; `tasks` is the RBAC module key.

| Module Key   | Display Name    | RBAC Scope                                  | Notes                  |
| ------------ | --------------- | ------------------------------------------- | ---------------------- |
| `tasks`      | Board / Tasks   | project                                     | Maps to `board` UI tab |
| `milestones` | Milestones      | project                                     |                        |
| `notes`      | Notes           | project                                     |                        |
| `documents`  | Documents       | project                                     |                        |
| `media`      | Media           | project                                     |                        |
| `calendar`   | Calendar        | project                                     |                        |
| `links`      | Links           | project                                     |                        |
| `ideas`      | Ideas           | project                                     |                        |
| `budgets`    | Budgets         | project                                     |                        |
| `billings`   | Billings        | project                                     |                        |
| `todos`      | To-do Lists     | project                                     |                        |
| `copilot`    | Copilot AI      | project                                     |                        |
| `projects`   | Projects        | org (create/read) + project (update/delete) |                        |
| `clients`    | Clients         | org                                         |                        |
| `businesses` | Businesses      | org                                         |                        |
| `teams`      | Teams & Members | org + project                               |                        |
| `profile`    | Profile         | own                                         |                        |
| `workspace`  | Workspace       | org + global                                |                        |

### Updated teams Module Action Keys

Replacing Revision 1's `teams.*` with unambiguous scope-encoded keys:

| Action Key                          | Description                                              | Scope   |
| ----------------------------------- | -------------------------------------------------------- | ------- |
| `teams.read_project_members`        | List members of a specific project                       | project |
| `teams.invite_project_member`       | Invite a user to a project                               | project |
| `teams.remove_project_member`       | Remove a user from a project                             | project |
| `teams.update_project_member_roles` | Add or remove roles for a project member                 | project |
| `teams.read_org_members`            | List members of the organization                         | org     |
| `teams.invite_org_member`           | Invite a user to the organization                        | org     |
| `teams.remove_org_member`           | Remove a user from the organization                      | org     |
| `teams.update_org_member_roles`     | Add or remove roles for an org member                    | org     |
| `teams.read_roles`                  | List defined roles and their granted actions             | org     |
| `teams.create_custom_role`          | Create a custom role scoped to the org                   | org     |
| `teams.update_custom_role`          | Edit a custom role's name, description, or action grants | org     |
| `teams.delete_custom_role`          | Delete a custom role (only if no active assignments)     | org     |

All other action keys from Revision 1 Section 5 are retained unchanged.

---

## 6. RBAC Schema Design

This section defines the complete relational schema for the RBAC system. All tables use UUIDs,
have `created_at` timestamps, enable RLS, and follow the project's migration checklist.

### 6.1 `organizations`

The top-level tenant container. Every user belongs to exactly one organization initially
(personal workspace model). Multi-org support is possible later by adding additional
`organization_members` rows.

```sql
CREATE TABLE public.organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan            TEXT NOT NULL DEFAULT 'free',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX orgs_owner ON public.organizations (owner_user_id);
CREATE INDEX orgs_slug  ON public.organizations (slug);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

RLS:

- SELECT: any `organization_members` row with `user_id = auth.uid()` grants read.
- UPDATE: only `owner_user_id = auth.uid()` or `is_system_admin`.
- DELETE: only `owner_user_id = auth.uid()`.

---

### 6.2 `organization_members`

Tracks who belongs to an organization. Does **not** carry a role field. Roles are in
`user_role_assignments`.

```sql
CREATE TABLE public.organization_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX org_members_lookup ON public.organization_members (org_id, user_id);
CREATE INDEX org_members_user   ON public.organization_members (user_id);
```

RLS:

- SELECT: `user_id = auth.uid()` (own memberships) OR any member of the same org can see
  other members (for team directory).
- INSERT: org admins/owners only (enforced at application layer; RLS is defense-in-depth).
- DELETE: org admins/owners only.

---

### 6.3 `project_members`

Tracks who has access to a project. Does **not** carry a role field.

```sql
CREATE TABLE public.project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX project_members_lookup ON public.project_members (project_id, user_id);
CREATE INDEX project_members_user   ON public.project_members (user_id);
```

RLS:

- SELECT: `user_id = auth.uid()` OR any project member can see other members.
- INSERT/DELETE: users holding `teams.invite_project_member` /
  `teams.remove_project_member` for the project (enforced at application layer).

---

### 6.4 `rbac_roles`

Named roles. System roles are immutable (`is_system_role = true`). Custom roles are scoped to an
org (`org_id NOT NULL`). Roles are **never** stored by name string elsewhere — always by UUID FK.

```sql
CREATE TABLE public.rbac_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT false,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- System roles: unique by name alone (org_id IS NULL)
  -- Custom roles: unique per org
  UNIQUE NULLS NOT DISTINCT (name, org_id)
);

CREATE INDEX rbac_roles_org ON public.rbac_roles (org_id) WHERE org_id IS NOT NULL;

CREATE TRIGGER update_rbac_roles_updated_at
  BEFORE UPDATE ON public.rbac_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Seeded system roles:**

| Role Name        | Description                                                                  | Context |
| ---------------- | ---------------------------------------------------------------------------- | ------- |
| `org_owner`      | Full control of the organization                                             | org     |
| `org_admin`      | Manage members, projects, clients; cannot delete org                         | org     |
| `org_member`     | View org-level resources; no write access                                    | org     |
| `project_owner`  | Full control of a project; can manage project members                        | project |
| `project_editor` | Create and edit all project content; cannot manage members or delete project | project |
| `project_viewer` | Read-only access to all project content                                      | project |

RLS: any org member can read system roles and their own org's custom roles.
Only org admins/owners can create/update/delete custom roles.

---

### 6.5 `rbac_modules`

Seeded reference table. One row per canonical module key. Prevents orphaned action keys.

```sql
CREATE TABLE public.rbac_modules (
  key          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seeded with all 17 module keys from Section 5. No RLS modification needed (read-only for all
authenticated users; no user-generated data).

---

### 6.6 `rbac_module_actions`

Seeded registry of every canonical permission key. The `action_key` column is the stable
identifier used throughout the system.

```sql
CREATE TABLE public.rbac_module_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  TEXT NOT NULL REFERENCES public.rbac_modules(key) ON DELETE CASCADE,
  action_key  TEXT NOT NULL UNIQUE,   -- e.g., 'tasks.create'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX rma_module ON public.rbac_module_actions (module_key);
```

Seeded with all canonical action keys from Section 5 of Revision 1 (plus updated `teams.*`
keys from Section 5 of this revision). Total: approximately 105 action keys.

---

### 6.7 `rbac_role_module_actions`

Defines which action keys a role grants. This is the core permission grant table.

```sql
CREATE TABLE public.rbac_role_module_actions (
  role_id   UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.rbac_module_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, action_id)
);

CREATE INDEX rrma_role   ON public.rbac_role_module_actions (role_id);
CREATE INDEX rrma_action ON public.rbac_role_module_actions (action_id);
```

**System role seed grants:**

`project_viewer` — all `*.read` action keys plus `profile.read`.

`project_editor` — all `project_viewer` grants, plus:

- `tasks.create`, `tasks.update_*`, `tasks.assign`, `tasks.unassign`, `tasks.delete`,
  `tasks.reorder`
- `milestones.create`, `milestones.update`, `milestones.complete`, `milestones.reopen`,
  `milestones.delete`
- `notes.create`, `notes.update_title`, `notes.update_content`, `notes.delete`,
  `notes.add_link`, `notes.delete_link`, `notes.manage_folders`
- `documents.upload`, `documents.update_metadata`, `documents.archive`, `documents.mark_final`,
  `documents.delete`, `documents.manage_folders`
- `media.upload`, `media.update_metadata`, `media.archive`, `media.unarchive`,
  `media.mark_final`, `media.delete`
- `calendar.create`, `calendar.update`, `calendar.delete`
- `links.create`, `links.update`, `links.archive`, `links.reorder`,
  `links.manage_categories`
- `ideas.create_board`, `ideas.update_board`, `ideas.delete_board`, `ideas.create_node`,
  `ideas.update_node`, `ideas.delete_node`, `ideas.manage_connections`, `ideas.batch_update`
- `budgets.create`, `budgets.update`, `budgets.delete`, `budgets.duplicate`,
  `budgets.manage_categories`, `budgets.manage_items`
- `billings.create`, `billings.update_amount`, `billings.update_status`,
  `billings.update_description`, `billings.delete`, `billings.manage_categories`
- `todos.create_list`, `todos.update_list`, `todos.delete_list`, `todos.create_item`,
  `todos.update_item`, `todos.toggle_item`, `todos.delete_item`
- `copilot.create_session`, `copilot.archive_session`, `copilot.delete_session`,
  `copilot.send_message`, `copilot.approve_proposal`, `copilot.reject_proposal`,
  `copilot.undo_proposal`

`project_owner` — all `project_editor` grants, plus:

- `projects.update`, `projects.archive`, `projects.unarchive`, `projects.delete`,
  `projects.link_client`, `projects.toggle_module`
- `tasks.bulk_delete`, `documents.bulk_delete`, `notes.bulk_delete`
- `media.share_create`
- `copilot.bulk_approve`, `copilot.bulk_reject`
- `teams.read_project_members`, `teams.invite_project_member`,
  `teams.remove_project_member`, `teams.update_project_member_roles`

`org_member` — `clients.read`, `businesses.read`, `projects.read`.

`org_admin` — all `org_member` grants, plus:

- `clients.create`, `clients.update`, `clients.delete`, `clients.manage_links`,
  `clients.link_to_project`
- `businesses.create`, `businesses.update`, `businesses.delete`, `businesses.manage_media`
- `projects.create`
- `teams.read_org_members`, `teams.invite_org_member`, `teams.remove_org_member`,
  `teams.update_org_member_roles`, `teams.read_roles`, `teams.create_custom_role`,
  `teams.update_custom_role`, `teams.delete_custom_role`

`org_owner` — all `org_admin` grants, plus:

- `workspace.update_name`, `workspace.update_branding`, `workspace.manage_billing_plan`,
  `workspace.danger_zone`

---

### 6.8 `user_role_assignments`

The central role assignment table, supporting multiple roles per user per context.
(Full definition in Section 4.)

---

### 6.9 `audit_log`

Immutable write log. (Definition unchanged from Revision 1 Section 7.8.)

---

### Relationship Diagram (text form)

```
auth.users
  │
  ├──► organization_members ──► organizations
  │         │
  │    user_role_assignments ──► rbac_roles
  │                                    │
  │                         rbac_role_module_actions ──► rbac_module_actions ──► rbac_modules
  │
  ├──► project_members ──► projects ──► organizations
  │         │
  │    user_role_assignments (project context)
  │
  └──► profile, user_assets, user_preferences  (own-scope, no org)
```

---

## 7. Role and Permission Resolution

### Runtime Resolution Function

```typescript
// lib/rbac/permissions.ts

export type PermissionContext = {
  projectId?: string;
  orgId?: string;
};

/**
 * Returns true if user holds any role that grants the given permission key
 * in the given context (project or org).
 *
 * Resolution: union of all granted action keys across all roles assigned to
 * the user in both the project context and the parent org context.
 */
export async function hasPermission(
  userId: string,
  permissionKey: string,
  context: PermissionContext
): Promise<boolean>;
```

### Resolution Steps

```
1. If context.projectId is provided:
   a. Verify user is a project_member (project_members WHERE project_id = ? AND user_id = ?)
   b. Fetch all role_ids from user_role_assignments WHERE user_id = ? AND project_id = ?
   c. Determine org_id from projects.org_id WHERE id = context.projectId
   d. Fetch all role_ids from user_role_assignments WHERE user_id = ? AND org_id = org_id
   e. Union of role_ids from steps b + d = all_role_ids

2. If context.orgId is provided (and no projectId):
   a. Verify user is an organization_member
   b. Fetch all role_ids from user_role_assignments WHERE user_id = ? AND org_id = ?
   c. all_role_ids = role_ids from step b

3. Expand all_role_ids:
   SELECT DISTINCT action_key
   FROM rbac_module_actions rma
   JOIN rbac_role_module_actions rrma ON rma.id = rrma.action_id
   WHERE rrma.role_id = ANY(all_role_ids)

4. Return: granted_action_keys.includes(permissionKey)
```

### Request-Scoped Caching

The full resolution for a user+context should be computed once per request and cached. The
per-request cache must be request-scoped (not module-scoped) to prevent cross-request leakage
in the Next.js server environment.

```typescript
// lib/rbac/cache.ts
// Uses React's cache() which scopes to a single server render pass

import { cache } from 'react';

export const getGrantedPermissions = cache(
  async (userId: string, context: PermissionContext): Promise<Set<string>> => {
    // ... resolution logic ...
    return new Set(grantedActionKeys);
  }
);
```

`hasPermission` calls `getGrantedPermissions` internally. Multiple calls with the same
`(userId, context)` in one server render are deduplicated automatically.

### requirePermission Guard

```typescript
export async function requirePermission(
  userId: string,
  permissionKey: string,
  context: PermissionContext
): Promise<void> {
  const allowed = await hasPermission(userId, permissionKey, context);
  if (!allowed) {
    throw new Error(`Permission denied: ${permissionKey}`);
    // Or: redirect('/')  — depending on context
  }
}
```

### Usage in Server Actions

```typescript
// Pattern for every server action after this change:
export async function createTask(projectId: string, data: CreateTaskInput) {
  const user = await requireAuth(); // Step 1: auth
  await requirePermission(user.id, 'tasks.create', { projectId }); // Step 2: permission
  // ... rest of action
}
```

### UI Gating Pattern

Permissions are resolved server-side in `*FromCache` components and passed as props to
`*Client` components. This is UX gating only — not a security boundary.

```typescript
// ContextBoardFromCache.tsx (server component)
const permissions = {
  canCreate: await hasPermission(user.id, 'tasks.create', { projectId }),
  canDelete: await hasPermission(user.id, 'tasks.delete', { projectId }),
  canBulkDelete: await hasPermission(user.id, 'tasks.bulk_delete', { projectId }),
  canReorder: await hasPermission(user.id, 'tasks.reorder', { projectId }),
};
return <ContextBoardClient ... permissions={permissions} />;
```

### Handling Own-Scope Actions

Actions in the `profile` module have scope `own`. They do not use `hasPermission` with a
projectId/orgId context. They use a simpler guard:

```typescript
// For own-scope actions: just requireAuth() is sufficient because RLS enforces owner_id
// No permission table lookup needed for profile.update_display_name etc.
export async function updateDisplayName(newName: string) {
  const user = await requireAuth(); // own-scope: auth is sufficient
  // ... RLS will enforce owner_id = auth.uid() at DB layer
}
```

---

## 8. RLS Integration Strategy

### Current State

All project-scoped data uses one of two patterns:

```sql
-- Pattern A: direct ownership
USING (owner_id = auth.uid())

-- Pattern B: project join
USING (EXISTS (
  SELECT 1 FROM projects p
  WHERE p.id = entity.project_id AND p.owner_id = auth.uid()
))
```

Both are binary: own-the-resource or nothing.

### Why the Current Model Is Insufficient

Pattern A and Pattern B cannot grant access to a second user. A `project_members` row for
a teammate has zero effect on existing RLS policies because neither pattern consults
`project_members`. The `owner_id = auth.uid()` check will always fail for any user who is not
the original creator.

### Target Policy Pattern

```sql
-- Target: project membership check (replaces project owner join)
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = entity.project_id
      AND pm.user_id = auth.uid()
  )
)
```

### Transition Policy (Phase 5 — OR logic)

During the transition period, apply both checks with OR. This preserves existing access while
enabling team access:

```sql
USING (
  -- Preserve: existing owners keep access (their project_members row may not exist yet)
  owner_id = auth.uid()
  OR
  -- New: project members gain access
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = entity.project_id
      AND pm.user_id = auth.uid()
  )
)
```

The OR clause is safe because:

1. The admin user has both `owner_id = auth.uid()` AND a `project_members` row (both pass).
2. The test user has neither — so even with the OR policy, they see nothing until a
   `project_members` row is created for them.
3. The `owner_id = auth.uid()` clause is removed only in Phase 9 (hardening), after all
   project owners have confirmed `project_members` rows.

### Tables Requiring RLS Rewrite

Project-scoped (switch from owner-join to membership join):

```
tasks, milestones, notes, note_links, project_note_folders,
project_links, project_document_folders, project_files,
calendar_events, todo_lists, todo_items,
idea_boards, idea_board_items, idea_connections,
copilot_sessions, copilot_messages, copilot_proposals,
budgets, budget_categories, budget_items, billings
```

Tables that **keep** owner semantics permanently (personal, non-shared):

```
profiles, user_assets, user_preferences,
link_categories, billing_categories,
project_access, project_favorites
```

Org-scoped tables (new policy type — join through `organization_members`):

```
clients, businesses, organizations (read via membership)
```

### RLS for `project_members` Itself

The `project_members` table has a chicken-and-egg consideration: the user must be a project
member to read `project_members`, but how do they know they are a member without reading it?

Resolution: `project_members` SELECT policy allows any row where `user_id = auth.uid()`.
This lets a user see their own memberships without revealing other memberships.
A secondary policy allows any project member to see all members of the same project:

```sql
-- Own memberships
CREATE POLICY "project_members_own" ON public.project_members
  FOR SELECT USING (user_id = auth.uid());

-- All members of projects I am a member of (for team directory)
CREATE POLICY "project_members_team" ON public.project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm2
      WHERE pm2.project_id = project_members.project_id
        AND pm2.user_id = auth.uid()
    )
  );
```

### Performance Requirements

Before any RLS rewrite, these indexes must exist:

```sql
CREATE INDEX project_members_lookup ON public.project_members (project_id, user_id);
CREATE INDEX org_members_lookup     ON public.organization_members (org_id, user_id);
CREATE INDEX ura_project_lookup     ON public.user_role_assignments (user_id, project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX ura_org_lookup         ON public.user_role_assignments (user_id, org_id)
  WHERE org_id IS NOT NULL;
```

Additionally, encapsulate the membership check in a security-definer function to enable
Postgres plan caching:

```sql
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;
```

Then RLS policies use: `USING (is_project_member(project_id))`.

### Storage Bucket Gap

Table RLS does not protect Supabase Storage. The `project-docs` and `project-media` buckets
currently use `owner_id` path prefixes for access control (`storage.objects` policies check
`auth.uid()::text = (storage.foldername(name))[1]`).

**This gap persists through Phase 5.** It is addressed in Phase 9 by rewriting storage bucket
policies to check `is_project_member(project_id_from_path)` instead of the owner prefix.

Until Phase 9, project members will be able to read document metadata via table RLS but will
get 403 errors when attempting to generate signed URLs or download files. This must be
communicated clearly before any member invitations are issued.

---

## 9. Safe Migration Strategy

### Constraints

- 2 users in production: admin user (owns all data) + 1 test user (no data)
- ~15 projects owned by admin user
- All tasks, notes, milestones, links, documents, budgets, billings attached to these projects
- **Zero data loss required**
- **Application must remain functional throughout migration**
- Migrations run on the live Supabase project; no staging environment assumed

### Migration Phases

Each step below is an independent, transactional migration. Each step has a rollback note.
Steps are ordered so that any abort leaves the system in a valid intermediate state.

---

#### Step 1 — Create the Default Organization

**What:** Insert one row into `organizations` for the admin user.

```sql
-- Migration: YYYYMMDDHHMMSS_create_default_organization.sql

-- 1a. Create organizations table (full definition from Section 6.1)
CREATE TABLE public.organizations ( ... );

-- 1b. Insert the default organization
-- NOTE: admin_user_id must be substituted with the real UUID of the admin user.
-- This is done via a migration variable or a seed script that reads auth.users.
INSERT INTO public.organizations (id, name, slug, owner_user_id, plan)
SELECT
  gen_random_uuid(),
  'Default Organization',
  'default-org',
  id,             -- admin user's UUID from auth.users
  'free'
FROM auth.users
WHERE email = current_setting('app.admin_email', true)  -- set via supabase config
   OR (SELECT COUNT(*) FROM auth.users) = 1              -- fallback: only user = admin
LIMIT 1;
```

**Validation:** `SELECT COUNT(*) FROM organizations` must return 1.
**Rollback:** `DROP TABLE organizations CASCADE` (safe — no other tables reference it yet).

---

#### Step 2 — Add `org_id` to `projects` (Nullable)

**What:** Add a nullable `org_id` column to `projects`. Do not constrain NOT NULL yet.

```sql
-- Migration: YYYYMMDDHHMMSS_projects_add_org_id.sql
ALTER TABLE public.projects
  ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX projects_org_id ON public.projects (org_id);
```

**Application impact:** None. The column is nullable and no query currently uses it.
**Rollback:** `ALTER TABLE projects DROP COLUMN org_id` — safe, no data loss.

---

#### Step 3 — Backfill `org_id` on All Projects

**What:** Set `org_id` on every existing project to the Default Organization ID.

```sql
-- Migration: YYYYMMDDHHMMSS_projects_backfill_org_id.sql
UPDATE public.projects
SET org_id = (SELECT id FROM public.organizations WHERE slug = 'default-org')
WHERE org_id IS NULL;
```

**Validation:** `SELECT COUNT(*) FROM projects WHERE org_id IS NULL` must return 0.
**Rollback:** `UPDATE projects SET org_id = NULL` — restores pre-backfill state.

---

#### Step 4 — Create `organization_members`

**What:** Create the table and insert the admin user as `org_owner` and the test user as
`org_member` (membership only — roles are assigned separately in Step 8).

```sql
-- Migration: YYYYMMDDHHMMSS_organization_members.sql
CREATE TABLE public.organization_members ( ... );  -- full definition from Section 6.2

-- Insert admin user
INSERT INTO public.organization_members (org_id, user_id)
SELECT
  (SELECT id FROM public.organizations WHERE slug = 'default-org'),
  id
FROM auth.users
WHERE email = current_setting('app.admin_email', true)
LIMIT 1;

-- Insert test user (all other users)
INSERT INTO public.organization_members (org_id, user_id)
SELECT
  (SELECT id FROM public.organizations WHERE slug = 'default-org'),
  id
FROM auth.users
WHERE email <> current_setting('app.admin_email', true);
```

**Validation:**

- `SELECT COUNT(*) FROM organization_members` must equal the total number of users.
- Both users must appear in the table.

**Rollback:** `DROP TABLE organization_members CASCADE`.

---

#### Step 5 — Create `project_members`

**What:** Create the table and insert one row per project for the admin user (the owner of all
projects).

```sql
-- Migration: YYYYMMDDHHMMSS_project_members.sql
CREATE TABLE public.project_members ( ... );  -- full definition from Section 6.3

-- Insert admin user as a member of all existing projects
-- (role is assigned separately in Step 8 via user_role_assignments)
INSERT INTO public.project_members (project_id, user_id, invited_by)
SELECT
  p.id,
  p.owner_id,    -- the admin user for all rows
  p.owner_id     -- invited by themselves (bootstrap)
FROM public.projects p
WHERE p.owner_id IS NOT NULL;
```

**Validation:**

- `SELECT COUNT(*) FROM project_members` must equal the number of existing projects (~15).
- Every project must have exactly one `project_members` row at this point.
- Cross-check: `SELECT COUNT(*) FROM projects p LEFT JOIN project_members pm ON p.id = pm.project_id WHERE pm.id IS NULL` must return 0.

**Rollback:** `DROP TABLE project_members CASCADE`.

---

#### Step 6 — Create RBAC Metadata Tables

**What:** Create `rbac_roles`, `rbac_modules`, `rbac_module_actions`, `rbac_role_module_actions`.
Seed all system data.

```sql
-- Migration: YYYYMMDDHHMMSS_rbac_metadata.sql
CREATE TABLE public.rbac_roles ( ... );
CREATE TABLE public.rbac_modules ( ... );
CREATE TABLE public.rbac_module_actions ( ... );
CREATE TABLE public.rbac_role_module_actions ( ... );

-- Seed system roles
INSERT INTO public.rbac_roles (name, description, is_system_role)
VALUES
  ('org_owner',       'Full organization control',                           true),
  ('org_admin',       'Manage members and org-level resources',              true),
  ('org_member',      'View org-level resources',                            true),
  ('project_owner',   'Full project control including member management',    true),
  ('project_editor',  'Create and edit all project content',                 true),
  ('project_viewer',  'Read-only access to project content',                 true)
ON CONFLICT DO NOTHING;

-- Seed modules (17 rows)
INSERT INTO public.rbac_modules (key, display_name) VALUES
  ('tasks',       'Board / Tasks'),
  ('milestones',  'Milestones'),
  -- ... all 17 modules
ON CONFLICT DO NOTHING;

-- Seed action keys (~105 rows)
INSERT INTO public.rbac_module_actions (module_key, action_key) VALUES
  ('tasks', 'tasks.read'),
  ('tasks', 'tasks.create'),
  -- ... all action keys
ON CONFLICT DO NOTHING;

-- Seed role grants (see Section 6.7)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r
JOIN public.rbac_module_actions a ON TRUE
WHERE r.name = 'project_viewer' AND a.action_key LIKE '%.read'
ON CONFLICT DO NOTHING;
-- ... continued for each role
```

**Validation:**

- All 17 modules exist.
- All ~105 action keys exist with valid `module_key` references.
- All 6 system roles exist.
- `project_viewer` has only `*.read` action grants.

**Rollback:** `DROP TABLE rbac_role_module_actions, rbac_module_actions, rbac_modules, rbac_roles CASCADE`.

---

#### Step 7 — Create `user_role_assignments`

**What:** Create the table. (Assignments are inserted in Step 8.)

```sql
-- Migration: YYYYMMDDHHMMSS_user_role_assignments.sql
CREATE TABLE public.user_role_assignments ( ... );  -- full definition from Section 4
```

**Rollback:** `DROP TABLE user_role_assignments CASCADE`.

---

#### Step 8 — Bootstrap Role Assignments

**What:** Assign the admin user the `org_owner` role for the Default Organization and
`project_owner` role for all 15 projects. Assign the test user the `org_member` role.

```sql
-- Migration: YYYYMMDDHHMMSS_bootstrap_role_assignments.sql

-- Admin user → org_owner at org level
INSERT INTO public.user_role_assignments (user_id, role_id, org_id)
SELECT
  om.user_id,
  (SELECT id FROM rbac_roles WHERE name = 'org_owner' AND is_system_role = true),
  om.org_id
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE u.email = current_setting('app.admin_email', true)
ON CONFLICT DO NOTHING;

-- Test user → org_member at org level
INSERT INTO public.user_role_assignments (user_id, role_id, org_id)
SELECT
  om.user_id,
  (SELECT id FROM rbac_roles WHERE name = 'org_member' AND is_system_role = true),
  om.org_id
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE u.email <> current_setting('app.admin_email', true)
ON CONFLICT DO NOTHING;

-- Admin user → project_owner for all existing projects
INSERT INTO public.user_role_assignments (user_id, role_id, project_id)
SELECT
  pm.user_id,
  (SELECT id FROM rbac_roles WHERE name = 'project_owner' AND is_system_role = true),
  pm.project_id
FROM public.project_members pm
ON CONFLICT DO NOTHING;
```

**Validation:**

- Admin user has 1 org-level role assignment (`org_owner`) + 15 project-level role assignments
  (`project_owner` × 15 projects).
- Test user has 1 org-level role assignment (`org_member`).
- Total `user_role_assignments` rows: 17 (1 + 15 + 1).

**Application impact:** None yet — server actions still use the old `requireAuth()` pattern.
The assignments exist in the DB but are not consulted by any application code until Phase 4.

**Rollback:** `DELETE FROM user_role_assignments` — safe, no other tables reference it.

---

#### Step 9 — Add Attribution Columns to Existing Tables

**What:** Non-breaking additions. All nullable — no backfill required for existing rows.

```sql
-- Migration: YYYYMMDDHHMMSS_attribution_columns.sql
ALTER TABLE public.tasks
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.milestones
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.copilot_proposals
  ADD COLUMN approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

**Application impact:** None. Nullable columns do not break existing queries or RPCs.
New server actions begin populating them going forward. Historical rows remain NULL.

---

#### Step 10 — Apply Transition RLS Policies

**What:** Rewrite project-scoped RLS policies to use OR logic (owner OR member). This is the
first change that affects actual data access.

**Order of operations within this step:**

1. Verify indexes exist on `project_members (project_id, user_id)` before applying.
2. Apply to one table at a time, testing between each table.
3. Start with a low-risk table (e.g., `notes`) before high-risk tables (e.g., `tasks`).

After this step, the test user (who has a `project_members` row only if explicitly invited —
they do NOT have one yet from Step 5) still cannot access any project data. The OR policy adds
no effective access because the test user has no `project_members` rows and does not own any data.

**This means the application continues working identically for both users after Step 10.**

---

### Migration Sequence Summary

| Step | Action                                                 | Rollback Risk | App Impact               |
| ---- | ------------------------------------------------------ | ------------- | ------------------------ |
| 1    | Create organizations table + insert Default Org        | Low           | None                     |
| 2    | Add nullable org_id to projects                        | Low           | None                     |
| 3    | Backfill org_id on all projects                        | Low           | None                     |
| 4    | Create organization_members + insert both users        | Low           | None                     |
| 5    | Create project_members + insert admin for all projects | Low           | None                     |
| 6    | Create RBAC metadata tables + seed                     | Medium        | None                     |
| 7    | Create user_role_assignments                           | Low           | None                     |
| 8    | Bootstrap role assignments for admin + test user       | Low           | None                     |
| 9    | Add nullable attribution columns                       | Low           | None                     |
| 10   | Apply transition OR RLS policies                       | High          | Test carefully per-table |

Steps 1–9 can be deployed as a single migration batch since none affect application behavior.
Step 10 (RLS rewrite) must be deployed separately, table by table, with validation between tables.

### What Happens to Existing Data

| Entity                         | Outcome                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| All 15 projects                | Remain in DB, gain `org_id = Default Organization`                           |
| All tasks                      | Remain in DB, unaffected (scoped by `project_id`, no schema change)          |
| All notes                      | Remain in DB, unaffected                                                     |
| All milestones                 | Remain in DB, gain nullable `created_by` (NULL for historical rows)          |
| All documents/media            | Remain in DB, unaffected                                                     |
| All budgets/billings           | Remain in DB, unaffected                                                     |
| All copilot sessions/proposals | Remain in DB, gain nullable `approved_by`/`rejected_by`                      |
| Admin user                     | Becomes org_owner of Default Organization + project_owner of all 15 projects |
| Test user                      | Becomes org_member of Default Organization (read-only at org level)          |

**Nothing is deleted. Nothing becomes orphaned. The admin user retains full access to
everything they owned before the migration.**

---

## 10. Final Architecture Summary

### What Changes After Full Implementation

| Layer          | Before                           | After                                                  |
| -------------- | -------------------------------- | ------------------------------------------------------ |
| Authentication | `requireAuth()` → binary         | Unchanged — still `requireAuth()`                      |
| Authorization  | None — authenticated = permitted | `requirePermission(userId, key, context)`              |
| Data isolation | `owner_id = auth.uid()`          | `is_project_member(project_id)` OR org membership      |
| Role storage   | None (implicit in ownership)     | `user_role_assignments` → FK to `rbac_roles`           |
| Multi-role     | Impossible                       | Union of all assigned role grants                      |
| Audit trail    | None                             | `audit_log` table, all writes logged                   |
| Team access    | Impossible                       | `project_members` + `user_role_assignments`            |
| Custom roles   | Impossible                       | `rbac_roles` with `org_id` for custom org-scoped roles |

### The Three Invariants This Architecture Preserves

1. **No data loss.** Every existing row is preserved. The admin user retains full ownership.
   The migration is additive (new tables + new columns) until the RLS rewrite phase.

2. **Defense in depth.** Application layer (`requirePermission`) and database layer (RLS) are
   independent. A bug in one layer does not compromise the other.

3. **Forward compatibility.** The schema supports custom roles, multiple roles per user, and
   org-level access control. New modules can be added by inserting rows into `rbac_modules` and
   `rbac_module_actions` — no schema change required.

### Implementation Priority Order

For the real two-user system described in this document, the recommended priority is:

1. **Execute Steps 1–9 of Section 9** — pure structural changes, zero risk, establishes the
   foundation. Can be done in a single deployment.

2. **Implement `lib/rbac/permissions.ts`** — write and test `hasPermission` and
   `requirePermission` with Vitest, mocking the Supabase client.

3. **Wire `requirePermission` into server actions** — start with high-risk actions:
   `setProjectModuleEnabled` (currently only guarded by `requireAuth()`), `deleteProject`,
   `deleteBilling`, then systematically cover all ~110 actions.

4. **Apply transition RLS policies (Step 10)** — table by table, with Playwright validation
   after each table.

5. **Fix the two pre-existing AGENTS.md violations** — `getBudgetStats`/`getBudgetWithData`
   missing `.eq('owner_id')`, and `deleteBilling` not scoped by `project_id`. These become
   security bugs the moment team members are introduced.

6. **Build Teams UI** — invite members, assign roles, view team roster.

7. **Phase 9 hardening** — remove OR transition from RLS, update storage bucket policies,
   implement `reorder_links_atomic` RPC.

---

_End of RBAC Normalization & Implementation Plan — Revision 2._
