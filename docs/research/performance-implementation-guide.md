# Performance Implementation Guide — ClearQueue

How to apply the research in `realtime-and-performance.md` to this specific codebase.
Two phases: Phase 1 (now, no Realtime) and Phase 2 (future, with Realtime).
Phase 1 is designed to survive Phase 2 without removal.

---

## What we are NOT doing

- No new client-side cache layer (no SWR, no React Query, no custom context cache)
- No re-introduction of anything like the old ContextDataCache
- No patterns that need to be removed when Realtime is added

These would add tech debt that conflicts with Realtime in Phase 2.

---

## Phase 1 — Loading speed without Realtime

Two changes. Both additive. Both survive Phase 2 unchanged.

### 1. Tab prefetching

**What it fixes:** Every tab switch currently triggers a server round-trip → skeleton →
content. After prefetching, tab switches are instant from the Router Cache.

**Where:** `components/context/ContextShell.tsx`

**How:** After the shell mounts, call `router.prefetch()` for every enabled tab. The
Router Cache stores the RSC payload for 5 minutes. Tab switches during that window are
instant with no skeleton.

```ts
// In ContextShell.tsx — add to the existing useEffect block or a new one
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

**After Phase 2 (Realtime):** Nothing changes. Prefetch provides the fast first render.
Realtime subscriptions keep the data live after first render. They do not compete.

**Edge cases:**

- After a mutation, the server action calls `revalidatePath` which immediately clears the
  Router Cache for that path. The next tab switch to that path will re-fetch once (skeleton
  reappears briefly), then the new data is cached for another 5 minutes.
- The 5-minute cache window resets on every navigation to a tab, so active users never
  hit stale data from the prefetch.

---

### 2. Optimistic mutations

**What it fixes:** Mutations (create, update, delete) currently wait for the server action
round-trip before updating the UI. The user sees a spinner or frozen state for 200-500ms.
With optimistic updates, the UI responds instantly.

**Current state:** Most `*Client.tsx` files call `router.refresh()` as the primary UI
update mechanism after mutations. This is a full server round-trip before the user sees
any change.

**Target pattern:**

```ts
// BEFORE (current — blocks on round-trip)
const handleCreate = async (title: string) => {
  setIsSubmitting(true);
  await createNote(projectId, title);
  router.refresh(); // user waits here
  setIsSubmitting(false);
};

// AFTER (optimistic — instant UI response)
const handleCreate = (title: string) => {
  startTransition(async () => {
    const tempId = `temp-${crypto.randomUUID()}`;
    setNotes((prev) => [
      { id: tempId, title, pending: true, ...defaults },
      ...prev,
    ]);

    const { data: saved, error } = await createNote(projectId, title);

    if (error || !saved) {
      setNotes((prev) => prev.filter((n) => n.id !== tempId)); // rollback
      setError(error);
      return;
    }

    // Replace temp with real — when Realtime echo arrives later, real ID already
    // in state → skipped by dedup guard. This is the Phase 2 handoff point.
    setNotes((prev) => prev.map((n) => (n.id === tempId ? saved : n)));
    router.refresh(); // background — syncs Next.js router cache, non-blocking
  });
};
```

**After Phase 2 (Realtime):** The optimistic pattern is exactly what Realtime builds on.
The only addition is the dedup guard in the Realtime INSERT handler:

```ts
// Phase 2 addition — one guard in the realtime handler
.on('postgres_changes', { event: 'INSERT', ... }, (payload) => {
  setNotes(prev => {
    if (prev.some(n => n.id === payload.new.id)) return prev  // echo guard
    return [payload.new, ...prev]
  })
})
```

The optimistic mutation code does not change.

---

## Phase 2 — Adding Realtime (future reference)

Document here for future context.

### Which tables need REPLICA IDENTITY FULL

Required if you need full old-row data on UPDATE or DELETE events:

```sql
-- Run these migrations before enabling Realtime subscriptions
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.notes REPLICA IDENTITY FULL;
ALTER TABLE public.project_members REPLICA IDENTITY FULL;
-- Add others as needed
```

Without this, UPDATE gives you `payload.new` only (sufficient for most cases).
DELETE gives you only primary key in `payload.old` — enough to remove from local state.

### Channel naming convention

Use `table-projectId` format to avoid collisions:

```ts
supabase.channel(`tasks-${projectId}`);
supabase.channel(`notes-${projectId}`);
supabase.channel(`members-${projectId}`);
```

### The browser client exception

Realtime requires the browser client. The rule in AGENTS.md forbids `createClient()` from
`@/lib/supabase/client` in components for data access. Realtime subscriptions are the
exception. The contract:

- Browser client: **only** for `.channel()` subscriptions
- All queries and mutations: server actions (unchanged)

### DELETE filter limitation

DELETE events cannot be filtered by `project_id`. You receive all DELETE events for the
subscribed table. Two options:

**Option A:** Enable REPLICA IDENTITY FULL, then check `payload.old.project_id` in handler.

**Option B:** Only subscribe DELETE per-row (using `id=eq.rowId`) where feasible.

For most tables in this app, Option A is cleaner because we subscribe per-project anyway.

### Deciding per-module: direct state update vs onRefresh signal

| Module        | Frequency                  | Recommendation                 |
| ------------- | -------------------------- | ------------------------------ |
| board (tasks) | High (drag, status change) | Direct state update with dedup |
| notes         | Medium                     | Direct state update with dedup |
| team/members  | Low                        | `onRefresh()` signal           |
| billings      | Low                        | `onRefresh()` signal           |
| milestones    | Low                        | `onRefresh()` signal           |
| owner         | Very low                   | `onRefresh()` signal           |
| calendar      | Medium                     | Direct state update with dedup |
| ideas         | Medium                     | Direct state update with dedup |

For `onRefresh()` signal approach, the Realtime handler is just:

```ts
.on('postgres_changes', { event: '*', ... }, () => { onRefresh() })
```

No dedup logic needed. Trade-off: one round-trip per change event (acceptable for
low-frequency data).

### Cleanup contract — every component that subscribes

```ts
useEffect(() => {
  const supabase = createClient()   // singleton
  const channel = supabase
    .channel(...)
    .on(...)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)  // ALWAYS removeChannel, not just unsubscribe
  }
}, [projectId])
```

The existing commented `// ── Realtime subscription slot` in every `*Client.tsx` is the
right location. Fill in that slot when implementing Phase 2.

---

## Things that would break — do not do these

### Do not filter DELETE events by project_id

The filter is silently ignored. You will receive all deletes. Always guard:

```ts
// WRONG — filter is ignored for DELETE
{ event: 'DELETE', filter: 'project_id=eq.abc' }

// CORRECT — check manually in handler
(payload) => {
  if (payload.old.project_id !== projectId) return  // only with REPLICA IDENTITY FULL
  setItems(prev => prev.filter(i => i.id !== payload.old.id))
}
```

### Do not use router.refresh() as the primary optimistic update mechanism

`router.refresh()` is a round-trip. It should run in the background after optimistic state
is already updated, never as the thing the user waits for.

### Do not call channel.unsubscribe() in cleanup — use removeChannel

```ts
// WRONG — channel stays registered, leads to TooManyChannels error over time
return () => {
  channel.unsubscribe();
};

// CORRECT
return () => {
  supabase.removeChannel(channel);
};
```

### Do not skip the echo dedup guard

Without it, the user who performs a mutation sees the item appear twice:
once from the optimistic update and once from the Realtime echo.

```ts
// This guard is non-negotiable in every INSERT handler
if (prev.some((i) => i.id === payload.new.id)) return prev;
```

### Do not create a separate Supabase browser client per component

`createBrowserClient` is already a singleton but calling `new SupabaseClient(...)` directly
creates a second WebSocket connection. Always use `createClient()` from `@/lib/supabase/client`.

### Do not subscribe to high-frequency events with postgres_changes

For cursor position, typing indicators, or other sub-second updates, use Broadcast.
`postgres_changes` processes on a single thread and triggers RLS checks per subscriber.
At scale it becomes a bottleneck. Broadcast bypasses both constraints.
