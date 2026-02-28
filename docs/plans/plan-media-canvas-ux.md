# Media Canvas UX — Implementation Plan

**Date:** 2026-02-28  
**Status:** Draft — awaiting approval  
**Scope:** Media viewer (canvas) when an image/media is open. Builds on existing MediaCanvas and Phase 4 polish.

---

## Requirements (11)

| #   | Requirement                                                                                   | Notes                                        |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | No padding/margin when image is open (bottom or sides)                                        | Full-bleed content area                      |
| 2   | Actions menu open by default, dismissible by tapping the screen                               | Tap content = hide menu; 3-dots = show again |
| 3   | Close button at top-left corner                                                               |                                              |
| 4   | 3-dots menu at top-right corner                                                               | Trigger for actions menu                     |
| 5   | Action menu items: Edit, Delete, Archive, Share                                               | (+ Download per #10)                         |
| 6   | Title, tags, description at bottom; collapsible (no full descriptions by default)             | Clean space, breathable                      |
| 7   | Description expandable so users can read full description                                     | e.g. “Show more” / expand section            |
| 8   | Share creates a link; recipient sees picture + description only (read-only, no owner actions) | Token-based or long-lived URL                |
| 9   | Favorite (Mark as Final) button stays in bottom widget with title/description                 | Keep current placement                       |
| 10  | Download button in the actions menu                                                           |                                              |
| 11  | Zoom, pan, and drag gestures on the image                                                     | User can manipulate to see better            |

---

## Phase Overview

| Phase | Name            | Deliverable                                                                         |
| ----- | --------------- | ----------------------------------------------------------------------------------- |
| 1     | Layout & chrome | Full-bleed canvas; close top-left; 3-dots top-right                                 |
| 2     | Actions menu    | Edit, Delete, Archive, Share, Download; open by default; tap to dismiss             |
| 3     | Bottom widget   | Collapsible title/tags/description; expandable full description; Favorite in widget |
| 4     | Download        | API route + Download menu item                                                      |
| 5     | Share           | Share token backend + public read-only view + Share action                          |
| 6     | Zoom, pan, drag | Image zoom/pan/drag (e.g. react-zoom-pan-pinch)                                     |

Execution order: 1 → 2 → 3 → 4 → 5 → 6. Each phase is testable before starting the next.

---

## Phase 1 — Layout & Chrome

**Goal:** Full-bleed image area; close button top-left; 3-dots trigger top-right (no menu content yet).

### Tasks

1. **Full-bleed**
   - Ensure canvas root is `fixed inset-0 z-50` with no inner padding/margin.
   - Content area: `absolute inset-0` or `fixed inset-0` for the clickable overlay; image container fills it.
   - Image: `object-contain` so aspect ratio is kept and image fits within the viewport (no letterbox padding beyond the black background).
   - Confirm no `p-*` or `m-*` on the content div that holds the image.

2. **Close button**
   - Move from bottom bar to **fixed top-left** (e.g. `fixed left-4 top-4 z-20`).
   - Use same icon (X), size and touch target (min 48px). Style to match (e.g. white/70 on black).

3. **3-dots at top-right**
   - Add a single button **fixed top-right** (e.g. `fixed right-4 top-4 z-20`) with `MoreVertical` (or `MoreHorizontal`) icon.
   - For Phase 1, button can be non-functional or open an empty dropdown; Phase 2 will add menu content.

### Files to touch

- `components/context/media/MediaCanvas.tsx`

### Exit criteria

- [ ] Image/content area has no padding or margin on sides or bottom (full-bleed).
- [ ] Close button is top-left.
- [ ] 3-dots button is top-right.
- [ ] Build and lint pass.

---

## Phase 2 — Actions Menu (Open by Default, Tap to Dismiss)

**Goal:** 3-dots opens a dropdown with Edit, Delete, Archive, Share, Download. Menu is open when canvas opens; tapping the image dismisses it.

### Tasks

1. **Dropdown menu**
   - Use existing `@/components/ui/dropdown-menu` (Radix).
   - Trigger: the 3-dots button (top-right).
   - Content: `DropdownMenuContent` with `side="bottom"` `align="end"` so it appears below the 3-dots.
   - Items: Edit, Delete, Archive, Share, Download (icons + labels). Use `DropdownMenuItem` for each.
   - Wire each item to existing handlers: Edit → `onEdit`, Delete → two-step confirm then `onDelete`, Archive → `onArchive`. Share and Download implemented in Phases 5 and 4.

2. **Open by default + tap to dismiss**
   - Control the dropdown with state: `menuOpen`, default `true` when canvas opens.
   - Use `DropdownMenu` with `open={menuOpen}` and `onOpenChange={setMenuOpen}`.
   - When user clicks/taps the **content area** (image/video/skeleton), call `setMenuOpen(false)` so the menu closes. Do not close on ESC for the menu (ESC still closes the canvas per existing behavior).
   - 3-dots click sets `menuOpen(true)` or toggles; so after tap-to-dismiss, user can open again via 3-dots.

3. **Remove old action bar**
   - Remove the current bottom action bar that has Edit, Archive, Delete, Close, Mark as Final. Keep only the new top-left close, top-right 3-dots, and the new bottom widget (Phase 3).

### Files to touch

- `components/context/media/MediaCanvas.tsx`
- Add props if needed: `onShare`, `onDownload` (can be no-op until Phases 4–5).

### Exit criteria

- [ ] 3-dots opens menu with Edit, Delete, Archive, Share, Download.
- [ ] Menu is open when canvas first opens.
- [ ] Tapping the image/content area closes the menu.
- [ ] Edit, Delete, Archive call existing handlers; Share/Download can be placeholders.
- [ ] Build and lint pass.

---

## Phase 3 — Bottom Widget (Title, Tags, Description, Favorite)

**Goal:** Single bottom widget: title, tags, short description (collapsed by default); expandable full description; Favorite (Mark as Final) in the same widget.

### Tasks

1. **Bottom widget layout**
   - One bar at bottom: `fixed bottom-0 left-0 right-0 z-10` with same style as current (e.g. `bg-black/70 backdrop-blur-sm`).
   - Left side: title (and optionally category); tags as small chips or comma-separated; description teaser (e.g. first line or 1–2 lines, truncated).
   - Right side: Favorite (Star) button only — same behavior as current “Mark as Final”.

2. **Collapsed by default**
   - Title: always visible (truncate if long).
   - Tags: visible as compact list/chips or single line.
   - Description: show truncated (e.g. `line-clamp-2` or first 80 chars) so the bar doesn’t grow large. No “full” description in default view.

3. **Expandable full description**
   - Add “Show more” / “Show full description” (or chevron) that expands a section below the bar or within the bar to show full description text.
   - “Show less” (or collapse) to return to truncated view. Use local state (e.g. `descriptionExpanded`).

4. **i18n**
   - Keys for “Show more”, “Show less” (or “Full description” / “Collapse”), and any new labels in the widget.

### Files to touch

- `components/context/media/MediaCanvas.tsx`
- `locales/en.json`, `locales/es.json` (new keys)

### Exit criteria

- [ ] Bottom widget shows title, tags, truncated description.
- [ ] Favorite (Mark as Final) is in the bottom widget.
- [ ] User can expand to read full description and collapse again.
- [ ] No padding/margin on sides/bottom of the **image** (widget is the only bottom chrome).
- [ ] Build and lint pass.

---

## Phase 4 — Download

**Goal:** Download action in the menu that lets the user download the media file.

### Tasks

1. **API route**
   - Add `app/api/media/[fileId]/download/route.ts`.
   - Auth: require user; verify file belongs to user (`project_files.owner_id`, `kind = 'media'`).
   - Get storage path, generate signed URL with **download** disposition and a sensible filename (e.g. from `title` + `file_ext`).
   - Return `302` redirect to that URL (same pattern as `app/api/documents/[fileId]/view/route.ts`; for download, use Supabase `createSignedUrl(..., { download: filename })`).

2. **Media actions**
   - Optionally add `getMediaDownloadUrl(fileId)` in `app/actions/media.ts` that returns a URL (e.g. to the API route or a signed URL). Per AGENTS.md, opening in new tab should use a synchronous URL; so the client will call `window.open(/api/media/${fileId}/download, '_blank')` so the browser navigates to the route and gets the redirect to the file. No async URL fetch before `window.open`.

3. **Menu item**
   - In MediaCanvas, add “Download” to the actions dropdown. On click: `window.open(\`/api/media/${file.id}/download\`, '\_blank', 'noopener,noreferrer')`.

### Files to create/change

- `app/api/media/[fileId]/download/route.ts` (new)
- `components/context/media/MediaCanvas.tsx` (wire Download)

### Exit criteria

- [ ] Download in menu opens download in a new tab (or triggers download).
- [ ] API route checks auth and ownership.
- [ ] Build and lint pass.

---

## Phase 5 — Share (Read-Only Link)

**Goal:** Share creates a link; recipient can open it and see only the image and description (read-only), no Edit/Delete/Archive/etc.

### Tasks

1. **Backend: share token**
   - **Option A (recommended):** New table `media_share_tokens` (or `project_file_share_tokens`): `id`, `file_id` (FK to project_files), `token` (unique, e.g. nanoid), `expires_at`, `created_at`. RLS: only owner can insert/select their rows.
   - **Option B:** Store token in `project_files` (e.g. `share_token`, `share_expires_at`). Simpler but couples share state to the file row.
   - Create migration; add RLS so only `owner_id = auth.uid()` can manage tokens for their files.

2. **Create share token**
   - Server action: `createMediaShareLink(fileId)` (or similar). Requires auth; verify file is media and owned; create token (e.g. 7-day expiry), return full URL: `${origin}/share/media/${token}` (or `/media/share/${token}`).

3. **Public read-only view**
   - Route: `app/share/media/[token]/page.tsx` (or `app/media/share/[token]/page.tsx`). No auth required.
   - Server: resolve token → file_id; load file row (id, title, description, path, mime_type, …). If expired or not found, 404.
   - Generate signed URL for the file (short expiry for this request, e.g. 1 hour).
   - Page: minimal layout (no app chrome): image (or video) + title + description. No Edit/Delete/Archive/Share/Download. Optional “Open in app” for logged-in users later.

4. **Share in menu**
   - Share menu item: call `createMediaShareLink(file.id)`, copy URL to clipboard, show toast “Link copied” (or “Share link created”). If error, show error toast.

### Files to create/change

- Migration: `supabase/migrations/YYYYMMDDHHMMSS_media_share_tokens.sql`
- `app/actions/media.ts` (createMediaShareLink, and possibly getMediaByShareToken for the public page)
- `app/share/media/[token]/page.tsx` (or chosen path) — server component that fetches by token and renders image + metadata
- `components/context/media/MediaCanvas.tsx` (wire Share)
- `lib/supabase/types.ts` if new table
- i18n: share success/error messages

### Exit criteria

- [ ] Share creates a link; copying to clipboard works.
- [ ] Opening the link in an incognito/second browser shows only image + title + description, no actions.
- [ ] Expired or invalid token returns 404.
- [ ] Build and lint pass.

---

## Phase 6 — Zoom, Pan, Drag

**Goal:** User can zoom, pan, and drag the image in the canvas for better viewing.

### Tasks

1. **Library**
   - Add `react-zoom-pan-pinch` (or equivalent). Install: `npm install react-zoom-pan-pinch`.

2. **Wrap image only**
   - In MediaCanvas, wrap the **image** (not the video, not the skeleton) in `TransformWrapper` + `TransformComponent` from the library. Configure sensible defaults (e.g. min/max scale, double-tap to reset, smooth transitions).
   - Video: keep as-is (no zoom/pan) or add the same wrapper if the library supports it; otherwise leave video without zoom for simplicity.

3. **Gestures**
   - Ensure pinch-to-zoom and drag (pan) work on touch and mouse. Do not let zoom/pan capture the “tap to dismiss menu” in a way that blocks it (e.g. tap on content still dismisses menu; only prevent default on double-tap if needed for zoom reset).

4. **Skeleton and URL loading**
   - Skeleton and “loading” state remain outside the transform wrapper; when image is loaded, show it inside the wrapper so zoom/pan apply to the image only.

### Files to touch

- `package.json` (add dependency)
- `components/context/media/MediaCanvas.tsx`

### Exit criteria

- [ ] Image can be zoomed (e.g. wheel, pinch) and panned (drag).
- [ ] Touch and mouse both work.
- [ ] Video and skeleton unchanged; no regression on close/menu behavior.
- [ ] Build and lint pass.

---

## Optional: Phase 4 Polish Leftovers

- **media.delete_confirm:** Add `media.delete_confirm` in en/es and use it for the Delete “Confirm?” text in MediaCanvas (and ensure delete confirm timer is cleared on close — already done).
- **Canvas close animation:** If desired, add a short fade-out before unmount (e.g. “closing” state with opacity-0, then onClose after 200ms). Not required for the 11 new requirements.

---

## Definition of Done (All Phases)

- [ ] All 11 requirements implemented and verified.
- [ ] No padding/margin on image (full-bleed); close top-left; 3-dots top-right.
- [ ] Actions menu (Edit, Delete, Archive, Share, Download) open by default; tap to dismiss.
- [ ] Bottom widget: title, tags, collapsed description, expandable full description, Favorite.
- [ ] Download works via menu; Share creates read-only link and copy to clipboard.
- [ ] Zoom, pan, drag on image.
- [ ] `npm run build` and `npm run lint` pass.
- [ ] Prettier run on modified files.

---

## Risk / Notes

- **Share:** Token storage and public route need to be secure (no bypass of RLS for non-shared files). Use a long random token and expiry.
- **Zoom library:** If `react-zoom-pan-pinch` causes layout or SSR issues, we can fall back to a minimal custom implementation (transform + wheel + pointer events).
- **Tap vs zoom:** On touch, distinguish tap (dismiss menu) from pinch/drag (zoom/pan). Library usually handles this; verify no conflict.
