# Project Vaults + Timeline — Final Plan and PR1 Foundation Execution

## Scope and fixed decisions

This document is the implementation plan and PR1 execution record for:

1. Media Vault
2. Document Hub
3. Link Vault
4. Project Timeline

Non-negotiable decisions applied in this plan:

- Project-centric only, under `/project/[id]` context.
- Separate tables: `project_files` and `project_links` (not a unified assets table).
- Two private buckets: `project-media` and `project-docs`.
- Storage defense-in-depth policies:
  - first path segment must be `auth.uid()`
  - second path segment must be `project_id` owned by `auth.uid()`
- Files page UX contract:
  - default **All** view with 3 collapsible sections (Media grid / Documents list / Links cards)
  - sub-tabs: All / Media / Documents / Links
  - one **Add** CTA with menu: Upload Media / Upload Document / Add Link
  - mobile: bottom-sheet preview + sticky CTA + tap targets >= 44px
- Timeline will capture high-signal events only and dedupe noisy events (60–120s window).

---

## A) Current repo architecture findings

## Project context navigation

- Project context shell is implemented in `app/project/[id]/layout.tsx` and project tab navigation in `components/project/ProjectContextNav.tsx`.
- Existing tabs are project-local (Overview, Tasks, Budget, Ideas, CRM, Notes, Files), matching the requirement that new modules stay inside `/project/[id]`.

## Current project routes relevant to this work

- `/project/[id]/files` exists but is currently a placeholder.
- `/project/[id]/notes`, `/project/[id]/tasks`, `/project/[id]/ideas`, `/project/[id]/budget` already follow project-scoped data access.

## Server action patterns

- Pattern is consistent across feature action files:
  - `'use server'`
  - `requireAuth()` guard first
  - Supabase server client from `@/lib/supabase/server`
  - explicit input checks and normalization
  - return typed result objects
  - `revalidatePath(...)` after mutations

## RLS/security patterns

- Current schema uses owner-based and project-ownership-join RLS policies.
- Storage policies already enforce path-folder ownership in private buckets (`storage.foldername(name)[1] = auth.uid()`).
- This foundation maps directly to the required defense-in-depth model for project vault buckets.

---

## B) Final DB schema

## Enums

### File dimension enums

- `public.project_file_kind_enum`
  - `media`
  - `document`

- `public.project_media_category_enum`
  - `branding`
  - `content`
  - `reference`
  - `screenshot`
  - `mockup`
  - `other`

- `public.project_document_category_enum`
  - `brief`
  - `contract`
  - `invoice`
  - `proposal`
  - `report`
  - `spreadsheet`
  - `notes`
  - `other`

### Link dimension enums

- `public.project_link_type_enum`
  - `environment`
  - `tool`
  - `resource`
  - `social`
  - `reference`
  - `other`

- `public.project_link_section_enum`
  - `delivery`
  - `infrastructure`
  - `product`
  - `marketing`
  - `operations`
  - `client`
  - `other`

### Event enums

- `public.project_event_type_enum`
  - `task_created`
  - `task_status_changed`
  - `task_completed`
  - `note_created`
  - `note_updated`
  - `file_uploaded`
  - `file_archived`
  - `link_added`
  - `link_updated`
  - `link_archived`
  - `project_updated`

- `public.project_event_entity_enum`
  - `project`
  - `task`
  - `note`
  - `file`
  - `link`

## Table: `public.project_files`

Purpose: source of truth for Media Vault + Document Hub file metadata.

Columns:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `owner_id uuid not null references auth.users(id) on delete cascade`
- `linked_task_id uuid null references public.tasks(id) on delete set null`
- `kind public.project_file_kind_enum not null`
- `media_category public.project_media_category_enum null`
- `document_category public.project_document_category_enum null`
- `title text not null`
- `description text null`
- `bucket text not null` (`project-media` or `project-docs`)
- `path text not null`
- `mime_type text not null`
- `file_ext text null`
- `size_bytes bigint not null check (size_bytes > 0)`
- `checksum_sha256 text null`
- `width int null`
- `height int null`
- `duration_seconds numeric(10,2) null`
- `page_count int null`
- `source_label text null`
- `source_url text null`
- `tags text[] not null default '{}'::text[]`
- `sort_order int not null default 0`
- `is_final boolean not null default false`
- `archived_at timestamptz null`
- `created_at timestamptz not null default timezone('utc', now())`
- `updated_at timestamptz not null default timezone('utc', now())`

Constraints:

- `bucket` must be one of `project-media`, `project-docs`.
- kind/bucket alignment:
  - `media` => bucket `project-media`
  - `document` => bucket `project-docs`
- category alignment:
  - `media` => `media_category` required and `document_category` null
  - `document` => `document_category` required and `media_category` null

Indexes:

- `(project_id, kind, created_at desc)`
- `(project_id, archived_at, sort_order, created_at desc)`
- `(project_id, linked_task_id)`
- `(owner_id, created_at desc)`
- GIN on `tags`

Triggers:

- `BEFORE UPDATE` trigger to set `updated_at` via `public.update_updated_at_column()`.

## Table: `public.project_links`

Purpose: Link Vault model for project tool/resource links.

Columns:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `owner_id uuid not null references auth.users(id) on delete cascade`
- `linked_task_id uuid null references public.tasks(id) on delete set null`
- `title text not null`
- `description text null`
- `url text not null`
- `provider text null`
- `link_type public.project_link_type_enum not null`
- `section public.project_link_section_enum not null`
- `tags text[] not null default '{}'::text[]`
- `pinned boolean not null default false`
- `sort_order int not null default 0`
- `open_in_new_tab boolean not null default true`
- `last_checked_at timestamptz null`
- `status_code int null`
- `archived_at timestamptz null`
- `created_at timestamptz not null default timezone('utc', now())`
- `updated_at timestamptz not null default timezone('utc', now())`

Constraints:

- URL must start with `http://` or `https://`.

Indexes:

- `(project_id, pinned desc, sort_order, created_at desc)`
- `(project_id, section, pinned desc, created_at desc)`
- `(project_id, link_type, created_at desc)`
- `(owner_id, created_at desc)`
- GIN on `tags`

Triggers:

- `BEFORE UPDATE` trigger to set `updated_at` via `public.update_updated_at_column()`.

## Table: `public.project_events`

Purpose: high-signal project timeline feed.

Columns:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `owner_id uuid not null references auth.users(id) on delete cascade`
- `actor_user_id uuid null references auth.users(id) on delete set null`
- `event_type public.project_event_type_enum not null`
- `entity_type public.project_event_entity_enum not null`
- `entity_id uuid null`
- `summary text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `dedupe_key text null`
- `occurred_at timestamptz not null default timezone('utc', now())`
- `created_at timestamptz not null default timezone('utc', now())`

Indexes:

- `(project_id, occurred_at desc)`
- `(project_id, event_type, occurred_at desc)`
- `(project_id, entity_type, entity_id, occurred_at desc)`
- `(owner_id, occurred_at desc)`
- `(project_id, dedupe_key, occurred_at desc)` where `dedupe_key is not null`

Dedupe support:

- `dedupe_key` supports 60–120s throttling in action layer by entity+event semantics.

## RLS policy model (all 3 tables)

For each table (`project_files`, `project_links`, `project_events`):

- SELECT/INSERT/UPDATE/DELETE only when:
  - row `owner_id = auth.uid()`
  - and row `project_id` belongs to authenticated user (join to `public.projects`).

---

## C) Supabase Storage plan

## Buckets

Two private buckets:

- `project-media`
- `project-docs`

## Deterministic path convention

For both buckets:

`{owner_id}/{project_id}/{yyyy}/{mm}/{uuid}.{ext}`

Examples:

- `1f.../7a.../2026/02/8d....webp`
- `1f.../7a.../2026/02/9e....pdf`

## Defense-in-depth storage policy logic

Policy conditions must all pass:

1. `bucket_id` is expected bucket (`project-media` or `project-docs`).
2. First folder segment equals `auth.uid()::text`.
3. Second folder segment parses to UUID and that `project_id` is owned by `auth.uid()` in `public.projects`.

Implementation detail:

- Introduce helper function: `public.storage_path_belongs_to_owned_project(name text)`
- Use it in storage policies for `INSERT`, `SELECT`, `UPDATE`, `DELETE` on both buckets.

---

## D) Server actions plan

## File locations

- Files feature actions:
  - `app/project/[id]/files/actions.ts`
- Timeline feature actions:
  - `app/project/[id]/timeline/actions.ts`
- Shared validation:
  - `lib/validation/project-vaults.ts`
- Shared storage helpers:
  - `lib/storage/project-files.ts`

## Proposed function names

### Files + links

- `listProjectFilesAction(projectId, params?)`
- `listProjectLinksAction(projectId, params?)`
- `uploadProjectMediaAction(projectId, formData)`
- `uploadProjectDocumentAction(projectId, formData)`
- `createProjectLinkAction(projectId, input)`
- `updateProjectFileAction(fileId, input)`
- `updateProjectLinkAction(linkId, input)`
- `archiveProjectFileAction(fileId)`
- `archiveProjectLinkAction(linkId)`
- `reorderProjectFilesAction(projectId, orderedIds)`
- `reorderProjectLinksAction(projectId, orderedIds)`

### Timeline

- `listProjectEventsAction(projectId, cursor?)`
- `recordProjectEventAction(input)` (internal utility; called by mutations)

## Validation approach

- Explicit checks in action layer (trim, required fields, enum membership, size limits).
- MIME and file size constraints enforced both in action code and bucket-level config.
- URL validation with strict `http/https` scheme requirement.
- Server-side computed bucket/path only (never trust client file path).

## `revalidatePath` plan

After mutations:

- Files/links mutations:
  - `/project/[id]/files`
  - `/project/[id]`
- Timeline mutations (once instrumentation exists):
  - `/project/[id]/timeline`
  - `/project/[id]`

---

## E) UI plan

## Routes

- Existing: `/project/[id]/files` (replace placeholder)
- New: `/project/[id]/timeline`

No global module routes for vaults/timeline.

## Files page behavior contract

### Primary layout

- Header area with single **Add** button (dropdown menu):
  - Upload Media
  - Upload Document
  - Add Link

### Sub-tabs

- All / Media / Documents / Links

### All tab (default)

- Three collapsible sections in this exact order:
  1. Media (grid cards)
  2. Documents (list rows)
  3. Links (cards)

### Mobile behavior

- Sticky bottom Add CTA.
- Preview/details open in bottom sheet.
- Minimum interactive tap target 44px.

## Component plan

- `ProjectFilesPageClient`
- `ProjectFilesToolbar`
- `ProjectFilesTabs`
- `MediaSectionGrid`
- `DocumentsSectionList`
- `LinksSectionCards`
- `AddAssetMenu`
- `FilePreviewSheet`
- `LinkEditSheet`

## Link Vault behaviors

- Display by `section` with optional section headers.
- Pinned links surfaced first.
- Provide **Open all in section** action (opens non-archived links in selected section).

## Timeline UI formatting map

Map `event_type` to label/template/icon, e.g.:

- `task_created` → “Task created: {taskTitle}”
- `task_status_changed` → “Task moved to {status}: {taskTitle}”
- `note_created` → “Note created: {noteTitle}”
- `file_uploaded` → “{kind} uploaded: {title}”
- `link_added` → “Link added ({section}): {title}”
- `project_updated` → “Project details updated”

---

## F) Execution plan (merge-safe PR sequence)

## PR1 — Foundation (DB + RLS + Storage + Types)

Checklist:

- [ ] Add enums and tables (`project_files`, `project_links`, `project_events`)
- [ ] Add constraints, indexes, updated_at triggers
- [ ] Enable RLS and add policies for all three tables
- [ ] Create private buckets `project-media`, `project-docs`
- [ ] Add storage policies with owner folder + owned project verification
- [ ] Update generated Supabase types
- [ ] Ensure app compiles

Exit criteria:

- Migration applies cleanly.
- RLS policies exist and compile.
- Types include new tables/enums.
- Build/typecheck passes.

## PR2 — Media Vault

Checklist:

- [ ] Upload media server action + storage helper
- [ ] Media list/read/update/archive actions
- [ ] Media UI in `/project/[id]/files` (media tab + all-tab media section)
- [ ] Validation for media MIME and file size
- [ ] Revalidate paths wired

Exit criteria:

- Media upload/manage works in project context only.

## PR3 — Document Hub

Checklist:

- [ ] Upload document server action + storage helper
- [ ] Document list/read/update/archive actions
- [ ] Documents UI in files route (documents tab + all-tab docs section)
- [ ] Validation for docs MIME and size limits
- [ ] Revalidate paths wired

Exit criteria:

- Document upload/manage works in project context only.

## PR4 — Link Vault

Checklist:

- [ ] Link CRUD actions
- [ ] Sectioning + pin/unpin + sort behaviors
- [ ] “Open all in section” behavior
- [ ] Links UI in files route (links tab + all-tab links section)
- [ ] Revalidate paths wired

Exit criteria:

- Link Vault supports project sections, pinned ordering, and open-all action.

## PR5 — Timeline

Checklist:

- [ ] `/project/[id]/timeline` route + feed UI
- [ ] Timeline list action with pagination/cursor
- [ ] Instrument high-signal events from tasks/notes/files/links/project edits
- [ ] Dedupe/throttle window (60–120s) via `dedupe_key` strategy
- [ ] Event formatting templates

Exit criteria:

- Timeline is useful, project-scoped, and not noisy.

---

## G) Risks and mitigations

- **Notion-clone risk**
  - Mitigation: strict scope (files/links/timeline only), no generic block editor.
- **Navigation bloat**
  - Mitigation: remain in project tabs/context; no global vault modules.
- **Timeline noise**
  - Mitigation: high-signal event whitelist + dedupe window with `dedupe_key`.
- **Security drift**
  - Mitigation: owner + project ownership checks in DB RLS and storage policies.
- **Performance issues**
  - Mitigation: targeted indexes, pagination, archived filters, bounded previews.

---

## H) Testing / QA plan

## RLS verification

1. User A creates project and file/link/event rows.
2. User B cannot read/update/delete User A rows.
3. Attempt insert with mismatched `owner_id` fails.
4. Attempt insert with foreign `project_id` not owned by user fails.

## Storage policy verification

1. Upload with path first segment != `auth.uid()` fails.
2. Upload with second segment as non-owned project fails.
3. Upload with owned `{uid}/{project_id}/...` succeeds.
4. Cross-user read/delete/update attempts fail.

## Upload constraints

1. Oversized files rejected.
2. MIME mismatch rejected.
3. Invalid URL in link creation rejected.
4. kind/category mismatches rejected by DB constraints.

## Mobile UX checks (to execute in PR2+)

1. Sticky Add CTA remains reachable while scrolling.
2. Bottom sheet previews open/close correctly.
3. Tap targets are >= 44px in files and links actions.

---

## PR1 implementation notes (executed)

Implemented in PR1:

- Added migration creating:
  - enums for file, link, and event categories/types
  - `project_files`, `project_links`, `project_events`
  - all constraints, indexes, updated_at triggers
  - RLS policies for all three tables
  - two private storage buckets (`project-media`, `project-docs`)
  - storage helper function and defense-in-depth storage policies (owner folder + owned project)
- Updated `lib/supabase/types.ts` to include new tables and enums.
- No UI changes and no timeline instrumentation included in PR1 by design.
