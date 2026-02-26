# Documents Hub — Notes-Feature Parity Design

_Date: 2026-02-25_

## Scope

Bring the following Notes-module capabilities into the Documents Hub, without changing how the document list is rendered (DocumentRow layout stays unchanged).

| #   | Feature                                                                          |
| --- | -------------------------------------------------------------------------------- |
| 1   | Recently-opened widget: dismiss persists until a new document is opened          |
| 2   | Create folder → immediately open it                                              |
| 3   | Folder multi-select + bulk delete with two-step confirmation                     |
| 4   | Document multi-select + move to folder, with optimistic UI, Undo toast, Go toast |
| 5   | Cache workflow alignment (explicit invalidation on critical mutations)           |

---

## Audit Summary

### What Documents already has

- Folder grid view + inside-folder view
- Recently-opened widget (no persistence)
- `CreateFolderDialog` (but stays on current view after create)
- `getDocuments`, `updateDocument`, `touchDocument` in `app/actions/documents.ts`
- `listFolders`, `createFolder`, `deleteFolder` (single) in `app/actions/document-folders.ts`
- Cache keys `{ type: 'documents', projectId }` and `{ type: 'documentFolders', projectId }`
- `useActionToast` is already imported in `ContextDocumentsClient.tsx`

### What is missing (gaps)

- `dismissedAt` sessionStorage persist on recently-opened dismiss
- Folder selection mode + `deleteFolders(projectId, folderIds[])` action
- `DeleteFoldersConfirmDialog` component
- Document selection mode + move handler + optimistic UI
- `MoveDocumentsToFolderDialog` component
- Undo toast for moves
- Go toast action for moves
- Cache.invalidate() calls before critical refetches (currently background-refresh only)
- `selectedFolderId` set immediately after folder creation

---

## Phase 1 — Recently-Opened Dismiss (sessionStorage persist)

**Goal:** When the user dismisses the recently-opened widget it stays gone until they open a document after the dismiss.

### Files changed

| File                                                           | Change                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `app/context/[projectId]/documents/ContextDocumentsClient.tsx` | Replace boolean show-flag with `dismissedAt` + sessionStorage |

### Logic

```
dismissedAt: number | null     (null = never dismissed)

useEffect on mount:
  read sessionStorage['cq-docs-dismissed-${projectId}']
  if present → setDismissedAt(parseInt(stored))

recentDocsFiltered = useMemo:
  if dismissedAt === null → return recentDocs (all)
  else → return recentDocs.filter(d =>
    d.last_opened_at != null &&
    new Date(d.last_opened_at).getTime() > dismissedAt
  )

handleDismissRecentDocs():
  now = Date.now()
  setDismissedAt(now)
  sessionStorage.setItem('cq-docs-dismissed-${projectId}', String(now))

Widget condition: recentDocsFiltered.length > 0 (no extra boolean flag)
```

### New i18n keys

None — `documents.recently_opened_section` and a dismiss aria-label key already exist or will reuse existing.
Check: `documents.dismiss_recently_opened` — add if missing.

---

## Phase 2 — Create Folder → Open It

**Goal:** After `CreateFolderDialog` succeeds, navigate into the new folder immediately (same as Notes).

### Files changed

| File                                                           | Change                                      |
| -------------------------------------------------------------- | ------------------------------------------- |
| `app/context/[projectId]/documents/ContextDocumentsClient.tsx` | Update `handleCreateFolderSuccess` callback |

### Logic

```
handleCreateFolderSuccess(folder: DocumentFolder):
  setFolders(prev => [...prev, folder].sort(by sort_order))
  setSelectedFolderId(folder.id)
  cache.invalidate({ type: 'documentFolders', projectId })
  // Note: do NOT call cache.invalidate('documents') here so the user
  // does not see a skeleton flicker — the empty folder view is correct.
```

No new action needed — `createFolder` already returns the created folder row.

No new i18n keys needed.

---

## Phase 3 — Folder Multi-Select + Bulk Delete

**Goal:** On the folder grid, user can enter a selection mode, tick folders, and delete them all in one two-step confirmation.

### Files changed

| File                                                           | Change                                      |
| -------------------------------------------------------------- | ------------------------------------------- |
| `app/actions/document-folders.ts`                              | Add `deleteFolders(projectId, folderIds[])` |
| `components/context/documents/DeleteFoldersConfirmDialog.tsx`  | New component                               |
| `app/context/[projectId]/documents/ContextDocumentsClient.tsx` | Folder selection state + handlers + JSX     |
| `locales/en.json`                                              | New `documents.*` keys (see below)          |
| `locales/es.json`                                              | Same keys in Spanish                        |

### New server action

```ts
// app/actions/document-folders.ts
export async function deleteFolders(
  projectId: string,
  folderIds: string[]
): Promise<{ success: boolean; error?: string }>;

// Implementation:
// - requireAuth()
// - validate projectId + folderIds (trim, non-empty)
// - single DELETE ... .in('id', validIds).eq('project_id', pid).eq('owner_id', user.id)
// - captureWithContext on error
// - revalidatePath('/context', 'layout') on success
```

### New component: DeleteFoldersConfirmDialog

Mirrors `components/context/notes/DeleteFoldersConfirmDialog.tsx` exactly, with props:

```
open: boolean
folderCount: number
isAllFolders: boolean   // true when every folder in the grid is selected
isDeleting: boolean
onConfirm: () => void
onCancel: () => void
```

Two-step flow:

- Step 1: warns documents move to "No folder"; if `isAllFolders` shows AlertTriangle banner
- Step 2: irreversible confirmation with destructive button

### New state vars in ContextDocumentsClient

```ts
folderSelectionMode: boolean;
selectedFolderIds: Set<string>;
isDeleteFoldersOpen: boolean;
isDeletingFolders: boolean;
```

### Handlers

```
exitFolderSelectionMode() — clear mode + ids
toggleFolderSelection(folderId) — toggle membership in Set
handleDeleteFolders() — call deleteFolders, optimistic remove folders + unassign docs, invalidate cache
```

### Optimistic update after delete

```
remove deleted folders from folders[] local state
update documents[]: set folder_id = null for any doc whose folder_id is in deletedSet
cache.invalidate({ type: 'documents', projectId })
cache.invalidate({ type: 'documentFolders', projectId })
```

### New i18n keys (documents namespace)

```
documents.folder_select_mode
documents.folder_selection_cancel
documents.folder_select_all
documents.folder_deselect_all
documents.folder_delete_selected      (interpolate {count})
documents.delete_folders_title        (interpolate {count})
documents.delete_folders_docs_warning
documents.delete_folders_all_warning
documents.delete_folders_continue
documents.delete_folders_final_title
documents.delete_folders_final_message  (interpolate {count})
documents.delete_folders_confirm
documents.delete_folders_deleting
documents.delete_folders_error
```

---

## Phase 4 — Document Multi-Select + Move + Undo + Go

**Goal:** Inside a folder view, user can enter selection mode, tick documents, and move them to another folder. The move is optimistic. A toast appears with a "Go" button (navigate to destination) and an "Undo" button (revert). Server writes happen in the background.

### Files changed

| File                                                           | Change                                         |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `components/context/documents/MoveDocumentsToFolderDialog.tsx` | New component                                  |
| `app/context/[projectId]/documents/ContextDocumentsClient.tsx` | Document selection state + move handler + undo |
| `locales/en.json`                                              | New `documents.*` keys                         |
| `locales/es.json`                                              | Same keys in Spanish                           |

### No new server action needed

The existing `updateDocument(fileId, { folder_id })` is used per-document in a background loop — same pattern as Notes uses `updateNote`. This is an accepted deviation from the atomicity rule because the optimistic UI + undo guarantees correctness from the user's perspective.

### New component: MoveDocumentsToFolderDialog

Mirrors `components/context/notes/MoveNotesToFolderDialog.tsx`, with props:

```
open: boolean
folders: DocumentFolder[]
selectedCount: number
projectId: string
currentFolderId: SelectedFolder
onClose: () => void
onMove: (targetFolderId: string | null) => void
onFolderCreated: (folder: DocumentFolder) => void
```

Shows a folder list (including "No folder") and lets user pick destination.

### New state vars in ContextDocumentsClient

```ts
selectionMode: boolean;
selectedDocumentIds: Set<string>;
isMoveDialogOpen: boolean;
isMoving: boolean; // reserved; moves are fire-and-forget, but kept for UI consistency
```

### Selection UI — does NOT modify DocumentRow

In selection mode, wrap each row in a `<div>` that adds a checkbox on the left. DocumentRow itself receives no new props. The approach:

```tsx
// selection mode: checkbox + row wrapper
<div key={doc.id} className="flex items-center gap-2">
  {selectionMode && (
    <input type="checkbox" checked={selected} onChange={...} />
  )}
  <div className="flex-1" onClick={() => selectionMode && toggleDocumentSelection(doc.id)}>
    <DocumentRow doc={doc} ... />
  </div>
</div>
```

This keeps DocumentRow's internal layout and event handlers fully intact.

### Move handler (optimistic + undo + go)

```
handleMoveToFolder(targetFolderId: string | null):
  snapshot: moved[] = selectedDocumentIds.map(id => ({ id, previousFolderId }))

  // Optimistic update
  setDocuments(prev => prev.map(d =>
    selectedDocumentIds.has(d.id) ? { ...d, folder_id: targetFolderId } : d
  ))
  setIsMoveDialogOpen(false)
  exitSelectionMode()

  // Toast
  showActionToast({
    message: t('documents.documents_moved_to', { count, folderName }),
    primaryAction: {
      label: t('toast.go'),
      href: goHref,
      onClick: () => setSelectedFolderId(targetFolderId ?? 'root'),
    },
    undoAction: {
      label: t('toast.undo'),
      onUndo: () => {
        // Revert state
        setDocuments(prev => revert using snapshot)
        // Confirmation toast
        showActionToast({ message: t('documents.move_undone') })
        // Background server reverts (no cache.invalidate — session cache already correct)
        void (async () => {
          for (const { id, previousFolderId } of moved)
            await updateDocument(id, { folder_id: previousFolderId })
        })()
      }
    }
  })

  // Background server writes
  void (async () => {
    for (const { id } of moved) {
      const { error } = await updateDocument(id, { folder_id: targetFolderId })
      if (error) {
        setDocuments(prev => revert)
        toastError(t('documents.move_error'))
        dismiss()
        return
      }
    }
  })()
```

### Toolbar in folder view (selection mode)

Follows Notes pattern: above the document list, show a selection toolbar when `selectionMode` is true:

- Cancel button
- Select all / Deselect all (acts on `filteredDocuments`)
- Move to folder button (opens `MoveDocumentsToFolderDialog`) — only when `selectedDocumentIds.size > 0`

The FAB button stays as Upload (no change) because moves are in-list, not floating.

### New i18n keys (documents namespace)

```
documents.select
documents.cancel_selection
documents.select_all
documents.deselect_all
documents.move_to_folder
documents.documents_moved_to    (interpolate {count}, {folderName})
documents.multi_actions
documents.move_error
documents.move_undone
documents.dismiss_recently_opened   (if not already present)
```

---

## Phase 5 — Cache Workflow Alignment

**Goal:** Ensure all mutations in the documents module use explicit `cache.invalidate()` before refetching, matching the Notes pattern.

### ContextDocumentsFromCache.tsx changes

Current `loadData()` does a background fetch without invalidation. Change it to:

```
loadData():
  cache.invalidate({ type: 'documents', projectId })
  cache.invalidate({ type: 'documentFolders', projectId })
  // then fetch and cache.set as before
```

This means refetches show the `SkeletonDocuments` briefly, which is the correct behavior (avoids stale data flash).

### When to invalidate in ContextDocumentsClient

| Event              | Invalidate                                                                             |
| ------------------ | -------------------------------------------------------------------------------------- |
| Upload success     | `documents` (caller does this via `onRefresh`)                                         |
| Edit success       | `documents` (optimistic state is sufficient; invalidate on next refresh)               |
| Folder creation    | `documentFolders` only                                                                 |
| Folder bulk delete | `documents` + `documentFolders`                                                        |
| Document move      | NO invalidation — optimistic state is already correct; undo does not invalidate either |
| Archive / delete   | `documents` (small list mutation, no optimistic needed)                                |

---

## Execution Order

```
Phase 1  (isolated, low risk)   — Recently-opened dismiss persist
Phase 2  (isolated, low risk)   — Create folder → open it
Phase 3  (medium, new action)   — Folder multi-select + bulk delete
Phase 4  (complex, no new action) — Document multi-select + move + undo + go
Phase 5  (refactor, low logic)  — Cache workflow alignment
```

Phases 1 and 2 can be done in a single pass (both touch only `ContextDocumentsClient.tsx`).

---

## Files to Create (new)

```
components/context/documents/DeleteFoldersConfirmDialog.tsx
components/context/documents/MoveDocumentsToFolderDialog.tsx
```

## Files to Modify

```
app/actions/document-folders.ts                  (add deleteFolders)
app/context/[projectId]/documents/ContextDocumentsFromCache.tsx  (cache invalidation)
app/context/[projectId]/documents/ContextDocumentsClient.tsx     (all phases)
locales/en.json
locales/es.json
```

## Files NOT to touch

```
components/context/documents/DocumentRow.tsx     (user asked to keep list view as-is)
app/actions/documents.ts                         (updateDocument already sufficient)
```

---

## Definition of Done

- [ ] Dismiss persists across navigation; widget reappears only for docs opened after dismiss
- [ ] Creating a folder immediately opens it
- [ ] Folder grid shows Select mode button; folders can be multi-checked and deleted with two-step confirm
- [ ] Inside a folder, Select mode adds checkboxes; selected docs can be moved with optimistic update
- [ ] Move toast shows Go (navigates to destination folder) and Undo (reverts optimistic state)
- [ ] Cache invalidated correctly (no stale data after mutations)
- [ ] `npm run lint`, `npx tsc --noEmit` pass clean
- [ ] DocumentRow component unchanged
