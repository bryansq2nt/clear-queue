# Media Vault — Implementation Plan

**Date:** 2026-02-28
**Status:** Approved — ready to execute
**Design reference:** `docs/pre-build/media-vault-design.md` (v1.2)
**Execution model:** phase by phase; do not start a phase until the previous one's exit criteria are met.

---

## Overview

| Phase | Name                        | Deliverable                                   |
| ----- | --------------------------- | --------------------------------------------- |
| 1     | Database Foundation         | Migration, bucket, types, build passes        |
| 2     | Server Actions & Validation | All 8 actions working and tested              |
| 3     | Core UI                     | Full module rendered, canvas, pagination      |
| 4     | Polish & Edge Cases         | Production-ready UX, animations, error states |

---

## Phase 1 — Database Foundation

**Goal:** The migration runs cleanly, types are updated, and the app builds with no errors.

### 1.1 Files to create

**`supabase/migrations/YYYYMMDDHHMMSS_media_vault.sql`**

```sql
-- 1. New enum for media categories
CREATE TYPE public.project_media_category_enum AS ENUM (
  'branding',
  'content',
  'reference',
  'screenshot',
  'mockup',
  'other'
);

-- 2. Add media_category column to project_files
ALTER TABLE public.project_files
  ADD COLUMN media_category public.project_media_category_enum NULL;

-- 3. Constraint: media rows must have media_category
ALTER TABLE public.project_files
  ADD CONSTRAINT media_category_required CHECK (
    kind <> 'media' OR media_category IS NOT NULL
  );

-- 4. Partial index optimized for the paginated getMedia query
--    Verify idx_project_files_project_kind doesn't already cover this before adding.
CREATE INDEX IF NOT EXISTS idx_project_files_media_created
  ON public.project_files (project_id, created_at DESC)
  WHERE kind = 'media' AND archived_at IS NULL AND deleted_at IS NULL;

-- 5. Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-media', 'project-media', false);

-- 6. Storage policies
CREATE POLICY "project-media select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "project-media insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "project-media update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "project-media delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

**Timestamp:** use the current date and time in format `YYYYMMDDHHMMSS`. Must sort after `20260224130000_note_folders_and_last_opened.sql` (the last existing migration).

### 1.2 Files to modify

**`lib/supabase/types.ts`**

After running `supabase gen types typescript` (or the project's equivalent type generation command), the generated types will include:

- `project_media_category_enum` in `Database['public']['Enums']`
- `media_category` column in `Database['public']['Tables']['project_files']['Row']`

If type generation is not available, extend manually:

```ts
// In the Enums section:
project_media_category_enum: 'branding' | 'content' | 'reference' | 'screenshot' | 'mockup' | 'other';

// In project_files Row (add alongside document_category):
media_category: Database['public']['Enums']['project_media_category_enum'] | null;

// In project_files Insert and Update:
media_category?: Database['public']['Enums']['project_media_category_enum'] | null;
```

### 1.3 Verification

- Run migration locally: `supabase db push` or `supabase migration up`.
- Open Supabase dashboard: confirm `project_files` has `media_category` column, confirm `project-media` bucket exists.
- Run `npm run build` — must pass with no TypeScript errors.
- Run `npm run typecheck` — must pass.

### Phase 1 exit criteria

- [ ] `project_media_category_enum` exists in DB
- [ ] `media_category` column exists on `project_files`
- [ ] `media_category_required` constraint exists
- [ ] `project-media` bucket exists and is private
- [ ] All 4 storage policies exist
- [ ] `lib/supabase/types.ts` reflects the new column and enum
- [ ] `npm run build` passes with no errors

---

## Phase 2 — Server Actions & Validation

**Goal:** All 8 server actions are implemented and manually testable. No UI yet.

### 2.1 Files to create

**`lib/validation/project-media.ts`**

```ts
export const MEDIA_PAGE_SIZE = 24;
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

**`app/actions/media.ts`**

Top of file structure:

```ts
'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { getProjectById } from '@/app/actions/projects';
import {
  MEDIA_MAX_SIZE_BYTES,
  MEDIA_EXT_MAP,
  MEDIA_PAGE_SIZE,
  isValidMediaMimeType,
  isValidMediaCategory,
} from '@/lib/validation/project-media';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

const MEDIA_FILE_COLS =
  'id, project_id, owner_id, kind, media_category, title, description, bucket, path, mime_type, file_ext, size_bytes, tags, is_final, last_opened_at, archived_at, deleted_at, folder_id, created_at, updated_at';

const BUCKET = 'project-media';

function revalidateMediaPaths(projectId: string) {
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/media`);
}
```

**Action implementations — key logic for each:**

**`getMedia`** (paginated):

- Uses `.range(offset, offset + limit)` — this fetches `limit + 1` rows (Supabase range is inclusive on both ends).
- `hasMore = data.length > limit`. Return `data.slice(0, limit)` if `hasMore`.
- Filter: `kind = 'media'`, `archived_at IS NULL`, `deleted_at IS NULL`, `owner_id = user.id`.
- Order: `created_at DESC`.

**`uploadMedia`** (FormData):

- `file = formData.get('file') as File`.
- Validate: `isValidMediaMimeType(file.type)`, `file.size <= MEDIA_MAX_SIZE_BYTES`.
- `title = (formData.get('title') as string)?.trim()` — required, non-empty.
- `media_category` — required, validate with `isValidMediaCategory`.
- `description`, `tags` (comma-split, trimmed array) — optional.
- Storage path: `${user.id}/${projectId}/${yyyy}/${mm}/${crypto.randomUUID()}.${MEDIA_EXT_MAP[file.type]}`.
- Upload: `supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })`.
- On storage error: return `{ success: false, error }`.
- Insert into `project_files`: `kind: 'media'`, `bucket: BUCKET`, `path`, `mime_type: file.type`, `file_ext`, `size_bytes: file.size`, `owner_id: user.id`, `project_id: projectId`.
- On DB error: `supabase.storage.from(BUCKET).remove([path])` (cleanup), then return error.
- On success: `revalidateMediaPaths`, return `{ success: true, data: row }`.

**`updateMedia`**:

- Fetch row first: verify `owner_id = user.id` AND `kind = 'media'`. Return error if not found or wrong kind.
- Build update object from only the provided fields in `input`.
- Update with explicit column select.
- `revalidateMediaPaths`.

**`archiveMedia`**:

- Update `archived_at = new Date().toISOString()` where `id = fileId` AND `owner_id = user.id` AND `kind = 'media'`.
- `revalidateMediaPaths`.

**`deleteMedia`**:

- Fetch row first to get `path` and verify ownership.
- Set `deleted_at = now()` in DB.
- Delete from bucket: `supabase.storage.from(BUCKET).remove([row.path])`.
- Storage delete failure is logged but does not block the DB soft-delete.
- `revalidateMediaPaths`.

**`markMediaFinal`**:

- Update `is_final = isFinal` where `id = fileId` AND `owner_id = user.id` AND `kind = 'media'`.
- `revalidateMediaPaths`.

**`getMediaSignedUrl`**:

- Fetch row: select `path` only, verify `owner_id = user.id` AND `kind = 'media'`.
- `supabase.storage.from(BUCKET).createSignedUrl(row.path, 3600)`.
- Return `{ url }` or `{ error }`. Never return `path`.

**`touchMedia`**:

- Fire-and-forget. `update last_opened_at = now()` where `id = fileId` AND `owner_id = user.id`. No revalidation. No throw.

### 2.2 Manual testing checklist

- [ ] Upload a PNG → row appears in `project_files` with `kind = 'media'`, file exists in `project-media` bucket at correct path.
- [ ] Upload a MP4 video → same verification.
- [ ] Upload with invalid MIME (e.g. PDF) → rejected before upload, no bucket write.
- [ ] Upload file > 100 MB → rejected before upload, no bucket write.
- [ ] `getMedia(projectId)` returns only media rows, no documents.
- [ ] `archiveMedia(id)` → `archived_at` is set, row no longer returned by `getMedia`.
- [ ] `markMediaFinal(id, true)` → `is_final = true` in DB.
- [ ] `touchMedia(id)` → `last_opened_at` updated.
- [ ] `getMediaSignedUrl(id)` → returns a URL starting with `https://`, raw path not exposed.
- [ ] `getMediaSignedUrl` for a document row (wrong kind) → returns error.
- [ ] Force a DB insert error after upload → confirm file is deleted from bucket (check bucket in dashboard, confirm file gone).

### Phase 2 exit criteria

- [ ] `lib/validation/project-media.ts` created, all exports correct
- [ ] `app/actions/media.ts` created with all 8 actions
- [ ] All manual tests above pass
- [ ] No TypeScript errors in new files
- [ ] Prettier passes on both files

---

## Phase 3 — Core UI

**Goal:** The full module renders with real data. The grid is visible via the tab, skeleton shows on first load, cards open the canvas, all canvas actions work, pagination loads more items.

### 3.1 Files to create — Skeletons

**`components/skeletons/SkeletonMediaCard.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export function SkeletonMediaCard() {
  return <Skeleton className="aspect-square w-full rounded-lg" />;
}
```

**`components/skeletons/SkeletonMedia.tsx`**

```tsx
import { SkeletonMediaCard } from './SkeletonMediaCard';

export function SkeletonMedia() {
  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonMediaCard key={i} />
        ))}
      </div>
    </div>
  );
}
```

---

### 3.2 Files to create — Feature components

**`components/context/media/MediaCard.tsx`**

Props: `{ file: ProjectFile; onClick: () => void }`

Key implementation details:

- The component is a `<button>` element with `type="button"` for accessibility.
- It fetches its own signed URL on mount using `getMediaSignedUrl(file.id)` via `useEffect`. This is intentional — each card manages its own thumbnail independently.
- Three internal states: `'loading'` (initial, shows `<SkeletonMediaCard />`), `'ready'` (shows `<img>`), `'error'` (shows `<ImageOff>` icon).
- For video MIME types (`isVideoMimeType(file.mime_type)`): skip the signed URL fetch, render a placeholder with `Film` icon directly. Video preview requires the canvas.
- "Final" badge: `{file.is_final && <span className="absolute top-2 right-2 ...">Final</span>}`. Use `position: absolute` inside a `position: relative` card wrapper.
- The `<button>` wrapper must have `className="relative aspect-square overflow-hidden rounded-lg bg-muted"`.
- `onClick` is called on button click — no other behavior on the card.
- Do NOT call `touchMedia` here — that happens in `ContextMediaClient` after the canvas opens.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getMediaSignedUrl } from '@/app/actions/media';
import {
  isImageMimeType,
  isVideoMimeType,
} from '@/lib/validation/project-media';
import { SkeletonMediaCard } from '@/components/skeletons/SkeletonMediaCard';
import { Film, ImageOff } from 'lucide-react';
import { Database } from '@/lib/supabase/types';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

interface MediaCardProps {
  file: ProjectFile;
  onClick: () => void;
}

export function MediaCard({ file, onClick }: MediaCardProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  useEffect(() => {
    if (!isImageMimeType(file.mime_type)) {
      setStatus('ready'); // video — no URL needed for card
      return;
    }
    let cancelled = false;
    getMediaSignedUrl(file.id).then(({ url: signedUrl, error }) => {
      if (cancelled) return;
      if (error || !signedUrl) {
        setStatus('error');
        return;
      }
      setUrl(signedUrl);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [file.id, file.mime_type]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={file.title}
    >
      {status === 'loading' && <SkeletonMediaCard />}

      {status === 'ready' && isImageMimeType(file.mime_type) && url && (
        <img
          src={url}
          alt={file.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {status === 'ready' && isVideoMimeType(file.mime_type) && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted">
          <Film className="h-8 w-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Video</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {file.is_final && (
        <span className="absolute top-2 right-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white">
          Final
        </span>
      )}
    </button>
  );
}
```

---

**`components/context/media/MediaCanvas.tsx`**

Props:

```ts
{
  file: ProjectFile;
  url: string | null;      // null while loading
  open: boolean;
  onClose: () => void;
  onMarkFinal: (isFinal: boolean) => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}
```

Key implementation details:

**Auto-hide timer:**

```ts
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [barVisible, setBarVisible] = useState(true);

const showBar = useCallback(() => {
  setBarVisible(true);
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(
    () => setBarVisible(false),
    MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS
  );
}, []);

// Start timer on open
useEffect(() => {
  if (open) showBar();
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, [open, showBar]);
```

**Toggle on content click:**

```ts
const handleContentClick = () => {
  if (barVisible) {
    setBarVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  } else {
    showBar();
  }
};
```

**ESC key:**

```ts
useEffect(() => {
  if (!open) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [open, onClose]);
```

**Delete confirmation:**

```ts
const [deleteConfirm, setDeleteConfirm] = useState(false);
const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleDeleteClick = () => {
  if (!deleteConfirm) {
    setDeleteConfirm(true);
    deleteTimerRef.current = setTimeout(() => setDeleteConfirm(false), 3000);
  } else {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    onDelete();
  }
};
// Reset confirm state when canvas closes
useEffect(() => {
  if (!open) setDeleteConfirm(false);
}, [open]);
```

**Layout structure:**

```tsx
if (!open || !file) return null;

return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
    {/* Content area — clicking toggles bar */}
    <div className="relative h-full w-full" onClick={handleContentClick}>
      {url === null ? (
        <div className="flex h-full items-center justify-center">
          <Skeleton className="h-64 w-64 rounded-lg" />
        </div>
      ) : isImageMimeType(file.mime_type) ? (
        <img src={url} alt={file.title} className="h-full w-full object-contain" />
      ) : (
        <video src={url} controls className="h-full w-full" onClick={(e) => e.stopPropagation()} />
      )}
    </div>

    {/* Action bar */}
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-10 flex items-center gap-3 bg-black/70 px-4 py-3 backdrop-blur-sm transition-all duration-150',
        barVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      )}
      onMouseEnter={showBar}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title + category — left */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{file.title}</p>
        <p className="text-xs text-white/60">{file.media_category}</p>
      </div>

      {/* Actions — right */}
      <button onClick={() => onMarkFinal(!file.is_final)} ...>
        {/* Star/bookmark icon */}
      </button>
      <button onClick={() => { onEdit(); showBar(); }} ...>Edit</button>
      <button onClick={handleArchive} ...>Archive</button>
      <button
        onClick={handleDeleteClick}
        className={cn(deleteConfirm ? 'text-red-400' : 'text-white/80')}
      >
        {deleteConfirm ? 'Confirm?' : 'Delete'}
      </button>
      <button onClick={onClose} ...><X /></button>
    </div>
  </div>
);
```

**Note:** `onArchive` inside the canvas calls `showBar()` only if you want user feedback before closing. Since archive closes the canvas, just call `onArchive()` directly.

---

**`components/context/media/UploadMediaDialog.tsx`**

Structure mirrors `UploadDocumentDialog.tsx`. Key differences:

- MIME types from `MEDIA_ACCEPTED_MIME_TYPES` (not DOCUMENT types).
- Category field uses `MEDIA_CATEGORY_VALUES` / `MEDIA_CATEGORY_LABELS`.
- Max size: `MEDIA_MAX_SIZE_BYTES`.
- Calls `uploadMedia(projectId, formData)`.
- No folder field (folders are out of scope for v1).
- Build FormData: `formData.append('file', file)`, `formData.append('title', title)`, `formData.append('media_category', category)`, etc.

---

**`components/context/media/EditMediaDialog.tsx`**

Structure mirrors `EditDocumentDialog.tsx`. Key differences:

- No file picker.
- Category field uses `MEDIA_CATEGORY_VALUES`.
- Pre-fills from `file.media_category`, not `file.document_category`.
- Calls `updateMedia(file.id, { title, media_category, description, tags })`.

---

### 3.3 Files to create — Route

**`app/context/[projectId]/media/page.tsx`**

```tsx
import { requireAuth } from '@/lib/auth';
import ContextMediaFromCache from './ContextMediaFromCache';

export default async function ContextMediaPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  return <ContextMediaFromCache projectId={params.projectId} />;
}
```

---

**`app/context/[projectId]/media/ContextMediaFromCache.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMedia } from '@/app/actions/media';
import { MEDIA_PAGE_SIZE } from '@/lib/validation/project-media';
import { SkeletonMedia } from '@/components/skeletons/SkeletonMedia';
import { useContextDataCache } from '../../ContextDataCache';
import ContextMediaClient from './ContextMediaClient';
import { Database } from '@/lib/supabase/types';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

type PaginatedMediaCache = {
  items: ProjectFile[];
  hasMore: boolean;
  loadedCount: number;
};
```

Logic:

- Read cache: `const cached = cache.get<PaginatedMediaCache>({ type: 'media', projectId })`.
- If cache hit: pass `cached.items`, `cached.hasMore`, `cached.loadedCount` straight to `ContextMediaClient` — no fetch.
- If cache miss: show `<SkeletonMedia />`, call `getMedia(projectId, { offset: 0, limit: MEDIA_PAGE_SIZE })`, store result in cache as `{ items, hasMore, loadedCount: items.length }`, render client.
- `loadData` (for `onRefresh`): always fetches page 1 only. Updates cache and state. Resets `loadedCount`.
- `useEffect` pattern: same as `ContextDocumentsFromCache` (cancelled flag, skip if cached).

---

**`app/context/[projectId]/media/ContextMediaClient.tsx`**

State:

```ts
const [media, setMedia] = useState<ProjectFile[]>(initialMedia);
const [hasMore, setHasMore] = useState(initialHasMore);
const [loadedCount, setLoadedCount] = useState(initialLoadedCount);
const [isLoadingMore, setIsLoadingMore] = useState(false);
const [uploadOpen, setUploadOpen] = useState(false);
const [canvasFile, setCanvasFile] = useState<ProjectFile | null>(null);
const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
const [editTarget, setEditTarget] = useState<ProjectFile | null>(null);
```

**Card click handler:**

```ts
const handleCardClick = async (file: ProjectFile) => {
  // Open canvas immediately (url = null shows loading shimmer inside canvas)
  setCanvasFile(file);
  setCanvasUrl(null);
  void touchMedia(file.id);
  const { url, error } = await getMediaSignedUrl(file.id);
  if (error || !url) {
    // Canvas is open, show error state — do not close
    return;
  }
  setCanvasUrl(url);
};
```

**Canvas close:**

```ts
const handleCanvasClose = () => {
  setCanvasFile(null);
  setCanvasUrl(null);
};
```

**Canvas mark final (optimistic):**

```ts
const handleCanvasMarkFinal = async (isFinal: boolean) => {
  if (!canvasFile) return;
  // Optimistic: update canvas file and grid
  setCanvasFile((prev) => (prev ? { ...prev, is_final: isFinal } : null));
  setMedia((prev) =>
    prev.map((f) => (f.id === canvasFile.id ? { ...f, is_final: isFinal } : f))
  );
  const { success } = await markMediaFinal(canvasFile.id, isFinal);
  if (!success) {
    // Revert
    setCanvasFile((prev) => (prev ? { ...prev, is_final: !isFinal } : null));
    setMedia((prev) =>
      prev.map((f) =>
        f.id === canvasFile.id ? { ...f, is_final: !isFinal } : f
      )
    );
    toastError(t('media.mark_final_error'));
  }
};
```

**Canvas archive:**

```ts
const handleCanvasArchive = async () => {
  if (!canvasFile) return;
  handleCanvasClose();
  setMedia((prev) => prev.filter((f) => f.id !== canvasFile.id));
  const { success } = await archiveMedia(canvasFile.id);
  if (!success) {
    // Revert: re-add the item (or just trigger onRefresh)
    void onRefresh?.();
    toastError(t('media.archive_error'));
  }
};
```

**Canvas delete:**

```ts
const handleCanvasDelete = async () => {
  if (!canvasFile) return;
  handleCanvasClose();
  setMedia((prev) => prev.filter((f) => f.id !== canvasFile.id));
  const { success } = await deleteMedia(canvasFile.id);
  if (!success) {
    void onRefresh?.();
    toastError(t('media.delete_error'));
  }
};
```

**Canvas edit success:**

```ts
const handleEditSuccess = (updated: ProjectFile) => {
  setEditTarget(null);
  setCanvasFile(updated); // update canvas with new metadata
  setMedia((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
};
```

**Load more:**

```ts
const handleLoadMore = async () => {
  setIsLoadingMore(true);
  const { items: newItems, hasMore: newHasMore } = await getMedia(projectId, {
    offset: loadedCount,
    limit: MEDIA_PAGE_SIZE,
  });
  const updatedItems = [...media, ...newItems];
  const newLoadedCount = loadedCount + newItems.length;
  setMedia(updatedItems);
  setHasMore(newHasMore);
  setLoadedCount(newLoadedCount);
  cache.set(
    { type: 'media', projectId },
    {
      items: updatedItems,
      hasMore: newHasMore,
      loadedCount: newLoadedCount,
    }
  );
  setIsLoadingMore(false);
};
```

**Upload success (prepend):**

```ts
const handleUploadSuccess = (file: ProjectFile) => {
  setUploadOpen(false);
  setMedia((prev) => [file, ...prev]);
  // loadedCount intentionally NOT updated
};
```

**JSX structure:**

```tsx
return (
  <div className="p-4 md:p-6 min-h-full">
    {/* Empty state */}
    {media.length === 0 && !isLoadingMore && (
      <div className="flex flex-col items-center justify-center py-24">
        <Image className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">{t('media.no_media_yet')}</p>
        <button
          onClick={() => setUploadOpen(true)}
          className="text-primary text-sm font-medium hover:underline"
        >
          {t('media.upload')}
        </button>
      </div>
    )}

    {/* Grid */}
    {media.length > 0 && (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {media.map((file) => (
          <MediaCard
            key={file.id}
            file={file}
            onClick={() => void handleCardClick(file)}
          />
        ))}
      </div>
    )}

    {/* Load more */}
    {hasMore && (
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => void handleLoadMore()}
          disabled={isLoadingMore}
          className="..."
        >
          {isLoadingMore ? t('common.loading') : t('media.load_more')}
        </button>
      </div>
    )}

    {/* FAB */}
    <button
      type="button"
      onClick={() => setUploadOpen(true)}
      aria-label={t('media.upload')}
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ..."
    >
      <Plus className="h-6 w-6" />
    </button>

    {/* Canvas */}
    <MediaCanvas
      file={canvasFile!}
      url={canvasUrl}
      open={canvasFile !== null}
      onClose={handleCanvasClose}
      onMarkFinal={handleCanvasMarkFinal}
      onEdit={() => setEditTarget(canvasFile)}
      onArchive={() => void handleCanvasArchive()}
      onDelete={() => void handleCanvasDelete()}
    />

    {/* Dialogs */}
    <UploadMediaDialog
      open={uploadOpen}
      projectId={projectId}
      onClose={() => setUploadOpen(false)}
      onSuccess={handleUploadSuccess}
    />
    <EditMediaDialog
      open={editTarget !== null}
      file={editTarget}
      onClose={() => setEditTarget(null)}
      onSuccess={handleEditSuccess}
    />
  </div>
);
```

---

### 3.4 Files to modify

**`components/context/ContextTabBar.tsx`**

Add to the `TABS` array, after the `documents` entry:

```ts
{ slug: 'media', labelKey: 'context.media', icon: Image },
```

Add `Image` to the lucide import. Add i18n key `context.media` to all translation files (value: `"Media"` in both English and Spanish).

**`app/context/ContextDataCache.tsx`**

Add to the `CacheKey` discriminated union:

```ts
| { type: 'media'; projectId: string }
```

Add to the `cacheKeyToString` function:

```ts
case 'media': return `media:${k.projectId}`;
```

### Phase 3 exit criteria

- [ ] Tab "Media" is visible in the context tab bar and navigates to `/context/[projectId]/media`
- [ ] First visit shows `<SkeletonMedia />`, then grid renders
- [ ] Subsequent visits (same session) load from cache instantly — no skeleton
- [ ] Cards show image thumbnails (or video icon) — no menus, no buttons
- [ ] "Final" badge appears on cards where `is_final = true`
- [ ] Clicking a card opens the canvas immediately (with shimmer while URL loads)
- [ ] Canvas action bar shows on open, auto-hides after 2.5 seconds
- [ ] Tapping image content toggles action bar
- [ ] ESC key closes canvas
- [ ] "Mark as Final" optimistic toggle works; badge updates on grid card without refresh
- [ ] "Edit" opens `EditMediaDialog` on top of canvas; edit saves and canvas title updates
- [ ] "Archive" closes canvas and removes card from grid
- [ ] "Delete" shows "Confirm?" on first click; second click removes card
- [ ] Upload FAB opens dialog; successful upload prepends card to grid
- [ ] "Load more" button appears when `hasMore = true`; clicking appends next page
- [ ] "Load more" button hidden when `hasMore = false`
- [ ] `npm run build` passes, no TypeScript errors, Prettier passes

---

## Phase 4 — Polish & Edge Cases

**Goal:** Production-ready. Every interaction feels instant. Every error is surfaced cleanly.

### 4.1 Tasks

**Canvas open/close animation**

- Wrap canvas in a CSS transition: `opacity-0 → opacity-100` on mount (200ms ease-out), reverse on close.
- Use a `mounted` state with a 10ms delay before adding the `opacity-100` class (allows the transition to play).
- Or use `data-[state=open]` Radix pattern if wrapping in Dialog.

**Action bar show/hide animation**

- `transition-all duration-150` on the action bar div (already in the spec).
- When `barVisible = false`: `opacity-0 translate-y-2 pointer-events-none`. When true: `opacity-100 translate-y-0`.

**Image loading state inside canvas**

- When `url === null` (fetching signed URL): show a centered `<Skeleton className="h-64 w-64 rounded-xl" />` inside the canvas.
- When URL arrives: image fades in (`transition-opacity duration-200`).

**MediaCard error state**

- When signed URL fetch fails: show `<ImageOff className="h-8 w-8 text-muted-foreground" />` centered in the card (already in Phase 3 spec — verify it works correctly).

**Delete confirmation auto-reset**

- Already in spec: 3-second timeout resets `deleteConfirm` to false. Verify the timer is cleared when canvas closes (`useEffect` on `open`).

**Mark as Final revert toast**

- On server error: call `toastError(t('media.mark_final_error'))` from `@/lib/ui/toast`.

**Archive / Delete revert**

- On server error after optimistic removal: call `onRefresh()` to restore the correct server state.

**"Load more" loading state**

- Button text changes to loading indicator while `isLoadingMore`.
- Button `disabled` during load to prevent double-submit.

**Touch target audit**

- Action bar buttons: verify each is `min-h-[48px]`.
- FAB: verify `h-14 w-14` (56px).
- Grid cards: at any reasonable screen size with 2 columns, minimum card width is (screen_width - padding - gap) / 2. On 375px screen: (375 - 32 - 12) / 2 ≈ 165px. Well above 44px. ✓

**i18n keys to add**

```
media.no_media_yet
media.upload
media.load_more
media.mark_final_error
media.archive_error
media.delete_error
media.delete_confirm
context.media
```

**Prettier**

- Run Prettier on every new and modified file before marking Phase 4 done.

### Phase 4 exit criteria

- [ ] Canvas opens with opacity fade-in (200ms)
- [ ] Action bar hides with opacity + translateY transition (150ms)
- [ ] Canvas shows skeleton while signed URL is loading, then fades image in
- [ ] Delete "Confirm?" auto-resets after 3 seconds if not confirmed
- [ ] Mark as Final revert toast shown on server error
- [ ] Archive / delete revert on server error via `onRefresh()`
- [ ] "Load more" button is disabled during fetch
- [ ] All i18n keys defined in both language files
- [ ] All action bar buttons ≥ 48px tall
- [ ] No console warnings or errors
- [ ] `npm run build` passes
- [ ] Prettier passes on all new and modified files

---

## Global Constraints (enforced across all phases)

- **No action buttons on grid cards.** Cards call `onClick` and nothing else.
- **No `.select()` without column list.** Use `MEDIA_FILE_COLS` constant.
- **No raw storage paths to client.** Only `getMediaSignedUrl` returns URLs.
- **No `router.refresh()`.** Use `onRefresh` + cache invalidation only.
- **No `select('*')`.** Always explicit columns.
- **Prettier after every file.** Semicolons, single quotes, tabWidth 2, trailingComma es5.
- **`kind = 'media'` in every query.** Never mix with document rows.
- **`MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS` for the timer.** Never inline `2500`.
- **`isImageMimeType` / `isVideoMimeType` for type branching.** Never hardcode MIME strings in components.

---

## Definition of Done (full module)

All four phase exit criteria checklists are complete AND:

- [ ] The "Media" tab is accessible and functional in a project context
- [ ] Uploading, previewing, editing, archiving, and deleting all work end-to-end
- [ ] Grid is clean — no buttons or menus on cards
- [ ] Canvas auto-hides action bar; tap-to-toggle works
- [ ] Pagination works: load more appends, cache accumulates, refresh resets to page 1
- [ ] Session cache: tab re-visit shows data instantly, no skeleton on return
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] `npm run lint` passes with no new violations
- [ ] Prettier passes on all new files
