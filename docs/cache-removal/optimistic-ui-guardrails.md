# Optimistic UI Guardrails for Cache Removal

**Date:** 2026-03-16
**Companion docs:** `audit.md`, `plan.md`
**Scope:** Defines the rules for preserving fluid UX during and after the ContextDataCache removal. Does not introduce new dependencies. Does not reintroduce client-side cache infrastructure.

---

## 1. Executive Summary — The `router.refresh()` Trap

The cache removal plan's simplest mechanical replacement is:

```
BEFORE: onRefresh()  →  cache.invalidate() + fetch + setState()
AFTER:  router.refresh()
```

This is **correct for some cases and wrong for others.** If applied uniformly across every mutation handler in every tab, the result is an app that feels like a 2010 full-page reload architecture. Every create, delete, or toggle triggers a skeleton flash, a server round trip, and a full re-render of the page component.

The original cache system accidentally produced good UX in one way: the `onRefresh()` path was a last resort. The primary path was optimistic local state updates (`onTaskUpdated`, `onTaskAdded`, `onTaskDeleted` on the board; `setNotes()`, `setItems()` in other clients). Cache invalidation was a synchronization step, not a display step.

The board is the proof: it has been optimistic since it was built. Add a task → the card appears instantly. Delete a task → it disappears instantly. Drag a card → it moves without a round trip. `router.refresh()` is never called on the board's happy path.

**The guardrail goal:** Every high-interaction module must match the board's fluidity. `router.refresh()` is a fallback for error recovery and low-frequency admin operations — not a mutation completion signal.

**The second risk** is cascade refreshes: one mutation triggering refreshes in sibling tabs. The old cache had this explicitly (`cache.invalidate({ type: 'milestones' })` in the board client, `cache.invalidate({ type: 'board' })` in the milestones client). Removing the cache removes these cascades automatically — they must not be re-introduced via cross-component `router.refresh()` calls or cross-tab effects.

---

## 2. Decision Framework

### When optimistic local state update is REQUIRED

Use optimistic updates when ALL of the following are true:

1. The user initiated the action (click, submit, drag, toggle)
2. The action affects data that is currently visible in the same tab
3. The action has a clear visual outcome the user expects to see immediately (item added to list, item removed, field updated, checkbox checked)
4. The server action returns enough data to reconcile the local state (see per-module matrix in section 3)

**In these cases, `router.refresh()` is banned on the happy path.** Use it only in the error recovery branch.

### When `router.refresh()` is acceptable

`router.refresh()` is the right choice when ONE of the following is true:

1. The mutation is infrequent (once every few minutes at most) — e.g., editing project owner info, revoking a team member
2. The result requires server-computed aggregate data that cannot be reconstructed client-side — e.g., milestone task progress percentages require a DB count query
3. Correctness is higher priority than speed — e.g., permission changes in the Team tab where showing stale RBAC state is worse than a brief reload
4. The mutation navigates the user away (e.g., delete a note → navigate to list → the destination page is always fresh on arrival)

### Never use `router.refresh()` for

- Toggling a checkbox (Todos)
- Dragging a card (Board — already handled)
- Adding an item to a list when the server action returns the new item
- Deleting an item from a list (you have the ID — remove it locally)
- Updating a field when the server action returns the updated entity

---

## 3. Per-Module Matrix

### Reference Standard: Board

The board is the pattern every other module should emulate for its mutation handlers.

| Property                        | Value                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                 | `tasksByStatus: Record<Status, Task[]>`, `counts: Record<Status, number>`, `dragOverride: Task[] \| null`, `loadingMore: Status \| null`                                                        |
| **Optimistic operations**       | Add task (via `onTaskAdded` + `onTaskConfirmed`), update task (via `onTaskUpdated`), delete task (via `onTaskDeleted`), drag/reorder (via `onTasksChange` + `dragOverride`)                     |
| **`router.refresh()` fallback** | Only inside `MutationErrorDialog.onTryAgain` failure path and non-optimistic legacy `onTaskUpdate` path                                                                                         |
| **Server action contracts**     | `createTask` returns `Task`, `updateTask` returns `Task`, `deleteTask` returns `{ success }` (ID known, sufficient for removal), `updateTaskOrder` returns nothing (optimistic already applied) |
| **Action contract gaps**        | None — board actions are already compliant                                                                                                                                                      |
| **Realtime slot**               | `useEffect` in `ContextBoardClient` will subscribe to `tasks` table changes for the project                                                                                                     |

---

### Notes

| Property                           | Value                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `notes: Note[]`, `folders: NoteFolder[]`, `selectedFolderId: string \| null`, `search: string`                                                                                                                                                                                      |
| **Optimistic operations required** | Create note → prepend to `notes` with returned data; delete note → filter from `notes` by ID; move note to folder → update `folder_id` on note in local state; create folder → append to `folders`; delete folder → remove from `folders` and nullify `folder_id` on affected notes |
| **`router.refresh()` acceptable**  | Never on happy path. On error recovery only.                                                                                                                                                                                                                                        |
| **Server action contracts**        | `createNote` must return `{ data: Note }` ✓ (standard convention). `deleteNote` returns `{ success }` — ID known ✓. `moveNoteToFolder` must return `{ data: Note }` with updated `folder_id`.                                                                                       |
| **Action contract gaps**           | Verify `moveNoteToFolder` returns the updated note. If not, update the action.                                                                                                                                                                                                      |
| **Realtime slot**                  | Subscribe to `notes` table for `project_id = projectId`                                                                                                                                                                                                                             |
| **New Note route**                 | `ContextNewNoteClient.handleBack` currently invalidates cache before navigating. After removal: just `router.push(listPath)` — the list page will fetch fresh on arrival. No `router.refresh()` needed.                                                                             |

---

### Note Detail

| Property                           | Value                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `title: string`, `content: string` (in editor), `links: NoteLink[]`, `folderId: string \| null` — all owned by the rich text editor component                                                                                                                                                               |
| **Optimistic operations required** | Save: server action returns updated note → update local title/content state; do NOT call `router.refresh()` after save (the editor already has the latest content — a refresh would re-mount the editor and could discard in-flight edits); add link → append to `links`; delete link → filter from `links` |
| **`router.refresh()` acceptable**  | Never on save (risk of editor re-mount mid-edit). On delete: `router.push(listPath)` instead — the list will be fresh on arrival.                                                                                                                                                                           |
| **Server action contracts**        | `updateNote` must return `{ data: Note }`. `addNoteLink` must return `{ data: NoteLink }`. `deleteNoteLink` returns `{ success }` — ID known ✓.                                                                                                                                                             |
| **Action contract gaps**           | None if standard conventions are followed.                                                                                                                                                                                                                                                                  |
| **Realtime slot**                  | Subscribe to `notes` table for `id = noteId`                                                                                                                                                                                                                                                                |
| **Critical risk**                  | This is the ONLY tab where `router.refresh()` after a mutation is actively harmful (editor re-mount). The save path must be purely optimistic.                                                                                                                                                              |

---

### Links

| Property                           | Value                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `links: ProjectLinkRow[]`, `categories: LinkCategoryRow[]`, `viewMode: 'active' \| 'archived' \| 'pinned'`                                                                                                                                                                                                          |
| **Optimistic operations required** | Add link → append to `links` with returned data; delete link → remove by ID; pin/unpin → update `pinned` field with returned data; archive/unarchive → update `archived_at` field; reorder (DnD) → already optimistic via RPC; create category → append to `categories`; delete category → remove from `categories` |
| **`router.refresh()` acceptable**  | Never on happy path. Error recovery only.                                                                                                                                                                                                                                                                           |
| **Server action contracts**        | `createProjectLink` must return `{ data: ProjectLinkRow }`. `updateProjectLink` (pin/archive) must return `{ data: ProjectLinkRow }`. `deleteProjectLink` returns `{ success }` — ID known ✓. `createLinkCategory` must return `{ data: LinkCategoryRow }`.                                                         |
| **Action contract gaps**           | Confirm `updateProjectLink` returns the full row. The reorder action (`reorderLinks` RPC) returns nothing — optimistic state is already applied via DnD.                                                                                                                                                            |
| **Realtime slot**                  | Subscribe to `project_links` for `project_id = projectId`                                                                                                                                                                                                                                                           |

---

### Ideas

| Property                           | Value                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `boards: Board[]`                                                                                                                                     |
| **Optimistic operations required** | Create board → append with returned data; delete board → remove by ID                                                                                 |
| **`router.refresh()` acceptable**  | Ideas mutations are infrequent (create/delete boards, not constant editing). `router.refresh()` is acceptable here but optimistic is still preferred. |
| **Server action contracts**        | `createBoard` must return `{ data: Board }`. `deleteBoard` returns `{ success }` — ID known ✓.                                                        |
| **Action contract gaps**           | Verify `createBoard` returns the board row.                                                                                                           |
| **Realtime slot**                  | Subscribe to `boards` table for `project_id = projectId`                                                                                              |

---

### Budgets

| Property                           | Value                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local state**                    | `budgets: BudgetWithProject[]`                                                                                                                                                                                                                         |
| **Optimistic operations required** | Delete budget → remove by ID (optimistic is simple); create/duplicate budget → preferred optimistic but `router.refresh()` acceptable because the `BudgetWithProject` shape includes project join data that the client already has                     |
| **`router.refresh()` acceptable**  | For create and duplicate (complex shape with project joins). For delete, optimistic is straightforward (remove by ID).                                                                                                                                 |
| **Server action contracts**        | `createBudget` returns `{ data: BudgetWithProject }` (must include project join, or client reconstructs from known project). `deleteBudget` returns `{ success }` — ID known ✓. `duplicateBudget` uses `_atomic` RPC — must return the new budget row. |
| **Action contract gaps**           | `duplicateBudget` via RPC — verify it returns the new budget with project join or at minimum the bare budget row. If not, `router.refresh()` after duplicate is the fallback.                                                                          |
| **Realtime slot**                  | Subscribe to `budgets` table for `project_id = projectId`                                                                                                                                                                                              |

---

### Billings

| Property                           | Value                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `billings: BillingWithRelations[]`, `categories: BillingCategory[]`, `filters: BillingFilters` (client-side filtering)                                                                                                                                                                        |
| **Optimistic operations required** | Create billing → append to `billings` with returned data; update billing → replace in list with returned data; delete billing → remove by ID; create category → append to `categories`; delete category → remove from `categories`                                                            |
| **`router.refresh()` acceptable**  | Never on happy path. Error recovery only.                                                                                                                                                                                                                                                     |
| **Server action contracts**        | `createBilling` must return `{ data: BillingWithRelations }` (must include client name join for display). `updateBilling` must return `{ data: BillingWithRelations }`. `deleteBilling` returns `{ success }` — ID known ✓. `createBillingCategory` must return `{ data: BillingCategory }`.  |
| **Action contract gaps**           | `BillingWithRelations` includes a client join (`client: { id, full_name }`). `createBilling` must either return this join or the client must be resolved from the `clients` prop already in scope. Verify the action select includes `client:clients!billings_client_id_fkey(id, full_name)`. |
| **Realtime slot**                  | Subscribe to `billings` table for `project_id = projectId`                                                                                                                                                                                                                                    |

---

### Calendar

| Property                           | Value                                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local state**                    | `feed: CalendarFeedItem[]`, `year: number`, `month: number`                                                                                                                                                  |
| **Optimistic operations required** | None. Calendar is a read-only view of tasks and milestones. No create/delete happens on this tab.                                                                                                            |
| **`router.refresh()` acceptable**  | Calendar has no mutations. Month navigation already calls the server action directly (`getProjectCalendarFeed`) and updates local state. This pattern is kept as-is. No `router.refresh()` is needed at all. |
| **Server action contracts**        | No mutations. Only reads.                                                                                                                                                                                    |
| **Action contract gaps**           | None.                                                                                                                                                                                                        |
| **Realtime slot**                  | Subscribe to `tasks` and `milestones` for `project_id = projectId` to update the feed when teammates make changes                                                                                            |
| **Note**                           | Calendar is the safest tab in the entire plan. No mutation handlers to worry about.                                                                                                                          |

---

### Documents

| Property                           | Value                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `documents: ProjectFile[]`, `folders: DocumentFolder[]`, `selectedFolderId: string \| null`                                                                                                                                                                                                                            |
| **Optimistic operations required** | Delete document → remove by ID; delete folder → remove from `folders` and move its files to root (null `folder_id`); create folder → append to `folders` with returned data; move file to folder → update `folder_id` on item in local state                                                                           |
| **Upload handling**                | File upload is inherently async (storage + DB). Pattern: add an optimistic placeholder with a `__uploading: true` flag and the local file name/size immediately; replace with the real `ProjectFile` when the action returns it. Do NOT call `router.refresh()` after upload — the placeholder-to-real swap is the UX. |
| **`router.refresh()` acceptable**  | Never on happy path for delete/move. Upload uses optimistic placeholder replacement. Error recovery only.                                                                                                                                                                                                              |
| **Server action contracts**        | `uploadDocument` must return `{ data: ProjectFile }` for placeholder replacement. `deleteDocument` returns `{ success }` — ID known ✓. `createDocumentFolder` must return `{ data: DocumentFolder }`. `moveDocumentToFolder` must return `{ data: ProjectFile }` with updated `folder_id`.                             |
| **Action contract gaps**           | Verify `createDocumentFolder` returns the folder row. Verify `moveDocumentToFolder` returns the updated file.                                                                                                                                                                                                          |
| **Realtime slot**                  | Subscribe to `project_files` for `project_id = projectId`                                                                                                                                                                                                                                                              |

---

### Milestones

| Property                           | Value                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `milestones: MilestoneWithProgress[]` — includes server-computed `taskCount`, `completedTaskCount`, `progress` percentage                                                                                                                                                                                                                                                                                                    |
| **Optimistic operations required** | Delete milestone → remove by ID; update milestone title/dates → update fields in local state with returned data                                                                                                                                                                                                                                                                                                              |
| **`router.refresh()` acceptable**  | Create milestone: the `progress` fields are server-computed (requires a DB count query) and would be 0 for a new milestone anyway — `router.refresh()` is acceptable here, or construct an optimistic `MilestoneWithProgress` with `progress: 0, taskCount: 0, completedTaskCount: 0` and let the refresh from `revalidatePath` reconcile on the next navigation. Optimistic with zeroed progress is the preferred approach. |
| **Server action contracts**        | `createMilestone` must return `{ data: Milestone }`. The `MilestoneWithProgress` shape can be constructed client-side with zeroed progress fields for optimistic add. `updateMilestone` must return `{ data: Milestone }` (title/dates only, not progress). `deleteMilestone` returns `{ success }` — ID known ✓.                                                                                                            |
| **Action contract gaps**           | None blocking. Client-side construction of optimistic `MilestoneWithProgress` is safe.                                                                                                                                                                                                                                                                                                                                       |
| **Realtime slot**                  | Subscribe to `milestones` for `project_id = projectId`. Progress fields require subscribing to `tasks` as well to update counts when tasks change.                                                                                                                                                                                                                                                                           |

---

### Owner

| Property                           | Value                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local state**                    | `project: Project`, `client: Client \| null`, `business: Business \| null`                                                                                                                             |
| **Optimistic operations required** | Update project name/color/notes → update `project` in local state with returned data; assign/create client → update `client` in local state; assign/create business → update `business` in local state |
| **`router.refresh()` acceptable**  | Owner mutations are very infrequent (rename a project, assign a client). `router.refresh()` is acceptable. Optimistic is still preferred for the save buttons to feel responsive.                      |
| **Server action contracts**        | `updateProject` must return `{ data: Project }`. `createClient` must return `{ data: Client }`. `updateClient` must return `{ data: Client }`.                                                         |
| **Action contract gaps**           | None if conventions are followed.                                                                                                                                                                      |
| **Realtime slot**                  | Subscribe to `projects` for `id = projectId`                                                                                                                                                           |

---

### Team

| Property                                              | Value                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                                       | `members: ProjectMember[]`, `invites: ProjectInvite[]`, `rejectedInvites: RejectedInvite[]`, `teams: ProjectTeam[]`                                                                                                                                                                                                                                                              |
| **Optimistic operations required**                    | Revoke invite → remove from `invites` by ID (safe to be optimistic, action cannot fail silently). Remove member → remove from `members` by ID. Create sub-team → append to `teams`. Delete sub-team → remove from `teams`.                                                                                                                                                       |
| **`router.refresh()` acceptable — and PREFERRED for** | Send invite (invite creation triggers email + DB changes; server confirmation is appropriate before showing success); edit member access/permissions (RBAC correctness is critical — the displayed permissions must match the DB; optimistic display of wrong permissions is worse than a 1-second reload); accept/reject invite (navigational action — user moves away anyway). |
| **Server action contracts**                           | `revokeInvite` returns `{ success }` — ID known ✓. `removeProjectMember` returns `{ success }` — ID known ✓. `inviteProjectMember` returns `{ data: ProjectInvite }` for the optimistic append on invite send. `updateMemberAccess` returns the updated grants — use `router.refresh()` to ensure RBAC data is authoritative.                                                    |
| **Action contract gaps**                              | `inviteProjectMember` — verify it returns the invite row for optimistic append.                                                                                                                                                                                                                                                                                                  |
| **Realtime slot**                                     | Subscribe to `project_members` and `project_invites` for `project_id = projectId`                                                                                                                                                                                                                                                                                                |
| **Special rule**                                      | Permission editing (`updateMemberAccess`) must always use `router.refresh()`. Never optimistically update displayed RBAC state.                                                                                                                                                                                                                                                  |

---

### Todos

| Property                           | Value                                                                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `items: TodoItem[]`                                                                                                                                                                                                                                                              |
| **Optimistic operations required** | Toggle item (check/uncheck) — **this is the highest-frequency interaction in the entire app** — must be instant, no round trip visible; add item → append to list with returned data; delete item → remove by ID; reorder items (DnD if applicable) → optimistic reorder         |
| **`router.refresh()` acceptable**  | Never on happy path. Toggle especially must never call `router.refresh()`. Error recovery only.                                                                                                                                                                                  |
| **Server action contracts**        | `toggleTodoItem` via `toggle_todo_item_atomic` RPC must return `{ data: TodoItem }` with the new `completed` state and `completed_at`. `createTodoItem` via `create_todo_item_atomic` RPC must return `{ data: TodoItem }`. `deleteTodoItem` returns `{ success }` — ID known ✓. |
| **Action contract gaps**           | Verify `toggle_todo_item_atomic` RPC returns the updated item row. If it only returns a success flag, change it to return the full row.                                                                                                                                          |
| **Realtime slot**                  | Subscribe to `todo_items` for the project's default list ID                                                                                                                                                                                                                      |
| **Critical note**                  | Todos is the module where a naïve `router.refresh()` replacement would be most visibly broken. A user checking off 5 items in a row would see 5 skeleton flashes.                                                                                                                |

---

### Media

| Property                           | Value                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `items: ProjectFile[]`, `hasMore: boolean`, `loadedCount: number`                                                                                                                                                                                                                                              |
| **Optimistic operations required** | Delete media item → remove by ID; upload → show optimistic placeholder with `__uploading: true`, file name, and file size; replace with real `ProjectFile` when upload action returns                                                                                                                          |
| **`router.refresh()` acceptable**  | Load-more pagination is already client-side (direct server action call, no refresh). After successful upload (placeholder replaced with real item), `router.refresh()` is NOT needed — the local state already has the correct item. Delete uses optimistic remove. `router.refresh()` only on error recovery. |
| **Server action contracts**        | `uploadMedia` must return `{ data: ProjectFile }` for placeholder replacement. `deleteMedia` returns `{ success }` — ID known ✓.                                                                                                                                                                               |
| **Action contract gaps**           | Verify `uploadMedia` returns the file row with the storage path and signed URL.                                                                                                                                                                                                                                |
| **Realtime slot**                  | Subscribe to `project_files` for `project_id = projectId` and `bucket = 'media'`                                                                                                                                                                                                                               |

---

### Copilot

| Property                           | Value                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local state**                    | `messages: CopilotMessage[]`, `sessions: CopilotSession[]`, `proposals: CopilotProposal[]` — already fully client-managed, no FromCache                                                                                                                                      |
| **Optimistic operations required** | Message streaming is already real-time (SSE/streaming response). Proposal approval → update proposal `status` to `'approved'` in local state immediately; proposal rejection → update `status` to `'rejected'`                                                               |
| **`router.refresh()` acceptable**  | Never. Copilot is self-contained and streaming.                                                                                                                                                                                                                              |
| **Cache removal change**           | Remove `invalidateProject(result.data.project_id)` call after proposal approval. This was the only cache-touching code in Copilot.                                                                                                                                           |
| **Impact of removal**              | After approving a copilot proposal (e.g., AI creates a task), the board tab will show the new task on next navigation (fresh server fetch). It will NOT appear in the board while the user is on the copilot tab. This is acceptable until Supabase Realtime is implemented. |
| **Realtime slot**                  | Subscribe to `copilot_proposals` for `session_id IN userSessionIds` to update proposal status when teammate approves/rejects                                                                                                                                                 |

---

## 4. No Cascade Refresh Rules

These patterns are explicitly banned. They either existed in the cache system (as cross-module invalidation) or are risks during the naive replacement phase.

### BANNED: `router.refresh()` inside a mutation that already updates local state

```tsx
// ❌ BANNED: optimistic update + refresh = double update = visual flash
setItems((prev) => [...prev, newItem]); // optimistic
const { data } = await createItem(formData);
router.refresh(); // redundant — causes skeleton flash after instant add
```

The fix:

```tsx
// ✅ CORRECT: use returned data to reconcile, no refresh
const { data, error } = await createItem(formData);
if (error) {
  rollbackOptimisticAdd(optimisticId);
  showError(error);
  return;
}
replaceOptimisticWithReal(optimisticId, data);
```

### BANNED: `router.refresh()` after a delete that removes by ID

```tsx
// ❌ BANNED: you have the ID, remove locally
await deleteItem(id);
router.refresh(); // unnecessary — causes full skeleton re-render

// ✅ CORRECT: remove from local state
setItems((prev) => prev.filter((i) => i.id !== id));
await deleteItem(id);
// server action already called revalidatePath — next navigation is fresh
```

### BANNED: `router.refresh()` inside a `useEffect`

```tsx
// ❌ BANNED: infinite loop risk, no clear trigger
useEffect(() => {
  router.refresh();
}, [someState]);
```

### BANNED: Cross-tab refresh triggers

```tsx
// ❌ BANNED: Tab A mutation causing Tab B to reload
// There is no mechanism for this in the new architecture — do not invent one.
// Do not add a global event bus, context-level refresh callback, or
// shared state that triggers refresh in a sibling tab.
// Each tab is isolated. Fresh data on tab entry handles cross-tab consistency.
```

### BANNED: `router.refresh()` on toggle interactions

```tsx
// ❌ BANNED: toggle must be instant
const handleToggle = async (id: string) => {
  await toggleTodoItem(id);
  router.refresh(); // user sees checkbox re-render with skeleton delay
};

// ✅ CORRECT: optimistic toggle
const handleToggle = async (id: string) => {
  setItems((prev) =>
    prev.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i))
  );
  const { data, error } = await toggleTodoItem(id);
  if (error) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i))
    ); // rollback
    showError(error);
  } else if (data) {
    setItems((prev) => prev.map((i) => (i.id === id ? data : i))); // reconcile with server truth
  }
};
```

### BANNED: Re-introducing cross-module invalidation

The old cache had `cache.invalidate({ type: 'milestones' })` in the board client and `cache.invalidate({ type: 'board' })` in the milestones client. These cross-module cascades are gone after cache removal. Do not re-introduce them in any form:

```tsx
// ❌ BANNED: do not add cross-tab side effects to mutation handlers
const handleCreateTask = async () => {
  // ...
  router.refresh(); // ❌ refreshes current tab — fine
  // Do NOT also refresh milestones, board from notes, etc.
};
```

Fresh-on-entry handles cross-tab consistency. When the user navigates to milestones after creating tasks on the board, the milestones page fetches fresh data from the server. No explicit invalidation needed.

### BANNED: `router.refresh()` after note save while editor is mounted

```tsx
// ❌ BANNED: will re-mount the rich text editor, discarding in-flight edits
const handleSave = async () => {
  await updateNote(noteId, { title, content });
  router.refresh(); // re-mounts editor — user loses cursor position and possibly content
};

// ✅ CORRECT: use returned data to update local state
const handleSave = async () => {
  const { data, error } = await updateNote(noteId, { title, content });
  if (error) {
    showError(error);
    return;
  }
  setLastSaved(data.updated_at); // update "last saved" indicator only
  // editor keeps its state — no re-mount
};
```

---

## 5. Implementation Order Adjustment

The original plan treated all tabs as equivalent and ordered them by complexity. This revision groups tabs by interaction frequency and ensures high-interaction tabs are converted with proper optimistic UI, not naïve refresh.

### Tier 1 — Low interaction / read-mostly (convert first, `router.refresh()` acceptable)

These tabs have very infrequent mutations or no mutations at all. Converting them first gives quick wins with no UX risk.

| Phase   | Modules              | Mutation frequency                                             | Strategy                                                                      |
| ------- | -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Phase 2 | ContextLayoutWrapper | No mutations                                                   | Props pass-through                                                            |
| Phase 3 | Calendar             | No mutations                                                   | Direct server calls for month nav, no refresh needed                          |
| Phase 4 | Ideas, Owner         | Low (weekly)                                                   | `router.refresh()` acceptable; optimistic preferred                           |
| Phase 5 | Team                 | Low (daily at most); permission edits are correctness-critical | `router.refresh()` for permission changes; optimistic for invite/remove       |
| Phase 6 | Milestones           | Low (weekly)                                                   | Optimistic for delete/title updates; `router.refresh()` acceptable for create |

### Tier 2 — Medium interaction (convert second, optimistic for core operations)

These tabs have regular mutations. Refresh is noticeable but not a constant annoyance.

| Phase    | Modules     | Key requirement                                                       |
| -------- | ----------- | --------------------------------------------------------------------- |
| Phase 7  | Budgets     | Optimistic delete, `router.refresh()` acceptable for create/duplicate |
| Phase 8  | Media       | Optimistic upload placeholder + delete                                |
| Phase 9  | Note Detail | Optimistic save (NO `router.refresh()` — editor re-mount risk)        |
| Phase 10 | Billings    | Optimistic add/update/delete with client join resolution              |

### Tier 3 — High interaction (convert last, full optimistic UI required)

These tabs have mutations that happen multiple times per minute. Any visible latency or skeleton flash is unacceptable.

| Phase    | Modules   | Key requirement                                                         |
| -------- | --------- | ----------------------------------------------------------------------- |
| Phase 11 | Todos     | Toggle MUST be optimistic — this is the highest-frequency interaction   |
| Phase 12 | Notes     | Optimistic add/delete/move; verify action return contracts              |
| Phase 13 | Links     | Optimistic add/delete/pin/archive                                       |
| Phase 14 | Documents | Optimistic upload placeholder + delete                                  |
| Phase 15 | Board     | Already optimistic — only remove cache references (simplest conversion) |

### Final cleanup

| Phase    | Action                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Phase 16 | Copilot — remove `invalidateProject` call                                    |
| Phase 17 | Delete `ContextDataCache.tsx`, remove provider from `app/context/layout.tsx` |

---

## 6. Realtime Readiness Contract

Every `*Client.tsx` after conversion must follow this shape to ensure Supabase Realtime can be dropped in without structural changes:

```tsx
export default function ContextNotesClient({
  projectId,
  initialNotes,
  initialFolders,
}: Props) {
  // ── Local state initialised from server props ──────────────────────────────
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [folders, setFolders] = useState<NoteFolder[]>(initialFolders);

  // ── Realtime subscription slot (empty until Realtime phase) ───────────────
  // useEffect(() => {
  //   const channel = supabase
  //     .channel(`notes:${projectId}`)
  //     .on('postgres_changes', { event: '*', schema: 'public', table: 'notes',
  //         filter: `project_id=eq.${projectId}` },
  //       (payload) => { /* reconcile setNotes */ })
  //     .subscribe();
  //   return () => { supabase.removeChannel(channel); };
  // }, [projectId]);

  // ── Mutation handlers (optimistic) ────────────────────────────────────────
  const handleCreate = async (formData: FormData) => {
    const optimisticId = crypto.randomUUID();
    const optimisticNote = buildOptimisticNote(optimisticId, formData);
    setNotes((prev) => [optimisticNote, ...prev]);

    const { data, error } = await createNote(formData);
    if (error) {
      setNotes((prev) => prev.filter((n) => n.id !== optimisticId)); // rollback
      // show error
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === optimisticId ? data : n))); // reconcile
  };

  const handleDelete = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id)); // optimistic remove
    const { error } = await deleteNote(id);
    if (error) {
      // rollback: refetch or re-add from snapshot
      router.refresh(); // fallback only
    }
  };

  // ...
}
```

**Three hard rules for Realtime readiness:**

1. **Local state is the single source of truth while the user is in the tab.** It is initialised from server props once and then owned by the client.
2. **The Realtime subscription slot is a commented `useEffect` block** placed immediately after state declarations. When Realtime is implemented, uncomment and fill it in — no restructuring required.
3. **Mutation handlers update local state directly.** They do not trigger page navigation or re-fetching from the server on the happy path. This means the Realtime subscription can later replace optimistic updates transparently.

---

## 7. Implementation Review Checklist

Run this checklist before marking any module's cache removal as complete.

### Data loading

- [ ] `page.tsx` fetches all data the Client needs using `await` / `Promise.all` in the server component
- [ ] A `loading.tsx` exists in the same directory and renders the appropriate skeleton
- [ ] The `*FromCache.tsx` file is deleted
- [ ] The `*Client.tsx` no longer imports `useContextDataCache`
- [ ] The `*Client.tsx` no longer accepts `onRefresh` prop
- [ ] Initial data flows from `page.tsx` → `*Client.tsx` as props → `useState(initialData)`

### Mutation handlers

- [ ] Every mutation that returns an entity uses that entity to update local state (not a full refresh)
- [ ] Every delete mutation removes the item from local state by ID before or immediately after the server call
- [ ] Toggle mutations (Todos) update local state before the server call and reconcile after
- [ ] `router.refresh()` is only called in: error recovery branches, infrequent admin operations (Team permission edits), and never after a successful optimistic update
- [ ] No `router.refresh()` call appears inside a `useEffect`
- [ ] No cross-module side effects exist in any mutation handler

### Server action contracts

- [ ] Every `create*` action that has an optimistic counterpart returns `{ data: <entity> }`
- [ ] Every `update*` action that has an optimistic counterpart returns `{ data: <entity> }`
- [ ] Note Detail: `updateNote` does NOT trigger a page re-fetch — local state update only
- [ ] Todos: `toggleTodoItem` RPC returns the updated `TodoItem` row (not just `{ success }`)

### Realtime readiness

- [ ] Local state is initialised from props once: `useState(initialData)`
- [ ] A commented Realtime subscription slot exists in the `useEffect` section
- [ ] No data is fetched inside a `useEffect` on mount (initial data always comes from server props)
- [ ] Mutation handlers update `set*` state functions directly — they do not re-fetch from server on happy path

### Cascade prevention

- [ ] No mutation handler in Tab X calls `router.refresh()` from a component that belongs to Tab Y
- [ ] No event bus, shared context, or global state is used to trigger refreshes across tabs
- [ ] The `invalidateProject` call in `ContextCopilotClient` is removed

### Infrastructure

- [ ] (Final phase only) `ContextDataCache.tsx` is deleted
- [ ] (Final phase only) `ContextDataCacheProvider` is removed from `app/context/layout.tsx`
- [ ] (Final phase only) `grep -r "useContextDataCache" app/ components/` returns zero matches
- [ ] (Final phase only) `grep -r "ContextDataCache" app/ components/ lib/` returns zero matches
