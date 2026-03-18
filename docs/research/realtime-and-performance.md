# Supabase Realtime + Next.js App Router — Reference Research

Gathered before implementing loading speed improvements and Realtime. Sources: Supabase
docs, Next.js docs, React docs, community references.

---

## 1. Supabase Realtime — postgres_changes

### Core subscription pattern

```ts
const channel = supabase
  .channel('tasks-' + projectId)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'tasks',
      filter: `project_id=eq.${projectId}`,
    },
    (payload) => {
      // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      // payload.new: the new row
      // payload.old: previous row (only with REPLICA IDENTITY FULL)
    }
  )
  .subscribe((status, err) => {
    // status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'
  });
```

### Cleanup — always use removeChannel

```ts
// CORRECT
return () => {
  supabase.removeChannel(channel);
};

// WRONG — leaves channel registered, causes TooManyChannels error over time
return () => {
  channel.unsubscribe();
};
```

`removeChannel` both unsubscribes AND de-registers the channel object. `unsubscribe()` alone
does not de-register it. With React StrictMode's double-invoke in dev, this distinction matters.

### Filtering

- Supported operators: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in` (max 100 values)
- Format: `column=operator.value` — e.g. `project_id=eq.abc123`
- **DELETE events cannot be filtered.** The filter only applies to INSERT and UPDATE.
  You will receive all DELETE events on the subscribed table regardless of the filter value.
  Guard against irrelevant deletes by checking `payload.old.project_id` after the fact.

### REPLICA IDENTITY FULL

By default, UPDATE gives you `payload.new` (full new row) but `payload.old` is empty
(only primary keys). DELETE gives `payload.old` with only primary keys.

To get the full previous row on UPDATE and DELETE:

```sql
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
```

**Caveat with RLS + DELETE:** Even with REPLICA IDENTITY FULL, when RLS is enabled,
`payload.old` for DELETE events only contains primary keys. This is a known Supabase
limitation — plan around it by filtering deletes by ID only.

### Known limits and pitfalls

| Limit                   | Value                                           |
| ----------------------- | ----------------------------------------------- |
| Channels per connection | 100 (all plans except Enterprise)               |
| Payload size limit      | 1,024 KB (large rows are truncated)             |
| Replication slots       | Up to 2 per project                             |
| Thread model            | Single-threaded — all events processed in order |

- **Single-threaded throughput:** postgres_changes uses one thread per project to maintain
  event order. Compute upgrades barely help. For high-frequency events (cursor movement,
  typing indicators), use Broadcast instead.
- **Authorization overhead:** Every change event triggers an RLS check per connected
  subscriber. 100 subscribers + 1 INSERT = 100 authorization reads. Plan accordingly
  for high-traffic tables.
- **TooManyChannels error** is the top cause of silent Realtime failures in React apps.
  Always `removeChannel` in useEffect cleanup.

---

## 2. Client setup — browser client vs server client

Realtime is **browser only**. It requires a WebSocket connection, which is not available in
server components, server actions, or API route handlers.

```ts
// lib/supabase/client.ts — the only client that can use Realtime
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`createBrowserClient` implements a singleton — calling it multiple times returns the same
instance, so there is only one WebSocket connection per page regardless of how many
components call `createClient()`.

**Important for this codebase:** AGENTS.md forbids `createClient()` from
`@/lib/supabase/client` in components for data access and mutations. Realtime subscriptions
are the one legitimate exception — they require the browser client. Any component using
the browser client for Realtime must:

1. Use it only for `.channel()` subscriptions — never for `.from().select()` queries
2. Keep all queries and mutations in server actions (unchanged)

---

## 3. Next.js Router Cache and prefetching

### The four caching layers

| Layer               | Location           | Duration                     | Cleared by                                                |
| ------------------- | ------------------ | ---------------------------- | --------------------------------------------------------- |
| Request Memoization | Server, per render | Duration of one render pass  | Automatic                                                 |
| Data Cache          | Server, persistent | Until revalidated            | `revalidatePath`, `revalidateTag`                         |
| Full Route Cache    | Server, persistent | Until Data Cache revalidated | Revalidating Data Cache                                   |
| **Router Cache**    | **Client memory**  | **Session + time-based**     | **`router.refresh()`, `revalidatePath` in Server Action** |

The Router Cache is what matters for perceived navigation speed. It stores RSC payloads
in browser memory and serves them instantly on navigation without a server round-trip.

### Router Cache durations

| How route was cached             | Duration                            |
| -------------------------------- | ----------------------------------- |
| `<Link>` default (dynamic route) | 0s — not cached                     |
| `<Link>` default (static route)  | 5 minutes                           |
| `<Link prefetch={true}>`         | 5 minutes (both static and dynamic) |
| `router.prefetch()`              | 5 minutes (both static and dynamic) |

All context tab pages in this app are dynamic (they call `requireAuth()` which reads
cookies). Without explicit prefetching they are **not cached** — every tab switch is a
server round-trip.

### router.prefetch()

```ts
router.prefetch('/context/abc/board');
// - Fires a request for the RSC payload of that route
// - Stores it in the Router Cache (5 minutes for dynamic routes)
// - Navigation to that route uses the cache — no round-trip, no skeleton
```

Called proactively after the shell mounts, this makes all tab switches instant for ~5
minutes after the project is opened.

### router.refresh()

```ts
router.refresh();
// - Clears the Router Cache for the CURRENT route only
// - Makes a new server request for the RSC payload
// - Does NOT clear Data Cache or Full Route Cache
// - Preserves React state and scroll position (not a full page reload)
// - Reconciles new RSC result with existing client state
```

Use after a Realtime event when you want to re-fetch the full server component data.
Avoid as the primary mutation UI update mechanism — it is a round-trip.

### revalidatePath from a Server Action

```ts
// In a server action:
revalidatePath(`/context/${projectId}/board`);
// Clears:
//   1. Data Cache for that path
//   2. Full Route Cache for that path
//   3. Router Cache on the client — IMMEDIATELY, via the server action response
```

`revalidatePath` called from a Server Action clears the Router Cache immediately because
the action response carries cache invalidation signals. `revalidatePath` called from a
Route Handler does NOT immediately clear the Router Cache.

---

## 4. useOptimistic

```ts
const [optimisticItems, dispatchOptimistic] = useOptimistic(
  items,                                       // real/authoritative state
  (current, action) => { ... return next }     // pure reducer
)
```

- While an async Transition is pending: `optimisticItems` shows the optimistic value
- When the Transition ends (success or failure): `optimisticItems` reverts to `items`
- Rollback on error is **automatic** — if the server action throws, optimistic state
  reverts to the real value with no extra code

### Requirement: must be inside startTransition

```ts
// CORRECT
startTransition(async () => {
  dispatchOptimistic(tempItem);
  await serverAction();
});

// WRONG — throws "Cannot update during render" or similar
dispatchOptimistic(tempItem);
await serverAction();
```

### Pattern for list mutations with deduplication prep

```ts
const [optimisticTasks, addOptimistic] = useOptimistic(
  tasks,
  (current, newTask) => [...current, { ...newTask, pending: true }]
);

const handleCreate = (formData) => {
  startTransition(async () => {
    const tempId = `temp-${crypto.randomUUID()}`;
    addOptimistic({ id: tempId, ...formData, pending: true });

    const { data: saved, error } = await createTask(formData);
    if (error) return; // auto-rollback

    // Replace temp item with real item.
    // When Realtime fires the echo, saved.id is already in state → skipped.
    setTasks((prev) => prev.map((t) => (t.id === tempId ? saved : t)));
  });
};
```

---

## 5. Combining optimistic updates with Realtime

### The echo problem

Every Supabase Realtime subscriber — including the user who made the mutation — receives
the `postgres_changes` event. Without deduplication, the sequence is:

1. Optimistic update → item appears in state with temp ID
2. Server action returns → item replaced with real ID
3. **Realtime echo fires** → same item inserted again → **duplicate**

### The canonical fix: ID-based deduplication

In every Realtime INSERT handler:

```ts
.on('postgres_changes', { event: 'INSERT', ... }, (payload) => {
  setItems(prev => {
    if (prev.some(i => i.id === payload.new.id)) return prev  // echo guard
    return [...prev, payload.new]
  })
})
```

This single guard handles both the echo case (item already in state from optimistic update)
and the multi-user case (item from another user is not in state → add it).

### UPDATE deduplication (for pending state)

```ts
.on('postgres_changes', { event: 'UPDATE', ... }, (payload) => {
  setItems(prev =>
    prev.map(i => i.id === payload.new.id ? { ...payload.new } : i)
  )
  // No dedup needed — replacing is idempotent
})
```

### DELETE handling (cannot be filtered)

```ts
.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
  // Filter is ignored for DELETE — check project ownership manually if needed
  setItems(prev => prev.filter(i => i.id !== payload.old.id))
})
```

Because DELETE cannot be filtered by `project_id`, you will receive DELETE events for
ALL rows deleted from that table across all projects. Always check `payload.old.project_id`
(requires REPLICA IDENTITY FULL) before applying the delete to local state.

### Realtime as a signal only (simple alternative)

For less interactive tabs, skip applying the payload directly and just signal a re-fetch:

```ts
.on('postgres_changes', { event: '*', ... }, () => {
  onRefresh()  // triggers server re-fetch; no dedup logic needed
})
```

Trade-off: a network round-trip on every change. No duplicate risk. Good for low-frequency
data like billing records, owner settings, milestones.

### Full architecture summary

```
Own mutations:
  server action → return saved row → update local state immediately
  server action → revalidatePath → Router Cache cleared for next navigation
  (Realtime echo arrives → ID already in state → skipped by dedup guard)

Other users' mutations:
  Realtime event → ID not in state → apply to local state
  OR
  Realtime event → call onRefresh() → server re-fetch

Tab navigation (after prefetch):
  Router Cache hit → instant render (no skeleton)
  Cache miss (>5min or post-mutation) → server fetch → skeleton → content
```

---

## 6. React StrictMode and Realtime in development

React StrictMode (active in Next.js dev mode) runs every `useEffect` twice:
mount → unmount → remount. This causes two channel subscriptions to be created.

With `supabase.removeChannel(channel)` in cleanup, the first channel is properly torn down
before the second is created. With the singleton `createBrowserClient`, only one WebSocket
connection exists regardless.

This double-invoke only happens in development. Production runs effects exactly once.

---

## Quick reference card

```ts
// Subscribe
const ch = supabase
  .channel('name')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'x', filter: 'col=eq.val' },
    cb
  )
  .subscribe();
return () => supabase.removeChannel(ch); // always cleanup

// Dedup guard in INSERT handler
if (prev.some((i) => i.id === payload.new.id)) return prev;

// DELETE cannot be filtered — check project_id manually

// Prefetch all tabs after shell mount
useEffect(() => {
  for (const slug of enabledSlugs)
    router.prefetch(`/context/${projectId}/${slug}`);
}, [projectId]);

// Optimistic update pattern
startTransition(async () => {
  addOptimistic(tempItem);
  const { data } = await serverAction();
  // on error: auto-rollback; on success: swap temp for real
  setItems((prev) => prev.map((i) => (i.id === tempItem.id ? data : i)));
});

// revalidatePath (server action) → clears Data Cache + Router Cache immediately
// router.refresh() (client) → clears Router Cache for current route only
// router.prefetch() → 5-minute Router Cache for dynamic routes
```
