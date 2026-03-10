> **Builds on:**
> `docs/project-copilot/teams-module/repo-audit.md`
> `docs/project-copilot/teams-module/rbac-normalization-implementation-plan.md` (Revision 1)
> `docs/project-copilot/teams-module/rbac-normalization-implementation-plan-rev2.md` (Revision 2)
>
> This document does not rewrite the RBAC work. It treats Revision 2 as the authoritative
> schema design and extends it into a complete multi-tenant SaaS foundation. Read Revision 2
> before this document. All schema definitions referenced here are fully specified there.

# Multi-Tenant SaaS Foundation Plan

**Date:** 2026-03-10
**Status:** Architecture — ready for engineering execution
**Depends on:** RBAC Revision 2 (all schema tables must be implemented first)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Reality](#2-current-system-reality)
3. [Target Multi-Tenant SaaS Model](#3-target-multi-tenant-saas-model)
4. [Tenant Isolation Model](#4-tenant-isolation-model)
5. [Organization and Membership Model](#5-organization-and-membership-model)
6. [Project Containment Model](#6-project-containment-model)
7. [Invite and Onboarding Model](#7-invite-and-onboarding-model)
8. [Role and Permission Architecture](#8-role-and-permission-architecture)
9. [Permission Resolver Design](#9-permission-resolver-design)
10. [Permission Cache Strategy](#10-permission-cache-strategy)
11. [Canonical Permissions by Module](#11-canonical-permissions-by-module)
12. [Billing, Quotas, and Feature Access Model](#12-billing-quotas-and-feature-access-model)
13. [Audit and Activity Model](#13-audit-and-activity-model)
14. [Storage Ownership and Access Model](#14-storage-ownership-and-access-model)
15. [RLS and Data Access Strategy](#15-rls-and-data-access-strategy)
16. [Safe Migration Strategy](#16-safe-migration-strategy)
17. [Risks, Edge Cases, and Open Decisions](#17-risks-edge-cases-and-open-decisions)
18. [Recommended Execution Order](#18-recommended-execution-order)

---

## 1. Executive Summary

ClearQueue is evolving from a single-user, owner-bound application into a multi-organization SaaS
platform. The previous RBAC work (Revision 2) established the correct schema primitives:
organizations, project membership, role assignments via FK (never free text), and multi-role union
semantics. This document extends that foundation into the three runtime systems that were
deliberately deferred from Revision 2: the **permission resolver**, the **permission cache**, and
the complete **canonical permission set by module**.

Beyond permissions, this document addresses the full SaaS platform model: tenant isolation, invite
lifecycle, billing ownership, quota enforcement, audit logging, and storage access isolation — all
grounded in the real constraints of a live system with production data that must not be disrupted.

### What Revision 2 Established (Do Not Revisit)

- `organizations`, `organization_members`, `project_members` schema
- `rbac_roles`, `rbac_modules`, `rbac_module_actions`, `rbac_role_module_actions` schema
- `user_role_assignments` (multi-role, FK-based, context-scoped)
- Permission key naming convention: `module.action` dot notation
- Module boundary ownership (teams vs projects, profile vs workspace)
- OR-transition RLS strategy
- 10-step safe migration for the live two-user system

### What This Document Adds

- Runtime `can(user, action, resource)` resolver with full resolution algorithm
- Request-scoped and distributed permission cache with explicit invalidation triggers
- Complete canonical permission tables for all 18 modules (~110 action keys)
- Billing/quota model with org-level plan enforcement
- Immutable audit log vs user-facing activity feed design
- Storage path strategy and bucket policy alignment with project membership
- Complete invite lifecycle with token, expiry, and new-user onboarding
- Execution order that respects live system constraints

---

## 2. Current System Reality

### The Live System

This is a production application, not a greenfield design. The following constraints are absolute:

- **2 active users.** The admin user (owner of all real data) and a single test user with no
  production data.
- **~15 real projects** owned by the admin user, each containing tasks, notes, milestones, links,
  documents, budgets, billings, todos, and calendar events. This data must not be touched.
- **Zero tolerance for data loss.** No row may be deleted or orphaned by any migration step.
- **Application must remain functional throughout migration.** Migrations are additive (new tables,
  nullable columns) until the RLS rewrite phase, which is applied table-by-table with validation.
- **No concept of organization exists today.** All isolation is `owner_id = auth.uid()`.
- **No roles, no teams, no permissions.** Authorization is binary: authenticated = full access to
  own data.

### What Must Happen to Existing Data

Every existing project and all data inside it must be attached to a "Default Organization" during
migration. The admin user becomes the org owner. The test user becomes an org member. No data
changes ownership. No new access is granted to the test user without an explicit invitation.

---

## 3. Target Multi-Tenant SaaS Model

### What a Tenant Is

A **tenant** is an `organization`. It is the top-level container for all shared data. A company,
team, or individual workspace is a tenant. One organization may have many users, many projects, and
many resources. Data belonging to one organization is never visible to members of another
organization.

### Ownership Hierarchy

```
Organization (tenant)
  ├── Members (organization_members + user_role_assignments)
  ├── Custom Roles (rbac_roles with org_id)
  ├── Projects (projects.org_id = organization.id)
  │     ├── Project Members (project_members + user_role_assignments)
  │     ├── Tasks / Milestones / Notes / Links / Documents / Media
  │     ├── Calendar / Ideas / Budgets / Billings / Todos / Copilot
  ├── Clients / Businesses (CRM, org-scoped)
  └── Billing / Plan / Quotas (org-scoped)

User (belongs to one or more organizations via organization_members)
  └── Profile / Preferences (own-scope, never org-scoped)
```

### What Belongs Where

| Scope            | What Lives Here                         | Examples                                                                                                       |
| ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **own**          | User-personal data that is never shared | profile, avatar, personal preferences, link_categories, billing_categories                                     |
| **project**      | All project content                     | tasks, notes, milestones, links, documents, media, calendar, ideas, budgets, billings, todos, copilot sessions |
| **organization** | Shared org-level data                   | clients, businesses, projects list, custom roles, billing plan, audit log                                      |
| **system**       | Platform-level data                     | system roles, module registry, action registry                                                                 |

### Multi-Org Support

A user may belong to multiple organizations simultaneously. Their profile is shared (one row in
`profiles`) but their memberships, role assignments, and accessible projects are fully scoped per
organization. Switching between organizations in the UI loads a different project list, different
clients, and different org settings — no data crosses org boundaries.

---

## 4. Tenant Isolation Model

### Hard Isolation Rules

1. **Every org-scoped resource must have `org_id` NOT NULL** after migration is complete.
   No org-scoped row may exist without a valid `org_id` foreign key.

2. **Every project-scoped resource must have `project_id` NOT NULL** — this is already enforced
   in the current schema.

3. **No resource may reference an entity from a different org.** A task in org A may not reference
   a milestone from org B. FK chains must not cross org boundaries.

4. **No orphan resources allowed.** A project with `org_id = NULL` is an orphan. A task with a
   `project_id` that references a project in a different org is a cross-tenant leak. Both are
   invalid states the migration must prevent.

5. **RLS is the final isolation barrier.** Every table that carries `org_id` or `project_id` must
   have RLS policies that enforce membership. No query may return rows outside the user's
   accessible orgs/projects regardless of application layer behavior.

### Org-ID Propagation Rule

When a project is created inside an org, its `org_id` is set. All project-scoped entities inherit
isolation through `project_id` (which chains to `projects.org_id`). Direct `org_id` columns on
project-scoped tables are not required for isolation — they are added only when needed for
direct org-level queries (e.g., cross-project reporting).

Tables that require a direct `org_id` column (because they are org-scoped, not project-scoped):
`clients`, `businesses`, `organizations`, `organization_members`, `rbac_roles` (custom roles),
`audit_log`, `org_billing`, `org_quotas`, `invites`.

### No Cross-Tenant Queries

The application layer must never issue a query without a scoping filter. Every server action that
reads org-scoped data must include `.eq('org_id', orgId)`. Every server action that reads
project-scoped data must include `.eq('project_id', projectId)`. Relying on RLS alone for scoping
(without the app-layer filter) is a convention violation flagged in `AGENTS.md` — and a security
risk because RLS can be misconfigured silently.

---

## 5. Organization and Membership Model

### Organization Lifecycle

```
Created → Active → Suspended → Deleted
           │
           └── Transfer Ownership (owner changes, org persists)
```

- **Created:** During signup (new user creates their personal workspace org) or explicitly via
  a "Create Organization" flow.
- **Active:** Normal operational state. All features available per plan.
- **Suspended:** Billing lapsed or admin action. Members can read but not write. (Future phase.)
- **Deleted:** Soft-delete only. Projects, members, and resources are cascade-archived, not
  destroyed. Hard deletion is a manual admin operation.

### Organization Schema (from Revision 2)

```sql
organizations: id, name, slug, owner_user_id, plan, created_at, updated_at
```

`owner_user_id` is the single accountable owner. Billing, danger-zone actions, and org deletion
require this role. The owner is always also present in `organization_members`.

### Membership Lifecycle

```
Invited → Pending → Active → Suspended → Removed
```

- **Invited:** An `invites` row exists (see Section 7). Not yet in `organization_members`.
- **Pending:** The invite email has been sent but not accepted.
- **Active:** Accept flow completed. A row exists in `organization_members` and one or more
  rows in `user_role_assignments`.
- **Removed:** `organization_members` row deleted. `user_role_assignments` rows cascade-deleted.
  `project_members` rows for projects in this org are also deleted (via DB trigger or migration).

### Built-In Org Roles

System roles for org context (defined in `rbac_roles` with `is_system_role = true`):

| Role         | Who Gets It                              | Key Capabilities                                                            |
| ------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| `org_owner`  | One user (the org creator or transferee) | Everything including danger zone, billing, transfer                         |
| `org_admin`  | Trusted managers                         | Invite/remove members, manage clients, create projects, manage custom roles |
| `org_member` | Default role                             | View org resources, access projects they are invited to                     |

Custom roles are created by `org_admin` and `org_owner` via the teams module. They are stored in
`rbac_roles` with `org_id` set and `is_system_role = false`. Custom roles can be assigned at both
org context and project context.

### Multi-Org Membership

A user can belong to N organizations simultaneously. Each membership is an independent
`organization_members` row with its own `user_role_assignments`. Permissions from org A never
bleed into org B. The UI shows an org switcher; the server always validates context before
resolving permissions.

---

## 6. Project Containment Model

### Containment Rule

Every project belongs to exactly one organization. `projects.org_id` is a NOT NULL FK to
`organizations.id`. This constraint is enforced at the schema level. A project cannot exist
without an org, and a project cannot be moved between orgs (ownership transfer of projects is
out of scope for this phase).

### Project Membership and Org Membership Relationship

Project membership does **not** require org membership. A user can be invited directly to a
project without being a member of the parent organization. This is the "external collaborator"
pattern — useful for contractors or clients who need access to specific projects only.

However, the recommended constraint for the initial implementation is:

> **Org members first:** When inviting someone to a project, if they are not yet an org member,
> the system automatically adds them as `org_member` at the org level before creating the
> project membership. This prevents projects from having members who are invisible at the org
> level, which complicates audit and billing.

This constraint can be relaxed later by introducing a `is_external_collaborator` flag on
`project_members` that exempts the user from requiring org membership.

### Project Membership Schema (from Revision 2)

```sql
project_members: id, project_id, user_id, invited_by, joined_at, created_at
user_role_assignments: id, user_id, role_id, project_id (nullable), org_id (nullable), assigned_by, assigned_at
```

Project-level system roles: `project_owner`, `project_editor`, `project_viewer`.

A user without any `project_members` row for a project sees zero data from that project — RLS
enforces this at the database layer.

---

## 7. Invite and Onboarding Model

### Invite Table

```sql
CREATE TABLE public.invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT UNIQUE NOT NULL,          -- cryptographically random, URL-safe
  email         TEXT NOT NULL,                 -- who is being invited
  invited_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context: exactly one must be set
  org_id        UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Role to assign on acceptance (FK to rbac_roles)
  role_id       UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,

  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'expired' | 'cancelled'
  expires_at    TIMESTAMPTZ NOT NULL,             -- DEFAULT NOW() + INTERVAL '7 days'
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invite_context_xor CHECK (
    (org_id IS NOT NULL AND project_id IS NULL) OR
    (org_id IS NULL AND project_id IS NOT NULL)
  )
);

CREATE INDEX invites_token  ON public.invites (token) WHERE status = 'pending';
CREATE INDEX invites_email  ON public.invites (email) WHERE status = 'pending';
CREATE INDEX invites_org    ON public.invites (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX invites_project ON public.invites (project_id) WHERE project_id IS NOT NULL;
```

### Invite Lifecycle

```
1. Inviter calls teams.invite_org_member or teams.invite_project_member
2. Server action validates: inviter has the permission, email is valid, no duplicate pending invite
3. Insert invite row (status = 'pending', token = secure random, expires_at = +7 days)
4. Send email via transactional email provider with link: /invite/accept?token=<token>
5. Invited user clicks link → GET /invite/accept?token=<token>
6. Server validates: token exists, status = 'pending', expires_at > NOW()
7a. If invited user already has an account:
    - Authenticate (or prompt login)
    - Insert organization_members (if org invite) or project_members (if project invite)
    - Insert user_role_assignments with the invite's role_id and context
    - Set invite.status = 'accepted', invite.accepted_at = NOW()
    - Redirect to the org or project
7b. If invited user does not have an account:
    - Redirect to /signup?invite=<token>
    - After signup, resume step 7a with the new user's ID
    - The invite email must match the signup email (enforce this)
8. Expired invites: a scheduled job or on-demand check sets status = 'expired' when expires_at < NOW()
```

### Org Invite vs Project Invite

| Property           | Org Invite                 | Project Invite                                                           |
| ------------------ | -------------------------- | ------------------------------------------------------------------------ |
| `org_id`           | Set                        | NULL                                                                     |
| `project_id`       | NULL                       | Set                                                                      |
| On accept: inserts | `organization_members` row | `project_members` row (+ `organization_members` if not already a member) |
| Default role       | `org_member`               | `project_viewer`                                                         |
| Who can issue      | `org_admin`, `org_owner`   | `project_owner` + `teams.invite_project_member`                          |

### Re-invite and Collision Rules

- If a pending invite for the same email+context already exists, do not create a duplicate —
  return the existing invite's expiry and allow the inviter to resend the email.
- If the invitee is already a member, return a clear error: "This user is already a member."
- If an invite is cancelled (`status = 'cancelled'`), a new invite for the same email+context
  may be created without restriction.

---

## 8. Role and Permission Architecture

### The Full Stack

```
rbac_modules          → defines what modules exist (17 canonical keys)
rbac_module_actions   → defines what actions exist per module (~110 action keys)
rbac_roles            → defines named roles (system + custom per org)
rbac_role_module_actions → maps role → granted action keys
user_role_assignments → maps user → role → context (org or project)
```

### System Roles vs Custom Org Roles

| Type        | `is_system_role` | `org_id`        | Who Can Modify       | When Deleted                  |
| ----------- | ---------------- | --------------- | -------------------- | ----------------------------- |
| System role | true             | NULL            | Never (immutable)    | Never                         |
| Custom role | false            | set to org's id | org_admin, org_owner | When org is deleted (CASCADE) |

System roles are seeded in the migration and never changed by application code. They represent
the universal permission profiles that work for any organization. Custom roles allow orgs to
define granular profiles — e.g., a `billing_manager` role that only grants `billings.*` and
`budgets.read` actions.

### Multi-Role Union Semantics

A user's effective permission set in a context is the set union of all action keys granted by
all roles assigned to them in that context, plus all action keys granted by org-level roles
if the context is a project (parent org roles supplement project roles).

```
effective_permissions(user, project_id) =
  UNION(
    expand_roles(user_role_assignments WHERE user_id = ? AND project_id = ?),
    expand_roles(user_role_assignments WHERE user_id = ? AND org_id = project.org_id)
  )
```

There is no "deny" mechanic. Roles only grant. If you want to restrict a user below their
org-level role for a specific project, you do not assign them an elevated project role — the
org role still applies unless the product introduces an explicit project-level override flag
(out of scope for this phase).

---

## 9. Permission Resolver Design

This is the central runtime system that all server actions, API routes, and UI gating depend on.
It must be correct, efficient, and testable.

### Conceptual API

```typescript
can(user: User, action: string, resource: Resource): Promise<boolean>
```

Where:

- `user` — the authenticated user from `requireAuth()`
- `action` — a canonical permission key string: `'tasks.update_status'`
- `resource` — the resource being acted on; the resolver extracts context from it

### Resource Context Resolution

The resolver does not receive a raw `projectId` string — it receives a typed resource descriptor
so it can resolve the correct scope without the caller needing to know which context type the
action requires.

```typescript
type Resource =
  | { type: 'project'; projectId: string }
  | { type: 'organization'; orgId: string }
  | { type: 'task'; projectId: string } // resolver uses projectId
  | { type: 'note'; projectId: string }
  | { type: 'billing'; projectId: string }
  | { type: 'client'; orgId: string }
  | { type: 'own' }; // profile actions — no context needed
```

The resolver maps the resource type to the correct context:

- `project`, `task`, `note`, `billing`, `document`, `media`, `milestone`, etc. → project context
- `client`, `business`, `organization` → org context
- `own` → no permission table lookup needed (auth alone is sufficient)

### Full Resolution Algorithm

```
can(user, action, resource):

1. If resource.type === 'own':
   return isAuthenticated(user)   // own-scope: no permission table needed

2. Determine context:
   - if project-scoped resource: context = { projectId: resource.projectId }
   - if org-scoped resource:     context = { orgId: resource.orgId }

3. Check membership:
   - project context: SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
   - org context:     SELECT 1 FROM organization_members WHERE org_id = ? AND user_id = ?
   - if no membership row: return false immediately (no need to expand roles)

4. Load all role IDs for this user in this context:
   project_role_ids = SELECT role_id FROM user_role_assignments
     WHERE user_id = ? AND project_id = ?

   org_id_for_project = SELECT org_id FROM projects WHERE id = ? (if project context)

   org_role_ids = SELECT role_id FROM user_role_assignments
     WHERE user_id = ? AND org_id = ? (project's org or direct org context)

   all_role_ids = project_role_ids ∪ org_role_ids

5. If all_role_ids is empty: return false

6. Expand roles to action keys:
   granted_actions = SELECT DISTINCT action_key
     FROM rbac_module_actions rma
     JOIN rbac_role_module_actions rrma ON rma.id = rrma.action_id
     WHERE rrma.role_id = ANY(all_role_ids)

7. return granted_actions.has(action)
```

### Implementation

```typescript
// lib/rbac/resolver.ts

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type Resource =
  | { type: 'project'; projectId: string }
  | { type: 'organization'; orgId: string }
  | { type: 'own' }
  | {
      type:
        | 'task'
        | 'note'
        | 'milestone'
        | 'document'
        | 'media'
        | 'link'
        | 'idea'
        | 'budget'
        | 'billing'
        | 'todo'
        | 'calendar_event';
      projectId: string;
    }
  | { type: 'client' | 'business'; orgId: string };

/**
 * Returns true if the user has the given permission in the resource's context.
 * Results are cached per-request via React's cache().
 */
export const can = cache(
  async (
    userId: string,
    action: string,
    resource: Resource
  ): Promise<boolean> => {
    if (resource.type === 'own') return true; // auth gate is sufficient for own-scope

    const supabase = await createClient();

    // Step 1: resolve context
    const isProjectScope = 'projectId' in resource;
    const contextId = isProjectScope
      ? (resource as { projectId: string }).projectId
      : (resource as { orgId: string }).orgId;

    // Step 2: verify membership (fast check before loading roles)
    if (isProjectScope) {
      const { data: member } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', contextId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!member) return false;
    } else {
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('org_id', contextId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!member) return false;
    }

    // Step 3: load granted permissions (cached — see Section 10)
    const grantedActions = await getGrantedActions(
      userId,
      contextId,
      isProjectScope
    );
    return grantedActions.has(action);
  }
);

/**
 * Throws if the user does not have permission. Use in server actions.
 */
export async function requireCan(
  userId: string,
  action: string,
  resource: Resource
): Promise<void> {
  const allowed = await can(userId, action, resource);
  if (!allowed) throw new Error(`Forbidden: ${action}`);
}
```

### Request Examples

**Example 1 — Task status update:**

```typescript
// In updateTaskStatus server action:
const user = await requireAuth();
await requireCan(user.id, 'tasks.update_status', { type: 'task', projectId });
```

Resolver: loads `project_members` for user + project → loads `user_role_assignments` for project

- parent org → expands all roles → checks `tasks.update_status` in granted set.

**Example 2 — Invite project member:**

```typescript
// In inviteProjectMember server action:
const user = await requireAuth();
await requireCan(user.id, 'teams.invite_project_member', {
  type: 'project',
  projectId,
});
```

A `project_viewer` does not have `teams.invite_project_member` in their granted set.
A `project_owner` does. The action is blocked or allowed accordingly.

**Example 3 — Update org branding:**

```typescript
// In updateOrgBranding server action:
const user = await requireAuth();
await requireCan(user.id, 'workspace.update_branding', {
  type: 'organization',
  orgId,
});
```

Resolver: checks `organization_members` for user + org → loads org-level role assignments →
only `org_owner` role grants `workspace.update_branding` → denied if user is `org_admin` or lower.

**Example 4 — Approve Copilot task proposal:**

```typescript
// The copilot approve action checks BOTH the copilot permission AND the target module permission
const user = await requireAuth();
await requireCan(user.id, 'copilot.approve_proposal', {
  type: 'project',
  projectId,
});
await requireCan(user.id, 'tasks.create', { type: 'project', projectId });
// Both must pass — a viewer cannot approve a task-creation proposal even if they can use copilot
```

### Interaction With RLS

The `can()` resolver is the **application-layer** gate. It prevents unauthorized requests from
even reaching the database query. RLS is the **database-layer** gate. It independently enforces
membership regardless of what the application layer does.

This dual-layer model means:

- A bug in `can()` that returns `true` too broadly will still be blocked by RLS.
- A misconfigured RLS policy that is too permissive will still be blocked by `requireCan()`.
- Both layers must be correct for full security, but neither is a single point of failure.

---

## 10. Permission Cache Strategy

### The Performance Problem

The full permission resolution for one `can()` call involves at minimum:

1. A membership check (1 query)
2. A role assignment lookup (1 query)
3. A role expansion join (1 query)

In a single page load, a `*FromCache` component may call `can()` 8–15 times (one per button,
one per conditional render). Without caching, this is 24–45 DB round trips per page render.

### Layer 1 — Request-Scoped Cache (Always Active)

React's `cache()` function (imported from `react`, not `react/cache`) automatically deduplicates
function calls with identical arguments within a single server render pass. This is the primary
cache layer and costs nothing to implement beyond wrapping the resolution function.

```typescript
// lib/rbac/resolver.ts
import { cache } from 'react';

// getGrantedActions is cached per-request per (userId, contextId, isProjectScope)
export const getGrantedActions = cache(
  async (
    userId: string,
    contextId: string,
    isProjectScope: boolean
  ): Promise<Set<string>> => {
    // ... 3-query resolution ...
    return new Set(grantedActionKeys);
  }
);
```

**What this achieves:** All calls to `can(userId, 'tasks.create', { projectId: 'X' })` and
`can(userId, 'tasks.delete', { projectId: 'X' })` in the same server render share one
resolution result. The 15 permission checks for a board page result in 3–4 DB queries, not 45.

**Scope:** Request-scoped only. A new server render starts fresh. This is correct — stale
permissions within a request are impossible by definition.

### Layer 2 — Distributed Cache (Optional, Scale Phase)

For high-traffic orgs or when the permission resolution load becomes measurable, a Redis cache
can be added in front of the DB resolution.

**Cache key format:**

```
perm:{userId}:{context_type}:{context_id}
# Examples:
perm:abc123:project:def456
perm:abc123:org:ghi789
```

**Cache value:** JSON-serialized array of granted action key strings.

**TTL:** 5 minutes. Stale permissions for 5 minutes is acceptable for most SaaS actions.
Exceptions (see invalidation below).

**Cache population:**

```typescript
// Pseudo-code for cache-aside pattern:
async function getGrantedActionsWithCache(userId, contextId, isProjectScope) {
  const cacheKey = `perm:${userId}:${isProjectScope ? 'project' : 'org'}:${contextId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return new Set(JSON.parse(cached));

  const actions = await resolveFromDB(userId, contextId, isProjectScope);
  await redis.setex(cacheKey, 300, JSON.stringify([...actions]));
  return actions;
}
```

### Invalidation Triggers

Permissions must be invalidated (cache key deleted) when any of these events occur:

| Event                                                 | Invalidation Target                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `user_role_assignments` INSERT/DELETE for a user      | `perm:{userId}:{context_type}:{context_id}`                                                                        |
| `rbac_role_module_actions` INSERT/DELETE for a role   | All cache keys for users who hold that role in any context — use `SCAN + DEL` by pattern or tag-based invalidation |
| `project_members` DELETE (user removed from project)  | `perm:{userId}:project:{project_id}`                                                                               |
| `organization_members` DELETE (user removed from org) | `perm:{userId}:org:{org_id}` AND all `perm:{userId}:project:*` for projects in that org                            |
| `rbac_roles` DELETE (custom role deleted)             | Same as role_module_actions above                                                                                  |

**Implementation:** Invalidation happens in the server action that performs the change.
The action calls a `invalidatePermissionCache(userId, context)` helper after the DB write.
Do not use DB triggers for cache invalidation — they run in the same transaction and cannot
guarantee the cache write succeeded.

### What Must Never Be Cached

- **RLS at the DB layer** — this is always evaluated live. No caching of query results based on
  permissions is safe because data changes independently of permission changes.
- **The `can()` result itself in a persistent store** — only cache the expanded action set, not
  the boolean result for a specific action. The action key checked can change at call time.
- **Org plan / quota checks** — these must be read fresh because billing events (plan upgrades,
  downgrades) may occur at any time. Do not cache quota remaining values.

---

## 11. Canonical Permissions by Module

The following tables are the authoritative reference. All ~110 action keys are implemented as
rows in `rbac_module_actions` (seeded in the RBAC metadata migration).

---

### tasks

| Action Key               | Description                             | Scope   | Notes                                   |
| ------------------------ | --------------------------------------- | ------- | --------------------------------------- |
| `tasks.read`             | List and view tasks in a project        | project |                                         |
| `tasks.create`           | Create a new task                       | project | Uses `create_task_atomic` RPC           |
| `tasks.update_title`     | Edit task title                         | project |                                         |
| `tasks.update_status`    | Move task to another status column      | project | Uses `move_task_atomic` RPC             |
| `tasks.update_priority`  | Change priority level                   | project | Audit-sensitive                         |
| `tasks.update_due_date`  | Set or clear the due date               | project |                                         |
| `tasks.update_notes`     | Edit task notes/description             | project |                                         |
| `tasks.update_tags`      | Add or remove task tags                 | project |                                         |
| `tasks.update_milestone` | Link or unlink a milestone              | project |                                         |
| `tasks.assign`           | Assign task to a user                   | project | Requires `assigned_to` column (Phase 2) |
| `tasks.unassign`         | Remove user assignment                  | project |                                         |
| `tasks.delete`           | Delete a single task                    | project |                                         |
| `tasks.bulk_delete`      | Delete multiple tasks                   | project | Restricted to project_owner+            |
| `tasks.reorder`          | Reorder tasks within or between columns | project |                                         |
| `tasks.duplicate`        | Clone an existing task                  | project | Not yet implemented                     |

---

### milestones

| Action Key            | Description                              | Scope   | Notes   |
| --------------------- | ---------------------------------------- | ------- | ------- |
| `milestones.read`     | List and view milestones                 | project |         |
| `milestones.create`   | Create a milestone                       | project |         |
| `milestones.update`   | Edit milestone title, description, dates | project |         |
| `milestones.complete` | Mark milestone as complete               | project | Via RPC |
| `milestones.reopen`   | Reopen a completed milestone             | project | Via RPC |
| `milestones.delete`   | Delete a milestone and unlink tasks      | project |         |

---

### notes

| Action Key             | Description                         | Scope   | Notes |
| ---------------------- | ----------------------------------- | ------- | ----- |
| `notes.read`           | List and open notes                 | project |       |
| `notes.create`         | Create a note                       | project |       |
| `notes.update_title`   | Edit note title                     | project |       |
| `notes.update_content` | Edit note body                      | project |       |
| `notes.delete`         | Delete a single note                | project |       |
| `notes.bulk_delete`    | Delete multiple notes               | project |       |
| `notes.add_link`       | Add a reference link to a note      | project |       |
| `notes.delete_link`    | Remove a link from a note           | project |       |
| `notes.manage_folders` | Create, rename, delete note folders | project |       |

---

### documents

| Action Key                  | Description                              | Scope   | Notes                                  |
| --------------------------- | ---------------------------------------- | ------- | -------------------------------------- |
| `documents.read`            | List documents and metadata              | project |                                        |
| `documents.view_signed_url` | Generate a signed URL to open a document | project | Creates a time-limited credential      |
| `documents.download`        | Generate a download-intent signed URL    | project |                                        |
| `documents.upload`          | Upload one or more documents             | project |                                        |
| `documents.update_metadata` | Edit title, description, category, tags  | project |                                        |
| `documents.archive`         | Soft-archive a document                  | project |                                        |
| `documents.unarchive`       | Restore an archived document             | project |                                        |
| `documents.mark_final`      | Mark a document as final/approved        | project | Elevated: restricted to project_owner+ |
| `documents.delete`          | Soft-delete a document                   | project |                                        |
| `documents.bulk_delete`     | Soft-delete multiple documents           | project |                                        |
| `documents.manage_folders`  | Create, rename, delete document folders  | project |                                        |

---

### media

| Action Key              | Description                        | Scope   | Notes                           |
| ----------------------- | ---------------------------------- | ------- | ------------------------------- |
| `media.read`            | List media and metadata            | project |                                 |
| `media.view_signed_url` | Generate signed URL to view media  | project |                                 |
| `media.upload`          | Upload a media file                | project |                                 |
| `media.update_metadata` | Edit caption, category, tags       | project |                                 |
| `media.archive`         | Soft-archive a media item          | project |                                 |
| `media.unarchive`       | Restore archived media             | project |                                 |
| `media.mark_final`      | Mark as favorite/final             | project |                                 |
| `media.delete`          | Delete a media item (DB + storage) | project | Physical deletion from bucket   |
| `media.share_create`    | Create a public share token        | project | Generates public URL — elevated |

---

### calendar

| Action Key        | Description                | Scope   | Notes                                     |
| ----------------- | -------------------------- | ------- | ----------------------------------------- |
| `calendar.read`   | Read project calendar feed | project | Aggregates tasks, billings, todos via RPC |
| `calendar.create` | Create a calendar event    | project |                                           |
| `calendar.update` | Edit event details         | project |                                           |
| `calendar.delete` | Delete an event            | project |                                           |

---

### links

| Action Key                | Description                            | Scope   | Notes                               |
| ------------------------- | -------------------------------------- | ------- | ----------------------------------- |
| `links.read`              | List project links and categories      | project |                                     |
| `links.create`            | Create a new link                      | project |                                     |
| `links.update`            | Edit link title, URL, category, tags   | project |                                     |
| `links.archive`           | Archive a link                         | project |                                     |
| `links.reorder`           | Reorder links                          | project | Requires `reorder_links_atomic` RPC |
| `links.delete`            | Delete a link                          | project |                                     |
| `links.manage_categories` | Create, update, delete link categories | own     | `link_categories` is owner-scoped   |

---

### ideas

| Action Key                 | Description                                | Scope   | Notes |
| -------------------------- | ------------------------------------------ | ------- | ----- |
| `ideas.read`               | List idea boards and nodes                 | project |       |
| `ideas.create_board`       | Create an idea board                       | project |       |
| `ideas.update_board`       | Rename or describe a board                 | project |       |
| `ideas.delete_board`       | Delete a board and all nodes               | project |       |
| `ideas.create_node`        | Add a node to a board                      | project |       |
| `ideas.update_node`        | Edit node content                          | project |       |
| `ideas.delete_node`        | Remove a node                              | project |       |
| `ideas.manage_connections` | Create or delete connections between nodes | project |       |
| `ideas.batch_update`       | Batch canvas layout save                   | project |       |
| `ideas.link_project`       | Associate board with a project             | project |       |

---

### budgets

| Action Key                  | Description                                        | Scope   | Notes                                         |
| --------------------------- | -------------------------------------------------- | ------- | --------------------------------------------- |
| `budgets.read`              | List budgets and stats                             | project | Fix: `getBudgetStats` needs `.eq('owner_id')` |
| `budgets.create`            | Create a budget envelope                           | project |                                               |
| `budgets.update`            | Edit budget name and description                   | project |                                               |
| `budgets.delete`            | Delete a budget and cascade items                  | project |                                               |
| `budgets.duplicate`         | Duplicate a budget                                 | project | Uses `duplicate_budget_atomic` RPC            |
| `budgets.manage_categories` | Create, update, delete budget categories           | project |                                               |
| `budgets.manage_items`      | Create, update, delete, status-change budget items | project |                                               |

---

### billings

| Action Key                    | Description                                    | Scope   | Notes                                  |
| ----------------------------- | ---------------------------------------------- | ------- | -------------------------------------- |
| `billings.read`               | List billing records                           | project |                                        |
| `billings.create`             | Create a billing record                        | project |                                        |
| `billings.update_amount`      | Change amount or currency                      | project | Financial — needs audit trail          |
| `billings.update_status`      | Change status (pending/paid/overdue/cancelled) | project | Core workflow action                   |
| `billings.update_description` | Edit title, notes, dates, payment fields       | project |                                        |
| `billings.delete`             | Delete a billing record                        | project | Fix: needs `project_id` scope in query |
| `billings.manage_categories`  | Create or delete billing categories            | own     | `billing_categories` is owner-scoped   |

---

### todos

| Action Key            | Description                 | Scope   | Notes                              |
| --------------------- | --------------------------- | ------- | ---------------------------------- |
| `todos.read`          | List todo lists and items   | project |                                    |
| `todos.create_list`   | Create a todo list          | project |                                    |
| `todos.update_list`   | Edit list title             | project |                                    |
| `todos.delete_list`   | Delete a list and all items | project |                                    |
| `todos.create_item`   | Add an item to a list       | project | Uses `create_todo_item_atomic` RPC |
| `todos.update_item`   | Edit item text              | project |                                    |
| `todos.toggle_item`   | Check or uncheck an item    | project | Uses `toggle_todo_item_atomic` RPC |
| `todos.delete_item`   | Delete an item              | project |                                    |
| `todos.reorder_items` | Reorder items in a list     | project |                                    |

---

### copilot

| Action Key                 | Description                               | Scope   | Notes                                  |
| -------------------------- | ----------------------------------------- | ------- | -------------------------------------- |
| `copilot.read_sessions`    | List and read AI sessions                 | project |                                        |
| `copilot.create_session`   | Start a new AI session                    | project |                                        |
| `copilot.archive_session`  | Archive a session                         | project |                                        |
| `copilot.delete_session`   | Permanently delete a session              | project |                                        |
| `copilot.send_message`     | Send a message to the AI                  | project | Calls streaming route                  |
| `copilot.read_proposals`   | View AI proposals                         | project |                                        |
| `copilot.approve_proposal` | Approve a proposal (executes side effect) | project | Also requires target module permission |
| `copilot.reject_proposal`  | Reject a proposal                         | project |                                        |
| `copilot.undo_proposal`    | Undo an approved delete proposal          | project |                                        |
| `copilot.bulk_approve`     | Approve all pending proposals             | project | Restricted to project_owner+           |
| `copilot.bulk_reject`      | Reject all pending proposals              | project |                                        |

---

### projects

| Action Key               | Description                            | Scope   | Notes                                   |
| ------------------------ | -------------------------------------- | ------- | --------------------------------------- |
| `projects.read`          | List and view project details          | org     | Sidebar, project picker                 |
| `projects.create`        | Create a new project                   | org     |                                         |
| `projects.update`        | Edit name, color, category, notes      | project |                                         |
| `projects.archive`       | Archive a project                      | project |                                         |
| `projects.unarchive`     | Restore archived project               | project |                                         |
| `projects.delete`        | Hard-delete a project                  | project | High-risk — restricted to project_owner |
| `projects.link_client`   | Link a client/business to a project    | project |                                         |
| `projects.toggle_module` | Enable or disable a project module tab | project | Currently unguarded — HIGH RISK         |

---

### clients

| Action Key                | Description                                   | Scope | Notes |
| ------------------------- | --------------------------------------------- | ----- | ----- |
| `clients.read`            | List clients                                  | org   |       |
| `clients.create`          | Create a client                               | org   |       |
| `clients.update`          | Edit client fields                            | org   |       |
| `clients.delete`          | Delete a client (cascades to businesses)      | org   |       |
| `clients.manage_links`    | Create, update, delete client reference links | org   |       |
| `clients.link_to_project` | Associate a client with a project             | org   |       |

---

### businesses

| Action Key                | Description                       | Scope | Notes |
| ------------------------- | --------------------------------- | ----- | ----- |
| `businesses.read`         | List businesses linked to clients | org   |       |
| `businesses.create`       | Create a business record          | org   |       |
| `businesses.update`       | Edit business fields              | org   |       |
| `businesses.delete`       | Delete a business record          | org   |       |
| `businesses.manage_media` | Upload or delete business media   | org   |       |

---

### teams

| Action Key                          | Description                              | Scope   | Notes                                   |
| ----------------------------------- | ---------------------------------------- | ------- | --------------------------------------- |
| `teams.read_project_members`        | List project members                     | project |                                         |
| `teams.invite_project_member`       | Invite a user to a project               | project | Creates invites row                     |
| `teams.remove_project_member`       | Remove a user from a project             | project |                                         |
| `teams.update_project_member_roles` | Add or remove roles for a project member | project |                                         |
| `teams.read_org_members`            | List org members                         | org     |                                         |
| `teams.invite_org_member`           | Invite a user to the organization        | org     |                                         |
| `teams.remove_org_member`           | Remove a user from the org               | org     |                                         |
| `teams.update_org_member_roles`     | Add or remove roles for an org member    | org     |                                         |
| `teams.read_roles`                  | List roles and their granted actions     | org     |                                         |
| `teams.create_custom_role`          | Define a new custom org role             | org     |                                         |
| `teams.update_custom_role`          | Edit a custom role's grants              | org     |                                         |
| `teams.delete_custom_role`          | Delete a custom role                     | org     | Blocked if any active assignments exist |

---

### profile

| Action Key                    | Description                | Scope | Notes                |
| ----------------------------- | -------------------------- | ----- | -------------------- |
| `profile.read`                | Read own profile           | own   | `requireAuth()` only |
| `profile.update_display_name` | Change display name        | own   |                      |
| `profile.update_phone`        | Change phone number        | own   |                      |
| `profile.update_timezone`     | Change timezone preference | own   |                      |
| `profile.upload_avatar`       | Upload a new avatar image  | own   |                      |
| `profile.delete_asset`        | Delete a user asset        | own   |                      |

---

### workspace

| Action Key                      | Description                             | Scope | Notes                              |
| ------------------------------- | --------------------------------------- | ----- | ---------------------------------- |
| `workspace.read`                | Read org/workspace settings             | org   |                                    |
| `workspace.update_appearance`   | Update theme, colors, logo (user-level) | own   | Maps to `app/settings/appearance/` |
| `workspace.update_name`         | Change organization name                | org   | Restricted to org_admin+           |
| `workspace.update_branding`     | Upload org logo or cover                | org   |                                    |
| `workspace.manage_billing_plan` | Manage subscription and plan            | org   | Restricted to org_owner only       |
| `workspace.danger_zone`         | Delete org, transfer ownership          | org   | Restricted to org_owner only       |

---

## 12. Billing, Quotas, and Feature Access Model

### Billing Belongs to the Organization

SaaS billing is scoped to the organization, not the user. The org owner manages the subscription.
Individual users do not have individual plan limits.

```sql
CREATE TABLE public.org_billing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL DEFAULT 'free',          -- 'free' | 'starter' | 'pro' | 'enterprise'
  billing_email   TEXT,
  stripe_customer_id TEXT,                               -- or equivalent payment provider ID
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active',        -- 'active' | 'past_due' | 'cancelled'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `organizations.plan` field is a denormalized snapshot for fast plan checks in application
code. It is updated by a webhook from the billing provider when the plan changes.

### Quota Model

```sql
CREATE TABLE public.org_quotas (
  org_id              UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  max_projects        INTEGER NOT NULL DEFAULT 3,
  max_members         INTEGER NOT NULL DEFAULT 5,
  max_storage_gb      NUMERIC(10,2) NOT NULL DEFAULT 1.0,
  ai_tokens_per_month INTEGER NOT NULL DEFAULT 50000,
  ai_tokens_used      INTEGER NOT NULL DEFAULT 0,
  ai_tokens_reset_at  TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Quota Enforcement Points

Quotas are enforced at the application layer (server actions), not at the database layer.
Database constraints cannot check business quotas.

| Quota                 | Enforced In                                    | Action                                                                |
| --------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `max_projects`        | `createProject` server action                  | Check `COUNT(*) FROM projects WHERE org_id = ?` < limit before insert |
| `max_members`         | `inviteOrgMember` server action                | Check current member count before creating invite                     |
| `max_storage_gb`      | `uploadDocument`, `uploadMedia` server actions | Check org storage usage before accepting upload                       |
| `ai_tokens_per_month` | Copilot chat route                             | Check `ai_tokens_used < ai_tokens_per_month` before calling AI API    |

### Feature Flags by Plan

Some features are plan-gated (available only on higher plans), not quota-limited.
These are enforced by checking `org.plan` in the server action:

```typescript
// Example: copilot is only available on 'pro' and 'enterprise'
const org = await getOrgByProjectId(projectId);
if (!['pro', 'enterprise'].includes(org.plan)) {
  return { error: 'copilot_requires_pro' };
}
```

Feature flag enforcement table:

| Feature      | Free | Starter | Pro       | Enterprise |
| ------------ | ---- | ------- | --------- | ---------- |
| Projects     | 3    | 10      | Unlimited | Unlimited  |
| Members      | 5    | 15      | Unlimited | Unlimited  |
| Copilot AI   | —    | —       | ✓         | ✓          |
| Custom roles | —    | —       | ✓         | ✓          |
| Audit log    | —    | —       | ✓         | ✓          |
| Storage      | 1 GB | 10 GB   | 100 GB    | Custom     |
| API access   | —    | —       | —         | ✓          |

---

## 13. Audit and Activity Model

### Two Distinct Concepts

**Audit log** — immutable, compliance-grade record of all significant writes. Intended for
org admins, security review, and compliance purposes. Never deleted. Append-only.

**Activity feed** — user-facing, readable summary of recent activity in a project or org.
Curated subset of the audit log. May be styled and grouped for readability. Can be paginated
and filtered by the user.

### Audit Log

```sql
-- From Revision 2 Section 7.8 (unchanged)
CREATE TABLE public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  module          TEXT NOT NULL,           -- canonical module key
  action          TEXT NOT NULL,           -- canonical action key
  entity_id       TEXT,                    -- UUID of affected entity
  entity_type     TEXT,                    -- table name
  payload_summary JSONB,                   -- non-PII diff or summary
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS:** Rows are only readable by `org_admin` and `org_owner` for their org. No user can
UPDATE or DELETE rows. The service role (used by server actions) is the only writer.

**Attribution requirements:**

- Every write must record `user_id` (who did it) and `entity_id` (what was affected).
- Copilot proposal approvals record `user_id` = approving user.
- Member invitations record `user_id` = inviter, `entity_id` = invite token.
- Role changes record both the affected user and the role.

**What is NOT in the audit log:**

- Read operations (too verbose, no compliance value for reads)
- Failed auth attempts (belong in a separate security log)
- System health events (belong in infrastructure monitoring)
- AI prompt content (privacy risk — only log proposal types, not message content)

### Activity Feed

The activity feed is a view or materialized query over `audit_log` filtered to project-visible
events. Members can see activity from projects they belong to. It does not require a separate
table — it is a filtered, formatted presentation of `audit_log` rows with a human-readable
description generated at query time.

---

## 14. Storage Ownership and Access Model

### The Gap

Table RLS does not protect Supabase Storage. The `project-docs` and `project-media` buckets
use Supabase Storage policies (`storage.objects` policies) that currently check an
`owner_id`-based path prefix (`auth.uid()::text = (storage.foldername(name))[1]`).

When team members are added, they will be able to read document metadata from the `project_files`
table (because RLS will allow it) but will receive 403 errors when attempting to generate signed
URLs or download files. This is a visible, confusing failure that must be resolved before any
team invitations are issued.

### Current Storage Path Structure

```
project-docs/{owner_id}/{project_id}/{filename}
project-media/{owner_id}/{project_id}/{filename}
```

### Target Storage Path Structure

```
project-docs/{org_id}/{project_id}/{filename}
project-media/{org_id}/{project_id}/{filename}
```

The `org_id` replaces `owner_id` in the path prefix. This allows storage policies to check org
membership instead of personal ownership.

**Migration:** Existing files must be moved from the `owner_id`-prefixed path to the
`org_id`-prefixed path. This is a storage object copy operation, not a DB migration. The steps are:

1. Create a script that reads all `project_files` rows.
2. For each row, copies the storage object from the old path to the new path.
3. Updates `project_files.storage_path` to the new path.
4. Deletes the old storage object.
5. Updates the bucket policy to use the new path format.

This step is high-risk and must be done with a complete backup first. It is scheduled for Phase 9
(hardening), after the rest of the RBAC system is stable.

### Target Storage Bucket Policy

```sql
-- Allow project members to access objects in their project's path
CREATE POLICY "project_members_can_access"
ON storage.objects FOR SELECT
USING (
  bucket_id IN ('project-docs', 'project-media')
  AND is_project_member(
    (storage.foldername(name))[2]::UUID  -- project_id is the second path segment
  )
);
```

The `is_project_member(project_id UUID)` security-definer function (defined in Section 8 of
Revision 2) makes this policy readable and performant.

### Signed URL Considerations

Signed URLs grant time-limited access to storage objects without requiring an active session.
They are generated by the API route pattern (`app/api/documents/[fileId]/view/route.ts`). The
route authenticates the user, checks `can(user, 'documents.view_signed_url', resource)`, then
calls `supabase.storage.createSignedUrl(path, 3600)`.

Signed URLs bypass storage bucket policies once generated. This means:

- The permission check in the API route is the critical security gate for signed URLs.
- A user who loses project membership can still use a signed URL they obtained while a member,
  until it expires. This is an accepted SaaS tradeoff (TTL = 1 hour maximum).
- For sensitive documents, consider a shorter TTL (300 seconds) or invalidating signed URLs
  on membership removal (not natively supported by Supabase Storage).

---

## 15. RLS and Data Access Strategy

### Three-Layer Defense Model

```
Request → requireAuth() → requireCan() → DB query → RLS enforcement → data
            Layer 1          Layer 2        Layer 3       Layer 3
```

- **Layer 1 (Auth):** `requireAuth()` — rejects unauthenticated requests. Returns `User`.
- **Layer 2 (Application):** `requireCan(userId, action, resource)` — rejects unauthorized
  requests based on role-derived permissions. This is the business logic gate.
- **Layer 3 (Database):** RLS policies — independently enforce membership at the row level.
  Operates regardless of application layer behavior. Cannot be bypassed by application code.

### Scope-Specific RLS Patterns

**Own-scope (personal data — never shared):**

```sql
USING (owner_id = auth.uid())
```

Applied to: `profiles`, `user_assets`, `user_preferences`, `link_categories`, `billing_categories`.

**Project-scope (shared project data):**

```sql
USING (is_project_member(project_id))
-- Where is_project_member is a security-definer function checking project_members
```

Applied to: `tasks`, `milestones`, `notes`, `project_links`, `project_files`, `calendar_events`,
`todo_lists`, `todo_items`, `idea_boards`, `idea_board_items`, `copilot_sessions`, `copilot_proposals`,
`budgets`, `budget_items`, `billings`, and all associated sub-tables.

**Org-scope (org-level shared data):**

```sql
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = entity.org_id AND user_id = auth.uid()
  )
)
```

Applied to: `clients`, `businesses`, `organizations` (read), `invites` (filtered by org_id).

**Transition policy (during migration — OR logic):**

```sql
USING (
  owner_id = auth.uid()   -- legacy: existing owners keep access
  OR
  is_project_member(project_id)   -- new: project members gain access
)
```

The OR clause is removed in Phase 9 (hardening) after all project owners have confirmed
`project_members` rows and the system has been validated with real team usage.

### Role Checks: Application Layer vs RLS

RLS enforces **membership** (is this user a member of this project/org?) but does **not** enforce
**permissions** (does this user have the `tasks.delete` action?). Fine-grained permission checking
is always done at the application layer by `requireCan()` before the DB query.

This is the correct division:

- **RLS** → coarse membership filter → prevents cross-tenant data leakage
- **requireCan()** → fine-grained action authorization → prevents unauthorized writes within a project

Attempting to encode fine-grained permission checks in RLS (e.g., checking role grants at the DB
policy level) would make RLS policies extremely complex, unmaintainable, and slow.

---

## 16. Safe Migration Strategy

### Live System Constraints

- 2 users; admin owns all data
- ~15 projects with all associated records
- Must remain functional throughout
- All 10 steps from Revision 2 Section 9 are the canonical migration plan

### Step Summary (from Revision 2, with additions)

| Step | Action                                                                                 | Risk   | App Impact     |
| ---- | -------------------------------------------------------------------------------------- | ------ | -------------- |
| 1    | Create `organizations` table + insert Default Organization                             | Low    | None           |
| 2    | Add nullable `org_id` to `projects`                                                    | Low    | None           |
| 3    | Backfill `org_id` on all ~15 projects                                                  | Low    | None           |
| 4    | Create `organization_members` + insert both users                                      | Low    | None           |
| 5    | Create `project_members` + insert admin for all projects                               | Low    | None           |
| 6    | Create RBAC metadata tables + seed roles/modules/actions/grants                        | Medium | None           |
| 7    | Create `user_role_assignments` table                                                   | Low    | None           |
| 8    | Bootstrap role assignments (admin = org_owner + project_owner × 15; test = org_member) | Low    | None           |
| 9    | Add nullable attribution columns (created_by, assigned_to, approved_by, etc.)          | Low    | None           |
| 10   | Apply transition OR RLS policies (per-table, with validation)                          | High   | Test per-table |

**Steps 1–9:** Single deployment, zero application impact. The application continues operating
on the old `owner_id = auth.uid()` model. New tables and columns exist but are not consulted.

**Step 10:** Deployed separately, table by table. The OR policy preserves existing access while
enabling new membership access. The test user still has no project access because no
`project_members` row exists for them in any project — the OR clause has no effect for them.

### Additional Migration Steps (Beyond Revision 2)

**Step 11 — Implement and wire `can()` resolver:**
Deploy `lib/rbac/resolver.ts`. Refactor all server actions to call `requireCan()` after
`requireAuth()`. Start with high-risk unguarded actions: `setProjectModuleEnabled`,
`deleteProject`, `deleteBilling`.

**Step 12 — Create `invites` table:**
Deploy migration for the `invites` table. Wire invite email sending. This enables the first
real team membership flow.

**Step 13 — Create `org_billing` and `org_quotas` tables:**
Deploy quota tables. Wire quota checks into `createProject` and `inviteOrgMember`.

**Step 14 — Wire `audit_log` into server actions:**
Add `logAuditEvent()` calls to all write server actions.

**Step 15 — Storage path migration (Phase 9 — hardening):**
Migrate storage objects from `owner_id/` prefix to `org_id/` prefix. Update bucket policies.
This is the highest-risk single operation and requires a full backup before execution.

### Rollback Strategy

Steps 1–9 are all additive. Rollback is `DROP TABLE / DROP COLUMN` — safe, no data loss.

Step 10 (RLS rewrite) is the first non-additive change. Rollback requires reverting the
specific policy to the previous `owner_id = auth.uid()` pattern. Keep the original policy
SQL in the migration file as a comment for reference.

Steps 11–14 are application-layer changes. Rollback is a code deploy revert.

Step 15 (storage migration) requires a pre-migration backup and a copy-then-delete pattern
(not move) so the old path is preserved until validation succeeds.

---

## 17. Risks, Edge Cases, and Open Decisions

### Risk Table

| Risk                                                                                       | Severity | Description                                                                                                                              | Mitigation                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant data leak via misconfigured RLS                                               | Critical | A wrong policy on `tasks` exposes all tasks to any authenticated user                                                                    | Test every RLS policy in isolation with a second test user before deployment. Use Supabase Row Level Security testing tools.                                                                                                                                                             |
| Storage path migration failure                                                             | High     | Copying 15 projects' worth of files fails mid-migration, leaving some on old paths and some on new                                       | Copy-then-validate-then-delete pattern. Do not delete old objects until new paths are fully validated. Keep a manifest of old→new paths.                                                                                                                                                 |
| Role explosion via custom roles                                                            | Medium   | Org admins create dozens of custom roles with overlapping, confusing grants                                                              | Limit custom roles to `org_admin` and `org_owner`. Display a role audit UI. Consider a max-custom-roles quota.                                                                                                                                                                           |
| Stale permission cache                                                                     | Medium   | A removed member's cached permissions remain valid for up to 5 minutes                                                                   | Invalidate cache synchronously in the `removeOrgMember` and `removeProjectMember` server actions before returning. Do not defer invalidation.                                                                                                                                            |
| Invite token interception                                                                  | Medium   | Invite links sent via email can be forwarded to unintended recipients                                                                    | Tokens are single-use (marked `accepted` on first use). Add email verification: invited email must match the email used to sign in or sign up.                                                                                                                                           |
| Invite collision — email changes between invite and accept                                 | Low      | Invited user changes their email before accepting                                                                                        | Enforce: the email used at signup or the current auth email must match `invites.email`. If it does not match, show a clear error.                                                                                                                                                        |
| Deleted org with active projects                                                           | High     | If an org is deleted (soft or hard), all projects and their data must cascade correctly                                                  | Use `ON DELETE CASCADE` on `projects.org_id`. Test org deletion in a non-production environment. Require explicit `workspace.danger_zone` permission + confirmation step.                                                                                                                |
| Org ownership transfer                                                                     | Medium   | The `org_owner` user wants to transfer ownership to another user                                                                         | Requires: new owner is an existing org member, old owner assigns `org_owner` role to new user, old owner is demoted to `org_admin`. Both DB changes must be atomic (transaction or RPC).                                                                                                 |
| Users in multiple orgs — context confusion                                                 | Medium   | A user belongs to two orgs and lands on a shared URL that does not specify org context                                                   | Always include `orgId` or `projectId` in the context for any permission check. Server actions that do not receive a context must derive it from the resource being accessed.                                                                                                             |
| Super admin / system admin design                                                          | Open     | A platform-level admin (Anthropic employee / app owner) needs to access any org for support purposes                                     | `checkIsAdmin()` in `lib/auth.ts` is dead code. Decision needed: implement as a separate `system_admins` table with its own RLS bypass policy (`USING (is_system_admin())`) or use Supabase service role for direct DB access only. Do not wire this into user-facing permission checks. |
| N+1 write in `reorderProjectLinksAction`                                                   | Medium   | Known tech debt. Concurrent team members reordering links simultaneously will corrupt `sort_order`                                       | Must be resolved before any team access is enabled. Implement `reorder_links_atomic` RPC (pattern identical to `move_task_atomic`).                                                                                                                                                      |
| `projects.toggle_module` currently unguarded                                               | High     | Any authenticated user can call `setProjectModuleEnabled` — only `requireAuth()` is checked                                              | Fix this in Step 11 (wire `requireCan()`). This is the highest-priority unguarded action in the codebase.                                                                                                                                                                                |
| `getBudgetStats` and `getBudgetWithData` missing app-layer scope                           | High     | These functions rely on RLS alone without `.eq('owner_id', user.id)` — a convention violation that becomes a real risk under team access | Fix before Step 10. Add explicit `.eq('owner_id', user.id)` (transitional) or refactor to use `project_id` scope after membership model is in place.                                                                                                                                     |
| Copilot API route has no rate limiting                                                     | High     | Any project member can make unlimited AI calls, consuming the entire token quota                                                         | Add per-org or per-user rate limiting before enabling team access to copilot. Enforce via `org_quotas.ai_tokens_used` check in the server action.                                                                                                                                        |
| `billing_categories` and `link_categories` are owner-scoped but will feel broken in a team | Low      | Team members cannot see each other's billing categories, making the category picker inconsistent                                         | Migrate these to project-scoped or org-scoped in a future phase. Document the current behavior as a known limitation.                                                                                                                                                                    |

### Open Decisions

1. **External collaborator model:** Should project members be required to also be org members
   (simpler, current recommendation) or should "external collaborator" project-only access be
   supported from day one? Decision needed before Phase 6 (Teams UI).

2. **Custom role permission editing UI:** Should org admins be able to see and edit the granted
   actions of system roles, or only custom roles? System roles are immutable in the DB — the UI
   must enforce this.

3. **Org deletion behavior:** Soft-delete (archive everything) or hard-delete (permanent
   cascade)? Recommendation: soft-delete only, with a 30-day recovery window.

4. **System admin access:** `checkIsAdmin()` is dead code. What is the intended platform admin
   access model? Options: (a) service role direct DB access only (no user-facing admin), (b)
   a `system_admins` table with a special RLS bypass for support purposes.

---

## 18. Recommended Execution Order

The following order respects live system constraints, builds on completed work, and minimizes
blast radius at each step.

### Phase A — Foundation (Zero Risk, Deploy Together)

1. Run RBAC Revision 2 migration steps 1–9 (organizations, membership tables, RBAC metadata
   tables, `user_role_assignments`, attribution columns)
2. Fix pre-existing violations: `getBudgetStats`/`getBudgetWithData` + `deleteBilling` scope
3. Implement `is_project_member()` and `is_org_member()` security-definer functions
4. Create required indexes: `project_members_lookup`, `org_members_lookup`, `ura_project_lookup`,
   `ura_org_lookup`

**Success gate:** `npm run test -- --run` passes. `npm run build` passes. Application behaves
identically for both users.

### Phase B — Application Authorization Layer

5. Implement `lib/rbac/resolver.ts` (`can()`, `requireCan()`, `getGrantedActions()`)
6. Write Vitest tests for `can()`: granted path, denied path, no membership, invalid context,
   multi-role union
7. Fix `projects.toggle_module` to call `requireCan(userId, 'projects.toggle_module', ...)`
   (currently completely unguarded)
8. Wire `requireCan()` into all ~110 server actions systematically (create a checklist mapping
   each function to its permission key — audit before touching code)

**Success gate:** All 74+ existing tests still pass. New `can()` tests pass. No server action
callable without the required permission in the test environment.

### Phase C — Transition RLS (High Care Required)

9. Apply OR-transition RLS policies, one table at a time, in this order:
   - `notes` (low risk, readable UI feedback if wrong)
   - `project_links`
   - `calendar_events`
   - `todo_lists`, `todo_items`
   - `idea_boards` and related
   - `budgets`, `budget_categories`, `budget_items`
   - `milestones`
   - `tasks` (highest risk — board breakage is immediately visible)
   - `billings`
   - `copilot_sessions`, `copilot_messages`, `copilot_proposals`
   - `project_files`, `project_document_folders`
10. After each table: validate that the admin user sees identical data to before

**Success gate:** Admin user's board, notes, documents, billings, and copilot work identically.
Test user (who has no project_members rows) sees zero data in all project tabs.

### Phase D — Invite and Teams UI

11. Create `invites` table migration
12. Implement transactional email sending for invites (Supabase Auth invite or custom provider)
13. Build `/invite/accept` route with token validation and user onboarding flow
14. Implement `inviteOrgMember`, `removeOrgMember`, `updateOrgMemberRoles` server actions
15. Implement `inviteProjectMember`, `removeProjectMember`, `updateProjectMemberRoles` server actions
16. Build Teams UI: member list, invite form, role assignment, remove member
17. Add i18n keys for all teams-related strings

**Success gate:** Project owner can invite the test user to a specific project. Test user
accepts invite, logs in, and sees only the invited project with `project_viewer` permissions.
Non-invited tabs return empty (not 404).

### Phase E — Billing and Quotas

18. Create `org_billing` and `org_quotas` tables
19. Seed Default Organization with free plan quotas
20. Wire quota checks into `createProject`, `inviteOrgMember`, copilot chat route
21. Build workspace settings page for plan overview (read-only initially)

**Success gate:** Creating a 4th project when `max_projects = 3` returns a quota error.
Copilot sends a feature-gate response on free plan.

### Phase F — Audit Logging

22. Implement `lib/rbac/audit.ts` with `logAuditEvent()`
23. Wire `logAuditEvent()` into all write server actions (create, update, delete, approve, reject)
24. Build audit log read UI for org admins

**Success gate:** Every write action produces a row in `audit_log`. Org admin can view the log.

### Phase G — Hardening (High Risk — Do Last)

25. Implement `reorder_links_atomic` RPC (fix N+1 tech debt before multi-user concurrent usage)
26. Run full Playwright E2E suite with two-user scenarios for every context tab
27. Remove `OR owner_id = auth.uid()` clause from all project-scoped RLS policies
28. Migrate storage objects from `owner_id/` path prefix to `org_id/` path prefix
29. Update `project-docs` and `project-media` bucket policies to use `is_project_member()`
30. Add per-org rate limiting to the copilot API route
31. Remove or replace dead `checkIsAdmin()` in `lib/auth.ts`
32. Document all known remaining gaps in `docs/audits/saas-gaps-post-hardening.md`

**Success gate:** All Playwright tests pass with strict membership RLS and two-user scenarios.
No authenticated user can access a project they are not a member of via any path. Storage
objects for project A are inaccessible to a member of project B.

---

_End of Multi-Tenant SaaS Foundation Plan._
