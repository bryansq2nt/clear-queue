# Board / Tasks — RBAC Module Doc

**Created:** 2026-03-18
**Status:** Implemented

---

## Current state

### What works

- `requireCan` gates every write server action (`tasks.create`, `tasks.update_*`,
  `tasks.assign`, `tasks.unassign`, `tasks.delete`, `tasks.bulk_delete`,
  `tasks.reorder`).
- Server-side protection is complete.

### What was missing

- `page.tsx` had no `getCanViewModule` guard → fixed in Phase 2A.
- No permissions object passed to the client → "Add task" buttons always rendered
  regardless of the member's `tasks.create` grant.

---

## Permission keys

| Key                                                                                                                                              | What it controls                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `tasks.read`                                                                                                                                     | Tab visible; board loads                        |
| `tasks.create`                                                                                                                                   | "Add task" column buttons + AddTaskModal        |
| `tasks.update_status`                                                                                                                            | Drag-and-drop between columns (server-enforced) |
| `tasks.update_title` / `tasks.update_notes` / `tasks.update_priority` / `tasks.update_due_date` / `tasks.update_tags` / `tasks.update_milestone` | Edit task fields (server-enforced)              |
| `tasks.assign` / `tasks.unassign`                                                                                                                | Assignment (server-enforced)                    |
| `tasks.delete`                                                                                                                                   | Delete task (server-enforced)                   |

For Phase 2, the only UI-visible gate is `tasks.create` (add buttons).
Move/edit/delete protection is already handled server-side; UI gating
for those is deferred to a future iteration when task cards expose
contextual action menus.

---

## Files changed

| File                                                      | Change                                           |
| --------------------------------------------------------- | ------------------------------------------------ |
| `app/actions/tasks.ts`                                    | `getBoardPermissions(projectId)` added           |
| `app/context/[projectId]/board/page.tsx`                  | calls `getBoardPermissions`, passes to FromCache |
| `app/context/[projectId]/board/ContextBoardFromCache.tsx` | accepts + passes `permissions` prop              |
| `app/context/[projectId]/board/ContextBoardClient.tsx`    | gates "Add task" on `canCreate`                  |

---

## Implementation checklist

- [x] `getBoardPermissions` in `app/actions/tasks.ts`
- [x] `page.tsx` passes permissions
- [x] `ContextBoardFromCache` threads permissions
- [x] `ContextBoardClient` hides add buttons when `!canCreate`
