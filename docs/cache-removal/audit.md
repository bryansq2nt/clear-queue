# Cache System Audit

**Date:** 2026-03-16
**Author:** Claude Code
**Purpose:** Baseline audit before full removal of the ContextDataCache session cache system.

---

## Executive Summary

ClearQueue uses a dual-layer caching strategy that must be removed:

1. **Session cache (`ContextDataCache`)** — an in-memory React context that persists tab data across project navigations for the duration of a browser session. This is the primary subject of this removal.
2. **Server request cache (React `cache()`)** — per-request memoization on read-only server action getters. This is orthogonal and is NOT removed in this phase.

The session cache touches **24 files** across the context layer, including 15 `*FromCache` wrapper components, 6 client components that call the cache directly, and 2 layout components.

**Reason for removal:** The RBAC multi-tenant architecture means multiple team members work on the same project simultaneously. Stale cached data creates incorrect UI states (e.g., a member sees a task that was deleted by a teammate, or sees permissions that have since been revoked). Every tab visit must hit the server.

**Future phase:** Supabase Realtime subscriptions will provide live push updates while users are already on a tab. That is out of scope for this phase.

---

## 1. Cache Core Infrastructure

### Provider

**File:** `app/context/layout.tsx`

`ContextDataCacheProvider` is mounted here — at the parent layout that wraps all project routes. This design was intentional: the cache survives project-to-project navigation without being unmounted. Removing it means deleting the provider import and the wrapper JSX.

### Store

**File:** `app/context/ContextDataCache.tsx`

In-memory `Record<string, unknown>` managed via React context. Exposes four methods:

| Method              | Signature                           | Purpose                                             |
| ------------------- | ----------------------------------- | --------------------------------------------------- |
| `get`               | `(key: CacheKey) => T \| undefined` | Read cached value                                   |
| `set`               | `(key: CacheKey, value: T) => void` | Write to cache                                      |
| `invalidate`        | `(key: CacheKey) => void`           | Remove one key                                      |
| `invalidateProject` | `(projectId: string) => void`       | Remove all keys for a project (except `noteDetail`) |

### Cache Key Union

```typescript
type CacheKey =
  | { type: 'project'; projectId: string }
  | { type: 'board'; projectId: string }
  | { type: 'notes'; projectId: string }
  | { type: 'noteFolders'; projectId: string }
  | { type: 'noteDetail'; noteId: string } // ← only key NOT scoped by projectId
  | { type: 'links'; projectId: string }
  | { type: 'linkCategories'; projectId: string }
  | { type: 'ideas'; projectId: string }
  | { type: 'budgets'; projectId: string }
  | { type: 'billings'; projectId: string }
  | { type: 'calendar'; projectId: string }
  | { type: 'documents'; projectId: string }
  | { type: 'documentFolders'; projectId: string }
  | { type: 'todos'; projectId: string }
  | { type: 'milestones'; projectId: string }
  | { type: 'media'; projectId: string }
  | { type: 'modules'; projectId: string }
  | { type: 'accessGrant'; projectId: string }
  | { type: 'canToggleModules'; projectId: string }
  | { type: 'team'; projectId: string }
  | { type: 'inviteRoles'; projectId: string }
  | { type: 'copilot'; projectId: string }; // defined but never used (ADR-004)
```

---

## 2. The FromCache Pattern

Every context tab follows this three-layer structure:

```
page.tsx (requireAuth + fetch permissions)
  └─ *FromCache (session cache layer — TO BE REMOVED)
      └─ *Client (UI, local state, mutations)
```

**What FromCache does today:**

1. Calls `cache.get(key)` — if hit, render Client immediately with cached data
2. On miss — show skeleton, fetch via server action, `cache.set()`, then render Client
3. Exposes an `onRefresh` callback to Client = `cache.invalidate()` + fetch + `cache.set()` + `setState()`

**What the new pattern will be (Option A):**

```
page.tsx (requireAuth + fetch permissions + fetch data server-side)
  └─ *Client (receives initialData as props, no onRefresh needed)
```

Every tab visit hits the server. The skeleton is shown by the existing `loading.tsx` / `Suspense` boundary or by the page rendering before data arrives. No cache layer. No invalidation callbacks.

---

## 3. Full Inventory: All FromCache Components

### 3.1 Board — `ContextBoardFromCache.tsx`

| Property                     | Value                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Cache key                    | `{ type: 'board', projectId }`                                                          |
| Server action                | `getBoardInitialData(projectId)`                                                        |
| Data shape                   | `BoardInitialData` — `{ project, counts, tasksByStatus, readScope }`                    |
| Special                      | Validates `readScope` against current permissions; discards if stale                    |
| `onRefresh` used by          | `ContextBoardClient` — `loadData` calls it after any change that requires a full reload |
| Direct cache calls in Client | `cache.invalidate({ type: 'milestones', projectId })` on task add/update/delete         |

### 3.2 Notes — `ContextNotesFromCache.tsx`

| Property                     | Value                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| Cache keys                   | `{ type: 'notes', projectId }`, `{ type: 'noteFolders', projectId }` |
| Server actions               | `getNotes({ projectId })`, `listFolders(projectId)`                  |
| Data shape                   | `Note[]`, `NoteFolder[]`                                             |
| `onRefresh` used by          | `ContextNotesClient` — after create/delete/move                      |
| Direct cache calls in Client | Invalidates `notes` + `noteFolders` on mutations                     |

### 3.3 Note Detail — `ContextNoteDetailFromCache.tsx`

| Property                     | Value                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Cache key                    | `{ type: 'noteDetail', noteId }` — keyed by note, not project                                |
| Server actions               | `getNoteById(noteId)`, `getNoteLinks(noteId)`, `listFolders(projectId)`, `touchNote(noteId)` |
| Data shape                   | `{ note, links, folders }`                                                                   |
| `onRefresh` used by          | `ContextNoteDetailClient` — `invalidateNote()` on save/delete                                |
| Direct cache calls in Client | On delete: also invalidates `notes` + `noteFolders` (cascade)                                |
| Special                      | Validates cached note's `project_id` matches current project                                 |

### 3.4 New Note — `ContextNewNoteClient.tsx`

| Property           | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| Cache keys touched | `notes`, `noteFolders`                                    |
| Where              | `handleBack()` invalidates both before navigating to list |
| Note               | No FromCache wrapper — this is a direct client component  |

### 3.5 Links — `ContextLinksFromCache.tsx`

| Property            | Value                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Cache keys          | `{ type: 'links', projectId }`, `{ type: 'linkCategories', projectId }`                   |
| Server actions      | `listProjectLinksAction(projectId)`, `listLinkCategoriesAction()`                         |
| Data shape          | `ProjectLinkRow[]`, `LinkCategoryRow[]`                                                   |
| `onRefresh` used by | `ContextLinksClient` — after any link/category mutation                                   |
| Special             | Partial cache miss handled: only fetches missing half                                     |
| Callback            | `onCategoriesCacheUpdate` — Client updates categories cache directly without full refresh |

### 3.6 Ideas — `ContextIdeasFromCache.tsx`

| Property            | Value                                            |
| ------------------- | ------------------------------------------------ |
| Cache key           | `{ type: 'ideas', projectId }`                   |
| Server action       | `getBoardsByProjectIdAction(projectId)`          |
| Data shape          | `Board[]`                                        |
| `onRefresh` used by | `ContextIdeasClient` — after board create/delete |

### 3.7 Budgets — `ContextBudgetsFromCache.tsx`

| Property            | Value                                           |
| ------------------- | ----------------------------------------------- |
| Cache key           | `{ type: 'budgets', projectId }`                |
| Server action       | `getBudgetsByProjectId(projectId)`              |
| Data shape          | `BudgetWithProject[]`                           |
| `onRefresh` used by | `ContextBudgetsClient` — after budget mutations |

### 3.8 Billings — `ContextBillingsFromCache.tsx`

| Property            | Value                                                                           |
| ------------------- | ------------------------------------------------------------------------------- |
| Cache key           | `{ type: 'billings', projectId }`                                               |
| Server actions      | `getBillingsByProjectId(projectId)`, `getBillingCategories()`, `getClients()`   |
| Data shape          | `BillingWithRelations[]`, `BillingCategory[]`, `Client[]`                       |
| `onRefresh` used by | `ContextBillingsClient` — after billing mutations                               |
| Special             | Clients and categories fetched in `useEffect` in Client regardless of cache hit |

### 3.9 Calendar — `ContextCalendarFromCache.tsx`

| Property            | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Cache key           | `{ type: 'calendar', projectId }`                                            |
| Server action       | `getProjectCalendarFeed(projectId, start, end)`                              |
| Data shape          | `CalendarFeedItem[]`                                                         |
| `onRefresh` used by | `ContextCalendarClient` — month navigation calls `onLoadMonth`               |
| Special             | Cache holds one month at a time; switching months overwrites the cache entry |

### 3.10 Documents — `ContextDocumentsFromCache.tsx`

| Property                     | Value                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cache keys                   | `{ type: 'documents', projectId }`, `{ type: 'documentFolders', projectId }`                                                 |
| Server actions               | `getDocuments(projectId)`, `listFolders(projectId)`                                                                          |
| Data shape                   | `ProjectFile[]`, `DocumentFolder[]`                                                                                          |
| `onRefresh` used by          | `ContextDocumentsClient` — after upload/delete                                                                               |
| Special                      | `loadData` does NOT call `cache.invalidate()` — it just overwrites (background refresh pattern, inconsistency vs other tabs) |
| Direct cache calls in Client | `cache.invalidate({ type: 'documentFolders', projectId })` on folder delete                                                  |

### 3.11 Milestones — `ContextMilestonesFromCache.tsx`

| Property                     | Value                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Cache key                    | `{ type: 'milestones', projectId }`                                                           |
| Server action                | `getMilestonesWithProgress(projectId)`                                                        |
| Data shape                   | `MilestoneWithProgress[]`                                                                     |
| `onRefresh` used by          | `ContextMilestonesClient` — after milestone mutations                                         |
| Direct cache calls in Client | `cache.invalidate({ type: 'board', projectId })` — milestone changes affect board task counts |

### 3.12 Owner — `ContextOwnerFromCache.tsx`

| Property            | Value                                                |
| ------------------- | ---------------------------------------------------- |
| Cache key           | `{ type: 'owner', projectId }`                       |
| Server actions      | `getProjectById`, `getClientById`, `getBusinessById` |
| Data shape          | `{ project, client \| null, business \| null }`      |
| `onRefresh` used by | `ContextOwnerClient` — via `onOwnerUpdated` callback |

### 3.13 Team — `ContextTeamFromCache.tsx`

| Property            | Value                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache key           | `{ type: 'team', projectId }`                                                                                                                                                                            |
| Server actions      | `listProjectMembers`, `listPendingInvites`, `listRejectedInvites`, `listProjectRoles`, `listProjectAccessProfiles`, `listReusableInviteRoles`, `getProjectById`, `listProjectTeams` — 8 parallel fetches |
| Data shape          | `{ members, invites, rejectedInvites, roles, profiles, reusableRoles, projectName, teams }`                                                                                                              |
| `onRefresh` used by | `ContextTeamClient` — after invite/remove/access changes                                                                                                                                                 |
| Special             | Only FromCache with explicit error state + retry button                                                                                                                                                  |

### 3.14 Todos — `ContextTodosFromCache.tsx`

| Property            | Value                                               |
| ------------------- | --------------------------------------------------- |
| Cache key           | `{ type: 'todos', projectId }`                      |
| Server action       | `getProjectTodoBoardAction(projectId)`              |
| Data shape          | `{ projectName, defaultListId, items: TodoItem[] }` |
| `onRefresh` used by | `ContextTodosClient` — after todo mutations         |

### 3.15 Media — `ContextMediaFromCache.tsx`

| Property            | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Cache key           | `{ type: 'media', projectId }`                                                 |
| Server action       | `getMedia(projectId, { offset, limit })`                                       |
| Data shape          | `{ items: ProjectFile[], hasMore: boolean, loadedCount: number }`              |
| `onRefresh` used by | Media Client manages its own `loadData` — does NOT use FromCache's `onRefresh` |
| Special             | Pagination is Client-managed. FromCache provides only page 1                   |

---

## 4. ContextLayoutWrapper Cache Usage

**File:** `app/context/[projectId]/ContextLayoutWrapper.tsx`

This file manages four additional cache keys that are NOT tab data — they are project-level metadata passed down from server props:

| Cache key          | Data                           | Source                         | Invalidated by                       |
| ------------------ | ------------------------------ | ------------------------------ | ------------------------------------ |
| `project`          | `Project` row                  | `getProjectById()`             | Navigation only                      |
| `modules`          | `SerializableResolvedModule[]` | Server props from `layout.tsx` | `handleModulesChange()` after toggle |
| `accessGrant`      | `string[] \| null`             | Server props from `layout.tsx` | Never (stale risk)                   |
| `canToggleModules` | `boolean`                      | Server props from `layout.tsx` | Never                                |

These are also removed. Metadata will be fetched fresh on every project navigation by the server layout.

---

## 5. Copilot — Intentionally Cache-Free (Remains Unchanged)

**File:** `app/context/[projectId]/copilot/ContextCopilotClient.tsx`

Copilot already does NOT use the session cache for its data (ADR-004). However, it calls:

```typescript
const { invalidateProject } = useContextDataCache();
invalidateProject(result.data.project_id); // called after proposal approval
```

This cross-module invalidation will become a no-op after cache removal. The call site must be cleaned up.

---

## 6. Cross-Cache Dependency Map

These are invalidation relationships that the cache currently manages. After removal they become irrelevant (fresh fetch on every tab visit renders them moot):

| Trigger                               | Invalidates                                | Location                                     |
| ------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| Task created / updated / deleted      | `milestones`                               | `ContextBoardClient`                         |
| Milestone created / updated / deleted | `board`                                    | `ContextMilestonesClient`                    |
| Note created / deleted / moved        | `notes` + `noteFolders`                    | `ContextNotesClient`, `ContextNewNoteClient` |
| Note saved / deleted (detail view)    | `noteDetail` + `notes` + `noteFolders`     | `ContextNoteDetailClient`                    |
| Document uploaded / deleted           | `documents` + `documentFolders`            | `ContextDocumentsClient`                     |
| Document folder deleted               | `documentFolders`                          | `ContextDocumentsClient`                     |
| Copilot proposal approved             | All keys for project (`invalidateProject`) | `ContextCopilotClient`                       |

---

## 7. React `cache()` on Server Actions — NOT Removed

These 33+ server action getters are wrapped with React's `cache()` for per-request deduplication. This is a different mechanism — it prevents the same getter from running twice in a single server render pass. It is **not** the session cache and is **not** removed in this phase.

Key wrapped getters:

- `getBoardInitialData`, `getBoardPermissions`, `getBoardCountsByStatus`
- `getNotes`, `getDocuments`, `getBudgetsByProjectId`, `getBillingsByProjectId`
- `getProjectById`, `getProjectsList`
- `listProjectMembers`, `listProjectRoles`, `listProjectAccessProfiles`
- `getProjectModules`, `getMyProjectAccessGrant`, `getCanViewModule`
- `getMilestonesWithProgress`, `getProjectCalendarFeed`
- ... and ~15 more

---

## 8. Complete File Change List

Every file that must change when the cache is removed:

### Delete entirely

- `app/context/ContextDataCache.tsx`

### Remove `*FromCache` wrapper layer (merge into page.tsx)

- `app/context/[projectId]/board/ContextBoardFromCache.tsx`
- `app/context/[projectId]/notes/ContextNotesFromCache.tsx`
- `app/context/[projectId]/notes/[noteId]/ContextNoteDetailFromCache.tsx`
- `app/context/[projectId]/links/ContextLinksFromCache.tsx`
- `app/context/[projectId]/ideas/ContextIdeasFromCache.tsx`
- `app/context/[projectId]/budgets/ContextBudgetsFromCache.tsx`
- `app/context/[projectId]/billings/ContextBillingsFromCache.tsx`
- `app/context/[projectId]/calendar/ContextCalendarFromCache.tsx`
- `app/context/[projectId]/documents/ContextDocumentsFromCache.tsx`
- `app/context/[projectId]/milestones/ContextMilestonesFromCache.tsx`
- `app/context/[projectId]/owner/ContextOwnerFromCache.tsx`
- `app/context/[projectId]/team/ContextTeamFromCache.tsx`
- `app/context/[projectId]/todos/ContextTodosFromCache.tsx`
- `app/context/[projectId]/media/ContextMediaFromCache.tsx`

### Modify: pages (now fetch data directly)

- `app/context/[projectId]/board/page.tsx`
- `app/context/[projectId]/notes/page.tsx`
- `app/context/[projectId]/notes/[noteId]/page.tsx`
- `app/context/[projectId]/links/page.tsx`
- `app/context/[projectId]/ideas/page.tsx`
- `app/context/[projectId]/budgets/page.tsx`
- `app/context/[projectId]/billings/page.tsx`
- `app/context/[projectId]/calendar/page.tsx`
- `app/context/[projectId]/documents/page.tsx`
- `app/context/[projectId]/milestones/page.tsx`
- `app/context/[projectId]/owner/page.tsx`
- `app/context/[projectId]/team/page.tsx`
- `app/context/[projectId]/todos/page.tsx`
- `app/context/[projectId]/media/page.tsx`

### Modify: layout wrapper (remove cache metadata management)

- `app/context/[projectId]/ContextLayoutWrapper.tsx`
- `app/context/[projectId]/layout.tsx` (remove provider, pass props directly)
- `app/context/layout.tsx` (remove `ContextDataCacheProvider`)

### Modify: client components (remove `onRefresh`, remove direct cache calls)

- `app/context/[projectId]/board/ContextBoardClient.tsx`
- `app/context/[projectId]/notes/ContextNotesClient.tsx`
- `app/context/[projectId]/notes/[noteId]/ContextNoteDetailClient.tsx`
- `app/context/[projectId]/notes/new/ContextNewNoteClient.tsx`
- `app/context/[projectId]/links/ContextLinksClient.tsx`
- `app/context/[projectId]/ideas/ContextIdeasClient.tsx`
- `app/context/[projectId]/budgets/ContextBudgetsClient.tsx`
- `app/context/[projectId]/billings/ContextBillingsClient.tsx`
- `app/context/[projectId]/calendar/ContextCalendarClient.tsx`
- `app/context/[projectId]/documents/ContextDocumentsClient.tsx`
- `app/context/[projectId]/milestones/ContextMilestonesClient.tsx`
- `app/context/[projectId]/owner/ContextOwnerClient.tsx`
- `app/context/[projectId]/team/ContextTeamClient.tsx`
- `app/context/[projectId]/todos/ContextTodosClient.tsx`
- `app/context/[projectId]/media/ContextMediaClient.tsx`
- `app/context/[projectId]/copilot/ContextCopilotClient.tsx` (remove `invalidateProject` call)

**Total: ~47 files touched, 14 files deleted.**

---

## 9. Key Risks & Notes

### 9.1 Board tab is the most complex Client

`ContextBoardClient` owns significant local state (`tasksByStatus`, `counts`, pagination, optimistic updates, drag state). After cache removal, it still keeps all this local state — the only change is that `onRefresh` / `loadData` is replaced by `router.refresh()` for full reloads, OR the board simply always loads fresh from server on tab mount. The optimistic add/update/delete handlers remain unchanged.

### 9.2 Calendar month navigation

The current month-switching UX fetches a new month and caches it. Without the cache, switching months will always hit the server. This is acceptable (it hit the server on first load anyway).

### 9.3 Media pagination

Media manages its own pagination outside the cache pattern. After removal the pagination logic stays in `ContextMediaClient` — only the FromCache wrapper and the `onRefresh` prop are removed.

### 9.4 ContextLayoutWrapper metadata

`modules`, `accessGrant`, `canToggleModules` are currently cached from server props. After removal, the `[projectId]/layout.tsx` server component fetches these on every project navigation and passes them as props to `ContextLayoutWrapper`. No caching, no staleness.

### 9.5 `revalidatePath` still required

After every mutation, server actions still call `revalidatePath('/context')` (and related paths). This is how Next.js knows to re-fetch server components when the client navigates. This does not change.

### 9.6 Future Realtime phase

When Supabase Realtime subscriptions are added (next phase), each Client component will subscribe to its relevant table. The `*FromCache` layer would have been the natural home for subscriptions — but since it's removed, subscriptions will live directly in the `*Client` components.
