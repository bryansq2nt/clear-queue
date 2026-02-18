# Proposal: Project Vaults + Project Timeline (Audit + Integration Plan)

## Scope and product guardrails

This proposal covers **planning only** (no implementation yet) for four project-centric modules:

1. **Media Vault** (images)
2. **Document Hub** (pdf/doc/xls/txt)
3. **Link Vault** (project links to tools: Vercel/Supabase/WP/IG/etc.)
4. **Project Timeline** (human-friendly activity feed)

Guardrails to preserve:

- Keep the app **project-centric**, not ERP/CRM-wide.
- Reduce context switching by keeping execution inside `/project/[id]` context.
- Follow current stack/patterns: **Next.js App Router + Supabase + RLS + server actions**.
- Favor minimal schema expansion and reusable primitives.
- Align with existing project context navigation pattern (tabs + context header).

---

## A) Current architecture findings

### 1) Navigation and project context

- The app has already moved toward project-scoped navigation via:
  - `app/project/[id]/layout.tsx` (loads project + renders context shell)
  - `components/project/ProjectContextNav.tsx` (tabs: Overview, Tasks, Budget, Ideas, CRM, Notes, Files)
- This is the correct anchor for the new modules. **Do not reintroduce global-module-first flows** for vaults/timeline.

### 2) Data model shape today (project-centric links already exist)

- Core project model: `projects` with `owner_id`, optional `client_id`, `business_id`.
- Key project-scoped entities already in place:
  - `tasks.project_id`
  - `notes.project_id`
  - `budgets.project_id` (nullable but often used in project scope)
  - `todo_lists.project_id` (nullable)
  - `idea_boards.project_id` (nullable)
  - `idea_project_links` (many-to-many between ideas and projects)
- Existing “link-like” patterns already in codebase:
  - `note_links` (URL list under a note)
  - `client_links` (URL list under client)
  - `idea_project_links` (relationship links)

**Finding:** The codebase already prefers “small focused tables” + project foreign keys and owner-aware RLS policies. The new modules should follow this same pattern.

### 3) Current project files state

- `/project/[id]/files` exists but is currently a placeholder page (no dedicated data model yet).
- This is the best insertion point for Media Vault + Document Hub + Link Vault UX.

### 4) Server action conventions

- Server actions are distributed by feature (e.g., `app/actions/*`, `app/notes/actions.ts`, `app/projects/actions.ts`).
- Pattern in use:
  - `requireAuth()` upfront
  - Supabase server client (`@/lib/supabase/server`)
  - explicit input trimming/guarding
  - return shaped results (`{ ok, data }` or `{ error }`)
  - `revalidatePath(...)` after mutations

### 5) Security and storage patterns

- DB side uses RLS consistently, mostly owner-anchored (`owner_id = auth.uid()` or project ownership join).
- Storage already uses private bucket + folder convention + storage RLS checks on first path segment.
- Existing `user_assets` flow gives a reusable pattern for file validation and metadata persistence.

---

## B) Proposed DB schema (minimal + reusable)

## Option chosen: Unified `project_assets` + `project_events`

To minimize table sprawl while supporting all 4 modules:

### Table 1: `public.project_assets` (unified vault model)

Use one table for media, documents, and links.

Suggested columns:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `owner_id uuid not null references auth.users(id) on delete cascade`
- `asset_type text not null check (asset_type in ('media','document','link'))`
- `title text not null`
- `description text null`
- `url text null` (for `asset_type='link'`)
- `bucket text null` (for uploaded files)
- `path text null` (for uploaded files)
- `mime_type text null`
- `size_bytes bigint null check (size_bytes is null or size_bytes > 0)`
- `file_ext text null`
- `preview_image_path text null` (optional future for docs/links)
- `provider text null` (normalized provider key, e.g. vercel/supabase/instagram/wordpress/custom)
- `tags text[] not null default '{}'`
- `sort_order int not null default 0`
- `created_at timestamptz not null default timezone('utc', now())`
- `updated_at timestamptz not null default timezone('utc', now())`
- `archived_at timestamptz null` (soft archive in vault)

Constraints:

- check: link rows require `url`, file rows require `bucket` + `path`
- check: `provider` only required/relevant for links (optional check or app-level validation)

Recommended indexes:

- `idx_project_assets_project_created` on `(project_id, created_at desc)`
- `idx_project_assets_project_type_created` on `(project_id, asset_type, created_at desc)`
- `idx_project_assets_owner` on `(owner_id)`
- `idx_project_assets_project_sort` on `(project_id, sort_order, created_at desc)`
- optional gin index on `tags`

> Why unified table?
>
> - Keeps schema small.
> - One vault query pattern for `/project/[id]/files`.
> - Future-friendly (new asset types without new tables).

### Table 2: `public.project_events` (timeline feed model)

Suggested columns:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `owner_id uuid not null references auth.users(id) on delete cascade`
- `actor_user_id uuid null references auth.users(id) on delete set null`
- `event_type text not null` (e.g., task_created, note_updated, asset_uploaded, link_added)
- `entity_type text not null` (task, note, budget, idea, asset, project, todo_item, billing)
- `entity_id uuid null`
- `summary text not null` (human-readable fallback)
- `metadata jsonb not null default '{}'::jsonb`
- `occurred_at timestamptz not null default timezone('utc', now())`
- `created_at timestamptz not null default timezone('utc', now())`

Recommended indexes:

- `idx_project_events_project_occurred` on `(project_id, occurred_at desc)`
- `idx_project_events_project_type` on `(project_id, event_type, occurred_at desc)`
- `idx_project_events_entity` on `(entity_type, entity_id)`

Retention strategy:

- Start with full retention.
- If volume grows, add scheduled pruning/aggregation for old low-value events.

### RLS model for both tables

Policies mirror current project ownership pattern:

- SELECT/INSERT/UPDATE/DELETE allowed only when:
  - `owner_id = auth.uid()` **and**
  - referenced `project_id` belongs to authenticated user.

(Implementation can either enforce both directly or use a helper SQL function such as `is_owned_project(project_id)` for policy readability.)

---

## C) Supabase Storage plan (buckets + paths + policy)

## Buckets

Use a **single private bucket** for project files:

- `project-assets` (private)

Why one bucket?

- simpler policy management
- easier shared upload pipeline
- mirrors existing `user-assets` approach

## Path conventions

Recommended deterministic structure:

`{owner_id}/{project_id}/{asset_type}/{yyyy}/{mm}/{uuid}.{ext}`

Examples:

- media: `u1/p1/media/2026/02/abc123.webp`
- document: `u1/p1/document/2026/02/def456.pdf`

Links (`asset_type='link'`) do not upload to storage; only DB row in `project_assets`.

## Storage policy approach

For `storage.objects` bucket `project-assets`:

- INSERT/SELECT/UPDATE/DELETE allowed only if:
  - `bucket_id = 'project-assets'`
  - first path segment equals `auth.uid()`

Optional hardening (phase 2):

- Parse second path segment as `project_id` and verify ownership against `projects`.
- This adds defense-in-depth if users somehow craft foreign project IDs.

## File constraints (app + bucket)

- Media Vault MIME: `image/png`, `image/jpeg`, `image/jpg`, `image/webp` (optionally `image/gif` later)
- Document Hub MIME: `application/pdf`, MS Office, OpenXML, `text/plain`, `text/csv`
- Enforce size caps in both storage bucket config and server action validation.
- Keep disallowed executables blocked.

---

## D) Server action plan

Place new actions close to project context routes while reusing shared helpers.

## Proposed files

1. `app/project/[id]/files/actions.ts`
2. `app/project/[id]/timeline/actions.ts`
3. `lib/validation/project-vaults.ts` (or existing validation location)
4. `lib/storage/project-assets.ts` (upload/remove helpers)

## Proposed action surface

### Vault actions (`files/actions.ts`)

- `listProjectAssetsAction(projectId, filters?)`
- `createProjectLinkAssetAction(projectId, input)`
- `uploadProjectFileAssetAction(projectId, formData)`
- `updateProjectAssetAction(assetId, input)`
- `deleteProjectAssetAction(assetId)`
- `reorderProjectAssetsAction(projectId, orderedIds)` (optional)

### Timeline actions (`timeline/actions.ts`)

- `listProjectEventsAction(projectId, cursor?)`
- `createProjectEventAction(input)` (internal utility action; mostly called by domain actions)

### Event instrumentation points (incremental)

Add timeline writes to existing mutation flows, starting with high-value events:

- tasks create/update/status move/delete
- notes create/update/delete
- project_assets create/update/delete (uploads + links)

Later:

- budgets/todo/billings/idea links as phase-2 additions.

## Validation approach

Use a centralized validation helper per payload type:

- `validateProjectAssetInput(...)`
- `validateProjectLinkInput(...)`
- `validateTimelineQuery(...)`

Given current style in repo, keep validation explicit and lightweight (trim + checks + enums + limits). If introducing Zod, do so only in this module and keep API contracts simple.

---

## E) UI plan (routes + components + navigation + mobile)

## Route strategy (project-centric)

Use existing project tabs/context nav.

### Files tab (`/project/[id]/files`)

Convert placeholder page into a vault workspace with **sub-tabs**:

- `All`
- `Media`
- `Documents`
- `Links`

Key components:

- `ProjectVaultPageClient`
- `VaultFiltersBar` (search, type, tag/provider)
- `MediaGrid` (image cards)
- `DocumentList` (icon + metadata rows)
- `LinkCards` (provider badge, title, URL)
- `AddAssetMenu` (Upload media / Upload doc / Add link)
- `AssetPreviewSheet` (mobile-friendly details/actions)

### Timeline integration

Preferred UX: add a timeline panel directly in project context, without adding global module complexity.

Option A (recommended):

- New tab: `/project/[id]/timeline`

Option B (secondary):

- Keep timeline block in Overview + “View all” link to dedicated route

Given “reduce context switching,” **Option A is cleaner** and discoverable.

## Sidebar and context navigation note

- Keep global sidebar for app-level module changes.
- Keep project-local switching in `ProjectContextNav` tabs.
- Extend tabs carefully (add `Timeline`) to avoid overcrowding:
  - If width becomes an issue, keep horizontal scroll (already present) and prioritize labels/icons for mobile.

## Mobile considerations

- Files page defaults to stacked cards/list, not dense table.
- Upload CTA as sticky bottom button on small screens.
- Preview in bottom sheet rather than modal where possible.
- Timeline entries as compact cards with “show details” expand.
- Keep tap targets >= 44px and avoid hover-only affordances.

---

## F) Implementation plan split into 3 PRs

## PR 1 — Data foundation (schema + storage + typed contracts)

Checklist:

- [ ] Add migration for `project_assets` and `project_events`
- [ ] Add indexes + `updated_at` trigger for `project_assets`
- [ ] Add RLS policies for both tables
- [ ] Add storage bucket `project-assets` + storage policies
- [ ] Regenerate/update Supabase types
- [ ] Add minimal docs for schema and policy rationale

Exit criteria:

- migrations apply cleanly
- RLS verified with authenticated/non-owner scenarios
- types compile

## PR 2 — Vault module (Media + Documents + Links)

Checklist:

- [ ] Replace `/project/[id]/files` placeholder with full vault UI
- [ ] Implement vault server actions and validation
- [ ] Implement file upload helper for `project-assets`
- [ ] Support create/list/update/delete for link assets
- [ ] Add filtering/search UI by type/title/provider/tags
- [ ] Add revalidation paths for project files and overview summaries

Exit criteria:

- end-to-end create/read/update/delete works for all 3 asset types
- storage path convention enforced
- no client-side direct Supabase anti-patterns

## PR 3 — Timeline module + event wiring

Checklist:

- [ ] Add `/project/[id]/timeline` route + UI feed
- [ ] Implement timeline read action with pagination/cursor
- [ ] Wire timeline writes in task, note, and vault mutation actions
- [ ] Add event formatting map (event_type -> icon/label/template)
- [ ] Add lightweight dedupe strategy for noisy updates (optional throttle/window)
- [ ] Add QA pass for mobile and tab navigation

Exit criteria:

- project timeline accurately reflects key project events
- timeline remains project-scoped and performant
- no cross-project leakage under RLS

---

## G) Risks + anti-“Notion clone” guardrails

## Main risks

1. **Over-generalization risk**
   - Adding too many content types/workspaces/blocks can turn this into a generic knowledge platform.

2. **Navigation bloat risk**
   - Too many tabs/panels can reduce clarity and increase cognitive load.

3. **Event noise risk**
   - Timeline becomes unreadable if every low-level mutation is logged.

4. **Security drift risk**
   - Mixed storage/DB rules can cause accidental cross-project access.

5. **Performance risk**
   - Large file lists + unbounded timeline queries can degrade project pages.

## Guardrails to keep product focused

- Keep every new record tied to `project_id` (first-class requirement).
- No cross-project workspace abstraction.
- Limit asset types to **media/document/link** only (for now).
- Timeline should answer: “What changed in this project that affects execution?”
  - Prefer high-signal events.
  - Exclude low-value noise.
- Avoid rich block editing and nested docs.
- Keep integrations as **links** (launch points), not embedded admin consoles.
- Keep CRUD lean and operational: upload, attach, open, archive, search.

## Practical success metric

If a user can run most project execution from `/project/[id]` tabs (tasks, notes, files/links, timeline) **without hopping to external tools or global sections**, the initiative is successful.
