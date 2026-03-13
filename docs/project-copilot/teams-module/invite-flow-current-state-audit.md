# Invite Flow Current State Audit

> Audited: 2026-03-13
> Based on live repository — no invented features.

---

## 1. Executive Summary

The Teams module has a working foundation but is **not yet the right shape for the desired invite flow**. The core infrastructure — project membership, token-based invites, role assignments, permission resolution — all works and is production-stable. What does not yet exist is: per-module access configuration during the invite, reusable role templates, the team/group concept, and org-level invites.

The current invite flow assigns one of three hardcoded system roles (Owner / Editor / Viewer). The inviter cannot choose which modules the invitee can access, cannot save a named team profile, and cannot define a custom permission set on the fly. All of that is missing.

The critical gaps before the new invite flow can be built are:

1. No module-access column on invites — there is no schema or runtime concept of "this invitee can access Tasks + Notes but not Billing"
2. No reusable role/team templates — there is no table or UI for named, saveable role configurations
3. No team/group model — no concept of "developer team", "UX team", etc.
4. `acceptInvite` is not atomic — three sequential DB writes; needs a `accept_invite_atomic` RPC

---

## 2. Current Invite Flow

### 2a. Invite Creation UI

**File:** `app/context/[projectId]/team/ContextTeamClient.tsx`

The invite form has exactly **two fields**:

| Field | Type | Behaviour |
|-------|------|-----------|
| Email | `<input type="email">` | Free text; trimmed and lowercased before save |
| Role | `<select>` | Populated by `listProjectRoles()` — returns project_owner, project_editor, project_viewer |

There is no step for module access selection. There is no concept of a team template or reusable profile. The inviter fills in email + role, clicks "Generate invite link", and receives a copyable URL.

**What happens on submit:**
1. `inviteProjectMember(projectId, email, roleId)` is called
2. Server action checks `teams.invite_project_member` permission
3. Calls `checkProjectMemberQuota(projectId)` — returns error if plan limit reached
4. Inserts into `project_invites` with a random 32-byte hex token (7-day expiry)
5. Returns `{ token }` — the UI builds `${origin}/invite/${token}` and shows it
6. The invite link is shown in the UI; the inviter copies and shares it manually
7. No email sending — the platform has no email service

### 2b. Invite Accept Flow

**File:** `app/invite/[token]/page.tsx`

1. Page loads the invite by token (no auth required to read metadata)
2. Guards displayed before any action:
   - Token not found → error
   - Status = 'revoked' → error
   - Status = 'accepted' → error (already used)
   - `expires_at < NOW()` → error
3. If user is **not authenticated**: redirect to `/login?returnUrl=/invite/${token}`. After login, user is returned here.
4. If user is authenticated: show project name, role, user's email, and Accept button
5. `acceptInvite(token)` runs three sequential writes (not atomic):
   - Upsert into `project_members` (idempotent, ON CONFLICT DO NOTHING)
   - Insert into `user_role_assignments` (catches unique constraint, returns null on duplicate)
   - Update `project_invites` → status = 'accepted', accepted_at = NOW()
6. On success: redirect to `/context/${projectId}/board`

**Works for unregistered users?** Yes, partially. The invite is stored against an email address, not a user ID. An unregistered user can click the link, register at `/signup`, and then the redirect returns them to the invite page. However, there is no automatic matching — if the newly registered user's email doesn't match the invite email, they can still accept it (the server only checks the token, not that the accepting user's email matches the invite email). This is a minor security gap to note.

### 2c. Current Team Tab Display

The team tab shows three sections:
- **Active members** — avatar initials, display name, email, role badge(s), remove button
- **Pending invites** — email, expiry date, role badge, revoke button
- **Invite form** (toggled) — email + role select + generate button

No module-access column or group/team column is shown in any of these sections.

### 2d. Org Invites

**Do not exist at the app layer.** The database infrastructure (action keys `teams.invite_org_member`, role grants on `org_admin`/`org_owner`) is seeded in migrations, but there are no server actions, no UI, and no invite table for org-level invitations. `organization_members` was pre-populated for existing users via the bootstrap migration.

---

## 3. Current Roles and Permissions State

### 3a. System Roles (seeded, always available)

| Role | Scope | Description |
|------|-------|-------------|
| `project_owner` | Project | Full control including member management |
| `project_editor` | Project | Create/edit all content; cannot manage members or delete project |
| `project_viewer` | Project | Read-only access to all project content |
| `org_owner` | Org | Full org control including billing, danger zone |
| `org_admin` | Org | Manage members, projects, org resources |
| `org_member` | Org | View org resources; access projects they are invited to |

All six are seeded at migration time via `20260310100005_rbac_metadata.sql`. They are `is_system_role = true` and have no `org_id` (globally available).

### 3b. Role Dropdown in Invite Form

`listProjectRoles()` queries `rbac_roles` filtering by `name IN ('project_owner', 'project_editor', 'project_viewer')`. **The dropdown is populated** — roles are always seeded. The invite form works without manual setup.

Default selection in the form: `project_editor` (first match, or first available).

### 3c. Permission Model (action-key based)

Permissions are resolved through a join chain:
```
user_role_assignments → rbac_roles → rbac_role_module_actions → rbac_module_actions (action_key)
```

There are **80+ action keys** across 18 modules. Examples:
- `tasks.create`, `tasks.update_status`, `tasks.delete`, `tasks.bulk_delete`
- `notes.create`, `notes.update_title`, `notes.update_content`, `notes.delete`
- `teams.invite_project_member`, `teams.remove_project_member`
- `copilot.send_message`, `copilot.approve_proposal`

The `project_owner` role has all 80+ keys. `project_editor` has all content CRUD but no member management or bulk operations. `project_viewer` has only `*.read` and `*.read_*` keys.

### 3d. Custom Roles

The schema supports custom roles scoped to an org (`rbac_roles.org_id IS NOT NULL`). The action keys `teams.create_custom_role`, `teams.update_custom_role`, `teams.delete_custom_role` are seeded and granted to org_admin/org_owner. However, **no UI or server actions exist for creating or editing custom roles**. Custom roles cannot be created by users today.

### 3e. Reusable Role Templates

**Do not exist.** There is no table, no UI, and no concept of saving a named configuration like "developer template" that assigns specific modules and permission levels. This must be built.

### 3f. Permission Resolver

**File:** `lib/rbac/resolver.ts`

The `can(userId, action, resource)` function:
1. For project-scoped resources: checks `projects.owner_id` first — if the caller IS the project owner, returns `true` immediately without hitting `user_role_assignments`. This is the robust fallback that prevents lockout even if role assignment data is missing.
2. If not the owner: confirms `project_members` membership, then expands roles via `getGrantedActions` (React `cache()` deduplicates within a render).
3. Org-scoped resources: checks `organization_members` then expands org role assignments.

---

## 4. Current Project Membership State

### 4a. Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `project_members` | Who is in the project | project_id, user_id, invited_by, joined_at |
| `user_role_assignments` | What role a member has | user_id, role_id, project_id (xor org_id), assigned_by |
| `project_invites` | Pending/past invitations | project_id, email, role_id, token, status, expires_at |

### 4b. Which Modules Are RBAC-Aware (requireCan calls confirmed)

| Module | Registry key | RBAC checks present | Notes |
|--------|-------------|---------------------|-------|
| Tasks | `board` | ✅ Yes | create, update_title, update_status, delete, bulk_delete |
| Notes | `notes` | ✅ Yes | create, update_title, delete, bulk_delete, add_link, delete_link, manage_folders |
| Documents | `documents` | ✅ Yes | upload, update_metadata, archive, unarchive, mark_final, view_signed_url, download, delete, bulk_delete, manage_folders |
| Media | `media` | ✅ Yes | upload, update_metadata, archive, unarchive, mark_final, delete, view_signed_url, share_create |
| Links | `links` | ✅ Yes | create, update, archive, reorder |
| Milestones | `milestones` | ✅ Yes | create, update, complete, reopen, delete |
| Budgets | `budgets` | ✅ Yes | create, update, delete, duplicate, manage_categories, manage_items |
| Billings | `billings` | ✅ Yes | create, update_description, update_status, delete |
| Ideas | `ideas` | ✅ Yes | create_board, update_board, delete_board, create_node, update_node, batch_update, link_project, manage_connections |
| Calendar | `calendar` | ✅ Yes | create, update, delete |
| Todos | todos (no tab yet) | ✅ Yes | create_list, update_list, delete_list, create_item, toggle_item, update_item, delete_item |
| Copilot | `copilot` | ✅ Yes | create_session, archive_session, delete_session, send_message |
| Projects | — | ✅ Yes | update, archive, unarchive, delete, toggle_module |
| Teams | `team` | ✅ Yes | read_project_members, invite_project_member, remove_project_member |
| Owner tab | `owner` | Partial | projects.update checked; projects.link_client not yet confirmed |

### 4c. Known Permission Gaps

These action keys are seeded in `rbac_module_actions` but the corresponding `requireCan` call is absent or inconsistent in server actions:

| Action key | Where expected | Current state |
|-----------|----------------|---------------|
| `notes.update_content` | `app/actions/notes.ts` updateNote | **Missing** — only `notes.update_title` is checked; content saves are not gated |
| `billings.update_amount` | `app/actions/billings.ts` updateBilling | **Missing** — only `billings.update_description` and `billings.update_status` are checked |
| `billings.manage_categories` | `app/actions/billings.ts` | **Missing** — billing category CRUD has no RBAC gate |
| `copilot.read_sessions` | `app/context/[projectId]/copilot/actions.ts` | **Missing** — list/read calls are not gated |
| `copilot.read_proposals` | same | **Missing** |
| `copilot.approve_proposal` | same | **Missing** |
| `copilot.reject_proposal` | same | **Missing** |
| `copilot.bulk_approve` | same | **Missing** |
| `copilot.bulk_reject` | same | **Missing** |
| `copilot.undo_proposal` | same | **Missing** |

These gaps mean project_viewers can currently perform write operations that should be restricted to editors/owners.

---

## 5. Current Modules Available for Invite Configuration

The user-facing module list proposed for the new invite flow, mapped to registry and RBAC:

| # | User-facing label | Registry key | RBAC module key | Permission-aware | Safe for invite config now |
|---|------------------|-------------|-----------------|------------------|---------------------------|
| 1 | Tasks | `board` | `tasks` | ✅ Yes | ✅ Yes |
| 2 | Project Owner | — | — | N/A | ⚠️ This is a role, not a module — maps to `project_owner` role assignment |
| 3 | Document Hub | `documents` | `documents` | ✅ Yes | ✅ Yes |
| 4 | Notes | `notes` | `notes` | ✅ Yes (1 gap) | ✅ Yes (minor gap: update_content unchecked) |
| 5 | Links Vault | `links` | `links` | ✅ Yes | ✅ Yes |
| 6 | Billing | `billings` | `billings` | ✅ Partial | ⚠️ Partial (update_amount, manage_categories unchecked) |
| 7 | Budgets | `budgets` | `budgets` | ✅ Yes | ✅ Yes |
| 8 | Ideas | `ideas` | `ideas` | ✅ Yes | ✅ Yes |
| 9 | Milestones | `milestones` | `milestones` | ✅ Yes | ✅ Yes |
| 10 | Calendar | `calendar` | `calendar` | ✅ Yes | ✅ Yes |
| 11 | Media | `media` | `media` | ✅ Yes | ✅ Yes |
| 12 | Copilot | `copilot` | `copilot` | ✅ Partial | ⚠️ Partial (read/approve/reject not gated) |

**Note on "Project Owner":** This is not a module — it is a role level. In the new invite flow, selecting "Project Owner" means assigning the `project_owner` system role, not toggling a module. It should be treated separately from the module access picker (either as a top-level role override, or excluded from the module list and handled as a role selector).

**Note on module enable/disable vs. permissions:** The current system has two separate concepts:
- `modules` table in DB (+ `user_project_module_preferences`?) — controls which tabs appear in the project nav
- `user_role_assignments` — controls what a member can do

These are not yet linked. A member may have the `notes.create` permission but if the Notes tab is disabled for the project, they won't see it. The new invite flow needs to decide whether "module access" means the tab is visible OR the permissions are active.

---

## 6. Current Gaps and Blockers

### G1 — No per-module access on invites (schema gap)

`project_invites` has no `module_access` or `allowed_modules` column. The current invite assigns a role (project_owner/editor/viewer) and that role determines all permissions. There is no way to say "this person gets project_viewer access but only for Tasks and Notes."

**Needed:** Either a new `project_role_templates` concept (named templates that bind a set of module access overrides), or a column on `project_invites` for module overrides, or a new approach entirely.

### G2 — No reusable role/team templates (missing concept)

There is no table, schema, or code for saving a named permission configuration (e.g., "Developer Template: can see Tasks, Milestones, Documents; cannot see Billing or Budgets"). This is the foundation for the future team/group concept.

### G3 — Non-atomic `acceptInvite`

`acceptInvite` performs three sequential DB writes:
1. Upsert `project_members`
2. Insert `user_role_assignments`
3. Update `project_invites` status

If write 2 or 3 fails after write 1, the member exists in the project but has no role or the invite stays "pending". Needs an `accept_invite_atomic` Postgres RPC.

### G4 — No team/group concept

There is no project-group abstraction. The future "developer team", "UX team", etc. requires a new table (`project_teams`?), a members join table, and a way to assign a team profile to an invitee. None of this exists.

### G5 — No org-level invite UI

Org invites are not implemented at the application layer. Only project invites exist.

### G6 — No role editing UI

Custom roles can be stored (schema supports `org_id` on `rbac_roles`), but no server actions exist for `createCustomRole`, `updateCustomRole`, `deleteCustomRole`. No UI exists for managing role grants.

### G7 — Email matching on invite accept

`acceptInvite` accepts the invite for whoever is logged in, regardless of whether their email matches `project_invites.email`. A user could accept an invite intended for a different person if they have the token. Low-severity but worth noting for future hardening.

### G8 — Bootstrap gap (mitigated)

The bootstrap migration hardcoded role assignment to one admin UUID. Projects created by other users, or projects created after migrations were applied, had no `user_role_assignments` rows. This was partially mitigated by:
1. A SQL backfill (run manually)
2. A resolver fix (project owners now bypass role checks via `projects.owner_id` check)
3. `create_project_atomic` RPC (all new projects get role assignment atomically)

**This is solved** for new projects. Existing projects without role assignments still work because of the owner bypass in the resolver.

---

## 7. Readiness for Team/Group Support

**Not ready.** The current data model is flat:

```
organizations
  └── organization_members (user_id)
  └── projects (org_id)
        └── project_members (user_id)
        └── user_role_assignments (user_id, role_id, project_id)
```

To support project teams/groups (developer team, UX team, etc.) the following would be needed:

| What | Schema needed | Exists? |
|------|--------------|---------|
| Project team definition | `project_teams (id, project_id, name, description, created_by)` | ❌ No |
| Team membership | `project_team_members (team_id, user_id, joined_at)` | ❌ No |
| Team role/permission profile | `project_team_role_template (team_id, role_id or module_overrides)` | ❌ No |
| Invite to a team | Column or join on `project_invites → team_id` | ❌ No |
| Team display in UI | New team list section in ContextTeamClient | ❌ No |

None of this infrastructure exists. The architecture is ready to add it (the existing tables are the right foundation), but the tables, actions, and UI all need to be built from scratch.

---

## 8. Recommended Direction for the New Invite Flow

Based on this audit, the recommended build sequence is:

### Step 1 — Fix `acceptInvite` atomicity (immediate)
Create `accept_invite_atomic(p_token UUID, p_user_id UUID)` RPC. This eliminates the partial-state risk before any further work.

### Step 2 — Define the role template model (schema)
Create a `project_role_templates` table:
```
project_role_templates (
  id UUID,
  project_id UUID,          -- project-scoped template
  org_id UUID,              -- or org-scoped template (reusable across projects)
  name TEXT,                -- "Developer", "Finance", "Legal", etc.
  base_role_id UUID,        -- project_owner | project_editor | project_viewer
  module_overrides JSONB,   -- { "billings": false, "budgets": false, "copilot": false }
  created_by UUID,
  created_at TIMESTAMPTZ
)
```
This allows:
- Named templates saved per-project or per-org
- A base role (determines default permissions) + module overrides (hide specific modules)
- The 3 default system templates (Owner, Editor, Viewer) need no overrides — they use the base role only

### Step 3 — Add template_id to project_invites
Add `template_id UUID REFERENCES project_role_templates(id) ON DELETE SET NULL` to `project_invites`. This replaces the raw `role_id` column (or coexists with it — if template_id is set, the template's base_role and overrides are applied on accept; otherwise the raw role_id is used as today).

### Step 4 — Redesign the invite form
New invite form steps:
1. Enter invitee email
2. Choose role template (or create ad hoc):
   - If template selected → show preview of what they can access
   - If custom → show module toggle list
3. Generate link

### Step 5 — Add project teams/groups (later)
After templates work, add `project_teams` table and team assignment in the invite flow.

---

## 9. Files and Code References

### Invite flow
| File | Purpose |
|------|---------|
| `app/context/[projectId]/team/page.tsx` | Team tab route; requireAuth guard |
| `app/context/[projectId]/team/ContextTeamFromCache.tsx` | Cache layer; error handling |
| `app/context/[projectId]/team/ContextTeamClient.tsx` | Invite form, member list, pending invites UI |
| `app/invite/[token]/page.tsx` | Accept page for invitees |
| `app/actions/teams.ts` | All team server actions |

### Schema
| File | Purpose |
|------|---------|
| `supabase/migrations/20260310100004_project_members.sql` | project_members table + bootstrap |
| `supabase/migrations/20260310100005_rbac_metadata.sql` | Roles, modules, action keys, role grants |
| `supabase/migrations/20260310100006_user_role_assignments.sql` | Role assignment table |
| `supabase/migrations/20260310100007_bootstrap_role_assignments.sql` | Seed for admin user roles |
| `supabase/migrations/20260310100009_rls_transition_or_project_members.sql` | OR-transition RLS (now partially superseded by 14) |
| `supabase/migrations/20260310100010_project_invites.sql` | project_invites table + RLS |
| `supabase/migrations/20260310100011_plan_quotas.sql` | plan_quotas table + quota RPCs |
| `supabase/migrations/20260310100012_rbac_audit_log.sql` | Audit log table |
| `supabase/migrations/20260310100013_reorder_links_atomic.sql` | reorder_links_atomic RPC |
| `supabase/migrations/20260310100014_drop_or_transition_rls.sql` | Clean member-only RLS |
| `supabase/migrations/20260310100015_create_project_atomic.sql` | create_project_atomic RPC |

### RBAC runtime
| File | Purpose |
|------|---------|
| `lib/rbac/resolver.ts` | can(), requireCan(), getGrantedActions() |
| `lib/rbac/audit.ts` | logAuditEvent() fire-and-forget |
| `lib/quotas.ts` | checkProjectMemberQuota(), checkOrgProjectQuota() |

### Module registry
| File | Purpose |
|------|---------|
| `lib/modules/registry.ts` | MODULE_REGISTRY — all 13 module definitions |
| `app/context/ContextDataCache.tsx` | Cache key types including 'team' |
| `components/skeletons/SkeletonTeam.tsx` | Loading state for team tab |
