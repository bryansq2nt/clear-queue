# Audit: Notes — Toast, cache, move feature (achieved) and open bugs

**Date:** 2026-02-24  
**Purpose:** Document what was implemented (toast, cache, move notes) and describe the current bugs in enough detail for another agent (e.g. Claude Code) to fix them without re-breaking the feature.

---

## Part 1 — What we achieved (feature summary)

### 1.1 Global action toast (context React)

- **Location:** `components/shared/ActionToastProvider.tsx`, provided in `app/layout.tsx` (inside `I18nProvider`).
- **API:** `useActionToast()` returns `{ showActionToast, dismiss }`.
  - `showActionToast({ message, primaryAction?, undoAction? })`.
  - `primaryAction`: `{ label, href?, onClick? }` — "Ir" uses `href` (navigates with `router.push(href)`), or `onClick` if no href.
  - `undoAction`: `{ label, onUndo }` — "Deshacer" runs `onUndo` then dismisses.
- **Behaviour:** Single toast only; a new `showActionToast` replaces the previous one and resets the 6s auto-dismiss timer. No multiple toasts; one bulk action = one toast.
- **i18n:** `toast.go`, `toast.undo`, `notes.notes_moved_to` (with `{ count, folderName }`).

### 1.2 Notes URL and folder state

- **URL:** `app/context/[projectId]/notes` accepts `searchParams.folderId`.
  - `page.tsx` reads `searchParams.folderId` and passes it as `initialFolderId` to `ContextNotesFromCache` → `ContextNotesClient`.
- **State sync:** In `ContextNotesClient`, `selectedFolderId` is initialised from `initialFolderId` and kept in sync via:
  ```ts
  useEffect(() => {
    if (initialFolderId === undefined) return;
    setSelectedFolderId(initialFolderId === 'root' ? 'root' : initialFolderId);
  }, [initialFolderId]);
  ```
- **Navigation:** "Volver a carpetas" does `router.replace(\`/context/${projectId}/notes\`)` so the grid has no `folderId` in the URL. Creating a folder does `router.replace(\`/context/${projectId}/notes?folderId=${folder.id}\`)`and invalidates notes + noteFolders cache (no`onRefresh()` to avoid a re-render with stale URL).

### 1.3 Session cache (notes tab)

- **Cache keys:** `{ type: 'notes', projectId }`, `{ type: 'noteFolders', projectId }` in `app/context/ContextDataCache.tsx`.
- **Flow:** `ContextNotesFromCache` uses `useContextDataCache()`; on cache hit it renders `ContextNotesClient` with cached `notes`/`folders` and `onRefresh={loadData}`; on miss it shows `SkeletonNotes`, fetches, sets cache, then renders the client. `loadData` invalidates both keys, fetches, sets cache and local state.
- **Invalidation:** After moving notes (undo path), after create-folder success, and when returning from note detail/back we invalidate these keys so that the next visit or re-render can refetch.

### 1.4 Move notes to folder (optimistic + toast)

- **Entry:** Multi-select in folder view → FAB menu (3 dots) or toolbar "Mover a carpeta (N)" → `MoveNotesToFolderDialog`. Current folder is excluded from the list (`currentFolderId` prop). From the dialog the user can also create a new folder and notes are moved there immediately (no second step).
- **Flow in `handleMoveToFolder` (ContextNotesClient):**
  1. Build `moved = [{ noteId, previousFolderId }]`.
  2. Optimistic update: `setNotes(...)` (assign `folder_id: targetFolderId` for selected ids), close dialog, exit selection mode.
  3. Show toast **immediately** with message, primaryAction `{ label: 'Ir', href: goHref }` (`/context/${projectId}/notes?folderId=${targetFolderId}` or `?folderId=root`), and undoAction that reverts state and runs `updateNote(..., { folder_id: previousFolderId })` in the background and invalidates cache.
  4. Server updates run in the background; on first failure we revert state, call `toastError`, and `dismiss()` the toast.
- **Undo:** Optimistic revert first (`setNotes`), then server revert in background; only cache invalidate (no `onRefresh()`) to avoid a visible "refresh" after undo.

### 1.5 Other behaviours

- Back from note detail / new note: "Volver a Notas" goes to the current folder URL (`?folderId=...` or root) and invalidates notes + noteFolders cache so the list is fresh.
- Select all: In selection mode, "Seleccionar todos" / "Quitar selección" toggles selection for all `filteredNotes`.

---

## Part 2 — Bugs (for another agent to fix)

### Bug A — Toast "Ir" button does nothing

**Observed:** After moving notes to another folder, the toast shows with "Ir" and "Deshacer". Clicking "Ir" has no effect (no navigation, or no visible change).

**Expected:** Clicking "Ir" should navigate to `/context/${projectId}/notes?folderId=${targetFolderId}` (or `?folderId=root`) so the user sees the destination folder.

**Relevant code:**

- **Toast handler:** `components/shared/ActionToastProvider.tsx`:

  ```ts
  const handlePrimary = useCallback(() => {
    if (!toast?.primaryAction) return;
    const { href, onClick } = toast.primaryAction;
    if (href) router.push(href);
    onClick?.();
    dismiss();
  }, [toast, router, dismiss]);
  ```

  So when `primaryAction.href` is set, `router.push(href)` is called, then `dismiss()`.

- **Where href is set:** `app/context/[projectId]/notes/ContextNotesClient.tsx` inside `handleMoveToFolder`:
  ```ts
  const goHref =
    targetFolderId == null
      ? `/context/${projectId}/notes?folderId=root`
      : `/context/${projectId}/notes?folderId=${targetFolderId}`;
  showActionToast({
    ...
    primaryAction: { label: t('toast.go'), href: goHref },
    ...
  });
  ```
  `projectId` and `targetFolderId` are in scope and correct at the time of the move.

**Possible causes to check:**

1. **Same URL:** If the user is already on `/context/${projectId}/notes?folderId=${targetFolderId}`, Next.js may treat `router.push(href)` as a no-op (same path + same query). Then "Ir" would do nothing visible. Fix idea: still update client state when the target URL is the same (e.g. read `window.location.search` and if it already matches, run the same sync as when `initialFolderId` changes), or use `router.replace(href)` and ensure the client syncs from URL.
2. **Router / tree:** Confirm `ActionToastProvider` is under the same Next.js layout that has the router so `useRouter()` is the correct one and navigation runs in the right context.
3. **Event / dismiss:** Confirm the button’s `onClick` is actually firing and that `dismiss()` is not preventing navigation (e.g. not closing the toast before `router.push` completes). Order is: `router.push(href)` then `onClick?.()` then `dismiss()` — if `router.push` is async and something in the tree unmounts or updates on dismiss, the navigation might be dropped. Consider calling `router.push(href)` and only calling `dismiss()` after a short delay or in a microtask so navigation is queued first.
4. **Stale closure:** `handlePrimary` depends on `[toast, router, dismiss]`. Ensure the `toast` object that holds `primaryAction.href` is the one from the last `showActionToast` and that `href` is a string (e.g. log `toast?.primaryAction?.href` in `handlePrimary` when the button is clicked).

**Suggested checks:** Add a temporary `console.log(toast?.primaryAction?.href)` and `console.log(router)` in `handlePrimary` on click; confirm in the UI that the address bar URL is not already equal to that href when "Ir" is clicked.

---

### Bug B — After creating a folder, the wrong folder opens (e.g. folder 7 instead of new folder 12)

**Observed:** User was in folder 6, moved notes to folder 7. Then went back to the folder grid and created folder 12. Right after creation, the view opens a folder but shows folder 7 (the last move destination) instead of folder 12 (the newly created folder).

**Expected:** Right after creating folder 12, the view should show folder 12 (the newly created folder), not folder 7.

**Relevant code:**

- **Create folder success:** `app/context/[projectId]/notes/ContextNotesClient.tsx`:

  ```ts
  const handleCreateFolderSuccess = (folder: NoteFolder) => {
    setFolders((prev) =>
      [...prev, folder].sort((a, b) => a.sort_order - b.sort_order)
    );
    setSelectedFolderId(folder.id);
    router.replace(`/context/${projectId}/notes?folderId=${folder.id}`);
    cache.invalidate({ type: 'notes', projectId });
    cache.invalidate({ type: 'noteFolders', projectId });
  };
  ```

  So we set client state to the new folder and replace the URL with `?folderId=${folder.id}`; we do **not** call `onRefresh()` to avoid a re-render with stale `initialFolderId`.

- **Where initialFolderId comes from:** Server component `app/context/[projectId]/notes/page.tsx`:

  ```ts
  const folderId = searchParams.folderId ?? undefined;
  return (
    <ContextNotesFromCache projectId={projectId} initialFolderId={folderId} />
  );
  ```

  So `initialFolderId` is whatever the **server** saw in `searchParams` when the page was rendered.

- **Sync from URL:** In `ContextNotesClient`, the effect that can overwrite `selectedFolderId`:
  ```ts
  useEffect(() => {
    if (initialFolderId === undefined) return;
    setSelectedFolderId(initialFolderId === 'root' ? 'root' : initialFolderId);
  }, [initialFolderId]);
  ```

**Likely cause:** After moving notes to folder 7, the user may have navigated to folder 7 (e.g. by clicking "Ir" in the toast) or the URL was updated to `?folderId=7`. Then they clicked "Volver a carpetas", which does `router.replace(\`/context/${projectId}/notes\`)`(no`folderId`). In Next.js App Router, client-side navigation and RSC payloads can be cached or batched. So when we then create folder 12 and call `router.replace(...?folderId=12)`:

- The client updates `selectedFolderId` to 12 and requests a new RSC for `?folderId=12`.
- If the **cached** RSC for the notes page is still the one that had `searchParams.folderId = 7` (e.g. because the cache key is pathname-only or the new request hasn’t completed), the tree that re-renders might still receive `initialFolderId = 7` from the server.
- The useEffect above then runs with `initialFolderId === '7'` and overwrites `selectedFolderId` to 7.

So the bug is probably a **race or cache**: the server-supplied `initialFolderId` (7) overwrites the client’s correct `selectedFolderId` (12) after create.

**Possible fixes to try:**

1. **Skip sync when we just created a folder:** Use a ref, e.g. `const lastCreatedFolderIdRef = useRef<string | null>(null)`. In `handleCreateFolderSuccess`, set `lastCreatedFolderIdRef.current = folder.id` before `router.replace`. In the useEffect, if `initialFolderId !== lastCreatedFolderIdRef.current` and `lastCreatedFolderIdRef.current !== null`, trust the client and set `selectedFolderId(lastCreatedFolderIdRef.current)` (or keep current state) and clear the ref; otherwise run the existing sync. This way one-off “we just created this folder” is not overwritten by stale `initialFolderId`.
2. **Don’t overwrite when state already matches the intended folder:** If we have a “pending” folder id (e.g. we just set it in `handleCreateFolderSuccess`), in the useEffect only apply `initialFolderId` when it’s not clearly stale (e.g. when it matches the folder we just created, or when we’re not in a “just created” window).
3. **Force a full navigation or re-fetch for the new URL:** After `router.replace(...?folderId=12)`, ensure the notes page is re-fetched with the new searchParams (e.g. so the server returns `initialFolderId=12`). This might require checking Next.js behaviour for soft navigation and query changes (e.g. whether replacing only the query string triggers a new RSC payload and whether that payload is cached by pathname only).
4. **Don’t rely on server for post-create:** After creating a folder, avoid depending on `initialFolderId` for that render. For example, only run the useEffect when `initialFolderId` is “authoritative” (e.g. from an actual navigation event), and treat “we just called handleCreateFolderSuccess” as authoritative for one render cycle (ref-based guard above).

**Suggested checks:** Log `initialFolderId` in the notes page (server) and in `ContextNotesClient` (client) on every render. Create folder 12 and see what `initialFolderId` the client receives on the next render; if it’s still 7, that confirms the stale-server/cache hypothesis.

---

## Part 3 — File reference

| Area                         | File(s)                                                   |
| ---------------------------- | --------------------------------------------------------- |
| Toast provider               | `components/shared/ActionToastProvider.tsx`               |
| Layout (provider)            | `app/layout.tsx`                                          |
| Notes page                   | `app/context/[projectId]/notes/page.tsx`                  |
| FromCache                    | `app/context/[projectId]/notes/ContextNotesFromCache.tsx` |
| Client (state, move, create) | `app/context/[projectId]/notes/ContextNotesClient.tsx`    |
| Move dialog                  | `components/context/notes/MoveNotesToFolderDialog.tsx`    |
| Cache types                  | `app/context/ContextDataCache.tsx`                        |

---

## Part 4 — Definition of done for the fix

- **Bug A:** Clicking "Ir" in the toast after moving notes navigates to the destination folder and the view shows that folder (or, if already on that URL, the view still shows that folder without flicker).
- **Bug B:** After creating a new folder, the opened view shows the newly created folder, not the folder that was last used as a move destination (or any other stale folder).
- No regressions: move (optimistic + toast + undo), cache invalidation, “Volver a carpetas” and “Volver a Notas” behaviour, and create-folder flow (without onRefresh) still work as described in Part 1.
