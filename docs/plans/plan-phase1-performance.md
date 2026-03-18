# Phase 1 — Performance: Tab Prefetching + Mutation Fixes

Goal: eliminate the two biggest sources of perceived latency in ClearQueue without
introducing anything that conflicts with a future Supabase Realtime phase.

Research basis: `docs/research/realtime-and-performance.md`,
`docs/research/performance-implementation-guide.md`,
`docs/research/optimistic-mutations-transitions.md`

---

## What this plan does NOT do

- No new cache layer (no SWR, React Query, custom context cache expansion)
- No `useOptimistic` / async `startTransition` (requires React 19, not available)
- No Supabase Realtime subscriptions
- No changes to the existing `onRefresh()` / `ContextDataCache` pattern
- Nothing that needs to be removed when Realtime is added

---

## Part A — Tab prefetching (1 file)

**Problem:** Every tab switch triggers a full server round-trip → skeleton → content.
Dynamic routes (all context tabs call `requireAuth()`) are not cached by Next.js by
default. The Router Cache only stores RSC payloads for dynamic routes when
`router.prefetch()` is called explicitly.

**Fix:** After `ContextShell` mounts, call `router.prefetch()` for every enabled tab.
The Router Cache stores each RSC payload for 5 minutes. Tab switches during that
window are instant — no skeleton, no round-trip.

**File:** `components/context/ContextShell.tsx`

**Change:** Add one `useEffect` after the existing entry animation effect.

```ts
useEffect(() => {
  const SLUG_MAP: Partial<Record<ModuleKey, string>> = {
    tasks: 'board',
    notes: 'notes',
    links: 'links',
    ideas: 'ideas',
    todos: 'todos',
    billings: 'billings',
    budgets: 'budgets',
    milestones: 'milestones',
    team: 'team',
    owner: 'owner',
    documents: 'documents',
    media: 'media',
    calendar: 'calendar',
    copilot: 'copilot',
  };
  for (const key of enabledModuleKeys) {
    const slug = SLUG_MAP[key];
    if (slug) router.prefetch(`/context/${projectId}/${slug}`);
  }
}, [projectId, enabledModuleKeys, router]);
```

**Estimated impact:** Tab switches drop from 300–800ms to < 50ms (Router Cache hit).
After 5 minutes or after a mutation that calls `revalidatePath`, the first switch to
that tab re-fetches once (skeleton reappears briefly), then caches again.

**Phase 2 compatibility:** Prefetch and Realtime do not interact. Prefetch provides
the fast first render. Realtime keeps data live after first render. No conflict.

---

## Part B — Fix router.refresh() violations (4 files)

AGENTS.md rule: *"Do not use `router.refresh()` as the way to update context tab
data after a mutation. Use returned data or `onRefresh()` from the *FromCache wrapper."\*

The following files call `router.refresh()` as their primary mutation response.
This is both an architectural violation and a latency source — `router.refresh()`
is a full server round-trip before the user sees any change.

### B1 — ContextOwnerClient.tsx (5 calls)

**Module:** Owner — very low frequency (project owner/client info, rarely changes).

**Fix approach:** Replace `router.refresh()` with `onRefresh()`. Owner data is a
single record — no optimistic list manipulation needed. The round-trip latency is
acceptable for a form that saves rarely. The fix is to use the correct update
mechanism, not to eliminate the round-trip.

**Lines to fix:** 127, 140, 156, 178, 677

- Lines 127, 140, 156, 178: direct calls after mutations → replace with `onRefresh()`
- Line 677: `onUpdated={() => router.refresh()}` inline → replace with `onUpdated={onRefresh}`

**Requires:** `onRefresh` prop must be wired in. Check `ContextOwnerFromCache.tsx`
to confirm `onRefresh` is passed. If not, add it following the standard pattern.

### B2 — ContextTeamClient.tsx (5 calls)

**Module:** Team — low frequency (invite/remove members, change roles).

**Fix approach:** Replace `router.refresh()` with `onRefresh()`. Same reasoning as
Owner — team mutations are infrequent, round-trip is acceptable, the fix is
architectural correctness.

**Lines to fix:** 663, 903, 921, 960, 1023

**Note:** Teams module was recently implemented and `onRefresh` is already passed
as a prop (from the teams work in recent commits). The calls just need to be
switched from `router.refresh()` to `onRefresh()`.

### B3 — ContextBoardClient.tsx (1 call)

**Line 105:** Needs inspection — likely a post-column-create or post-status-change
refresh. Board is high-frequency, so the fix approach depends on what state is
being refreshed. If it's updating list state, switch to optimistic. If it's
refreshing the entire board layout (e.g. new column added), `onRefresh()` is fine.

Read the file before implementing.

### B4 — Ideas module: IdeaDrawer.tsx (3 calls) + ContextBoardViewClient.tsx (3 calls)

**Module:** Ideas — medium frequency.

**Fix approach:** Ideas use a board-style view. `IdeaDrawer` handles create/update/delete
for individual ideas. `ContextBoardViewClient` handles board-level operations.

For `IdeaDrawer` mutations (create, update, delete): optimistic state update using
returned data from server action. The ideas list is in `ContextBoardViewClient` state.
Check how `IdeaDrawer` communicates back to the parent — likely via callback props.

For `ContextBoardViewClient` board-level operations: check what each call does.
If it's refreshing the whole board after a reorder, `onRefresh()` is fine.

---

## Part C — NoteEditor.tsx (deferred, 3 calls)

`NoteEditor` is the note detail page editor — not a context tab list view. The
`router.refresh()` calls there are refreshing the current detail page after saving
content, which is different semantically from the context tab pattern. This is a
lower-priority fix and should be done in a separate pass with full understanding
of the note editor's state model.

**Not in scope for this plan.**

---

## Implementation order

| Step | File                                            | Change                                                      | Risk                            |
| ---- | ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| 1    | `ContextShell.tsx`                              | Add prefetch `useEffect`                                    | Very low — additive only        |
| 2    | `ContextTeamClient.tsx`                         | Replace 5x `router.refresh()` with `onRefresh()`            | Low — teams recently refactored |
| 3    | `ContextOwnerClient.tsx`                        | Replace 5x `router.refresh()` with `onRefresh()`            | Low — single-record view        |
| 4    | `ContextBoardClient.tsx`                        | Inspect line 105, fix appropriately                         | Low                             |
| 5    | `IdeaDrawer.tsx` + `ContextBoardViewClient.tsx` | Replace 6x `router.refresh()` with optimistic/`onRefresh()` | Medium — inspect first          |

---

## Files NOT touched

- `NoteEditor.tsx` — deferred
- `ContextProjectPicker.tsx` — home layer, different concern
- Any `*FromCache.tsx` — no changes needed
- Any server actions — no changes needed
- Any migrations — no DB changes needed

---

## Definition of done

- [ ] All tab switches (to already-enabled tabs) are instant after the first project open
- [ ] No `router.refresh()` calls remain as the primary mutation response in context tabs
- [ ] All mutations in fixed files update UI from returned server action data or `onRefresh()`
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` pass
- [ ] Verified in DevTools Network tab: tab switches show no RSC fetch requests
