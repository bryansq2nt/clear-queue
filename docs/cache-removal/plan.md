# Cache Removal Plan

**Date:** 2026-03-16
**Based on:** `docs/cache-removal/audit.md`
**Scope:** Remove the `ContextDataCache` session cache entirely. Every tab visit fetches fresh from the server. No new dependencies.

---

## Goal

Replace the `*FromCache → *Client` two-layer pattern with a single-layer pattern:

```
BEFORE:
page.tsx (requireAuth + permissions)
  └─ *FromCache (cache hit? render : fetch → cache → render)
      └─ *Client (data + onRefresh)

AFTER:
page.tsx (requireAuth + permissions + fetch data)
  └─ *Client (data, no onRefresh)
```

`page.tsx` becomes a true server component that fetches all data. The skeleton is shown by Next.js's built-in `loading.tsx` mechanism while the server fetch completes.

---

## What Does NOT Change

- All server action logic (auth, queries, mutations, `revalidatePath`)
- React `cache()` wrappers on read-only server action getters — those are per-request deduplication, not session caching
- Skeleton components — they stay, they will be used in `loading.tsx` files
- `ContextBoardClient` local state management (optimistic updates, drag, pagination)
- All mutation logic inside Client components
- `KanbanBoard`, `Column`, `TaskCard`, `EditTaskModal`, `AddTaskModal` — untouched

---

## Phases

### Phase 1 — Remove the infrastructure (1 file)

**Goal:** Delete `ContextDataCache.tsx` and remove the provider from `app/context/layout.tsx`.

This is done LAST (after all consumers are removed), but it defines the target end-state.

Files:

- Delete `app/context/ContextDataCache.tsx`
- Edit `app/context/layout.tsx` — remove `ContextDataCacheProvider` wrapper, remove import

---

### Phase 2 — Fix `ContextLayoutWrapper` (metadata cache)

**Goal:** `modules`, `accessGrant`, `canToggleModules`, and `project` are currently stored in the session cache from server props. Remove the cache layer — the server layout already has this data, just pass it straight through as props.

**Current flow:**

```
[projectId]/layout.tsx (fetches modules, accessGrant, canToggle from server)
  → passes as props to ContextLayoutWrapper
  → ContextLayoutWrapper stores them in session cache on first render
  → subsequent navigations read from cache
```

**New flow:**

```
[projectId]/layout.tsx (fetches fresh on every project navigation)
  → passes directly as props to ContextLayoutWrapper
  → ContextLayoutWrapper uses props directly, no cache
```

Files:

- `app/context/[projectId]/ContextLayoutWrapper.tsx` — remove all `useContextDataCache()` calls, use props directly
- `app/context/[projectId]/layout.tsx` — remove any cache-related imports

**Complexity:** Low. The data is already arriving via server props; we just stop the cache hop.

---

### Phase 3 — Simple tabs (no cross-invalidation, no pagination)

Each tab in this phase follows the exact same pattern. For each:

1. **`page.tsx`** — add `await fetch*(projectId)` call(s), pass result as `initialData` prop to Client
2. **`*FromCache.tsx`** — delete the file
3. **`*Client.tsx`** — remove `onRefresh` prop and all `cache.*` calls; for mutations that currently call `onRefresh()`, call `router.refresh()` instead

Tabs in this phase:

| Tab     | page.tsx fetches                                                | FromCache file to delete      |
| ------- | --------------------------------------------------------------- | ----------------------------- |
| Ideas   | `getBoardsByProjectIdAction(projectId)`                         | `ContextIdeasFromCache.tsx`   |
| Budgets | `getBudgetsByProjectId(projectId)`                              | `ContextBudgetsFromCache.tsx` |
| Owner   | `getProjectById` + optional `getClientById` + `getBusinessById` | `ContextOwnerFromCache.tsx`   |
| Todos   | `getProjectTodoBoardAction(projectId)`                          | `ContextTodosFromCache.tsx`   |

**Pattern for each `page.tsx`:**

```tsx
// BEFORE
export default async function Page({ params }) {
  await requireAuth();
  return <ContextIdeasFromCache projectId={params.projectId} />;
}

// AFTER
export default async function Page({ params }) {
  await requireAuth();
  const boards = await getBoardsByProjectIdAction(params.projectId);
  return (
    <ContextIdeasClient projectId={params.projectId} initialBoards={boards} />
  );
}
```

**Pattern for each `*Client.tsx`:**

```tsx
// BEFORE
export default function ContextIdeasClient({ ..., onRefresh }) {
  const cache = useContextDataCache();
  ...
  async function handleCreate() {
    await createBoard(formData);
    onRefresh();
  }
}

// AFTER
export default function ContextIdeasClient({ ... }) {
  const router = useRouter();
  ...
  async function handleCreate() {
    await createBoard(formData);
    router.refresh(); // triggers server re-fetch via revalidatePath
  }
}
```

**`loading.tsx` for each tab:**

```tsx
// app/context/[projectId]/ideas/loading.tsx
import { SkeletonIdeas } from '@/components/skeletons/SkeletonIdeas';
export default function Loading() {
  return <SkeletonIdeas />;
}
```

If a skeleton for the tab doesn't exist yet, use a generic one or create a minimal one.

---

### Phase 4 — Multi-key tabs (notes, documents)

Same pattern as Phase 3 but each tab fetches two parallel data sets.

| Tab       | page.tsx fetches                                                      | FromCache file                  |
| --------- | --------------------------------------------------------------------- | ------------------------------- |
| Notes     | `getNotes({ projectId })` + `listFolders(projectId)` in `Promise.all` | `ContextNotesFromCache.tsx`     |
| Documents | `getDocuments(projectId)` + `listFolders(projectId)` in `Promise.all` | `ContextDocumentsFromCache.tsx` |

**Example `page.tsx`:**

```tsx
export default async function Page({ params }) {
  await requireAuth();
  const [notes, folders] = await Promise.all([
    getNotes({ projectId: params.projectId }),
    listFolders(params.projectId),
  ]);
  return (
    <ContextNotesClient
      projectId={params.projectId}
      initialNotes={notes}
      initialFolders={folders}
    />
  );
}
```

**Client changes:**

- Remove `onRefresh` — call `router.refresh()` after mutations
- Remove direct `cache.invalidate()` calls — they are no longer needed (fresh fetch on every navigation)
- `ContextNewNoteClient` — remove the `handleBack` cache invalidation; just `router.push(listPath)`

---

### Phase 5 — Note Detail

The note detail page has a slightly different shape because the cache key is `noteId`-scoped, not `projectId`-scoped.

File: `app/context/[projectId]/notes/[noteId]/page.tsx`

```tsx
export default async function Page({ params }) {
  await requireAuth();
  const [note, links, folders] = await Promise.all([
    getNoteById(params.noteId),
    getNoteLinks(params.noteId),
    listFolders(params.projectId),
  ]);
  if (!note || note.project_id !== params.projectId) notFound();
  return (
    <ContextNoteDetailClient
      projectId={params.projectId}
      initialNote={note}
      initialLinks={links}
      initialFolders={folders}
    />
  );
}
```

**Client changes:**

- Remove `invalidateNote()` helper — no longer needed
- On save: call `router.refresh()` (triggers re-fetch of the page)
- On delete: call `router.push(listPath)` (navigates away — nothing to refresh)
- Remove cascade invalidations of `notes` / `noteFolders` — irrelevant without cache

---

### Phase 6 — Links

Links currently has partial-cache logic (fetch only the missing half). After removal, always fetch both in parallel.

File: `app/context/[projectId]/links/page.tsx`

```tsx
export default async function Page({ params }) {
  await requireAuth();
  const [links, categories] = await Promise.all([
    listProjectLinksAction(params.projectId),
    listLinkCategoriesAction(),
  ]);
  return (
    <ContextLinksClient
      projectId={params.projectId}
      initialLinks={links}
      initialCategories={categories}
    />
  );
}
```

**Client changes:**

- Remove `onRefresh`, `onCategoriesCacheUpdate` props
- After mutations: `router.refresh()`

---

### Phase 7 — Billings

Billings currently fetches clients and categories in `useEffect` regardless of cache hit — this is already "always fresh" for those two. After removal, fetch all three in `page.tsx`.

```tsx
export default async function Page({ params }) {
  await requireAuth();
  const [billings, categories, clients] = await Promise.all([
    getBillingsByProjectId(params.projectId),
    getBillingCategories(),
    getClients(),
  ]);
  return (
    <ContextBillingsClient
      projectId={params.projectId}
      initialBillings={billings}
      initialCategories={categories}
      clients={clients}
    />
  );
}
```

**Client changes:**

- Remove `useEffect` fetches for clients and categories (moved to page)
- Remove `onRefresh` — after mutations call `router.refresh()`

---

### Phase 8 — Calendar

Calendar's month-switching UX makes a direct server call for new months. After removal, the initial load comes from `page.tsx` and month navigation continues to call the server action directly from the Client (no cache store needed).

```tsx
// page.tsx
export default async function Page({ params }) {
  await requireAuth();
  const now = new Date();
  const feed = await getProjectCalendarFeed(
    params.projectId,
    startOfMonth(now).toISOString(),
    endOfMonth(now).toISOString()
  );
  return (
    <ContextCalendarClient
      projectId={params.projectId}
      initialFeed={feed}
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth()}
    />
  );
}
```

**Client changes:**

- `onLoadMonth(year, month)` — already calls server action directly; just remove the `cache.set()` call inside it
- Remove `onRefresh` prop

---

### Phase 9 — Milestones

```tsx
export default async function Page({ params }) {
  await requireAuth();
  const milestones = await getMilestonesWithProgress(params.projectId);
  return (
    <ContextMilestonesClient
      projectId={params.projectId}
      initialMilestones={milestones}
    />
  );
}
```

**Client changes:**

- Remove `onRefresh` — call `router.refresh()` after mutations
- Remove `cache.invalidate({ type: 'board', projectId })` — no longer needed

---

### Phase 10 — Team

Team has the most complex FromCache (8 parallel fetches). All of them move to `page.tsx`.

```tsx
export default async function Page({ params }) {
  await requireAuth();
  const [
    members,
    invites,
    rejectedInvites,
    roles,
    profiles,
    reusableRoles,
    project,
    teams,
  ] = await Promise.all([
    listProjectMembers(params.projectId),
    listPendingInvites(params.projectId),
    listRejectedInvites(params.projectId),
    listProjectRoles(),
    listProjectAccessProfiles(params.projectId),
    listReusableInviteRoles(params.projectId),
    getProjectById(params.projectId),
    listProjectTeams(params.projectId),
  ]);
  return (
    <ContextTeamClient
      projectId={params.projectId}
      initialMembers={members}
      initialInvites={invites}
      initialRejectedInvites={rejectedInvites}
      roles={roles}
      profiles={profiles}
      reusableRoles={reusableRoles}
      projectName={project?.name ?? ''}
      initialTeams={teams}
    />
  );
}
```

**Client changes:**

- Remove `onRefresh` — call `router.refresh()` after invite/remove/access mutations
- Remove error state with retry button from FromCache — the `loading.tsx` skeleton handles loading; 404/error is handled by Next.js `error.tsx`
- `ContextTeamClient` already calls server actions directly for most mutations; just remove the `onRefresh()` call at the end of each handler

---

### Phase 11 — Media

Media has Client-managed pagination. The FromCache only provides page 1.

```tsx
// page.tsx
export default async function Page({ params }) {
  await requireAuth();
  const result = await getMedia(params.projectId, {
    offset: 0,
    limit: MEDIA_PAGE_SIZE,
  });
  return (
    <ContextMediaClient
      projectId={params.projectId}
      initialItems={result.items}
      initialHasMore={result.hasMore}
    />
  );
}
```

**Client changes:**

- Remove `onRefresh` prop and `loadData` callback chain
- Pagination (load more) — already calls server action directly from Client; keep as-is
- After upload/delete: call `router.refresh()` which re-fetches page 1 from the server

---

### Phase 12 — Board

Board is the most complex Client. The FromCache removal is straightforward; the Client's internal state logic does not change.

```tsx
// page.tsx
export default async function Page({ params }) {
  const user = await requireAuth();
  const [permissions, data] = await Promise.all([
    getBoardPermissions(params.projectId),
    getBoardInitialData(params.projectId),
  ]);
  if (!data) notFound();

  const projectMembers = permissions.canAssign
    ? await getProjectMembersForAssignment(params.projectId)
    : [];

  return (
    <ContextBoardClient
      projectId={params.projectId}
      initialProject={data.project}
      initialCounts={data.counts}
      initialTasksByStatus={data.tasksByStatus}
      permissions={permissions}
      projectMembers={projectMembers}
      currentUserId={user.id}
    />
  );
}
```

**Client changes:**

- Remove `onRefresh` prop
- Remove `loadData` callback (was: `onRefresh()` → `cache.invalidate()` + fetch + set)
- `loadData` usages currently occur in non-optimistic paths (full reload). Replace with `router.refresh()`
- Remove `cache.invalidate({ type: 'milestones', projectId })` — no longer needed
- All optimistic update handlers (`handleTaskAdded`, `handleTaskUpdated`, `handleTaskDeleted`, `handleTasksChange`) stay exactly as-is — they update local state directly and do not touch the cache
- `onRefresh` was only called for true full-reload scenarios (e.g., hard error recovery); `router.refresh()` is the right replacement

---

### Phase 13 — Copilot cleanup

Copilot does not use the cache for its own data. It only calls `invalidateProject()` after approving a proposal. After removal this call is a no-op and must be cleaned up.

**File:** `app/context/[projectId]/copilot/ContextCopilotClient.tsx`

- Remove `const { invalidateProject } = useContextDataCache()`
- Remove the `invalidateProject(result.data.project_id)` call after proposal approval
- Remove `useContextDataCache` import

**Note:** After cache removal, approved proposals won't trigger a visual update on other open tabs. This is acceptable until Supabase Realtime is implemented. When a user navigates to another tab after approving a proposal, the server fetch will return fresh data.

---

### Phase 14 — Delete cache infrastructure

Only reached when all consumers have been removed.

1. Delete `app/context/ContextDataCache.tsx`
2. Edit `app/context/layout.tsx` — remove provider, remove import
3. Verify no remaining imports of `ContextDataCache` anywhere (`grep -r "ContextDataCache" .`)

---

## Loading States

Every tab that moves data-fetching to `page.tsx` gets a `loading.tsx` file. This is the Next.js way to show a skeleton while the server component is fetching.

**Pattern:**

```tsx
// app/context/[projectId]/notes/loading.tsx
import { SkeletonNotes } from '@/components/skeletons/SkeletonNotes';
export default function Loading() {
  return <SkeletonNotes />;
}
```

**Existing skeletons to reuse:**

- `SkeletonBoard`
- `SkeletonNotes`
- (others — verify in `components/skeletons/`)

For tabs without a dedicated skeleton, use a generic content skeleton or a simple div placeholder. A full-featured skeleton for each tab is a nice-to-have, not a blocker.

**Files to create:**

| Tab        | `loading.tsx` path       | Skeleton                   |
| ---------- | ------------------------ | -------------------------- |
| Board      | `board/loading.tsx`      | `SkeletonBoard`            |
| Notes      | `notes/loading.tsx`      | `SkeletonNotes`            |
| Links      | `links/loading.tsx`      | generic or `SkeletonLinks` |
| Ideas      | `ideas/loading.tsx`      | generic                    |
| Budgets    | `budgets/loading.tsx`    | generic                    |
| Billings   | `billings/loading.tsx`   | generic                    |
| Calendar   | `calendar/loading.tsx`   | generic                    |
| Documents  | `documents/loading.tsx`  | generic                    |
| Milestones | `milestones/loading.tsx` | generic                    |
| Owner      | `owner/loading.tsx`      | generic                    |
| Team       | `team/loading.tsx`       | generic                    |
| Todos      | `todos/loading.tsx`      | generic                    |
| Media      | `media/loading.tsx`      | generic                    |

---

## Execution Order

The phases are ordered by complexity and dependency. Each phase is independently deployable — the cache system degrades gracefully as keys are removed one by one.

```
Phase 2  → ContextLayoutWrapper (unblock layout, low risk)
Phase 3  → Ideas, Budgets, Owner, Todos (simple single-key tabs)
Phase 4  → Notes, Documents (multi-key, no special UX)
Phase 5  → Note Detail (noteId-scoped key)
Phase 6  → Links (partial-miss logic removed)
Phase 7  → Billings (useEffect fetches moved to page)
Phase 8  → Calendar (month navigation stays client-side)
Phase 9  → Milestones (cross-invalidation removed)
Phase 10 → Team (most data, 8 parallel fetches)
Phase 11 → Media (client-managed pagination)
Phase 12 → Board (most complex client, optimistic state stays)
Phase 13 → Copilot cleanup (remove invalidateProject call)
Phase 14 → Delete ContextDataCache.tsx + remove provider
```

---

## Definition of Done

- [ ] `ContextDataCache.tsx` is deleted
- [ ] `ContextDataCacheProvider` is removed from `app/context/layout.tsx`
- [ ] All 14 `*FromCache.tsx` files are deleted
- [ ] Zero references to `useContextDataCache` anywhere in the codebase
- [ ] Zero references to `ContextDataCache` anywhere in the codebase
- [ ] Every context tab has a `loading.tsx` that renders its skeleton
- [ ] Every context tab `page.tsx` fetches its own data server-side
- [ ] All `*Client.tsx` files use `router.refresh()` instead of `onRefresh()` for post-mutation reloads
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` all pass
- [ ] Manual smoke test: open each tab, make a mutation, confirm fresh data appears without page reload

---

## Future: Realtime Phase

When Supabase Realtime is added (next phase after this one):

- Each `*Client.tsx` will add a `useEffect` that subscribes to its relevant Supabase table
- Changes pushed by other team members will update the local React state directly
- `router.refresh()` after mutations may be replaced by optimistic local state updates (already done for Board)
- The `*FromCache` layer's original purpose (avoid redundant fetches on tab switch) will be replaced by Realtime keeping data fresh in memory

The architecture after cache removal (`page.tsx` → `*Client.tsx`) maps cleanly onto the Realtime architecture (`page.tsx` → `*Client.tsx` + Supabase subscription). No structural changes needed — just add subscriptions inside Client components.
