# Design: Phase 4 — Read Scope Enforcement

**Created:** 2026-03-15
**Prerequisites:** Phase 3 (sub-teams) ✓
**Status:** Ready for implementation

---

## The core problem

When a team member is invited to a project, they cannot see most of the project
content. This is because the following modules currently filter queries by
`owner_id = current_user.id`:

| Module          | Current filter       | Result for team member        |
| --------------- | -------------------- | ----------------------------- |
| Notes           | `owner_id = user.id` | Sees only own notes           |
| Links           | `owner_id = user.id` | Sees only own links           |
| Budgets         | `owner_id = user.id` | Sees only own budgets         |
| Billings        | `owner_id = user.id` | Sees only own billing records |
| Calendar events | `owner_id = user.id` | Sees only own events          |
| Ideas (boards)  | `owner_id = user.id` | Sees only own boards          |
| Documents       | `owner_id = user.id` | Sees only own documents       |
| Media           | `owner_id = user.id` | Sees only own media           |

**Tasks and milestones** filter by `project_id` only (no `owner_id`), so team
members already see all project tasks and milestones. Phase 4 does not change
their query behavior.

Phase 4 makes queries **scope-aware**: the same action key that says "you can
read notes" now also says _which_ notes you can read.

---

## Scope tiers

```
*.read.own      — records created by / owned by the current user only
*.read.team     — records created by any member of the user's sub-teams
*.read.project  — all records in the project (no owner filter)
```

**Role → scope mapping:**

| Role              | Scope                                                 |
| ----------------- | ----------------------------------------------------- |
| `project_viewer`  | `project` (read all, existing `*.read` key maps here) |
| `project_member`  | `own` (see only own records)                          |
| `team_manager`    | `team` (see own sub-team's records)                   |
| `project_editor`  | `project` (existing `*.read` key maps here)           |
| `project_manager` | `project`                                             |
| `project_owner`   | fast path — bypasses scope checks                     |

**Tasks and milestones:** no owner attribution column exists, always
`project` scope regardless of role. Phase 4 adds no new filtering to these.

---

## New action keys

Added to the **existing** module entries in `rbac_module_actions`.
Existing `*.read` keys are preserved for backwards compatibility — they resolve
to `project` scope by default.

```
notes.read.own, notes.read.team, notes.read.project
links.read.own, links.read.team, links.read.project
budgets.read.own, budgets.read.team, budgets.read.project
billings.read.own, billings.read.team, billings.read.project
calendar.read.own, calendar.read.team, calendar.read.project
ideas.read.own, ideas.read.team, ideas.read.project
documents.read.own, documents.read.team, documents.read.project
media.read.own, media.read.team, media.read.project
```

**No new keys for tasks or milestones** — they remain project-scoped.

### Role grants for new keys

| Key pattern      | project_viewer | project_member | project_editor | team_manager | project_manager | project_owner |
| ---------------- | -------------- | -------------- | -------------- | ------------ | --------------- | ------------- |
| `*.read.project` | ✓              |                | ✓              |              | ✓               | ✓             |
| `*.read.team`    |                |                |                | ✓            |                 | ✓             |
| `*.read.own`     |                | ✓              |                | ✓            |                 | ✓             |

(`project_owner` gets all three, but the fast path short-circuits before scope
check anyway.)

---

## `getReadScope()` — new helper

File: `lib/rbac/read-scope.ts` (new)

```typescript
export type ReadScope = 'own' | 'team' | 'project';

/**
 * Returns the highest read scope the user has for a given module in a project.
 * Falls back to 'project' if user has only the legacy *.read key.
 * Falls back to 'own' if no scoped key is found (safety floor).
 */
export async function getReadScope(
  userId: string,
  projectId: string,
  module: string
): Promise<ReadScope>;

/**
 * Returns the user IDs of all members of sub-teams that the given user
 * belongs to within a project. Used when scope = 'team'.
 */
export async function getTeamMemberIds(
  userId: string,
  projectId: string
): Promise<string[]>;
```

**Resolution logic in `getReadScope()`:**

1. Owner fast path: if `projects.owner_id = userId` → return 'project'
2. Call `getGrantedActions(userId, projectId, true)` (cached, no extra DB hit)
3. If granted has `{module}.read.project` OR `{module}.read` → return 'project'
4. If granted has `{module}.read.team` → return 'team'
5. If granted has `{module}.read.own` → return 'own'
6. Default: return 'own' (safest fallback — shows only own content)

**`getTeamMemberIds()` logic:**

```sql
SELECT DISTINCT ptm2.user_id
FROM project_team_members ptm1
JOIN project_team_members ptm2 ON ptm2.team_id = ptm1.team_id
JOIN project_teams pt ON pt.id = ptm1.team_id
WHERE ptm1.user_id = $userId
  AND pt.project_id = $projectId
```

Returns all user IDs sharing a sub-team with the caller (including themselves).

---

## Per-module query changes

Each affected module's list function gains a scope filter:

```typescript
// Pattern for owner-scoped modules:
const scope = await getReadScope(user.id, projectId, 'notes');
let query = supabase.from('notes').select(...).eq('project_id', projectId);
if (scope === 'own') {
  query = query.eq('owner_id', user.id);
} else if (scope === 'team') {
  const teamIds = await getTeamMemberIds(user.id, projectId);
  if (teamIds.length > 0) query = query.in('owner_id', teamIds);
  else query = query.eq('owner_id', user.id); // fallback to own
}
// scope === 'project': no extra filter
```

### Functions that change

| Module    | Function                              | Change                            |
| --------- | ------------------------------------- | --------------------------------- |
| notes     | `getNotes(projectId)`                 | Add scope filter                  |
| links     | `listProjectLinks(projectId)`         | Add scope filter                  |
| budgets   | `getBudgetsByProjectId(projectId)`    | Add scope filter                  |
| billings  | `listBillings(projectId)`             | Add scope filter                  |
| calendar  | `getProjectCalendarFeed(projectId)`   | Add scope filter (or pass to RPC) |
| ideas     | `getIdeaBoardsByProjectId(projectId)` | Add scope filter                  |
| documents | `getDocumentsByProjectId(projectId)`  | Add scope filter                  |
| media     | `getMediaByProjectId(projectId)`      | Add scope filter                  |

**Tasks, milestones, todos**: no changes.

---

## Migration plan

One file: `20260319200000_read_scope_action_keys.sql`

Contents:

1. Insert `*.read.own`, `*.read.team`, `*.read.project` for all 8 affected modules
2. Seed `project_viewer` with `*.read.project` for all 8 modules
3. Seed `project_member` with `*.read.own` for all 8 modules
4. Seed `team_manager` with `*.read.team` + `*.read.own` for all 8 modules
5. Seed `project_manager` with `*.read.project` for all 8 modules
6. Seed `project_editor` with `*.read.project` for all 8 modules
7. Seed `project_owner` with all 3 tiers for all 8 modules

---

## Files that change

| File                                                            | Change                                        |
| --------------------------------------------------------------- | --------------------------------------------- |
| `supabase/migrations/20260319200000_read_scope_action_keys.sql` | New                                           |
| `lib/rbac/read-scope.ts`                                        | New — `getReadScope()` + `getTeamMemberIds()` |
| `app/actions/notes.ts`                                          | Scope-aware `getNotes()`                      |
| `app/context/[projectId]/links/actions.ts`                      | Scope-aware `listProjectLinks()`              |
| `app/actions/budgets.ts`                                        | Scope-aware `getBudgetsByProjectId()`         |
| `app/actions/billings.ts`                                       | Scope-aware `listBillings()`                  |
| `app/actions/calendar.ts`                                       | Scope-aware calendar feed query               |
| `app/actions/idea-boards.ts`                                    | Scope-aware boards list                       |
| `app/actions/documents.ts`                                      | Scope-aware documents list                    |
| `app/actions/media.ts`                                          | Scope-aware media list                        |

No changes to: tasks, milestones, todos, `lib/rbac/resolver.ts`,
`getCanViewModule`, `ContextDataCache`, or any `*Client.tsx` files.

---

## Implementation checklist

- [ ] Migration: `*.read.own/team/project` action keys for all 8 modules
- [ ] Migration: role grants seeded for all new keys
- [ ] `lib/rbac/read-scope.ts`: `getReadScope()` + `getTeamMemberIds()`
- [ ] `app/actions/notes.ts`: scope-aware `getNotes()`
- [ ] `app/context/[projectId]/links/actions.ts`: scope-aware list
- [ ] `app/actions/budgets.ts`: scope-aware list
- [ ] `app/actions/billings.ts`: scope-aware list
- [ ] `app/actions/calendar.ts`: scope-aware feed
- [ ] `app/actions/idea-boards.ts`: scope-aware boards list
- [ ] `app/actions/documents.ts`: scope-aware documents list
- [ ] `app/actions/media.ts`: scope-aware media list
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` pass
