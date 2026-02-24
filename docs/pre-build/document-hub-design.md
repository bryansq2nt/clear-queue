# Document Hub — Module Design Document

**Version:** 1.0  
**Status:** Ready for implementation  
**Reference module:** Notes (`app/context/[projectId]/notes/`)  
**Route:** `app/context/[projectId]/documents/`

---

## 1. Overview

Document Hub is a project-scoped file management module that lives inside the Context tab system. It allows users to upload, organize, preview, and manage documents associated with a specific project. Every document belongs to one project and one owner. The module follows the established Notes pattern exactly: server page → `*FromCache` → `*Client`, with session cache, server actions, and RLS enforcement.

---

## 2. Features

### 2.1 Document List

- Displays all non-archived documents for the current project.
- Sorted by `last_opened_at DESC NULLS LAST`, then `created_at DESC`.
- Each row shows: file type icon + title + category badge + file size + date.
- "Mark as Final" toggle per row (green badge when final, muted button when not).
- Three-dot overflow menu per row: Edit, Archive.
- Empty state with upload CTA.
- No pagination for now (defer until volume demands it).

### 2.2 Upload Document

- Triggered by a FAB or header button (consistent with Notes pattern).
- Opens a Dialog (using existing `@/components/ui/dialog`).
- Fields: file picker, title (auto-filled from filename, editable), category (required), description (optional), tags (optional, comma-separated).
- Accepted MIME types: PDF, DOCX/DOC, XLSX/XLS, CSV, PPTX/PPT, TXT/plain.
- Max file size: 50 MB.
- MIME validation on file select (before submit).
- Shows upload progress feedback; inline error on failure.

### 2.3 Open Document

- Clicking a document title generates a signed URL (1-hour expiry) and opens it in a new tab.
- After opening, `last_opened_at` is updated via `touchDocumentAction`.
- Signed URL is generated server-side via a server action.

### 2.4 Edit Document Metadata

- Opens same Dialog as upload but pre-filled.
- Editable fields: title, category, description, tags.
- File itself cannot be replaced (out of scope for this version).

### 2.5 Mark as Final

- Toggle per row. Calls `markDocumentFinalAction(id, boolean)`.
- Visual: green "Final" badge when true, muted "Mark as Final" text when false.
- Optimistic UI update, revert on error.

### 2.6 Archive Document

- Soft delete: sets `archived_at = now()`.
- Removes document from active list immediately (optimistic).
- No hard delete in this version.

### 2.7 Session Cache

- Cache key: `{ type: 'documents', projectId }`.
- On cache hit: render list immediately with no loading.
- On cache miss: show `<SkeletonDocuments />`, fetch, set cache, render.
- After any mutation: invalidate cache key and refresh from server.
- No `router.refresh()` — use returned data or `onRefresh` pattern.

---

## 3. Data Model

### 3.1 New table: `project_files`

```sql
CREATE TYPE public.project_file_kind_enum AS ENUM ('media', 'document');

CREATE TYPE public.project_document_category_enum AS ENUM (
  'brief', 'contract', 'invoice', 'proposal',
  'report', 'spreadsheet', 'notes', 'other'
);

CREATE TABLE public.project_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                  public.project_file_kind_enum NOT NULL,
  document_category     public.project_document_category_enum NULL,
  title                 TEXT NOT NULL,
  description           TEXT NULL,
  bucket                TEXT NOT NULL,
  path                  TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  file_ext              TEXT NULL,
  size_bytes            BIGINT NOT NULL CHECK (size_bytes > 0),
  tags                  TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_final              BOOLEAN NOT NULL DEFAULT false,
  last_opened_at        TIMESTAMPTZ NULL,
  archived_at           TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT bucket_values CHECK (bucket IN ('project-media', 'project-docs')),
  CONSTRAINT document_category_required CHECK (
    kind <> 'document' OR document_category IS NOT NULL
  )
);
```

**Note:** Only `document` kind is implemented in this module. `media` kind and `project_media_category_enum` are reserved for a future Media Vault module but the enum is created now to avoid a migration conflict later. `media_category` column is intentionally omitted until Media Vault is scoped.

### 3.2 Indexes

```sql
CREATE INDEX idx_project_files_project_kind
  ON public.project_files (project_id, kind, created_at DESC);

CREATE INDEX idx_project_files_last_opened
  ON public.project_files (project_id, last_opened_at DESC NULLS LAST);

CREATE INDEX idx_project_files_owner
  ON public.project_files (owner_id, created_at DESC);

CREATE INDEX idx_project_files_archived
  ON public.project_files (project_id, archived_at, created_at DESC);
```

### 3.3 Trigger

```sql
CREATE TRIGGER update_project_files_updated_at
  BEFORE UPDATE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 3.4 RLS Policies

```sql
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own project files"
  ON public.project_files FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own project files"
  ON public.project_files FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own project files"
  ON public.project_files FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own project files"
  ON public.project_files FOR DELETE
  USING (owner_id = auth.uid());
```

### 3.5 Storage Bucket: `project-docs`

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-docs', 'project-docs', false);
```

**Path convention:** `{owner_id}/{project_id}/{yyyy}/{mm}/{uuid}.{ext}`

**Storage policies:**

```sql
-- SELECT
CREATE POLICY "project-docs select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT
CREATE POLICY "project-docs insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE
CREATE POLICY "project-docs update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE
CREATE POLICY "project-docs delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## 4. Server Actions

**File:** `app/actions/documents.ts`

All actions follow the established pattern:

- `'use server'` at file level.
- `const user = await requireAuth()` as first line.
- `const supabase = await createClient()` from `@/lib/supabase/server`.
- Explicit column selection in every query.
- Return shape `{ data?, error? }` for reads, `{ success: boolean; error?: string }` for mutations.
- `revalidatePath('/context')`, `revalidatePath(\`/context/${projectId}\`)`, `revalidatePath(\`/context/${projectId}/documents\`)` after mutations.
- Sentry `captureWithContext` on errors.

### 4.1 `getDocuments` (cached read)

```ts
export const getDocuments = cache(async (projectId: string): Promise<ProjectFile[]>)
```

- Queries `project_files` where `project_id = projectId`, `kind = 'document'`, `archived_at IS NULL`, `owner_id = user.id`.
- Orders by `last_opened_at DESC NULLS LAST`, then `created_at DESC`.
- Wrapped in React `cache()` for request deduplication.

### 4.2 `uploadDocument`

```ts
uploadDocument(projectId: string, formData: FormData): Promise<{ success: boolean; error?: string; data?: ProjectFile }>
```

Steps:

1. `requireAuth()`.
2. Verify project exists and belongs to user via `getProjectById(projectId)` → null check.
3. Extract and validate file from formData (MIME, size).
4. Extract and validate title (required, trimmed), document_category (required, enum check), description, tags.
5. Build storage path server-side: `{user.id}/{projectId}/{yyyy}/{mm}/{uuid}.{ext}`.
6. Upload to `project-docs` bucket.
7. Insert row into `project_files`. On DB error: delete uploaded file (cleanup), return error.
8. `revalidatePath` on all three paths.
9. Return `{ success: true, data: insertedRow }`.

### 4.3 `updateDocument`

```ts
updateDocument(fileId: string, input: { title?: string; description?: string; document_category?: string; tags?: string[] }): Promise<{ success: boolean; error?: string; data?: ProjectFile }>
```

- Fetches row, verifies `owner_id = user.id` and `kind = 'document'`.
- Updates only provided fields.
- Returns updated row.

### 4.4 `archiveDocument`

```ts
archiveDocument(fileId: string): Promise<{ success: boolean; error?: string }>
```

- Sets `archived_at = now()`.

### 4.5 `markDocumentFinal`

```ts
markDocumentFinal(fileId: string, isFinal: boolean): Promise<{ success: boolean; error?: string }>
```

- Sets `is_final = isFinal`.

### 4.6 `getDocumentSignedUrl`

```ts
getDocumentSignedUrl(fileId: string): Promise<{ url?: string; error?: string }>
```

- Fetches row, verifies ownership.
- Calls Supabase `storage.from('project-docs').createSignedUrl(path, 3600)`.
- Returns signed URL. Never exposes raw path to client.

### 4.7 `touchDocument`

```ts
touchDocument(fileId: string): Promise<void>
```

- Sets `last_opened_at = now()`. Fire-and-forget, no revalidation, no throw on error.

---

## 5. Validation Constants

**File:** `lib/validation/project-documents.ts`

```ts
export const DOCUMENT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export const DOCUMENT_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
] as const;

export const DOCUMENT_EXT_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
};

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  brief: 'Brief',
  contract: 'Contract',
  invoice: 'Invoice',
  proposal: 'Proposal',
  report: 'Report',
  spreadsheet: 'Spreadsheet',
  notes: 'Notes',
  other: 'Other',
};
```

---

## 6. UI Components

### 6.1 Route files

```
app/context/[projectId]/documents/
  page.tsx                          ← server, requireAuth, renders ContextDocumentsFromCache
  ContextDocumentsFromCache.tsx     ← client, cache get/set, skeleton or client
  ContextDocumentsClient.tsx        ← client, list + upload dialog, mutations
```

### 6.2 Shared UI components

```
components/skeletons/
  SkeletonDocuments.tsx             ← full list skeleton (N shimmer rows)
  SkeletonDocumentRow.tsx           ← single shimmer row for loading state

components/context/documents/
  DocumentRow.tsx                   ← single list row
  UploadDocumentDialog.tsx          ← upload form inside Dialog
  EditDocumentDialog.tsx            ← edit metadata inside Dialog
```

> **Convention:** All skeleton components belong in `components/skeletons/` and must use the `Skeleton*` prefix (see `SkeletonNotes`, `SkeletonBoard`, `SkeletonBudgets`). Do not place skeletons in feature folders.

### 6.3 Component specs

**`page.tsx`**

- Async server component.
- `await requireAuth()`.
- Renders `<ContextDocumentsFromCache projectId={params.projectId} />`.

**`ContextDocumentsFromCache.tsx`**

- Client component.
- Cache key: `{ type: 'documents', projectId }`.
- Cache hit → `<ContextDocumentsClient initialDocuments={cached} onRefresh={...} />`.
- Cache miss → `<SkeletonDocuments />`, fetch `getDocuments(projectId)`, `cache.set(...)`, render client.
- `onRefresh`: `cache.invalidate(key)` then re-fetch and re-set.

**`ContextDocumentsClient.tsx`**

- Client component. Props: `initialDocuments: ProjectFile[]`, `onRefresh: () => void`, `projectId: string`.
- Local state: `documents` (copy of initialDocuments for optimistic updates), `uploadOpen`, `editTarget`.
- Renders list of `<DocumentRow>` components.
- FAB or header "+ Upload" button → sets `uploadOpen = true`.
- Handles `onMarkFinal`, `onArchive`, `onEdit` callbacks from rows with optimistic updates.
- After any server action: call `onRefresh()` on completion.
- Empty state if `documents.length === 0`.

**`DocumentRow.tsx`**

- Props: `file: ProjectFile`, `onMarkFinal`, `onArchive`, `onEdit`.
- Left: file type icon (color-coded by extension).
- Center: title (clickable, calls `getDocumentSignedUrl` then `window.open(url, '_blank')` then `touchDocument`), category badge, size, date.
- Right: Final toggle + overflow menu (Edit, Archive).
- Min height 44px.
- Loading state on title click while fetching signed URL.

**`SkeletonDocuments.tsx`** (`components/skeletons/SkeletonDocuments.tsx`)

- Renders 4–5 `<SkeletonDocumentRow />` shimmer rows. No spinner. No "Loading..." text. Matches real row dimensions.

**`SkeletonDocumentRow.tsx`** (`components/skeletons/SkeletonDocumentRow.tsx`)

- Single shimmer row matching the real `DocumentRow` dimensions. Used by `SkeletonDocuments`.

**`UploadDocumentDialog.tsx`**

- Uses `Dialog` from `@/components/ui/dialog`.
- Fields: file picker (drag+drop), title, category (Select), description (Textarea), tags (Input).
- MIME validation on file select (before form submit), inline error.
- On submit: build FormData, call `uploadDocument`, loading state on button, error message on failure.
- On success: `onSuccess()` closes dialog and triggers refresh.

**`EditDocumentDialog.tsx`**

- Same structure as Upload but no file picker.
- Pre-filled with existing document data.
- Calls `updateDocument`.

---

## 7. Navigation — Adding the Tab

**File to edit:** `components/context/ContextTabBar.tsx`

Add to the `TABS` array:

```ts
{ slug: 'documents', labelKey: 'context.documents', icon: FolderOpen },
```

Add the i18n key to the translation files (`context.documents` = "Documents" in English).

The tab href resolves to `/context/${projectId}/documents` automatically by the existing active-state logic.

---

## 8. Cache Integration

Add `'documents'` to the cache key type union in `app/context/ContextDataCache.tsx`:

```ts
type CacheKeyType =
  | 'board'
  | 'notes'
  | 'links'
  | 'linkCategories'
  | 'ideas'
  | 'owner'
  | 'budgets'
  | 'billings'
  | 'todos'
  | 'project'
  | 'documents';
```

No other changes to the cache system needed.

---

## 9. TypeScript Types

After running migration and Supabase type generation, add a convenience type alias in `lib/supabase/types.ts` or a new `lib/types/documents.ts`:

```ts
export type ProjectFile = Database['public']['Tables']['project_files']['Row'];
export type ProjectFileInsert =
  Database['public']['Tables']['project_files']['Insert'];
export type ProjectFileUpdate =
  Database['public']['Tables']['project_files']['Update'];
export type DocumentCategory =
  Database['public']['Enums']['project_document_category_enum'];
```

---

## 10. Implementation Phases

### Phase 1 — Database Foundation

**Goal:** Migration applies cleanly, types are updated, app builds.

Tasks:

- Write migration: `project_file_kind_enum`, `project_document_category_enum`, `project_files` table, constraints, indexes, updated_at trigger, RLS policies.
- Write migration: `project-docs` private bucket + storage policies.
- Run Supabase type generation (or extend types manually).
- Verify build and typecheck pass.

Exit criteria: migration runs, `project_files` exists in DB and types, no build errors.

---

### Phase 2 — Server Actions & Validation

**Goal:** All server actions work and are testable independently.

Tasks:

- Create `lib/validation/project-documents.ts`.
- Create `app/actions/documents.ts` with all 7 actions.
- Manual test: upload a PDF via a temporary test form, verify row in DB and file in bucket.
- Manual test: archive, mark final, touch — verify DB updates.
- Manual test: invalid MIME and oversized file — verify rejection.
- Manual test: DB insert failure after upload — verify file cleanup in bucket.

Exit criteria: all actions work, edge cases handled, no TypeScript errors.

---

### Phase 3 — UI Components

**Goal:** Full UI renders correctly with real data.

Tasks:

- Create `SkeletonDocuments`, `SkeletonDocumentRow` in `components/skeletons/`.
- Create `DocumentRow` in `components/context/documents/`.
- Create `UploadDocumentDialog`, `EditDocumentDialog`.
- Create `ContextDocumentsClient`.
- Create `ContextDocumentsFromCache`.
- Create `page.tsx`.
- Add tab entry to `ContextTabBar.tsx` + i18n key.
- Add `'documents'` to cache key type union.

Exit criteria: tab is visible, list renders, skeleton shows on first load, upload works end to end.

---

### Phase 4 — Polish & Edge Cases

**Goal:** Production-ready behavior and UX completeness.

Tasks:

- Optimistic updates for mark-final and archive (no lag feel).
- Empty state UI (centered message + upload CTA).
- Signed URL error handling (show toast if URL fetch fails).
- File type icon map (PDF red, DOCX blue, XLSX green, PPTX orange, CSV teal, TXT gray).
- MIME validation on file picker before submit.
- All tap targets verified >= 44px.
- Shimmer dimensions match real row.
- Run Prettier across all new files.

Exit criteria: all interactions feel instant, errors are surfaced cleanly, no console warnings, Prettier passes.

---

## 11. Constraints & Rules

- Never compute bucket path on the client. Path is always generated server-side in the action.
- Never expose raw storage paths to the client. Only signed URLs are sent.
- Always call `getProjectById(projectId)` null-check before any storage or DB write to verify project ownership.
- Storage cleanup on DB insert failure (upload → DB fail → delete file).
- No `router.refresh()` after mutations. Use returned data or `onRefresh` via cache invalidation.
- No spinners or "Loading…" text. Skeleton shimmer only.
- Prettier: semicolons, single quotes, tabWidth 2, trailingComma es5. Run after every file.
- `kind = 'document'` is the only kind used in this module. Never hardcode `'media'`.
- Explicit column selection in every Supabase query. No `select('*')`.

---

## 12. Out of Scope for This Module

- Media Vault (images, video) — separate future module.
- Document versioning / file replacement.
- Shared documents across projects.
- Global (non-project) document list.
- Download tracking beyond `last_opened_at`.
- Hard delete.
- Document search or filtering (defer to when volume demands it).
