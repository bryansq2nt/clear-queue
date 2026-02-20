# Pattern: Context Session Cache

**Status:** Standard  
**Date:** 2026-02  
**Context:** Fase 3 — no refetch when returning to an already-visited context (project, tabs).  
**Discovery:** `docs/context-session-cache-discovery.md`

---

## Principle

**Data that the user already loaded in this session, and that could not have changed elsewhere, must not be refetched when they return.** Show it from a client-side session cache instead.

This complements the server-side data-loading pattern: first load can still be server-driven; once data is in the client, keep it in a cache keyed by context (e.g. `projectId` + data type) so that navigating away and back does not trigger new fetches or loading states.

---

## When to Use

- **Use** for route trees where the user repeatedly enters “contexts” (e.g. project) and switches between “views” or tabs (board, notes, ideas, etc.) and may **return** to a context/view they already opened. Cache per context + view so that on return, data is shown from cache and no fetch runs.
- **Use** when the same user is the only one who can change that data during the session (no real-time multi-user updates on that data).
- **Do not use** for data that changes outside the user’s actions (e.g. live collaboration, external updates); prefer Realtime, polling, or no cache.

---

## Architecture

### 1. Cache store and provider

- A **client-only** store (e.g. React Context with `useState` or a Map) that holds data keyed by “context + type”, e.g. `project:${projectId}`, `board:${projectId}`, `notes:${projectId}`.
- API: `get(key)`, `set(key, value)`, `invalidate(key)`, and optionally `invalidateProject(projectId)` to clear all keys for that context.
- The store is provided by a **Provider** component that must live in a layout that **does not unmount** when the user switches between contexts (e.g. between projects). If the provider is inside a dynamic segment (e.g. `[projectId]`), it will unmount when leaving that project and the cache will be lost.

### 2. Provider placement (critical)

- Put the cache **Provider** in the **smallest common layout** that wraps all routes that share the cache. Example: `app/context/layout.tsx` wrapping both `/context` and `/context/[projectId]/...`. So when navigating from project A to project B and back to A, the **same** provider stays mounted and the cache persists.
- **Do not** put the provider inside a layout that is specific to one instance of the context (e.g. inside `app/context/[projectId]/layout.tsx`), or the cache will be reset every time the user leaves that context.

### 3. Per-view components (“FromCache” components)

- For each “view” or tab that should use the cache (e.g. board, notes, ideas):
  - A wrapper component (e.g. `ContextBoardFromCache`) that:
    - Reads from the cache for that context + type (e.g. `board:${projectId}`).
    - If **cache hit:** render the actual view component with cached data; no loading.
    - If **cache miss:** show a loading state (skeleton or “Loading…”), call the server action (or receive initial data from RSC once), then `set` the result in the cache and render the view.
  - The view component (e.g. `ContextBoardClient`) receives data as props and an optional `onRefresh` callback. When the user mutates (create/update/delete), call `onRefresh` so the wrapper can invalidate the cache, refetch, and update the cache (and thus the UI) without a full page refresh.

### 4. Mutations

- After a mutation that affects a cached view, either:
  - **Invalidate** that cache key and (if the user stays on that view) **refetch** and `set` again so the UI shows fresh data; or
  - Use **optimistic updates** (Phase 4 idea): update UI immediately and sync in the background; on failure, revert or show retry.
- Provide `onRefresh` from the FromCache wrapper to the view so that existing “refresh after mutation” behavior (e.g. after adding a task) calls cache invalidate + refetch instead of a full router refresh.

---

## Checklist when adding or changing cached context

1. **Cache scope:** Is the cache provider in a layout that stays mounted when switching between the things we cache (e.g. projects)? If it’s inside a dynamic segment that unmounts, move the provider up.
2. **Keys:** Are cache keys unique per context and data type (e.g. `board:${projectId}`)? Avoid collisions.
3. **First load:** On cache miss, do we fetch (server action or RSC) and then `set` in the cache?
4. **Mutations:** On create/update/delete, do we invalidate (and optionally refetch) the affected cache key so the user sees up-to-date data?
5. **New view/tab:** When adding a new tab or view in the same context, add a `*FromCache` wrapper and a cache key for that view; pass `onRefresh` if the view has mutations.

---

## References

- **Discovery and rationale:** `docs/context-session-cache-discovery.md`
- **Fix for provider placement:** `docs/plan-fase3-cache-fix.md`
- **Instant navigation plan:** `docs/plan-instant-navigation-and-skeletons.md`
- **Data loading (server):** `docs/patterns/data-loading.md` — session cache is an addition for “return to already-visited context”, not a replacement for server-side first load where appropriate.
