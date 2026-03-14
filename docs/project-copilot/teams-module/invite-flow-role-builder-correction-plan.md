# Invite Flow — Role Builder Correction Plan

> Written: 2026-03-13
> Status: Approved for implementation
> Replaces the invite access profiles flow from `invite-access-profiles-plan.md`
> (which solved the atomicity problem but got the UX wrong)

---

## 1. What Is Wrong in the Current Flow

### 1.1 Billings and Copilot Are Hardcoded as Always Visible

The current implementation excludes `billings` and `copilot` from the profile system
and displays a message saying they are "always visible and not configurable." This is
incorrect product behaviour. If the inviter does not grant access to a module, that
module should not appear for the invited member — regardless of whether that module has
fully gated server actions or not.

The incomplete `requireCan()` coverage in billing and copilot is a server-side RBAC gap;
it does not justify forcing those modules to always be visible. Visibility control is a
UI-layer concern and should be consistent across all modules.

### 1.2 The Role Dropdown Precedes Access Configuration

The current custom flow asks the inviter to pick a role (Owner / Editor / Viewer) **before**
choosing module access. This is backwards. The role is a system concept (a named bundle of
permissions). Business users do not think in terms of roles; they think in terms of:
"what can this person see and do?"

The correct mental model: the inviter first decides what the member can do, then the system
assigns the appropriate role automatically.

### 1.3 Module Cards Are Selected by Default

The custom module grid starts with all modules checked. This implies the inviter is
_removing_ access, which is a denylist mental model. The product uses an allowlist model.
Every module should start unselected. The inviter explicitly grants the ones they want.

### 1.4 Selecting a Module Grants No Specific Permissions

The current flow treats module selection as equivalent to "full access to that module."
There is no way to say "this person can read tasks but not create them" or
"this person can view budgets but not delete them." This is too coarse for real-world
access control needs:

- A contractor should be able to read and update tasks, but not delete them.
- A finance reviewer should see budgets but not create or edit entries.
- A client collaborator should read notes and upload documents, but nothing else.

### 1.5 Saving as a Reusable Role Happens Before Access Configuration

The current system shows pre-existing named profiles (Editor, Finance, Developer, etc.)
in Step 2, before any configuration. This forces users to understand what "Editor" means
before knowing what access they want to grant. The configuration should come first;
saving it as a named role for future reuse is an optional last step.

### 1.6 No Reuse Path for Custom Configurations

Once the inviter crafts a custom set of module+permissions, there is no way to save it
for reuse when inviting the next person. Every custom invite requires starting from scratch.

---

## 2. Corrected Workflow

### Step 1 — Enter invitee email

Plain email input. "Next" advances. No role or module selection yet.

### Step 2 — Choose access mode

Two options:

- **Use saved role** — only shown when at least one saved (named) role exists for this project
- **Custom access** — configure from scratch

If no saved roles exist, skip this step and go directly to Step 3.

### Step 3 — Configure access (custom mode only)

Two panels:

**Left / top — module cards (all unselected)**

All 12 project modules displayed as cards in a grid. No module is selected by default.
The inviter clicks a module to select it.

**Right / below — permissions for selected module**

When a module card is selected, a permission checklist appears inline or in a side panel.
The permissions are named in plain language (not technical key names) and organized
by concern. No permission is pre-checked. The inviter must explicitly grant each one.

After selecting permissions, the module card shows a summary badge ("3 of 6 permissions").
The inviter can click the module again to collapse it.

### Step 4 — Review access summary

A read-only summary shows:

- Each granted module with its permissions listed
- The derived effective role (Viewer / Editor / Owner) — shown informatively, not as a choice

At this step, the inviter can also save this configuration:

- Checkbox: "Save as a reusable role for this project"
- If checked: text field for the role name

### Step 5 — Generate invite link

The system:

1. Creates a `project_invite_roles` record with `granted_actions` and derived `allowed_modules`
2. If "save as reusable role" was checked, stores a `name`
3. Creates the `project_invites` record linking to the role
4. Returns the invite link

---

## 3. Required Data Model Changes

### 3.1 New table: `project_invite_roles`

Stores the explicit permission configuration for an invite. Can be named (reusable) or
unnamed (ephemeral / one-off).

```sql
CREATE TABLE public.project_invite_roles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name                 TEXT,           -- NULL = ephemeral; non-null = saved reusable role
  granted_actions      TEXT[] NOT NULL DEFAULT '{}',  -- canonical action keys
  allowed_modules      TEXT[] NOT NULL DEFAULT '{}',  -- derived: modules with ≥1 granted action
  effective_role_name  TEXT NOT NULL,  -- 'project_viewer' | 'project_editor' | 'project_owner'
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Derivation rules (computed by the server action before insert):**

`allowed_modules`: For each module key, check whether any action in `granted_actions`
starts with the module's canonical prefix (e.g. `tasks.*` for `board`). If yes, include
the module key.

| Module key   | Action prefix |
| ------------ | ------------- |
| `board`      | `tasks.`      |
| `notes`      | `notes.`      |
| `documents`  | `documents.`  |
| `media`      | `media.`      |
| `links`      | `links.`      |
| `milestones` | `milestones.` |
| `budgets`    | `budgets.`    |
| `billings`   | `billings.`   |
| `ideas`      | `ideas.`      |
| `calendar`   | `calendar.`   |
| `todos`      | `todos.`      |
| `copilot`    | `copilot.`    |

`effective_role_name`: Apply in order:

1. If any action in `granted_actions` is an owner-only action → `project_owner`
2. Else if any action is NOT a viewer-only action → `project_editor`
3. Else → `project_viewer`

Owner-only actions (not held by editor):

```
tasks.bulk_delete, notes.bulk_delete, documents.bulk_delete, documents.mark_final,
media.share_create, copilot.bulk_approve, copilot.bulk_reject,
projects.update, projects.archive, projects.unarchive, projects.delete,
projects.link_client, projects.toggle_module,
teams.invite_project_member, teams.remove_project_member,
teams.update_project_member_roles
```

Viewer-only actions (not write actions):

```
tasks.read, milestones.read, notes.read, documents.read, media.read,
calendar.read, links.read, ideas.read, budgets.read, billings.read, todos.read,
copilot.read_sessions, copilot.read_proposals,
projects.read, profile.read, workspace.read, teams.read_project_members
```

### 3.2 `project_invites` — add `invite_role_id`

```sql
ALTER TABLE public.project_invites
  ADD COLUMN invite_role_id UUID REFERENCES public.project_invite_roles(id) ON DELETE SET NULL;
```

The existing `role_id` and `profile_id` columns are retained for backward compatibility.
New invites set `invite_role_id`. Old invites still use `role_id` (and optionally `profile_id`).

### 3.3 `accept_invite_atomic` RPC — updated priority chain

Priority order for resolving role + module allowlist at accept time:

```
1. invite_role_id IS NOT NULL → use project_invite_roles (new path)
2. profile_id IS NOT NULL → use project_access_profiles (old path, backward compat)
3. else → use role_id directly (legacy plain invite)
```

---

## 4. Module Permissions — Canonical Keys Per Module

These are the real action keys seeded in `rbac_module_actions`. Labels are plain-language
descriptions for display in the invite builder UI.

### Tasks (board)

| Action key              | Label                  |
| ----------------------- | ---------------------- |
| `tasks.read`            | View tasks             |
| `tasks.create`          | Create tasks           |
| `tasks.update_status`   | Move between columns   |
| `tasks.update_title`    | Edit task title        |
| `tasks.update_notes`    | Edit task description  |
| `tasks.update_priority` | Change priority        |
| `tasks.update_due_date` | Set due date           |
| `tasks.assign`          | Assign to team members |
| `tasks.unassign`        | Remove assignments     |
| `tasks.delete`          | Delete tasks           |

### Notes

| Action key             | Label        |
| ---------------------- | ------------ |
| `notes.read`           | View notes   |
| `notes.create`         | Create notes |
| `notes.update_title`   | Edit title   |
| `notes.update_content` | Edit content |
| `notes.delete`         | Delete notes |

### Documents

| Action key                  | Label                 |
| --------------------------- | --------------------- |
| `documents.read`            | View documents        |
| `documents.upload`          | Upload files          |
| `documents.download`        | Download files        |
| `documents.update_metadata` | Edit document details |
| `documents.delete`          | Delete documents      |

### Media

| Action key              | Label              |
| ----------------------- | ------------------ |
| `media.read`            | View media         |
| `media.upload`          | Upload media       |
| `media.update_metadata` | Edit media details |
| `media.delete`          | Delete media       |

### Links

| Action key     | Label        |
| -------------- | ------------ |
| `links.read`   | View links   |
| `links.create` | Add links    |
| `links.update` | Edit links   |
| `links.delete` | Delete links |

### Milestones

| Action key            | Label             |
| --------------------- | ----------------- |
| `milestones.read`     | View milestones   |
| `milestones.create`   | Create milestones |
| `milestones.update`   | Edit milestones   |
| `milestones.complete` | Mark as complete  |
| `milestones.delete`   | Delete milestones |

### Budgets

| Action key             | Label             |
| ---------------------- | ----------------- |
| `budgets.read`         | View budgets      |
| `budgets.create`       | Create budgets    |
| `budgets.update`       | Edit budgets      |
| `budgets.manage_items` | Manage line items |
| `budgets.delete`       | Delete budgets    |

### Billings

| Action key                    | Label                  |
| ----------------------------- | ---------------------- |
| `billings.read`               | View billing records   |
| `billings.create`             | Create billing records |
| `billings.update_amount`      | Edit amount            |
| `billings.update_status`      | Change payment status  |
| `billings.update_description` | Edit description       |
| `billings.delete`             | Delete billing records |

### Ideas (mind maps)

| Action key           | Label                  |
| -------------------- | ---------------------- |
| `ideas.read`         | View mind maps         |
| `ideas.create_board` | Create mind maps       |
| `ideas.update_board` | Edit mind map settings |
| `ideas.create_node`  | Add nodes              |
| `ideas.update_node`  | Edit nodes             |
| `ideas.delete_node`  | Delete nodes           |
| `ideas.delete_board` | Delete mind maps       |

### Calendar

| Action key        | Label         |
| ----------------- | ------------- |
| `calendar.read`   | View events   |
| `calendar.create` | Create events |
| `calendar.update` | Edit events   |
| `calendar.delete` | Delete events |

### Todos

| Action key          | Label           |
| ------------------- | --------------- |
| `todos.read`        | View todo lists |
| `todos.create_list` | Create lists    |
| `todos.create_item` | Add items       |
| `todos.update_item` | Edit items      |
| `todos.toggle_item` | Check / uncheck |
| `todos.delete_item` | Delete items    |

### Copilot

| Action key                 | Label             |
| -------------------------- | ----------------- |
| `copilot.read_sessions`    | View sessions     |
| `copilot.create_session`   | Start sessions    |
| `copilot.read_proposals`   | View proposals    |
| `copilot.approve_proposal` | Approve proposals |
| `copilot.reject_proposal`  | Reject proposals  |

---

## 5. When Reusable Roles Are Created

A reusable role is an `project_invite_roles` row with a non-null `name`.

**Creation:** Opt-in at the end of the invite builder flow. After configuring modules and
permissions, the inviter can check "Save as reusable role" and enter a name. If they skip
this, the role is ephemeral (still stored in `project_invite_roles` for the invite's
lifetime, but not surfaced in the "Use saved role" list).

**Reuse:** On the next invite for the same project, if any saved roles exist, Step 2 shows
the "Use saved role" option. The inviter can pick a saved role and skip module/permission
configuration entirely. They can also choose "Custom access" to start fresh.

**Scope:** Saved roles are project-scoped. A role created in Project A is not available in
Project B. (Org-level role templates are deferred.)

**Mutability:** In Phase 1, saved roles are read-only after creation. Deleting a saved role
is a future feature. Existing invites that used the role are unaffected (the `invited_role_id`
FK is `ON DELETE SET NULL`).

---

## 6. Backward Compatibility

| Scenario                                      | Behaviour                                                   |
| --------------------------------------------- | ----------------------------------------------------------- |
| Existing member (accepted before this change) | No `user_project_access_grants` row — all tabs visible      |
| Pending invite with `profile_id`              | Accept path uses profile's `base_role_id + allowed_modules` |
| Pending invite with `role_id` only            | Accept path uses raw `role_id`, no module restrictions      |
| New invite with `invite_role_id`              | Accept path uses `project_invite_roles` derivation          |
| `accept_invite_atomic` RPC                    | Handles all three paths with priority ordering              |

---

## 7. Known Limitations (Phase 1)

### 7.1 Server-side enforcement uses derived system role

When an invite is accepted, the member is assigned the **derived system role**
(`project_viewer`, `project_editor`, or `project_owner`). The `requireCan()` checks in
server actions are based on this system role, not on the exact set of `granted_actions`.

This means: if an inviter grants only `tasks.read` and `notes.read` (viewer-level), but
that derivation results in `project_viewer`, the user may also be able to perform other
viewer-allowed actions in modules they were not given tab access to (e.g. by direct URL).

Module tab hiding prevents normal users from discovering this. It is not a guarantee for
adversarial users with direct API access.

True per-action server enforcement requires custom `rbac_roles` with specific action grants
— this is Phase 2 work.

### 7.2 Billings / Copilot server-side RBAC gaps

Including billings and copilot in the invite builder removes the "always visible" rule,
but the missing `requireCan()` calls in those modules remain. A `project_editor` or
`project_viewer` with tab access to billings can still invoke ungated server actions.

This is documented in `§13` of `invite-access-profiles-plan.md` and is unchanged by this
correction plan.

### 7.3 Per-action button visibility within modules

The UI does not yet hide/show individual action buttons (e.g. "Create task") based on
`granted_actions`. Only module tab visibility is enforced at the UI layer. In-module
action filtering is Phase 2.

---

## 8. Implementation Sequence

1. **Migration** `20260313200000_invite_role_builder.sql`:
   - Create `project_invite_roles` table with RLS
   - Add `invite_role_id` FK to `project_invites`
   - Update `accept_invite_atomic` RPC (priority chain: invite_role → profile → role)

2. **Server actions** (`app/actions/teams.ts`):
   - `createInviteRole(projectId, { grantedActions, name? })` — creates role row, derives `allowed_modules` and `effective_role_name`
   - `listReusableInviteRoles(projectId)` — lists named roles for the project
   - Update `inviteProjectMember` to accept `inviteRoleId?`
   - Update `listPendingInvites` to JOIN `project_invite_roles(name)`

3. **Cache key** (`app/context/ContextDataCache.tsx`): add `'inviteRoles'` type

4. **ContextTeamFromCache** (`app/context/[projectId]/team/ContextTeamFromCache.tsx`):
   - Add `listReusableInviteRoles(projectId)` to `Promise.all`
   - Pass `reusableRoles` to client

5. **ContextTeamClient** (`app/context/[projectId]/team/ContextTeamClient.tsx`):
   - Remove role dropdown from custom config
   - Add all 12 modules (remove billings/copilot exclusion)
   - Add `MODULE_PERMISSIONS` constant with real action keys
   - New invite step machine: `email → mode → modules → review`
   - Module cards start unselected; clicking expands inline permission checklist
   - Review step shows summary + optional "save as role" input
   - `handleInvite`: calls `createInviteRole` then `inviteProjectMember`

6. **Remove `invite_modules_note` from locales** — the "not configurable" message is gone
