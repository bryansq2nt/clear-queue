# Design: Phase 5 — Copilot Permissions Alignment

**Created:** 2026-03-15
**Prerequisites:** Phase 4 (Read Scope Enforcement) ✓
**Status:** Complete

---

## Goal

Bind the Copilot to the same RBAC rules that govern every other module. Two
things must be true:

1. **Proposal approval is gated** — the Copilot cannot approve a proposal to
   create a task if the acting user does not hold `tasks.create` in the project.
2. **Context is scope-aware** — the system prompt the Copilot receives only
   includes records the user is allowed to read (per their `*.read.*` scope).

---

## Problems before Phase 5

| Problem                                                             | Effect                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The chat route only accepted the project owner                      | Project members could not use the Copilot at all                                             |
| `approveProposal` performed no RBAC check                           | Any project member could approve any proposal, even for modules they cannot write to         |
| `buildProjectContext` queried all project data regardless of caller | A `project_member` with `notes.read.own` would see every team member's notes in their prompt |

---

## Solution overview

### 1. Chat route — open to project members

`app/api/copilot/[projectId]/chat/route.ts` previously checked `projects.owner_id = user.id` and
returned 403 for everyone else. Changed to: owner OR project member check via
`project_members` table. Rate limiting and session isolation are unchanged.

### 2. `approveProposal` RBAC gate

`app/context/[projectId]/copilot/actions.ts` — after looking up the registry
capability, `approveProposal` now calls:

```typescript
const allowed = await can(user.id, capability.requiredAction, {
  type: 'project',
  projectId: proposalRow.project_id,
});
if (!allowed) {
  return {
    error: `Permission denied: you do not have '${capability.requiredAction}' in this project`,
  };
}
```

`requiredAction` is a new required field on `CopilotModuleCapability` — see
registry types below.

### 3. `requiredAction` on every capability

`lib/copilot/registry/types.ts` — added:

```typescript
/**
 * RBAC action key that the user must hold to approve this proposal.
 * Checked in the dispatcher before calling `approve`.
 */
requiredAction: string;
```

Every capability in every registry module file was updated with the appropriate
key. Mapping:

| Type                    | requiredAction              |
| ----------------------- | --------------------------- |
| task                    | tasks.create                |
| delete_task             | tasks.delete                |
| update_task             | tasks.update_title          |
| note                    | notes.create                |
| delete_note             | notes.delete                |
| update_note             | notes.update_title          |
| note_folder             | notes.manage_folders        |
| update_note_folder      | notes.manage_folders        |
| delete_note_folder      | notes.manage_folders        |
| milestone               | milestones.create           |
| delete_milestone        | milestones.delete           |
| update_milestone        | milestones.update           |
| mind_map                | ideas.create_board          |
| link                    | links.create                |
| delete_link             | links.delete                |
| update_link             | links.update                |
| todo_item               | todos.create_item           |
| toggle_todo             | todos.toggle_item           |
| delete_todo_item        | todos.delete_item           |
| billing                 | billings.create             |
| update_billing          | billings.update_description |
| delete_billing          | billings.delete             |
| billing_category        | billings.manage_categories  |
| update_billing_category | billings.manage_categories  |
| delete_billing_category | billings.manage_categories  |
| budget                  | budgets.create              |
| update_budget           | budgets.update              |
| delete_budget           | budgets.delete              |
| budget_category         | budgets.manage_categories   |
| update_budget_category  | budgets.manage_categories   |
| delete_budget_category  | budgets.manage_categories   |
| budget_item             | budgets.manage_items        |
| update_budget_item      | budgets.manage_items        |
| delete_budget_item      | budgets.manage_items        |
| client                  | owner.create_client         |

### 4. Context fetchers — scope-aware

`lib/copilot/context.ts` — `buildProjectContext` now:

1. Resolves `ownerFilter: string[] | null` for four owner-scoped modules
   (`links`, `documents`, `budgets`, `billings`) by calling the helper:

```typescript
async function resolveOwnerFilter(
  userId: string,
  projectId: string,
  module: string
): Promise<string[] | null> {
  const scope = await getReadScope(userId, projectId, module);
  if (scope === 'project') return null;
  if (scope === 'team') return getTeamMemberIds(userId, projectId);
  return [userId]; // 'own'
}
```

2. Runs filter resolution in parallel with the other project queries (Phase 1
   of the Promise.all), then passes each `ownerFilter` to the corresponding
   `fetch*Context` function (Phase 2).

**Design note on client bundling:** the `fetch*Context` functions live inside
`lib/copilot/registry/modules/*.ts`, which are imported by the client-side
parser chain (`ContextCopilotClient → parser → registry`). To avoid pulling
server-only code (`next/headers`) into the client bundle, scope resolution was
moved to `buildProjectContext` (which is `'use server'` and never client-bundled).
The fetchers receive a pre-resolved `ownerFilter: string[] | null` rather than
calling `getReadScope` themselves.

**Modules not scope-filtered in context:**

- `fetchTodosContext` — todo lists are project-level resources without per-user
  ownership semantics in the calendar/context view.
- `fetchClientsContext` — clients are project-linked entities, not owned by
  individual members.

---

## Files changed

| File                                         | Change                                                           |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `app/api/copilot/[projectId]/chat/route.ts`  | Accept project members, not only owner                           |
| `app/context/[projectId]/copilot/actions.ts` | RBAC gate in `approveProposal` via `can()`                       |
| `lib/copilot/registry/types.ts`              | Add `requiredAction: string` to `CopilotModuleCapability`        |
| `lib/copilot/registry/modules/tasks.ts`      | `requiredAction` on 3 capabilities                               |
| `lib/copilot/registry/modules/notes.ts`      | `requiredAction` on 6 capabilities                               |
| `lib/copilot/registry/modules/milestones.ts` | `requiredAction` on 3 capabilities                               |
| `lib/copilot/registry/modules/ideas.ts`      | `requiredAction` on 1 capability                                 |
| `lib/copilot/registry/modules/links.ts`      | `requiredAction` on 3 capabilities + scope-aware context fetcher |
| `lib/copilot/registry/modules/todos.ts`      | `requiredAction` on 3 capabilities                               |
| `lib/copilot/registry/modules/billings.ts`   | `requiredAction` on 6 capabilities + scope-aware context fetcher |
| `lib/copilot/registry/modules/budgets.ts`    | `requiredAction` on 9 capabilities + scope-aware context fetcher |
| `lib/copilot/registry/modules/clients.ts`    | `requiredAction` on 1 capability                                 |
| `lib/copilot/registry/modules/documents.ts`  | Scope-aware context fetcher                                      |
| `lib/copilot/context.ts`                     | Two-phase parallel resolution: owner filters + context fetchers  |

---

## What is NOT in scope for Phase 5

- **Copilot session isolation per member** — each member's sessions are already
  isolated by `owner_id` in `copilot_sessions`. No change needed.
- **Proposal visibility filtering** — proposals are stored per session and
  session ownership already prevents cross-user access. No change needed.
- **Calendar context fetcher** — the Copilot does not currently include a
  `fetchCalendarContext` function. Calendar data is not part of the system
  prompt. No change needed for Phase 5.
