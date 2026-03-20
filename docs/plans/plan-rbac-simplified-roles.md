# Plan: Simplified Role System — 5 Roles, Clean Architecture

> **Status:** Ready to implement
> **Replaces:** All custom role/profile/action-override complexity
> **Preserves:** All task, note, budget, billing, link, idea, document, media, todo, milestone data
> **Estimate:** 6 focused phases

---

## The new model in one page

### 5 roles, strict hierarchy

```
Owner
  └── Project Manager
        └── Team Manager  (scoped to their sub-team)
              └── Team Member
                    └── Guest
```

### What each role means

| Role                | Read scope                      | Write    | Delete           | Manage modules | Invite                       |
| ------------------- | ------------------------------- | -------- | ---------------- | -------------- | ---------------------------- |
| **Owner**           | Entire project                  | ✅       | ✅               | ✅             | All roles incl. PM           |
| **Project Manager** | Entire project                  | ✅       | ✅               | ✅             | TM / Member / Guest          |
| **Team Manager**    | Their sub-team                  | ✅       | ✅ (team's data) | ❌             | Member / Guest (team-scoped) |
| **Team Member**     | Own + assigned tasks            | ✅ (own) | ✅ (own)         | ❌             | ❌                           |
| **Guest**           | Team or project (set at invite) | ❌       | ❌               | ❌             | ❌                           |

### Read scope rules

- **Owner / Project Manager** → sees all data in the project
- **Team Manager** → sees data created by members of their sub-team (across all modules)
- **Team Member** → sees their own data + tasks assigned to them
- **Guest (project-scoped)** → reads all project data in their allowed modules
- **Guest (team-scoped)** → reads their team's data in their allowed modules
- Guest scope is set automatically: Owner/PM invites → project-scoped; Team Manager invites → team-scoped

### Invite flow — 2 steps, no extra configuration

```
Step 1: Choose modules
         → Only shows project-active modules
         → Inviter selects which ones the new member can access

Step 2: Choose role
         → Owner inviting: PM / Team Manager / Team Member / Guest
         → PM inviting:    Team Manager / Team Member / Guest
         → Team Manager:   Team Member / Guest
         → Role automatically determines all permissions
         → No per-module permission toggles needed
```

### Task-specific rules

|              | See              | Create | Edit           | Delete   |
| ------------ | ---------------- | ------ | -------------- | -------- |
| Owner / PM   | All tasks        | ✅     | ✅             | ✅       |
| Team Manager | Sub-team's tasks | ✅     | ✅             | ✅       |
| Team Member  | Own + assigned   | ✅ own | Own + assigned | Own only |
| Guest        | Per scope above  | ❌     | ❌             | ❌       |

Audit trail: every task edit records who changed what and when → `task_activity_log`.

---

## What changes in the database

### Remove entirely

| Table / Column                                                                                      | Why                                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `user_project_action_grants`                                                                        | Per-member action overrides — replaced by role                     |
| `project_access_profiles`                                                                           | Predefined profiles (Finance, Developer, etc.) — replaced by roles |
| `project_invite_roles`                                                                              | Custom invite role builder — replaced by 2-step invite             |
| `project_invites.profile_id`                                                                        | Column no longer used                                              |
| `project_invites.invite_role_id`                                                                    | Column no longer used                                              |
| Old system roles (project_editor, project_viewer, project_member, org_owner, org_admin, org_member) | Replaced by 5 new roles                                            |

### Keep, unchanged

- All module data tables (`tasks`, `notes`, `budgets`, `billings`, `links`, `ideas`, `documents`, `media`, `todos`, `milestones`)
- `projects`, `project_members`, `project_teams`, `project_team_members`
- `user_role_assignments` (structure stays, data cleared — test users only)
- `user_project_access_grants` (structure stays, gains one column)
- `project_invites` (structure stays, two columns removed)
- `rbac_roles`, `rbac_modules`, `rbac_module_actions`, `rbac_role_module_actions` (structure stays, data rebuilt)
- `rbac_audit_log`

### Add

| Table / Column                               | Why                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `user_project_access_grants.read_scope TEXT` | Stores guest read scope: `'team'` or `'project'`. NULL for non-guests (scope derived from role). |
| `task_activity_log`                          | Audit trail: who changed what on each task                                                       |

---

## New action key structure (simplified)

**Before:** `tasks.read.own`, `tasks.read.team`, `tasks.read.project`, `tasks.update_title`, `tasks.bulk_delete`, ...

**After:** one set per module, same for all modules

```
{module}.read
{module}.create
{module}.update
{module}.delete
```

Plus cross-module actions:

```
projects.manage_modules   — enable/disable modules project-wide
teams.invite              — send invites
teams.manage_members      — remove members, edit their access
```

Read _scope_ (`own` / `team` / `project`) is no longer encoded in the action key.
It is derived from the role in `getReadScope()`.

### Role → action mapping

| Action                    | Owner | PM  | Team Manager  | Team Member | Guest |
| ------------------------- | ----- | --- | ------------- | ----------- | ----- |
| `*.read`                  | ✅    | ✅  | ✅            | ✅          | ✅    |
| `*.create`                | ✅    | ✅  | ✅            | ✅          | ❌    |
| `*.update`                | ✅    | ✅  | ✅            | ✅          | ❌    |
| `*.delete`                | ✅    | ✅  | ✅            | ✅          | ❌    |
| `projects.manage_modules` | ✅    | ✅  | ❌            | ❌          | ❌    |
| `teams.invite`            | ✅    | ✅  | ✅            | ❌          | ❌    |
| `teams.manage_members`    | ✅    | ✅  | ✅ (own team) | ❌          | ❌    |

> Note: "can do" and "what data they see" are now separate concerns.
> Team Member has `tasks.delete` but the server action checks `owner_id = userId` before deleting.
> Team Manager has all write actions but queries are scoped to their sub-team.

---

## Implementation phases

---

### Phase 1 — Remove legacy RBAC tables and columns

**Migration:** `20260324200000_remove_legacy_rbac.sql`

```sql
-- Remove per-member action overrides
DROP TABLE IF EXISTS public.user_project_action_grants;

-- Remove predefined profiles
DROP TABLE IF EXISTS public.project_access_profiles;

-- Remove custom invite role builder
DROP TABLE IF EXISTS public.project_invite_roles;

-- Remove columns from project_invites that reference the above
ALTER TABLE public.project_invites
  DROP COLUMN IF EXISTS profile_id,
  DROP COLUMN IF EXISTS invite_role_id;

-- Clear test role data (preserves schema, clears assignments)
TRUNCATE public.user_role_assignments;
TRUNCATE public.rbac_role_module_actions;
TRUNCATE public.rbac_module_actions;

-- Remove old system roles, keep the table
DELETE FROM public.rbac_roles WHERE is_system_role = true;
```

---

### Phase 2 — Seed the 5-role system

**Migration:** `20260324200001_seed_simplified_roles.sql`

```sql
-- ── New system roles ──────────────────────────────────────────────────────
INSERT INTO public.rbac_roles (id, name, is_system_role) VALUES
  (gen_random_uuid(), 'owner',           true),
  (gen_random_uuid(), 'project_manager', true),
  (gen_random_uuid(), 'team_manager',    true),
  (gen_random_uuid(), 'team_member',     true),
  (gen_random_uuid(), 'guest',           true);

-- ── Simplified action keys (one set per module) ──────────────────────────
-- Modules: tasks, notes, budgets, billings, links, ideas,
--          documents, media, todos, milestones, calendar, copilot
-- Actions: read, create, update, delete
-- Cross-module: projects.manage_modules, teams.invite, teams.manage_members

DO $$
DECLARE
  modules TEXT[] := ARRAY[
    'tasks','notes','budgets','billings','links','ideas',
    'documents','media','todos','milestones','calendar','copilot'
  ];
  actions TEXT[] := ARRAY['read','create','update','delete'];
  mod TEXT;
  act TEXT;
BEGIN
  FOREACH mod IN ARRAY modules LOOP
    FOREACH act IN ARRAY actions LOOP
      INSERT INTO public.rbac_module_actions (id, module_key, action_key)
      VALUES (gen_random_uuid(), mod, mod || '.' || act);
    END LOOP;
  END LOOP;
END $$;

-- Cross-module actions
INSERT INTO public.rbac_module_actions (id, module_key, action_key) VALUES
  (gen_random_uuid(), 'projects', 'projects.manage_modules'),
  (gen_random_uuid(), 'teams',    'teams.invite'),
  (gen_random_uuid(), 'teams',    'teams.manage_members');

-- ── Role → action grants ──────────────────────────────────────────────────

-- Helper: grant all *.read + *.create + *.update + *.delete to a role
-- Owner: everything
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'owner';

-- Project Manager: everything (same as owner)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'project_manager';

-- Team Manager: all module CRUD + teams.invite + teams.manage_members
-- (NOT projects.manage_modules)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'team_manager'
  AND a.action_key NOT IN ('projects.manage_modules');

-- Team Member: all module CRUD (NOT teams.invite / teams.manage_members / projects.manage_modules)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'team_member'
  AND a.action_key NOT IN (
    'projects.manage_modules',
    'teams.invite',
    'teams.manage_members'
  );

-- Guest: read only (no create/update/delete, no management actions)
INSERT INTO public.rbac_role_module_actions (role_id, action_id)
SELECT r.id, a.id
FROM public.rbac_roles r, public.rbac_module_actions a
WHERE r.name = 'guest'
  AND a.action_key LIKE '%.read';

-- ── Add read_scope column to user_project_access_grants ──────────────────
ALTER TABLE public.user_project_access_grants
  ADD COLUMN IF NOT EXISTS read_scope TEXT
    CHECK (read_scope IN ('own', 'team', 'project'));

COMMENT ON COLUMN public.user_project_access_grants.read_scope IS
  'For guests only: the read scope granted at invite time.
   NULL = scope derived from role (owner/PM = project, team_manager = team, team_member = own).
   project = guest sees all project data in their allowed modules.
   team = guest sees their sub-team''s data in their allowed modules.';

-- ── Backfill owner role assignments from projects.owner_id ───────────────
INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
SELECT
  p.owner_id,
  (SELECT id FROM public.rbac_roles WHERE name = 'owner'),
  p.id,
  p.owner_id
FROM public.projects p
WHERE p.owner_id IS NOT NULL;
```

---

### Phase 3 — Task activity log

**Migration:** `20260324200002_task_activity_log.sql`

```sql
CREATE TABLE public.task_activity_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id   UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  action       TEXT        NOT NULL
                CHECK (action IN ('created','updated','status_changed',
                                  'assigned','unassigned','deleted')),
  changed_fields JSONB,    -- { "title": {"from": "old", "to": "new"} }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_activity_log_task_id
  ON public.task_activity_log (task_id, created_at DESC);

CREATE INDEX idx_task_activity_log_project_id
  ON public.task_activity_log (project_id, created_at DESC);

ALTER TABLE public.task_activity_log ENABLE ROW LEVEL SECURITY;

-- Members of the project can read the log
CREATE POLICY "Project members can read task activity"
  ON public.task_activity_log FOR SELECT
  USING (public.is_project_member(project_id));

-- Only authenticated users can insert (server actions only via SECURITY DEFINER RPCs)
CREATE POLICY "Authenticated users can insert task activity"
  ON public.task_activity_log FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);
```

---

### Phase 4 — Simplify app layer

**Files to change:**

#### `lib/rbac/resolver.ts`

Remove the `user_project_action_grants` query block entirely (table no longer exists).
The simplified `getGrantedActions` only does:

1. Fetch project role assignments + org role assignments (in parallel)
2. Expand to action keys

No override logic — roles are the single source of truth.

#### `lib/rbac/read-scope.ts`

Rewrite to derive scope from role name, not action key variants:

```typescript
// New getReadScope logic:
// 1. If owner_id === userId → 'project'
// 2. Fetch role name from user_role_assignments
// 3. Switch on role name:
//    'owner' | 'project_manager' → 'project'
//    'team_manager'              → 'team'
//    'team_member'               → 'own'
//    'guest'                     → read from user_project_access_grants.read_scope
//                                  (defaults to 'project' if null)
```

This replaces the current action-key-based scope resolution completely.

#### `app/actions/tasks.ts`

Add activity log writes after every mutation:

- `createTask` → log `created`
- `updateTask` → log `updated` with `changed_fields`
- Status change → log `status_changed`
- Assignment change → log `assigned` / `unassigned`
- `deleteTask` → log `deleted`

---

### Phase 5 — Rebuild accept_invite_atomic RPC

**Migration:** `20260324200003_simplified_accept_invite.sql`

The new RPC is much simpler — no priority cascade, no profile lookup, no custom role:

```sql
CREATE OR REPLACE FUNCTION public.accept_invite_atomic(
  p_token   TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_invite  RECORD;
  v_user_email TEXT;
  v_role_id UUID;
  v_read_scope TEXT;
BEGIN
  -- Fetch + lock invite
  SELECT pi.id, pi.project_id, pi.role_id, pi.invited_by,
         pi.status, pi.expires_at, pi.email,
         pi.allowed_modules, pi.guest_scope
  INTO v_invite FROM public.project_invites pi
  WHERE pi.token = p_token FOR UPDATE;

  -- Validate
  IF NOT FOUND                    THEN RAISE EXCEPTION 'invite_not_found';   END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF v_invite.expires_at < NOW()  THEN RAISE EXCEPTION 'invite_expired';     END IF;

  SELECT LOWER(TRIM(email)) INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF v_user_email <> LOWER(TRIM(v_invite.email))
    THEN RAISE EXCEPTION 'invite_email_mismatch'; END IF;

  -- Add to project_members
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- Assign role
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT p_user_id, v_invite.role_id, v_invite.project_id, v_invite.invited_by
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = p_user_id AND ura.project_id = v_invite.project_id
  );

  -- Write module allowlist (always — fail-closed semantic from Phase 1)
  -- For guests: also write read_scope
  INSERT INTO public.user_project_access_grants
    (project_id, user_id, allowed_modules, read_scope)
  VALUES
    (v_invite.project_id, p_user_id, v_invite.allowed_modules, v_invite.guest_scope)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    read_scope      = EXCLUDED.read_scope,
    updated_at      = NOW();

  -- Mark accepted
  UPDATE public.project_invites
  SET status = 'accepted', accepted_at = NOW() WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Note: `project_invites` needs two new columns:

- `allowed_modules TEXT[]` — moved here from the old profile/custom role resolution
- `guest_scope TEXT` — `'team'` or `'project'`, NULL for non-guests

---

### Phase 6 — Rebuild invite UI

**Goal:** Replace the current multi-step invite drawer with the clean 2-step flow.

**Files:**

- Locate current invite components (Team tab invite drawer)
- Replace with new flow:

```
Step 1 — Module selector
  Shows checkboxes for every project-active module
  Default: all checked

Step 2 — Role selector
  Shows role options based on who is inviting:
    Owner inviting    → PM / Team Manager / Team Member / Guest
    PM inviting       → Team Manager / Team Member / Guest
    Team Manager      → Team Member / Guest
  One click per option (radio, not checkboxes)
  Each option shows a short description of what that role can do

Preview panel (right side):
  Shows the selected modules + role + a one-line summary:
  e.g. "Team Member — can create and manage their own tasks, notes, and links"
```

**Server action changes (`app/actions/teams.ts`):**

- Simplify `inviteProjectMember` to accept `{ email, roleId, allowedModules }` — no more profileId or customRoleId
- Derive `guest_scope` automatically: if inviter is Team Manager → `'team'`, else → `'project'`

---

## Files touched per phase

| Phase | New migrations   | App files changed                                                        |
| ----- | ---------------- | ------------------------------------------------------------------------ |
| 1     | `20260324200000` | None                                                                     |
| 2     | `20260324200001` | None                                                                     |
| 3     | `20260324200002` | None                                                                     |
| 4     | None             | `lib/rbac/resolver.ts`, `lib/rbac/read-scope.ts`, `app/actions/tasks.ts` |
| 5     | `20260324200003` | `app/actions/teams.ts`                                                   |
| 6     | None             | Invite drawer component, team tab                                        |

---

## What Phase 2 of RBAC correctness fixes changes

We already implemented intersection semantics on `user_project_action_grants` (Phase 2 of the correctness fixes plan). Since that table is now removed, we revert the resolver to a clean role-expansion-only function — no override logic at all.

The Phase 1 correctness fixes (fail-open → fail-closed on `user_project_access_grants`) remain valid and stay in place.

---

## Definition of Done

- [ ] All legacy tables removed; schema migration runs clean on fresh Supabase reset
- [ ] 5 roles seeded with correct action sets
- [ ] Project owners have `owner` role assigned via backfill
- [ ] `getReadScope()` returns correct scope for all 5 roles without checking action key variants
- [ ] `can()` works correctly for all 5 roles using new action keys
- [ ] Invite flow is 2 steps: modules → role
- [ ] Guest scope automatically set based on inviter's role
- [ ] Task activity log records created/updated/deleted/assigned/unassigned events
- [ ] All existing task data preserved
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` pass

---

## Test personas (updated)

| Persona | Role              | allowed_modules               | read_scope     |
| ------- | ----------------- | ----------------------------- | -------------- |
| P1      | `owner`           | null (unrestricted)           | null → project |
| P2      | `project_manager` | null                          | null → project |
| P3      | `team_manager`    | null                          | null → team    |
| P4      | `team_member`     | null                          | null → own     |
| P5      | `team_member`     | `['board']`                   | null → own     |
| P6      | `guest` (project) | `['budgets', 'billings']`     | `'project'`    |
| P7      | `guest` (team)    | `['board', 'notes']`          | `'team'`       |
| P8      | `project_manager` | `['board', 'tasks', 'links']` | null → project |
