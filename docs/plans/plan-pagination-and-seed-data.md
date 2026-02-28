# Pagination & Dev Seed Data — Cross-Module Plan

**Date:** 2026-02-28
**Status:** Draft — awaiting review
**Scope:** All context modules that currently have no pagination + a dev seed data system to test them at realistic volume.

---

## 1. Why This Exists

Every context module was built without pagination because during development the data sets are tiny. This creates a hidden contract: the UI is only tested against 5–15 rows, but in production a real user can have hundreds.

The two problems are coupled:

- **Problem A — No pagination:** modules load ALL rows on every visit. At 200 documents, 300 todos, or 500 media files, this becomes slow, expensive, and the UI potentially breaks (oversized lists, layout regressions, performance cliffs).
- **Problem B — No way to simulate volume:** we cannot see or test the paginated UI because we never have enough local data to trigger it.

This plan solves both, in that order:

1. Build the **Dev Seed Data system** first — so we can generate realistic volume on localhost.
2. Then add **pagination** to each module using the generated data to validate the UI before shipping.

---

## 2. Dev Seed Data System

### 2.1 What it is

A dev-only tool that inserts realistic-looking fake records into any module for the currently active project. It only works on `localhost` (gated by `NODE_ENV === 'development'`). It has zero footprint in production builds.

### 2.2 Design principles

- **Project-scoped:** seed data belongs to the currently logged-in user and the currently active project. Never seeds across users.
- **Additive only:** seeding adds records; it does not wipe existing data. If you want a clean slate, archive or delete manually (or use the Supabase dashboard reset).
- **Controlled counts:** each module seed button lets you choose how many records to create (e.g. 25 / 50 / 100).
- **Realistic content:** titles, descriptions, tags, and categories are drawn from a predefined pool of realistic-looking values so the UI looks natural, not lorem-ipsum.
- **No production exposure:** the API routes are only registered when `NODE_ENV === 'development'`. The floating UI panel is conditionally rendered with `process.env.NODE_ENV === 'development'`.

### 2.3 Architecture

```
app/
  api/
    dev/
      seed/
        route.ts           ← POST /api/dev/seed — top-level router, dev-only
        _generators/
          documents.ts     ← generates fake project_files (kind='document') rows
          media.ts         ← generates fake project_files (kind='media') rows
          notes.ts         ← generates fake notes rows
          links.ts         ← generates fake project_links rows
          ideas.ts         ← generates fake ideas rows
          budgets.ts       ← generates fake budgets rows
          todos.ts         ← generates fake tasks rows

components/
  dev/
    DevSeedPanel.tsx       ← floating panel UI, only rendered in development
    DevSeedButton.tsx      ← single module seed button with count selector
```

### 2.4 API route contract

**`POST /api/dev/seed`**

Request body:

```json
{
  "module": "documents" | "media" | "notes" | "links" | "ideas" | "budgets" | "todos",
  "projectId": "uuid",
  "count": 25 | 50 | 100
}
```

Response:

```json
{ "inserted": 47, "errors": 0 }
```

The route:

1. Returns `405 Method Not Allowed` if `NODE_ENV !== 'development'`.
2. Calls `requireAuth()` — even dev routes enforce ownership. Seeded rows always get `owner_id = auth.uid()`.
3. Delegates to the appropriate generator function.
4. Returns counts. Does not revalidate paths (the user will refresh the tab manually to see the seed data).

### 2.5 Generator contract

Each generator receives `{ projectId, userId, count }` and returns an array of insert payloads. It uses a deterministic pool of fake values (no external faker library — just local arrays defined in each generator file). Generators use `crypto.randomUUID()` for IDs and `new Date()` offsets for timestamps to spread records over the past 6 months.

### 2.6 `DevSeedPanel` UI

- **Position:** fixed bottom-left corner, z-50. Small circular button with a `FlaskConical` (or `Bug`) icon. Clicking expands a panel.
- **Content:** one section per module. Each section shows:
  - Module name
  - A count selector (25 / 50 / 100 radio or segmented control)
  - A "Seed" button (shows spinner while seeding, shows "✓ 47 inserted" on success)
- **Panel header:** "Dev Seed Data — localhost only"
- **Visibility:** `if (process.env.NODE_ENV !== 'development') return null;` — component renders nothing in production. Because `NODE_ENV` is a build-time constant in Next.js, the panel is fully tree-shaken from production bundles.
- **Context requirement:** the panel needs the current `projectId`. It reads it from the URL (`usePathname()` → extract `[projectId]` segment). If no project is active (user is on a non-context page), the panel shows "No active project — navigate to a project context first."

### 2.7 What gets seeded per module

| Module    | Table                           | Seeded fields                                                                                        | Realistic pool                                                                                          |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Documents | `project_files` (kind=document) | title, document_category, description, tags, size_bytes, mime_type, file_ext, path, bucket, is_final | 40 realistic doc titles (e.g. "Q3 Budget Report", "Client Proposal v2"), all 8 categories, 10 tags pool |
| Media     | `project_files` (kind=media)    | title, media_category, description, tags, size_bytes, mime_type, file_ext, path, bucket, is_final    | 40 realistic asset names (e.g. "Hero Banner v3", "Logo Dark Mode"), all 6 categories                    |
| Notes     | `notes`                         | title, content (short paragraph), project_id                                                         | 40 realistic note titles                                                                                |
| Links     | `project_links`                 | title, url (valid but fake), category_id (if categories exist), description                          | 40 realistic link titles (tools, articles)                                                              |
| Ideas     | `ideas`                         | title, description, project_id                                                                       | 40 idea titles                                                                                          |
| Budgets   | `budgets`                       | name, amount, currency, notes                                                                        | 30 budget item names                                                                                    |
| Todos     | `tasks`                         | title, description, stage_id (if stages exist), tags                                                 | 50 task titles                                                                                          |

**Important:** generators create rows with correct `owner_id` and `project_id`. Storage files are NOT actually uploaded — the `path` and `bucket` fields point to fake paths. This means thumbnails and document previews will fail to load (404 on signed URL), which is expected and acceptable for seed data. The goal is to test layout and pagination, not file content.

---

## 3. Pagination Approach

### 3.1 Strategy chosen: offset-based "Load more"

**Why offset-based:**

- Simpler to implement and reason about
- All data in these modules belongs to a single user — no concurrent inserts from other users that would cause the "phantom row" problem
- New items added by the user during a session are prepended optimistically to client state — they don't go through the paginated query mid-session
- Can be upgraded to cursor-based if benchmarks reveal issues at very high volume

**Why "Load more" and not numbered pages:**

- Numbered pages require a `COUNT(*)` query on every load — adds latency on every navigation
- "Load more" appends rows to a continuous list — fits the UX pattern for list views and media grids
- Consistent with how the session cache works (accumulated state persists per tab)
- No "which page am I on?" state to manage on back/forward navigation

### 3.2 Fetch strategy: limit + 1

The server action fetches `limit + 1` rows from the DB. If it receives `limit + 1` rows, it sets `hasMore = true` and returns only `limit` rows in the response. This determines `hasMore` without a separate COUNT query.

```ts
const { data } = await query.limit(limit + 1);
const hasMore = data.length > limit;
const items = hasMore ? data.slice(0, limit) : data;
return { items, hasMore };
```

### 3.3 Cache shape change

All modules that currently cache a flat array must change their cache value to a paginated shape:

```ts
// Before
type CachedValue = T[];

// After
type PaginatedCache<T> = {
  items: T[];
  hasMore: boolean;
  loadedCount: number; // total items currently loaded in client state
};
```

The `loadedCount` field allows "load more" to pass the correct `offset` to the next fetch without re-deriving it from `items.length` (which can differ when items are archived/deleted optimistically).

### 3.4 onRefresh behavior with pagination

When `onRefresh` is called after any mutation (create, archive, delete, edit):

- Invalidate the cache key for that module
- Re-fetch **page 1 only** (`offset: 0, limit: PAGE_SIZE`)
- Reset `loadedCount` to `PAGE_SIZE`
- Replace `items` with the fresh first page

This is intentional: mutations that change the list (add/remove) should restart from the top with a fresh sort. Items the user had loaded on pages 2+ will disappear from the view until they click "Load more" again. This is the standard "load more" UX tradeoff and is acceptable.

### 3.5 Page sizes per module

| Module                  | Page size     | Rationale                                                       |
| ----------------------- | ------------- | --------------------------------------------------------------- |
| Media                   | 24            | 4-col grid × 6 rows — clean fill                                |
| Documents               | 25            | list view — 25 rows is a comfortable scroll before needing more |
| Notes                   | 20            | each note card is taller than a doc row                         |
| Links                   | 25            | compact rows, similar to documents                              |
| Ideas                   | 20            | idea cards have more visual weight                              |
| Budgets                 | 20            | detail-heavy rows                                               |
| Todos                   | 50            | compact single-line rows; users browse todos quickly            |
| Board (tasks per stage) | See Section 5 | kanban is a special case                                        |

Each page size is defined as a named constant in its module's validation or constants file (e.g. `DOCUMENTS_PAGE_SIZE`, `NOTES_PAGE_SIZE`). Never hardcoded inline.

---

## 4. Module-by-Module Plan

Each module follows the same three-step pattern:

1. **Action update:** add `options?: { offset?: number; limit?: number }` param to the cached getter. Change return type from `T[]` to `{ items: T[]; hasMore: boolean }`.
2. **Cache update:** change `*FromCache` to store and pass the paginated cache shape. Pass `initialHasMore` and `initialLoadedCount` props to the `*Client`.
3. **UI update:** add `hasMore`, `loadedCount`, `isLoadingMore` state to `*Client`. Render "Load more" button at the bottom. On click, fetch next page and append.

### 4.1 Document Hub

**Files:**

- `app/actions/documents.ts` — update `getDocuments`
- `app/context/[projectId]/documents/ContextDocumentsFromCache.tsx`
- `app/context/[projectId]/documents/ContextDocumentsClient.tsx`
- `lib/validation/project-documents.ts` — add `DOCUMENTS_PAGE_SIZE = 25`

**Special consideration — "Recently opened" widget:**
The current `ContextDocumentsClient` computes the "recently opened" top-5 from ALL loaded documents. With pagination, this widget will only see the first 25 items. This is acceptable as a temporary state, but for correctness the recently-opened widget should eventually be a **separate query** (`getRecentDocuments(projectId, limit: 5)` — sorted by `last_opened_at DESC NULLS LAST`, no pagination). This can be done in the same PR or as a follow-up.

**Special consideration — folder view:**
The current Document Hub filters documents by folder in the client (`filteredByFolder = documents.filter(d => d.folder_id === selectedFolderId)`). With pagination, this client-side filter only works on loaded items. Two options:

- Option A (v1 — simpler): paginate the full list, client-side folder filter applies to loaded items. Add a note in the UI: "Load more to see all documents in this folder."
- Option B (correct, later): pass `folderId` to `getDocuments` so the server filters by folder. Each folder gets its own paginated query. This requires per-folder cache keys.

Start with Option A. Plan Option B for the folders-pagination integration phase.

### 4.2 Notes

**Files:**

- `app/actions/notes.ts` — update `getNotes`
- `app/context/[projectId]/notes/ContextNotesFromCache.tsx`
- `app/context/[projectId]/notes/ContextNotesClient.tsx`

**Page size:** 20 (`NOTES_PAGE_SIZE = 20`)

**No special considerations.** Notes are a simple list. No folders, no recently-opened widget. Straightforward.

### 4.3 Links

**Files:**

- `app/context/[projectId]/links/actions.ts` — update the links getter action
- `app/context/[projectId]/links/ContextLinksFromCache.tsx`
- `app/context/[projectId]/links/ContextLinksClient.tsx`

**Page size:** 25 (`LINKS_PAGE_SIZE = 25`)

**Special consideration — categories:**
Links have a category system. Category list (`listLinkCategories`) does NOT need pagination — there won't be hundreds of categories. Only the links list itself is paginated. The category filter (if any) is a server-side filter param passed to the paginated getter.

### 4.4 Ideas

**Files:**

- `app/actions/ideas.ts` — update the ideas getter
- `app/context/[projectId]/ideas/ContextIdeasFromCache.tsx`
- `app/context/[projectId]/ideas/ContextIdeasClient.tsx`

**Page size:** 20 (`IDEAS_PAGE_SIZE = 20`)

**No special considerations.** Ideas are a simple list. The ideas board (kanban for ideas) is a separate sub-route and is not paginated in this plan.

### 4.5 Budgets

**Files:**

- `app/actions/budgets.ts` — update the budgets getter
- `app/context/[projectId]/budgets/ContextBudgetsFromCache.tsx`
- `app/context/[projectId]/budgets/ContextBudgetsClient.tsx`

**Page size:** 20 (`BUDGETS_PAGE_SIZE = 20`)

**No special considerations.**

### 4.6 Todos

**Files:**

- `app/actions/todo.ts` — update the todos getter
- `app/context/[projectId]/todos/ContextTodosFromCache.tsx`
- `app/context/[projectId]/todos/ContextTodosClient.tsx`

**Page size:** 50 (`TODOS_PAGE_SIZE = 50`)

Todos are compact single-line rows. 50 is a reasonable first load. Users with 200+ todos will need to "load more" several times, but that is an acceptable UX for a heavy task list.

---

## 5. Board (Kanban) — Special Case

The Board (tasks grouped by stage/column) cannot use a simple "load more" button because tasks live inside columns. The right approach is **per-column pagination**:

- Each column shows the first N tasks (e.g. `BOARD_TASKS_PER_STAGE = 20`).
- At the bottom of each column there is a "Show more (X remaining)" link/button that loads the next page for that specific stage.
- The board query must support filtering by `stage_id` and pagination per stage.

This is significantly more complex than the other modules and should be a **separate dedicated plan** (`plan-pagination-board.md`). It is out of scope for this plan.

**For now:** the Board module retains its current behavior (load all tasks). The kanban pagination plan is filed as a future item.

---

## 6. Cache Key Changes Required

The following cache key types must be added or already exist and need their value shape updated:

| CacheKey type | Already exists? | Value shape change                                   |
| ------------- | --------------- | ---------------------------------------------------- |
| `'documents'` | Yes             | `ProjectFile[]` → `PaginatedCache<ProjectFile>`      |
| `'media'`     | No (new module) | designed as `PaginatedCache<ProjectFile>` from day 1 |
| `'notes'`     | Yes             | `Note[]` → `PaginatedCache<Note>`                    |
| `'links'`     | Yes             | `ProjectLink[]` → `PaginatedCache<ProjectLink>`      |
| `'ideas'`     | Yes             | `Idea[]` → `PaginatedCache<Idea>`                    |
| `'budgets'`   | Yes             | `Budget[]` → `PaginatedCache<Budget>`                |
| `'todos'`     | Yes             | `Task[]` → `PaginatedCache<Task>`                    |

The `PaginatedCache<T>` generic type should be defined once in `app/context/ContextDataCache.tsx` and exported for use in all `*FromCache` components:

```ts
export type PaginatedCache<T> = {
  items: T[];
  hasMore: boolean;
  loadedCount: number;
};
```

No changes to `invalidateProject` are needed — it already clears all keys matching `*:${projectId}`.

---

## 7. New Cache Keys Required

**`'documentFolders'`** — already exists (added during Document Hub folders phase). No change.
**`'mediaFolders'`** — will be added when Media Vault folders are built. No change needed now.
**`'linkCategories'`** — already exists. No pagination needed for categories.

---

## 8. Implementation Order

The order below minimizes risk. Each step is independently shippable.

### Step 0 — Dev Seed Data System (prerequisite for everything)

**Goal:** have a way to fill any module with enough records to visually test pagination.

Deliverables:

- `app/api/dev/seed/route.ts` + generator files
- `components/dev/DevSeedPanel.tsx` + `DevSeedButton.tsx`
- Manual verification: seed 100 documents into a local project, confirm rows appear in Supabase dashboard

Exit criteria: can seed any module with 100 records in under 5 seconds from the browser. Panel does not appear in production build (`npm run build` confirms no dev components in bundle).

---

### Step 1 — Media Vault (new module, pagination from day 1)

Designed with pagination from the beginning in `docs/pre-build/media-vault-design.md v1.1`. No legacy code to migrate.

---

### Step 2 — Document Hub

Most complex due to the "recently opened" widget and folder-filter interaction.

Deliverables:

- `DOCUMENTS_PAGE_SIZE = 25` constant
- Updated `getDocuments` with offset/limit
- Updated `ContextDocumentsFromCache` (paginated cache shape)
- Updated `ContextDocumentsClient` (load more button, paginated state)
- Separate `getRecentDocuments(projectId, limit)` action for the recently-opened widget (decoupled from pagination)
- Folder-filter note in UI when paginated (Option A)

---

### Step 3 — Notes

Simplest module. No special considerations.

Deliverables:

- `NOTES_PAGE_SIZE = 20` constant
- Updated getter + FromCache + Client

---

### Step 4 — Links

Deliverables:

- `LINKS_PAGE_SIZE = 25` constant
- Updated getter + FromCache + Client

---

### Step 5 — Ideas

Deliverables:

- `IDEAS_PAGE_SIZE = 20` constant
- Updated getter + FromCache + Client

---

### Step 6 — Budgets

Deliverables:

- `BUDGETS_PAGE_SIZE = 20` constant
- Updated getter + FromCache + Client

---

### Step 7 — Todos

Deliverables:

- `TODOS_PAGE_SIZE = 50` constant
- Updated getter + FromCache + Client

---

### Step 8 — Board (separate plan, future)

Out of scope here. See future `plan-pagination-board.md`.

---

## 9. Definition of Done (per module)

A module's pagination is complete when:

- [ ] Page size constant defined in validation/constants file
- [ ] Server action returns `{ items: T[], hasMore: boolean }` with limit+1 fetch strategy
- [ ] `*FromCache` stores and reads `PaginatedCache<T>` from session cache
- [ ] `*Client` renders "Load more" button at bottom, visible only when `hasMore = true`
- [ ] "Load more" button shows loading state while fetching
- [ ] "Load more" appends next page to `items` — does not replace
- [ ] `onRefresh` after any mutation resets to page 1
- [ ] New items (upload/create) are prepended to `items` in client state, `loadedCount` unchanged
- [ ] Deleted/archived items are removed from `items` in client state, `loadedCount` unchanged
- [ ] Seed data test: seeded 100 records, confirmed "Load more" appears and loads next page
- [ ] Seed data test: seeded 25 records (= exactly 1 page), confirmed "Load more" does NOT appear
- [ ] No TypeScript errors, Prettier passes

---

## 10. Constraints & Rules

- Never add `COUNT(*)` queries to determine `hasMore`. Always use the limit+1 trick.
- Never paginate category/folder lists — only item lists.
- `loadedCount` tracks how many items have been fetched from the server, not how many are visible after client-side filters (archive/delete reduce `items.length` but do not reduce `loadedCount`).
- "Load more" must be disabled (not hidden) while `isLoadingMore = true` to prevent double-submits.
- Dev seed API routes must return `405` outside `NODE_ENV === 'development'`. This is a hard rule — no feature flags, no env vars, just `NODE_ENV`.
- Seed data creates rows with valid `owner_id` and `project_id` via `requireAuth()`. No seeding anonymous or cross-user data.
- `PaginatedCache<T>` is defined once in `ContextDataCache.tsx` and imported by all `*FromCache` components. Do not redefine it per module.

---

## 11. Out of Scope

- Board (kanban) pagination — dedicated future plan
- Server-side search/filter with pagination — each module handles this in its own folder/search phase
- Infinite scroll — "Load more" button is intentional; infinite scroll is harder to debug and test
- Cursor-based pagination — upgrade path noted in design rationale, not built now
- Pagination of detail views (note detail, budget detail) — detail views show a single record
- Dev seed data for the Board — task stages make seeding more complex; deferred to board pagination plan
