# Design: Phase 3 — Sub-Teams

**Created:** 2026-03-15
**Prerequisites:** Phase 1 (critical fixes) ✓, Phase 2 (UI permission gating) ✓
**Status:** Ready for implementation

---

## Overview

Phase 3 introduces **sub-teams**: named groups within a project that organise
members into functional areas (e.g. "Developers", "UX/UI", "Legal"). It also
introduces two new project-level roles — `project_member` and `project_manager`
— and formalises the `team_manager` role.

Phase 3 delivers the data model and management UI. Read-scope enforcement
(`*.read.own/team/project` tiers and `tasks.assign.team` filtering) is Phase 4.

---

## What Phase 3 delivers

| Deliverable                   | Detail                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `project_teams` table         | Sub-team registry per project                                                                                             |
| `project_team_members` table  | Membership + manager flag per sub-team                                                                                    |
| 3 new RBAC roles              | `project_member`, `team_manager`, `project_manager`                                                                       |
| `project_teams.*` action keys | Seed + role grants for create/manage/delete                                                                               |
| Sub-team management UI        | "Sub-teams" section in the Teams tab                                                                                      |
| Server actions                | `listProjectTeams`, `createProjectTeam`, `deleteProjectTeam`, `addTeamMember`, `removeTeamMember`, `updateTeamMemberRole` |

## What Phase 3 defers

| Deferred                                                  | Phase |
| --------------------------------------------------------- | ----- |
| `tasks.assign.team` vs `tasks.assign.project` enforcement | 4     |
| `*.read.own/team/project` scope filtering on queries      | 4     |
| `getReadScope()` helper                                   | 4     |
| Copilot registry permission checks                        | 5     |

---

## Role hierarchy (full picture after Phase 3)

| Role              | Scope   | Description                                                       |
| ----------------- | ------- | ----------------------------------------------------------------- |
| `project_viewer`  | Project | Read-only access to permitted modules (existing)                  |
| `project_member`  | Project | Create/edit own content; can be a sub-team member                 |
| `project_editor`  | Project | Create/edit all project content; cannot manage members (existing) |
| `team_manager`    | Project | Manage their own sub-team, assign within team                     |
| `project_manager` | Project | Manage all sub-teams, assign across the project                   |
| `project_owner`   | Project | Full access including members, teams, settings (existing)         |

**Important:** All roles are assigned at **project scope** via `user_role_assignments`.
`project_team_members.role` (`member` | `manager`) is the source of truth for
_which team_ a user manages — this is separate from the RBAC role. A user with
the `team_manager` RBAC role SHOULD also have `role = 'manager'` in at least
one `project_team_members` row, but the RBAC role grants the capabilities
system-wide; the membership row determines the scope of those capabilities.

---

## New action keys

All registered under a new RBAC module `project_teams`:

```
project_teams.read              — list sub-teams and their members
project_teams.create            — create a sub-team
project_teams.update            — rename or re-describe a sub-team
project_teams.delete            — delete a sub-team (removes all memberships)
project_teams.manage_members    — add/remove members and set manager role
```

### Role grants for new keys

| Action key                     | project_viewer | project_member | project_editor | team_manager | project_manager | project_owner |
| ------------------------------ | -------------- | -------------- | -------------- | ------------ | --------------- | ------------- |
| `project_teams.read`           | ✓              | ✓              | ✓              | ✓            | ✓               | ✓             |
| `project_teams.create`         |                |                |                |              | ✓               | ✓             |
| `project_teams.update`         |                |                |                | ✓\*          | ✓               | ✓             |
| `project_teams.delete`         |                |                |                |              | ✓               | ✓             |
| `project_teams.manage_members` |                |                |                | ✓\*          | ✓               | ✓             |

\* `team_manager` can update/manage **only their own team**. This constraint is
enforced in the server action (verify `project_team_members.role = 'manager'`
for the calling user on that specific team), not in RBAC.

---

## Data model

### `project_teams`

```sql
CREATE TABLE public.project_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);
```

**Indexes:**

- `(project_id)` — list all teams for a project
- `(project_id, name)` — covered by UNIQUE constraint

**RLS:**

- SELECT: any `project_members` row matching `project_id`
- INSERT/UPDATE/DELETE: project owner OR user with `project_teams.create/update/delete`
  (enforced by server action `requireCan()` since RLS uses auth.uid directly)

### `project_team_members`

```sql
CREATE TABLE public.project_team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES public.project_teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);
```

**Indexes:**

- `(team_id)` — list members of a team
- `(user_id)` — list teams a user belongs to
- `(team_id, user_id)` — covered by UNIQUE constraint

**RLS:**

- SELECT: any `project_members` row for the same project (via join through `project_teams`)
- INSERT/UPDATE/DELETE: project owner OR user who is `role = 'manager'` for this team

---

## Migration plan

One migration file: `20260319100000_project_sub_teams.sql`

Contents:

1. Insert `project_teams` module into `rbac_modules`
2. Insert `project_teams.*` action keys into `rbac_module_actions`
3. Insert `project_member`, `team_manager`, `project_manager` into `rbac_roles`
4. Seed role grants for all new keys across all roles
5. Create `project_teams` table + indexes + RLS + trigger
6. Create `project_team_members` table + indexes + RLS

---

## Server actions

File: `app/actions/sub-teams.ts` (new)

```typescript
// Reads
export const listProjectTeams(projectId: string): Promise<ProjectTeam[]>
export const getProjectTeam(teamId: string): Promise<ProjectTeam | null>

// Writes
export async function createProjectTeam(projectId, name, description?): Promise<{data?, error?}>
export async function updateProjectTeam(teamId, name, description?): Promise<{data?, error?}>
export async function deleteProjectTeam(teamId): Promise<{error?}>
export async function addTeamMember(teamId, userId): Promise<{data?, error?}>
export async function removeTeamMember(teamId, userId): Promise<{error?}>
export async function updateTeamMemberRole(teamId, userId, role): Promise<{data?, error?}>
```

All writes: `requireAuth()` first, then `requireCan(user.id, 'project_teams.X', { type: 'project', projectId })`.
For `team_manager`-scoped operations (update own team, manage own team members): additionally verify
`project_team_members.role = 'manager'` for `(teamId, user.id)` before executing.

---

## UI changes

### Teams tab — new "Sub-teams" section

The existing Teams tab (`ContextTeamClient.tsx`) has two sections: Members and Pending Invites.
Phase 3 adds a third section: **Sub-teams**.

```
┌─────────────────────────────────────┐
│  Members (existing)                 │
│  Pending invites (existing)         │
│  ──────────────────────────────     │
│  Sub-teams  [+ New team]            │
│  ┌──────────────────────────────┐   │
│  │ 🏷 Developers   3 members    │   │
│  │   Alice (manager), Bob, Carol│   │
│  │   [Add member] [Delete]      │   │
│  ├──────────────────────────────┤   │
│  │ 🏷 UX/UI   2 members        │   │
│  │   Dave (manager), Eve        │   │
│  │   [Add member] [Delete]      │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Permissions gating in the UI:**

- `+ New team` button: visible only if `canCreateTeam` (project_manager or owner)
- `[Delete]` button: visible only if `canDeleteTeam`
- `[Add member]` button: visible if `canManageMembers` (project_manager, team_manager of this team, or owner)
- Manager badge toggle: same as above

### `SubTeamsPermissions` type (new)

```typescript
export type SubTeamsPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  managedTeamIds: string[]; // which teams the current user manages (for team_manager scope)
};
```

`managedTeamIds` is populated by querying `project_team_members` for `(user_id, role='manager')`.
This lets the UI show manage actions only for the specific team(s) the user manages.

### Data flow

```
page.tsx
  → getSubTeamsPermissions(projectId)  [new — in app/actions/sub-teams.ts]
  → listProjectTeams(projectId)        [new — cached read]
  → ContextTeamFromCache receives { teams, subTeamsPermissions }
  → ContextTeamClient receives same as props
```

Since teams data is now included in the Team tab cache, the existing
`ContextTeamFromCache` + `ContextTeamClient` cache key (`{ type: 'team', projectId }`)
will be extended to include `teams` alongside `members`, `invites`, `rejectedInvites`.

---

## Implementation order

1. **Migration** — tables, roles, action keys, role grants
2. **Server actions** — `app/actions/sub-teams.ts` (CRUD functions)
3. **`getSubTeamsPermissions`** — in `app/actions/sub-teams.ts`
4. **`ContextTeamFromCache`** — extend cache data to include teams + permissions
5. **`ContextTeamClient`** — add Sub-teams section UI
6. **`page.tsx`** — fetch teams + permissions in parallel with other data
7. **i18n** — add keys to `locales/en.json` and `locales/es.json`

---

## Files that change

| File                                                       | Change                    |
| ---------------------------------------------------------- | ------------------------- |
| `supabase/migrations/20260319100000_project_sub_teams.sql` | New                       |
| `app/actions/sub-teams.ts`                                 | New                       |
| `app/context/[projectId]/team/page.tsx`                    | Fetch teams + permissions |
| `app/context/[projectId]/team/ContextTeamFromCache.tsx`    | Extend cache shape        |
| `app/context/[projectId]/team/ContextTeamClient.tsx`       | Sub-teams section UI      |
| `locales/en.json`                                          | New i18n keys             |
| `locales/es.json`                                          | New i18n keys             |

No changes to `lib/rbac/resolver.ts` — the team_manager role is project-scoped
and resolves through the existing `user_role_assignments` + `rbac_role_module_actions`
path without any new logic.

---

## Implementation checklist

- [ ] Migration: `project_teams` module in `rbac_modules`
- [ ] Migration: `project_teams.*` action keys seeded
- [ ] Migration: `project_member`, `team_manager`, `project_manager` roles seeded
- [ ] Migration: role grants seeded for all 3 new roles
- [ ] Migration: `project_teams` table + RLS + indexes + trigger
- [ ] Migration: `project_team_members` table + RLS + indexes
- [ ] Server actions: `listProjectTeams`, `getProjectTeam`, `createProjectTeam`, `updateProjectTeam`, `deleteProjectTeam`
- [ ] Server actions: `addTeamMember`, `removeTeamMember`, `updateTeamMemberRole`
- [ ] Server actions: `getSubTeamsPermissions`
- [ ] `ContextTeamFromCache`: extend cache data shape to include teams
- [ ] `ContextTeamClient`: Sub-teams section with create/view/manage/delete UI
- [ ] `page.tsx`: fetch teams + permissions in `Promise.all`
- [ ] i18n: all new string keys in both locale files
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` pass
