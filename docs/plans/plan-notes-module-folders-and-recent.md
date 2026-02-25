# Plan: Notes Module — Folders + Recently Opened

**Date:** 2026-02-24  
**Status:** Ready for execution  
**Scope:** Notes tab in project context (`/context/[projectId]/notes`): add recently opened widget and folder workflow; keep existing note card grid when viewing a folder.

**Reference:** Documents module workflow (`ContextDocumentsClient.tsx`, `ContextDocumentsFromCache.tsx`, `app/actions/document-folders.ts`).

---

## 1. Current state

### Schema (`notes`)

| Column     | Type        | Notes         |
| ---------- | ----------- | ------------- |
| id         | uuid        | PK            |
| owner_id   | uuid        | FK auth.users |
| project_id | uuid        | FK projects   |
| title      | text        | NOT NULL      |
| content    | text        | NOT NULL      |
| created_at | timestamptz | NOT NULL      |
| updated_at | timestamptz | NOT NULL      |

- No `folder_id`. No `last_opened_at`. Notes are flat per project.

### UI today

- **Notes tab:** Single view — grid of note cards (title, `updated_at`, dropdown: View / Edit / Delete). FAB “New note”. No folders, no “recently opened”.
- **Loading:** `ContextNotesFromCache` shows `SkeletonNotes` on cache miss; `ContextNotesClient` shows `t('common.loading')` during refresh (should remain minimal; no full-page spinner).

### Data flow

- `ContextNotesFromCache`: cache key `{ type: 'notes', projectId }`, loads via `getNotes({ projectId })`, passes `initialNotes` + `onRefresh` to `ContextNotesClient`.
- No folder data or cache key.

---

## 2. Objectives

1. **Same workflow as Documents (top-level):**
   - **Landing view:** “Recently opened” widget (top N notes by open time) + **folder grid** (card “Sin carpeta” + one card per folder).
   - **Folder selected:** Back button, folder title, then **content area**.

2. **Content inside a folder:**
   - **Do not** replicate the documents “item list” (row list).
   - **Keep** the existing **notes card grid** (same component: title, updated_at, dropdown, click → detail). Only the **data** is scoped by selected folder (and “root” = notes with no folder).
   - **Required:** **Search/filter inside folder** — when viewing a folder, show a search input that filters notes by title (and optionally content) in memory; “Clear filters” when query is non-empty. Same UX pattern as documents (search bar + clear), but notes only need text search (no category/tags unless added later).

3. **Recently opened:**
   - When no folder is selected, show a “Recently opened” section with up to N notes (e.g. 5), sorted by `last_opened_at` (then `updated_at`).
   - Tapping a note opens the detail and updates “recent” (touch on view).

4. **Folders:**
   - Project-scoped note folders (mirror document folders): table `project_note_folders`, optional `notes.folder_id`.
   - CRUD for folders; list folders; filter notes by folder in UI.

5. **Rules:**
   - Follow AGENTS.md, CONVENTIONS.md, `docs/patterns/` (data-loading, server-actions, context-session-cache).
   - No `router.refresh()` for tab updates; use returned data or `onRefresh`.
   - Shimmer skeletons for loading; no spinners or “Loading…” for initial load.
   - Context tab initial load ≤ 3 DB round trips.

---

## 3. Specifications

### 3.1 Schema

**New table: `project_note_folders`**

- Mirror `project_document_folders`:  
  `id`, `project_id`, `owner_id`, `name`, `sort_order`, `created_at`, `updated_at`.
- RLS: all policies by `owner_id`.
- Indexes: `(project_id, sort_order, name)`, `(owner_id, created_at DESC)`.
- `updated_at` trigger.

**Changes to `notes`**

- `folder_id uuid NULL REFERENCES project_note_folders(id) ON DELETE SET NULL`.
- Index: `(project_id, folder_id, updated_at DESC)` (or equivalent for list by folder).
- `last_opened_at timestamptz NULL` — set when user opens a note (detail view) for “recently opened” ordering.

**Migration**

- New migration file: `supabase/migrations/YYYYMMDDHHMMSS_note_folders_and_last_opened.sql`.
- Create `project_note_folders`; alter `notes` add `folder_id` and `last_opened_at`; indexes; RLS; trigger.
- Regenerate or extend Supabase types if needed.

### 3.2 Server actions

**New module: `app/actions/note-folders.ts`**

- Mirror `app/actions/document-folders.ts`:
  - `listFolders(projectId)` — cacheable, returns folders for project.
  - `getFolderForProject(folderId, projectId)`.
  - `createFolder(projectId, name)`.
  - `updateFolder(folderId, { name?, sort_order? })`.
  - `deleteFolder(folderId)`.
- All scoped by `owner_id` and `project_id`. Explicit column lists; `revalidatePath` after mutations.
- Use `captureWithContext` on error paths.

**Updates: `app/actions/notes.ts`**

- **getNotes:** Already project-scoped. Optionally extend to accept `folderId?: string | null` (null = only root, undefined = all). For this plan, **client can filter in memory** from full project notes to respect “≤3 round trips” (load notes + folders in same tab load). So: keep `getNotes({ projectId })` returning all notes for the project; client filters by `folder_id` for selected folder / root.
- **touchNote(noteId):** New. Sets `last_opened_at = now()` for the note; scoped by `owner_id`. Called when user opens note detail (from context notes tab or detail page). Return updated note or void.
- **createNote:** Add optional `folder_id` to params; include in insert.
- **updateNote:** Allow updating `folder_id` (move note to folder).
- Ensure all selects use explicit column lists (no `*`).
- Revalidate paths: `/context`, `/context/[projectId]`, `/context/[projectId]/notes`.

**Detail page:** When opening a note from the context notes tab (or from URL), call `touchNote(noteId)` so “recently opened” stays correct. Prefer doing this in the detail page/layout or in a small client effect so the tab doesn’t need to know.

### 3.3 Context cache

**Cache keys** (in `app/context/ContextDataCache.tsx`)

- Add: `| { type: 'noteFolders'; projectId: string }`.
- Existing `notes` key unchanged.

**ContextNotesFromCache**

- On cache miss: fetch **notes** and **note folders** in parallel (e.g. `Promise.all([getNotes({ projectId }), listFolders(projectId)])`).
- Set both cache keys; pass `initialNotes`, `initialFolders`, `onRefresh` to `ContextNotesClient`.
- Loading: keep `SkeletonNotes`. Optionally extend skeleton later to suggest “recently opened” + folder grid (e.g. first block + grid of placeholders); not required for MVP.
- `onRefresh`: invalidate both keys, refetch both, set cache, update state.

**ContextNotesClient**

- **State:**
  - `selectedFolderId: null | 'root' | string` (null = folder grid view, 'root' = no folder, string = folder id).
  - `notes`, `folders` from props; sync from `initialNotes` / `initialFolders` in effect.
- **Landing (selectedFolderId === null):**
  - **Recently opened:** Top N notes by `last_opened_at ?? updated_at`, same card style as current (or compact list like documents recently opened). Click → navigate to note detail; call `touchNote` (or rely on detail page to call it).
  - **Folder grid:** “Sin carpeta” card (count = notes where `folder_id` is null) + one card per folder (count = notes where `folder_id` = id). “New folder” button → CreateFolderDialog (new component, mirror CreateFolderDialog for documents).
- **Inside folder (selectedFolderId !== null):**
  - Back button → set `selectedFolderId` to null, clear any local filter state.
  - Folder title (for 'root' use i18n “Sin carpeta”).
  - **Search/filter (required):** When inside a folder, show a search bar (e.g. placeholder “Search notes”). Filter notes in memory by `title` and optionally `content` (trimmed, case-insensitive). Show “Clear filters” button when `searchQuery` is non-empty.
  - **Content:** Render the **existing notes card grid** (same grid and card component as today), with `notes` filtered by folder then by search:
    - Folder: `selectedFolderId === 'root'` → `note.folder_id == null`; `selectedFolderId === id` → `note.folder_id === id`.
    - Then apply search filter on title/content.
  - Empty state: same as today (“No notes yet” + link to new note); when search is active and no matches, show “No notes match your search” + clear button.
  - FAB “New note”: keep; when creating a note from inside a folder, pass current `selectedFolderId` (if not 'root') as `folder_id`.
- **New note / Edit note:** Support `folder_id` in create and update (dropdown or default from current folder).

### 3.4 UI components

- **CreateFolderDialog (notes):** New component under `components/context/notes/` or reuse a generic folder dialog. Same pattern as `components/context/documents/CreateFolderDialog.tsx` but for note folders (projectId, listFolders/createFolder from note-folders actions).
- **Notes card grid:** Keep current implementation (grid of cards with title, date, dropdown).
- **Search/filter inside folder (required):** Search input + clear button when inside a folder; filter by title (and content) in memory. Reference: documents search bar in `ContextDocumentsClient.tsx` (lines ~384–413).
- **Recently opened block:** Markup similar to documents: section title, list of up to N note cards or compact rows; click → detail; optionally call `touchNote` on open (or in detail page).
- **SkeletonNotes:** Keep; optionally add a variant or extra block for folder-grid view (not blocking).

### 3.5 i18n

- Add keys (or reuse from documents where appropriate): e.g. `notes.recently_opened_section`, `notes.folders_section`, `notes.folder_no_folder`, `notes.notes_count`, `notes.new_folder`, `notes.back_to_folders`, `notes.search_placeholder`, `notes.clear_filters`, `notes.no_notes_match`.
- Reuse documents pattern for counts: e.g. “X notes” / “X documentos”.

### 3.6 Note detail and touch

- When user opens a note (from notes tab or from URL), ensure `touchNote(noteId)` is called once so `last_opened_at` is updated.
- Preferred: call from note detail page/layout (server or client) so any entry point (tab, link, bookmark) updates recent.
- Alternative: call from `ContextNotesClient` when navigating to detail (e.g. in click handler).
- Do not open a blank window and navigate after async (see AGENTS.md 1b); not applicable here (we only navigate with router).

---

## 4. Execution order

| Phase | Task                                                                                           | Files / artifacts                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1     | Migration: note folders table + notes.folder_id + notes.last_opened_at                         | `supabase/migrations/YYYYMMDDHHMMSS_note_folders_and_last_opened.sql`                                  |
| 2     | Regenerate Supabase types if needed                                                            | `lib/supabase/types.ts` (or project script)                                                            |
| 3     | Note-folders actions                                                                           | `app/actions/note-folders.ts` (new)                                                                    |
| 4     | Notes actions: touchNote, createNote/updateNote folder_id                                      | `app/actions/notes.ts`                                                                                 |
| 5     | Cache key for noteFolders                                                                      | `app/context/ContextDataCache.tsx`                                                                     |
| 6     | CreateFolderDialog for notes                                                                   | `components/context/notes/CreateFolderDialog.tsx` (or shared)                                          |
| 7     | ContextNotesFromCache: load folders + notes, pass to client                                    | `app/context/[projectId]/notes/ContextNotesFromCache.tsx`                                              |
| 8     | ContextNotesClient: recently opened + folder grid + folder view with card grid + search/filter | `app/context/[projectId]/notes/ContextNotesClient.tsx`                                                 |
| 9     | Note detail: call touchNote on open                                                            | `app/context/[projectId]/notes/[noteId]/` (detail client or page)                                      |
| 10    | i18n keys                                                                                      | Locale files / I18nProvider keys                                                                       |
| 11    | New note default folder                                                                        | ContextNewNoteClient (or new-note action) — default folder_id from current folder when opened from tab |

---

## 5. Reference implementations

| Area                             | Reference                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Folder CRUD + list               | `app/actions/document-folders.ts`                                                 |
| Documents tab workflow           | `app/context/[projectId]/documents/ContextDocumentsClient.tsx`                    |
| Documents cache + two keys       | `app/context/[projectId]/documents/ContextDocumentsFromCache.tsx`                 |
| Recently opened + folder grid UI | `ContextDocumentsClient.tsx` (lines ~264–356)                                     |
| Create folder dialog             | `components/context/documents/CreateFolderDialog.tsx`                             |
| Notes card grid (keep as-is)     | `ContextNotesClient.tsx` (grid + card markup)                                     |
| Touch document                   | `app/actions/documents.ts` (`touchDocument`), usage in DocumentRow / open handler |

---

## 6. Testing and definition of done

- **Lint/build:** `npm run lint`, `npm run build` pass.
- **Unit:** Any new domain logic in `lib/` has Vitest tests; new actions can have integration tests if desired.
- **E2E:** At least one Playwright happy path: open context notes tab → see recently opened (if any) and folder grid → open a folder → see notes grid → open a note → back; create folder; create note in folder.
- **Rules:** No client Supabase in components; explicit selects; revalidatePath after mutations; no `router.refresh()` for tab data; loading = shimmer where applicable; `touchNote` called on note open.
- **Performance:** Notes tab initial load ≤ 3 DB round trips (e.g. notes + folders = 2).

---

## 7. Risks and follow-ups

- **Risks:** Migration adds columns and table; existing notes get `folder_id = null`, `last_opened_at = null` (both fine).
- **Follow-ups:** Optional SkeletonNotes variant for folder-grid view; consider “recently updated” as fallback label if we ever don’t persist `last_opened_at`.
