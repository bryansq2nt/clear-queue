# Media Vault — Module Design Document

**Version:** 1.2
**Status:** Draft v1.2 — canvas UX, no card menus, pagination
**Reference module:** Document Hub (`app/context/[projectId]/documents/`)
**Route:** `app/context/[projectId]/media/`

---

## 1. Overview

Media Vault is a project-scoped visual asset management module that lives inside the Context tab system. It allows users to upload, organize, preview, and manage visual media (images, videos, mockups, screenshots) associated with a specific project. Every media file belongs to one project and one owner. The module follows the established pattern exactly: server page → `*FromCache` → `*Client`, with session cache, server actions, and RLS enforcement.

Media Vault is strictly visual — it does not manage documents, links, or structured text. It is the visual complement to Document Hub. Both modules store rows in `project_files` with `kind = 'media'` vs `kind = 'document'`.

---

## 2. Features

### 2.1 Media Grid

- Displays all non-archived media for the current project.
- **Grid layout:** 2 columns on mobile, 3 on tablet (`md:`), 4 on desktop (`lg:`).
- **Cards are purely visual.** Each card shows only: the image thumbnail (lazy-loaded via signed URL) or a video placeholder icon. Nothing else. No buttons, no menus, no badges on top of the thumbnail — the user's eye lands on the content only.
- The only exception is a small "Final" badge rendered as a non-interactive corner indicator when `is_final = true`. It is read-only.
- Clicking any card opens the **Media Canvas** (see Section 2.3). That is the single entry point to every action.
- Empty state with upload CTA.
- Paginated: initial load shows first `MEDIA_PAGE_SIZE` items. A "Load more" button at the bottom of the grid appends the next page. The button is hidden once all items are loaded (`hasMore = false`).
- Sorted by `created_at DESC`.

### 2.2 Upload Media

- Triggered by a FAB (consistent with Document Hub).
- Opens a Dialog (using existing `@/components/ui/dialog`).
- Fields: file picker (drag-and-drop), title (auto-filled from filename, editable), category (required), description (optional), tags (optional, comma-separated).
- Accepted MIME types: JPEG, PNG, WebP, GIF, SVG, MP4, WebM, QuickTime (MOV).
- Max file size: **100 MB**.
- MIME validation on file select (before submit), inline error.
- Shows upload progress feedback; inline error on failure.

### 2.3 Media Canvas

When the user taps any card in the grid, a full-screen **Media Canvas** opens as a client-side overlay. No page redirect — the canvas mounts on top of the grid, which stays mounted in the background. Opening the canvas feels instant.

**Canvas behavior:**

- **Full-screen overlay:** fixed position, z-50, black/near-black background, covers the entire viewport.
- **Content area:** the image is centered using `object-contain`, filling as much of the canvas as possible. For videos: the canvas shows a large centered video player (`<video controls>` tag using the signed URL).
- **Action bar:** a semi-transparent dark bar (with backdrop-blur) docked at the bottom of the canvas. Contains all available actions.
- **Auto-hide:** the action bar appears immediately when the canvas opens, then fades out automatically after **2.5 seconds** of no interaction. This keeps the focus on the image.
- **Toggle on tap:** tapping or clicking anywhere on the image/content area toggles the action bar back into view (and restarts the auto-hide timer).
- **ESC key:** always closes the canvas regardless of action bar visibility.
- **Signed URL:** fetched server-side via `getMediaSignedUrl` when the card is tapped. The canvas shows a loading shimmer while the URL is being fetched (typically < 300ms). On error, shows an error state inside the canvas.

**Action bar contents (left to right):**

| Element                | Behavior                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Title + category badge | Informational, left-aligned, truncated                                                 |
| "Mark as Final" toggle | Calls `markMediaFinal`, optimistic update reflected in both canvas badge and grid card |
| "Edit" button          | Opens `EditMediaDialog` on top of the canvas (dialog stacks over the canvas)           |
| "Archive" button       | Calls `archiveMedia`, closes canvas, removes item from grid (optimistic)               |
| "Delete" button        | Shows inline confirmation first, then calls `deleteMedia`, closes canvas, removes item |
| "Close" (X) button     | Closes canvas, returns to grid                                                         |

**Touch target rule:** every action bar button must be at least 48px tall (canvas context — users are on larger screens or use deliberate taps).

### 2.4 Edit Media Metadata

- Accessed exclusively from the action bar inside the Media Canvas (Edit button).
- Opens `EditMediaDialog` — same Dialog component as in Document Hub, rendered on top of the canvas.
- Editable fields: title, category, description, tags.
- File replacement is out of scope for this version.
- On success: dialog closes, canvas updates title and category badge in real time (optimistic update on the in-canvas file state), grid card is updated, `onRefresh()` called.

### 2.5 Mark as Final

- Accessed from the action bar inside the Media Canvas.
- Toggle button. Calls `markMediaFinal(id, boolean)`.
- Optimistic: toggles `is_final` immediately in canvas state and in the parent grid state.
- Visual reflection: the small "Final" badge on the grid card appears/disappears without closing the canvas.
- Revert on server error with toast notification.

### 2.6 Archive Media

- Accessed from the action bar inside the Media Canvas.
- Soft delete: sets `archived_at = now()`.
- On success: canvas closes, item is removed from the grid immediately (optimistic).
- No hard delete in this version.

### 2.7 Delete Media

- Accessed from the action bar inside the Media Canvas.
- **Requires inline confirmation:** clicking "Delete" first changes the button to a "Confirm delete?" state (with a brief moment to cancel). Single misclick cannot delete a file.
- On confirm: calls `deleteMedia`, canvas closes, item removed from grid (optimistic).

### 2.8 Pagination

- **Strategy:** Offset-based with a "Load more" button. Simple, auditable, and sufficient for realistic media library sizes.
- **Page size:** `MEDIA_PAGE_SIZE = 24` (fills a 4-column grid neatly: 4 × 6 rows). Defined as a constant in `lib/validation/project-media.ts`.
- **Load more:** clicking the button appends the next 24 items to the grid. The button shows a loading state while fetching and disappears once `hasMore = false`.
- **Sort:** `created_at DESC` (stable, insert-order). `last_opened_at` is used only for the "recently opened" widget if one is added in a future phase — it is NOT the primary pagination sort, because null values make offset-based ordering unstable.
- **Fetch strategy:** the server action fetches `limit + 1` rows. If it gets `limit + 1` back, `hasMore = true` and only `limit` rows are returned. This avoids a COUNT query on every request.
- **Cache shape:** the session cache stores `{ items: ProjectFile[], hasMore: boolean, loadedCount: number }` instead of a flat `ProjectFile[]`. On `onRefresh` (after a mutation), the cache is invalidated and reset to page 1 (first `MEDIA_PAGE_SIZE` items only).
- **New uploads:** prepended to the top of `items` in client state immediately (optimistic). They do not change the loaded page count.
- **Archive / delete:** item is removed from `items` in client state immediately (optimistic). Does not reload the page.

### 2.9 Session Cache

- Cache key: `{ type: 'media', projectId }`.
- On cache hit: render grid immediately with no loading. The cached value shape is `{ items: ProjectFile[], hasMore: boolean, loadedCount: number }`.
- On cache miss: show `<SkeletonMedia />`, fetch, set cache, render.
- After any mutation: `onRefresh` pattern — `cache.invalidate(key)` then re-fetch and re-set.
- No `router.refresh()`.

---

## 3. Data Model

### 3.1 Changes to existing `project_files` table

The `project_files` table already exists with `kind = 'media'` reserved in `project_file_kind_enum`. Two DB additions are required:

**New enum:**

```sql
CREATE TYPE public.project_media_category_enum AS ENUM (
  'branding',
  'content',
  'reference',
  'screenshot',
  'mockup',
  'other'
);
```

**New column + constraint:**

```sql
ALTER TABLE public.project_files
  ADD COLUMN media_category public.project_media_category_enum NULL;

ALTER TABLE public.project_files
  ADD CONSTRAINT media_category_required CHECK (
    kind <> 'media' OR media_category IS NOT NULL
  );
```

**Existing columns used by Media Vault (no changes):**

| Column                     | Usage                                    |
| -------------------------- | ---------------------------------------- |
| `id`                       | PK                                       |
| `project_id`               | Project scoping                          |
| `owner_id`                 | RLS / ownership                          |
| `kind`                     | Always `'media'` in this module          |
| `title`                    | Asset title (required)                   |
| `description`              | Optional notes                           |
| `tags`                     | Optional array                           |
| `is_final`                 | Final indicator (shown as badge on card) |
| `bucket`                   | Always `'project-media'` in this module  |
| `path`                     | Storage path (server-only)               |
| `mime_type`                | MIME for image vs video branching        |
| `file_ext`                 | Extension                                |
| `size_bytes`               | File size                                |
| `last_opened_at`           | Updated on canvas open via `touchMedia`  |
| `archived_at`              | Soft archive                             |
| `deleted_at`               | Soft delete                              |
| `created_at`, `updated_at` | Timestamps                               |

**Note on `folder_id`:** The existing `folder_id` column FK points to `project_document_folders`. For Media Vault v1, all media rows will have `folder_id = NULL`. When folders are added in a future phase, a dedicated `project_media_folders` table and `media_folder_id` column will be created to keep modules independent.

### 3.2 New index (conditional, verify before adding)

```sql
-- Only add if the existing idx_project_files_project_kind does not already
-- cover (project_id, kind, created_at DESC) efficiently.
CREATE INDEX IF NOT EXISTS idx_project_files_media_created
  ON public.project_files (project_id, created_at DESC)
  WHERE kind = 'media' AND archived_at IS NULL AND deleted_at IS NULL;
```

### 3.3 Storage Bucket: `project-media`

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-media', 'project-media', false);
```

**Path convention:** `{owner_id}/{project_id}/{yyyy}/{mm}/{uuid}.{ext}`

**Storage policies:**

```sql
-- SELECT
CREATE POLICY "project-media select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT
CREATE POLICY "project-media insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE
CREATE POLICY "project-media update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE
CREATE POLICY "project-media delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## 4. Server Actions

**File:** `app/actions/media.ts`

All actions follow the established pattern:

- `'use server'` at file level.
- `const user = await requireAuth()` as first line.
- `const supabase = await createClient()` from `@/lib/supabase/server`.
- Explicit column selection in every query.
- Return shape `{ data?, error? }` for reads, `{ success: boolean; error?: string }` for mutations.
- `revalidatePath('/context')`, `revalidatePath(\`/context/${projectId}\`)`, `revalidatePath(\`/context/${projectId}/media\`)` after mutations.
- Sentry `captureWithContext` on errors.

### 4.1 `getMedia` (cached read, paginated)

```ts
export const getMedia = cache(async (
  projectId: string,
  options?: { offset?: number; limit?: number }
): Promise<{ items: ProjectFile[]; hasMore: boolean }>)
```

- Queries `project_files` where `project_id = projectId`, `kind = 'media'`, `archived_at IS NULL`, `deleted_at IS NULL`, `owner_id = user.id`.
- Orders by `created_at DESC`.
- `limit` defaults to `MEDIA_PAGE_SIZE` (24). Fetches `limit + 1` rows internally to determine `hasMore` without a COUNT query. Returns only `limit` rows in `items`.
- `offset` defaults to `0`. Each "load more" call passes `offset = loadedCount`.
- Wrapped in React `cache()` for request deduplication within the same render.
- Return shape: `{ items: ProjectFile[], hasMore: boolean }`.

### 4.2 `uploadMedia`

```ts
uploadMedia(projectId: string, formData: FormData): Promise<{ success: boolean; error?: string; data?: ProjectFile }>
```

Steps:

1. `requireAuth()`.
2. Verify project exists via `getProjectById(projectId)` → null check (project ownership).
3. Extract and validate file from formData (MIME type via `isValidMediaMimeType`, size via `MEDIA_MAX_SIZE_BYTES`).
4. Extract and validate title (required, trimmed), media_category (required, `isValidMediaCategory`), description, tags.
5. Build storage path server-side: `{user.id}/{projectId}/{yyyy}/{mm}/{uuid}.{ext}`.
6. Upload to `project-media` bucket.
7. Insert row into `project_files` with `kind = 'media'`. On DB error: delete uploaded file (cleanup), return error.
8. `revalidatePath` on all three paths.
9. Return `{ success: true, data: insertedRow }`.

### 4.3 `updateMedia`

```ts
updateMedia(fileId: string, input: { title?: string; description?: string; media_category?: string; tags?: string[] }): Promise<{ success: boolean; error?: string; data?: ProjectFile }>
```

- Fetches row, verifies `owner_id = user.id` and `kind = 'media'`.
- Updates only provided fields.
- Returns updated row.

### 4.4 `archiveMedia`

```ts
archiveMedia(fileId: string): Promise<{ success: boolean; error?: string }>
```

- Sets `archived_at = now()`.

### 4.5 `deleteMedia`

```ts
deleteMedia(fileId: string): Promise<{ success: boolean; error?: string }>
```

- Sets `deleted_at = now()` (soft delete in DB).
- Also removes file from `project-media` bucket (storage cleanup).
- Both operations in sequence; if storage delete fails, still soft-deletes the DB row (file becomes inaccessible via RLS, orphaned in bucket — acceptable for v1).

### 4.6 `markMediaFinal`

```ts
markMediaFinal(fileId: string, isFinal: boolean): Promise<{ success: boolean; error?: string }>
```

- Verifies `owner_id = user.id` and `kind = 'media'`.
- Sets `is_final = isFinal`.

### 4.7 `getMediaSignedUrl`

```ts
getMediaSignedUrl(fileId: string): Promise<{ url?: string; error?: string }>
```

- Fetches row, verifies ownership and `kind = 'media'`.
- Calls Supabase `storage.from('project-media').createSignedUrl(path, 3600)`.
- Returns signed URL. Never exposes raw path to client.

### 4.8 `touchMedia`

```ts
touchMedia(fileId: string): Promise<void>
```

- Sets `last_opened_at = now()`. Fire-and-forget, no revalidation, no throw on error.

---

## 5. Validation Constants

**File:** `lib/validation/project-media.ts`

```ts
export const MEDIA_PAGE_SIZE = 24; // 4-column grid × 6 rows

export const MEDIA_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export const MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS = 2500;

export const MEDIA_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

export type AcceptedMediaMimeType = (typeof MEDIA_ACCEPTED_MIME_TYPES)[number];

export const MEDIA_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export const MEDIA_CATEGORY_VALUES = [
  'branding',
  'content',
  'reference',
  'screenshot',
  'mockup',
  'other',
] as const;

export type MediaCategoryValue = (typeof MEDIA_CATEGORY_VALUES)[number];

export const MEDIA_CATEGORY_LABELS: Record<MediaCategoryValue, string> = {
  branding: 'Branding',
  content: 'Content',
  reference: 'Reference',
  screenshot: 'Screenshot',
  mockup: 'Mockup',
  other: 'Other',
};

export function isValidMediaMimeType(
  mime: string
): mime is AcceptedMediaMimeType {
  return (MEDIA_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);
}

export function isValidMediaCategory(
  value: unknown
): value is MediaCategoryValue {
  return (
    typeof value === 'string' &&
    (MEDIA_CATEGORY_VALUES as readonly string[]).includes(value)
  );
}

export function isImageMimeType(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isVideoMimeType(mime: string): boolean {
  return mime.startsWith('video/');
}
```

---

## 6. UI Components

### 6.1 Route files

```
app/context/[projectId]/media/
  page.tsx                       ← server, requireAuth, renders ContextMediaFromCache
  ContextMediaFromCache.tsx      ← client, cache get/set, skeleton or client
  ContextMediaClient.tsx         ← client, grid + canvas, mutations
```

### 6.2 Shared UI components

```
components/skeletons/
  SkeletonMedia.tsx              ← full grid skeleton (shimmer card grid)
  SkeletonMediaCard.tsx          ← single shimmer card

components/context/media/
  MediaCard.tsx                  ← purely visual card: thumbnail or video icon + Final badge
  MediaCanvas.tsx                ← full-screen canvas with auto-hiding action bar
  UploadMediaDialog.tsx          ← upload form inside Dialog
  EditMediaDialog.tsx            ← edit metadata inside Dialog (opens on top of canvas)
```

> **Convention:** Skeleton components belong in `components/skeletons/` with the `Skeleton*` prefix. No skeletons in feature folders.

> **No `MediaLightbox`:** the canvas replaces the lightbox concept entirely. There is no separate lightbox component.

### 6.3 Component specs

**`page.tsx`**

- Async server component.
- `await requireAuth()`.
- Renders `<ContextMediaFromCache projectId={params.projectId} />`.

**`ContextMediaFromCache.tsx`**

- Client component.
- Cache key: `{ type: 'media', projectId }`.
- Cache value shape is `{ items: ProjectFile[], hasMore: boolean, loadedCount: number }` (not a flat array).
- Cache hit → passes `initialMedia={cached.items}`, `initialHasMore={cached.hasMore}`, `initialLoadedCount={cached.loadedCount}` to the client.
- Cache miss → shows `<SkeletonMedia />`, fetches first page (`offset: 0, limit: MEDIA_PAGE_SIZE`), stores paginated shape in cache, renders client.
- `onRefresh`: invalidates cache key, re-fetches page 1 only, resets `loadedCount` to `MEDIA_PAGE_SIZE`.

**`ContextMediaClient.tsx`**

- Client component.
- Props: `initialMedia: ProjectFile[]`, `initialHasMore: boolean`, `initialLoadedCount: number`, `onRefresh: () => void`, `projectId: string`.
- Local state:
  - `media: ProjectFile[]` — copy of initialMedia, mutated optimistically
  - `hasMore: boolean`, `loadedCount: number`, `isLoadingMore: boolean` — pagination
  - `uploadOpen: boolean` — controls upload dialog
  - `canvasFile: ProjectFile | null` — the file currently open in the canvas (null = canvas closed)
  - `canvasUrl: string | null` — signed URL for the canvas file (fetched on card click)
  - `canvasLoading: boolean` — true while fetching the signed URL after card click
- Renders CSS grid of `<MediaCard>` components.
- FAB → sets `uploadOpen = true`.
- On card click: sets `canvasLoading = true`, calls `getMediaSignedUrl(file.id)`, on success sets `canvasFile` + `canvasUrl`, calls `touchMedia(file.id)` (fire-and-forget).
- Renders `<MediaCanvas>` with `open={canvasFile !== null}`.
- "Load more" button at bottom, visible when `hasMore = true`, disabled when `isLoadingMore`.
- New uploads are prepended to `media` array; `loadedCount` is not incremented.
- Empty state: centered `Image` icon + "Upload your first media file" link.

**`MediaCard.tsx`**

- Props: `file: ProjectFile`, `onClick: () => void`.
- **No action callbacks. No overflow menu. No buttons. Purely visual.**
- Renders a square `<button>` element (for accessibility — it is keyboard-focusable and responds to Enter/Space).
- On click: calls `onClick()` (which the parent uses to open the canvas).
- **Image files (`isImageMimeType`):**
  - Fetches signed URL on mount via `getMediaSignedUrl`.
  - Shows `<SkeletonMediaCard />` while loading.
  - On URL ready: renders `<img src={url} alt={file.title} className="object-cover w-full h-full" />`.
  - On URL error: shows a muted placeholder with an `ImageOff` icon.
- **Video files (`isVideoMimeType`):**
  - Renders a muted dark background with a `Film` icon centered.
  - A small "Video" text label below the icon.
- **"Final" badge:** if `is_final = true`, renders a small green dot or "Final" chip in the top-right corner. This is a `<span>`, not a button — read-only indicator only.
- Card aspect ratio: `aspect-square`. Min touch target: card itself ≥ 44px (easy at any reasonable grid size).
- **No three-dot menu. No overflow. No inline action of any kind beyond opening the canvas.**

**`MediaCanvas.tsx`**

- Props:
  ```ts
  {
    file: ProjectFile;
    url: string;
    open: boolean;
    onClose: () => void;
    onMarkFinal: (isFinal: boolean) => void;
    onEdit: () => void;
    onArchive: () => void;
    onDelete: () => void;
  }
  ```
- **Layout:** `fixed inset-0 z-50 bg-black flex items-center justify-center`. Animates in with `opacity` transition.
- **Content area:** `<img>` for images (`object-contain w-full h-full`) or `<video controls>` for videos. Clicking the content area toggles action bar visibility and restarts the hide timer.
- **Action bar:** `fixed bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm px-4 py-3 flex items-center gap-3`. Transitions with `opacity` and `translateY`.
  - **Auto-hide:** on canvas open, a `setTimeout(MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS)` hides the bar. Any user interaction (click on content, focus inside bar, mouse move over bar) clears and restarts the timer.
  - **Contents (left → right):**
    - Title (truncated, white text) + category badge
    - Flex spacer
    - "Mark as Final" toggle button: star or bookmark icon, filled when `is_final`, outline when not. Calls `onMarkFinal(!file.is_final)`.
    - "Edit" button (pencil icon + label). Calls `onEdit()`.
    - "Archive" button (archive-box icon + label). Calls `onArchive()`.
    - "Delete" button: first click changes to "Confirm?" state (red color, 3 second timeout to cancel). Second click calls `onDelete()`.
    - "Close" button (X icon). Calls `onClose()`.
- **ESC key:** `useEffect` adds a `keydown` listener for `Escape` → calls `onClose()`. Cleaned up on unmount.
- **Edit dialog:** `EditMediaDialog` is rendered inside (or alongside) `MediaCanvas`, stacked on top. When `onEdit()` is called, `ContextMediaClient` sets `editTarget = file` which opens `EditMediaDialog`. The canvas remains visible behind the dialog.

**`SkeletonMedia.tsx`** (`components/skeletons/SkeletonMedia.tsx`)

- Renders a CSS grid (2/3/4 cols) of 8–12 `<SkeletonMediaCard />` shimmer cards. No spinner. No "Loading…" text.

**`SkeletonMediaCard.tsx`** (`components/skeletons/SkeletonMediaCard.tsx`)

- Single shimmer card with `aspect-square`, matching real `MediaCard` dimensions. Uses `<Skeleton />` from `@/components/ui/skeleton`.

**`UploadMediaDialog.tsx`**

- Uses `Dialog` from `@/components/ui/dialog`.
- Fields: drag-and-drop file area, title (Input), category (Select, required), description (Textarea), tags (Input).
- MIME validation on file select (before form submit), inline error message.
- On submit: build FormData, call `uploadMedia`, loading state on button, error message on failure.
- On success: `onSuccess(file)` — closes dialog, caller prepends file to grid state.

**`EditMediaDialog.tsx`**

- Same structure as Upload but no file picker.
- Pre-filled with existing media data.
- Calls `updateMedia`.
- Rendered by `ContextMediaClient` on top of the canvas when `onEdit()` is triggered.

---

## 7. Navigation — Adding the Tab

**File to edit:** `components/context/ContextTabBar.tsx`

Add to the `TABS` array (position: after `documents`, before any future tabs):

```ts
{ slug: 'media', labelKey: 'context.media', icon: Image },
```

Import `Image` from `lucide-react`.

Add the i18n key to the translation files:

- English: `context.media` = `"Media"`
- Spanish: `context.media` = `"Media"`

The tab href resolves to `/context/${projectId}/media` automatically via the existing active-state logic.

---

## 8. Cache Integration

Add `'media'` to the `CacheKey` discriminated union in `app/context/ContextDataCache.tsx`:

```ts
| { type: 'media'; projectId: string }
```

No other changes to the cache system. The existing `invalidateProject(projectId)` function will correctly invalidate `media:${projectId}` cache entries with no modifications needed (same `key.split(':')[1]` pattern).

---

## 9. TypeScript Types

After running migration and Supabase type generation:

```ts
// lib/types/media.ts (or add to an existing types file)
export type MediaCategory =
  Database['public']['Enums']['project_media_category_enum'];
```

`ProjectFile` (already defined and used by Document Hub) covers media rows since both modules share `project_files`. No new table row type needed.

---

## 10. Implementation Phases

### Phase 1 — Database Foundation

**Goal:** Migration applies cleanly, types updated, app builds.

Tasks:

- Write migration: `project_media_category_enum`, `media_category` column on `project_files`, `media_category_required` constraint, new index if needed.
- Write migration: `project-media` private bucket + 4 storage policies.
- Run Supabase type generation (or extend types manually) to pick up `project_media_category_enum` and `media_category`.
- Verify `npm run build` and `npm run typecheck` pass.

Exit criteria: migration runs cleanly, `media_category` column in DB and types, no build errors.

---

### Phase 2 — Server Actions & Validation

**Goal:** All server actions work and are independently testable.

Tasks:

- Create `lib/validation/project-media.ts` with all constants and helpers.
- Create `app/actions/media.ts` with all 8 actions.
- Manual test: upload an image → verify row in `project_files` (`kind = 'media'`) and file in `project-media` bucket.
- Manual test: upload a video → same verification.
- Manual test: archive, mark final, touch → verify DB updates.
- Manual test: invalid MIME type → verify rejection before upload.
- Manual test: oversized file → verify rejection before upload.
- Manual test: DB insert failure after upload → verify file deleted from bucket (cleanup).

Exit criteria: all actions work, edge cases handled, no TypeScript errors.

---

### Phase 3 — Core UI

**Goal:** Full UI renders correctly with real data.

Tasks:

- Create `SkeletonMedia`, `SkeletonMediaCard` in `components/skeletons/`.
- Create `MediaCard` in `components/context/media/` — purely visual, no menus.
- Create `MediaCanvas` in `components/context/media/` — full-screen canvas with auto-hiding action bar.
- Create `UploadMediaDialog`, `EditMediaDialog`.
- Create `ContextMediaClient` — handles canvas state, signed URL fetch on card click, all mutations.
- Create `ContextMediaFromCache` — paginated cache shape.
- Create `page.tsx`.
- Add tab entry to `ContextTabBar.tsx` + i18n keys.
- Add `'media'` to `CacheKey` type union in `ContextDataCache.tsx`.
- Implement "Load more" button and paginated state.

Exit criteria: tab is visible, grid renders clean (no menus on cards), canvas opens on card click, action bar visible and auto-hides, all actions work from canvas, upload works end-to-end.

---

### Phase 4 — Polish & Edge Cases

**Goal:** Production-ready behavior and UX completeness.

Tasks:

- Image thumbnail loading skeleton inside `MediaCard` (show shimmer while signed URL loads).
- Image thumbnail error state inside `MediaCard` (`ImageOff` icon on URL fetch failure).
- Canvas signed URL loading shimmer (brief, while URL is being fetched on card click).
- Canvas open/close animation: `opacity` transition (200ms ease-out open, 150ms ease-in close).
- Action bar show/hide animation: `opacity + translateY` transition (150ms).
- Delete confirmation: "Confirm?" state with 3-second auto-reset if not confirmed.
- Mark as Final: optimistic toggle with revert-on-error toast.
- "Final" badge on grid card reflects canvas state change without grid refresh.
- Video card: prominent `Film` icon + "Video" label, muted background color.
- "Load more" disabled state while `isLoadingMore`.
- Empty state: centered icon + upload CTA.
- All action bar touch targets ≥ 48px tall.
- Run Prettier across all new files.

Exit criteria: all transitions feel smooth, errors are surfaced cleanly, delete requires confirmation, no console warnings, Prettier passes.

---

## 11. Constraints & Rules

- **No action buttons, no overflow menus, no three-dot menus on grid cards.** Cards are purely presentational. The only interactive behavior on a card is opening the canvas.
- **The canvas is the single entry point for all mutations** (edit, archive, delete, mark final).
- Never compute bucket path on the client. Path is always generated server-side in the action.
- Never expose raw storage paths to the client. Only signed URLs are returned.
- Always call `getProjectById(projectId)` null-check before any storage or DB write.
- Storage cleanup on DB insert failure: if upload succeeds but DB insert fails, delete the file from the bucket before returning error.
- No `router.refresh()` after mutations. Use returned data or `onRefresh` via cache invalidation.
- No spinners or "Loading…" text. Skeleton shimmer only (exception: action bar buttons may show a loading state during async operations since they are small interactive elements, not page-level loading states).
- Prettier: semicolons, single quotes, tabWidth 2, trailingComma es5. Run after every file.
- `kind = 'media'` is the only kind used in this module. Never hardcode `'document'`.
- Explicit column selection in every Supabase query. No `.select()` with no arguments.
- Signed URLs expire in 1 hour. Do not cache signed URLs across sessions or beyond the component lifecycle. Each canvas open fetches a fresh URL.
- `isImageMimeType` and `isVideoMimeType` helpers from `lib/validation/project-media.ts` must be used for type branching — never hardcode MIME strings in components.
- `MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS` from the validation file must be used for the auto-hide timer — never hardcode `2500` or any number inline.

---

## 12. Out of Scope for This Module

- **Folders / organization** — dedicated `project_media_folders` table and `media_folder_id` column in a future phase, following the Document Hub folders pattern. The current `folder_id` column (FK to `project_document_folders`) is NOT used for media.
- **Canvas navigation arrows** — browsing previous/next image without closing the canvas. Deferred to a future phase.
- **Video thumbnails** — server-side thumbnail generation or frame extraction.
- **Image editing or cropping** — module only manages, never modifies.
- **Video editing or transcoding.**
- **Batch upload** — single file per dialog in this version.
- **Shared media across projects.**
- **Global (non-project) media library.**
- **Hard delete** — soft delete (`deleted_at`) only.
- **Search or filtering** — defer to the folders phase. Note: client-side filtering on paginated data only searches loaded items; server-side filtering will be needed when folders are added.
- **CDN / publicly accessible URLs** — all URLs are private signed URLs.
- **Download tracking beyond `last_opened_at`.**
- **Image dimensions metadata** (`width`, `height`) — not captured in this version.

---

## 13. UX Design Rationale

### Why no action menus on grid cards?

The grid is a visual library. When a user enters the Media Vault, they are looking for a specific image or browsing their visual assets. Placing three-dot menus, archive buttons, or action controls on every card creates visual noise and competes for attention with the actual content. Worse, small touch targets (the three-dot icon) are hard to tap on mobile without accidentally triggering the wrong card.

The correct UX pattern — used by Facebook, Instagram, Google Photos, and Figma — is: the grid is for discovery, the detail view is for action.

### Why a canvas instead of a page navigation?

A full page redirect (e.g. `/context/[projectId]/media/[fileId]`) would require:

- A new server component + route
- A back-navigation that loses scroll position in the grid
- A full page load for what is conceptually a "peek" at a file

A client-side canvas mounts instantly (no network round-trip for the page itself), keeps the grid mounted in the background (scroll position preserved), and closes instantly. It feels like the same page, because it is.

### Why auto-hide the action bar?

The user opened the canvas to see the image, not the controls. Auto-hiding after 2.5 seconds gives the user full-screen, unobstructed view of their asset. The controls are still one tap away. This is the exact behavior of Facebook's photo viewer, iOS Photos, and Google Photos.

### Why require a confirmation step for Delete?

Archive is reversible (files can be unarchived in a future phase). Delete is not — it removes the file from the storage bucket. A misclick on Delete in a touch interface is too easy. The "Confirm?" two-step with a 3-second auto-reset prevents accidental deletion without adding a separate modal dialog.

---

## 14. Pagination Design Rationale

### Why offset-based and not cursor-based?

Cursor-based (keyset) pagination is more robust when rows can be inserted between pages mid-session. For Media Vault, this risk is low: new uploads are always prepended to client state optimistically and do not go through the paginated query mid-session. Offset-based is simpler to implement, simpler to debug, and sufficient for realistic single-user media libraries (hundreds to low-thousands of items).

If load testing reveals instability (e.g. duplicate rows when many files are uploaded during a session), cursor-based pagination can be added in a future migration by encoding `(created_at, id)` as the cursor.

### Why "Load more" and not numbered pages?

Numbered pages require a COUNT query on every load, which adds latency. "Load more" accumulates items in a continuous list, matches the expected UX for a visual media grid (similar to Google Photos, Figma assets), and works naturally with the existing session cache (accumulated items persist while the user stays in the tab).

### Why page size 24?

24 fills a 4-column desktop grid neatly (4 × 6 rows = 24). On a 3-column tablet grid, 24 = 8 rows. On mobile (2 cols), 24 = 12 rows. All clean numbers.

### How pagination interacts with the session cache

The session cache stores the accumulated state `{ items, hasMore, loadedCount }`. On re-visit to the tab within the same session, the user sees all pages they had loaded — no re-fetch, no flicker. On mutation (upload, archive), `onRefresh` resets to page 1: cache is invalidated, first page is re-fetched, `loadedCount` resets to `MEDIA_PAGE_SIZE`. This is correct because mutations that add or remove items should trigger a fresh sort from the top.
