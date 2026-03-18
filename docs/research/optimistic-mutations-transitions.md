# Optimistic Mutations — startTransition, useOptimistic, and useTransition

Research on React's transition system and optimistic update patterns.
Critical compatibility note: **useOptimistic requires React 19 / Next.js 15.**
This codebase is on Next.js 14 (React 18). The correct pattern for each version
is documented here so the Phase 1 implementation uses the right one.

---

## Version compatibility matrix

| Feature                        | React version   | Next.js version | Available in this codebase? |
| ------------------------------ | --------------- | --------------- | --------------------------- |
| `useOptimistic` (stable)       | React 19        | Next.js 15      | **No**                      |
| `useOptimistic` (experimental) | React 18 canary | —               | No                          |
| `useTransition`                | React 18+       | Next.js 14+     | **Yes**                     |
| `startTransition` (async)      | React 19        | Next.js 15      | **No**                      |
| `startTransition` (sync only)  | React 18        | Next.js 14      | **Yes**                     |
| `useState`-based optimistic    | Any             | Any             | **Yes**                     |

**Bottom line for Phase 1:** Use `useState`-based manual optimistic updates.
Do NOT use `useOptimistic`. Do NOT use async `startTransition` (throws in React 18).

---

## The correct pattern for this codebase (React 18 / Next.js 14)

### Optimistic create

```ts
// In a *Client.tsx component
const [items, setItems] = useState(initialItems);
const [isSubmitting, setIsSubmitting] = useState(false);

const handleCreate = async (title: string) => {
  const tempId = `temp-${crypto.randomUUID()}`;
  const tempItem = { id: tempId, title, pending: true, ...defaults };

  setItems((prev) => [tempItem, ...prev]); // optimistic: user sees it immediately
  setIsSubmitting(true);

  const { data: saved, error } = await createItem(projectId, title);

  if (error || !saved) {
    setItems((prev) => prev.filter((i) => i.id !== tempId)); // rollback
    // show error dialog
    setIsSubmitting(false);
    return;
  }

  // Replace temp with real row (when Realtime echo arrives, dedup guard skips it)
  setItems((prev) => prev.map((i) => (i.id === tempId ? saved : i)));
  setIsSubmitting(false);
};
```

**Key properties:**

- User sees the item appear immediately (< 16ms)
- Server failure rolls back the optimistic state
- When Phase 2 (Realtime) adds an INSERT echo handler, the dedup guard
  (`if (prev.some(i => i.id === payload.new.id)) return prev`) skips the echo
  because `saved.id` is already in state at that point

### Optimistic update (in-place edit)

```ts
const handleUpdate = async (id: string, changes: Partial<Item>) => {
  const original = items.find((i) => i.id === id);
  if (!original) return;

  setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i))); // optimistic

  const { data: saved, error } = await updateItem(id, changes);

  if (error || !saved) {
    setItems((prev) => prev.map((i) => (i.id === id ? original : i))); // rollback to original
    return;
  }

  setItems((prev) => prev.map((i) => (i.id === id ? saved : i))); // commit server version
};
```

### Optimistic delete

```ts
const handleDelete = async (id: string) => {
  const deleted = items.find((i) => i.id === id);
  setItems((prev) => prev.filter((i) => i.id !== id)); // optimistic

  const { error } = await deleteItem(id);

  if (error) {
    setItems((prev) => [deleted!, ...prev]); // rollback
  }
  // success: nothing to do, state already correct
};
```

---

## What useOptimistic does (for future reference / Phase 2+)

Available only in React 19 / Next.js 15. Documents the mechanics for when
the codebase upgrades.

```ts
// React 19 only — do NOT use in this codebase
const [optimisticItems, addOptimistic] = useOptimistic(
  items, // real/authoritative state
  (current, newItem) => [newItem, ...current] // pure reducer
);

// Inside a startTransition (async) — also React 19 only
startTransition(async () => {
  addOptimistic({ id: `temp-${crypto.randomUUID()}`, ...data, pending: true });
  const saved = await createItem(data);
  setItems((prev) => [...prev, saved]);
});
```

**Behavior:**

- While the transition is pending: `optimisticItems` shows the optimistic value
- When the transition ends (success): `optimisticItems` reverts to `items` value
  (which should now include the saved row from `setItems`)
- When the transition ends (error): `optimisticItems` auto-reverts to `items` —
  **automatic rollback, no explicit error handling needed for UI state**

**What `useOptimistic` adds over manual `useState`:**

- Auto-rollback on error (no `if (error) setItems(original)` needed)
- Tied to React's transition lifecycle — optimistic state is scoped to the transition
- Cleaner mental model: "optimistic layer" vs "real state" are distinct

**What it does NOT add:**

- No network performance improvement (same server action call)
- No different caching behavior
- The user-perceived latency improvement is identical to the `useState` pattern

---

## startTransition — what it does and does not do

### In React 18 (synchronous only)

```ts
// React 18 — startTransition accepts a SYNCHRONOUS function only
const [isPending, startTransition] = useTransition();

startTransition(() => {
  // Only synchronous state updates here
  setTab('notes');
});
// ↑ marks the update as non-urgent; React can interrupt it for higher-priority updates
```

**Do NOT** pass an async function to `startTransition` in React 18 — it silently
drops the promise and the transition ends before the async work completes.

### In React 19

```ts
// React 19 — startTransition accepts async functions
startTransition(async () => {
  addOptimistic(tempItem); // synchronous optimistic state update
  const saved = await serverAction(); // server round-trip (async)
  setItems((prev) => [...prev, saved]);
});
// isPending remains true until the entire async function resolves
```

The `isPending` flag staying true throughout the async function is what enables
`useOptimistic` to hold the optimistic state until the server responds.

### useTransition in React 18 for UI feedback only

Even in React 18, `useTransition` is useful for tracking an in-flight state:

```ts
const [isPending, startTransition] = useTransition();

const handleTabSwitch = (slug: string) => {
  startTransition(() => {
    router.push(`/context/${projectId}/${slug}`);
  });
};
// isPending = true while React processes the navigation
// Can use isPending to show a subtle loading indicator
```

---

## The revalidatePath flash — why this codebase avoids it

A known issue in Next.js App Router when combining optimistic state with
`revalidatePath` from a server action:

```
1. Optimistic state update → UI shows new item
2. Server action fires → returns saved row
3. Server action calls revalidatePath → RSC payload invalidated
4. Next.js requests new RSC payload from server
5. ⚠️  React reconciles new RSC result with client state
6. For a moment, optimistic state reverts to server-side state
   (which may not yet reflect the new row if RSC fetches faster than DB write)
7. Flash: item disappears briefly, then reappears
```

**This codebase avoids the flash because:**

- Context tab mutations call `onRefresh()` — which updates local `useState` directly
  from the server action's return value
- `revalidatePath` is called for Next.js cache correctness, but the UI update
  comes from `setItems(prev => ...)` using returned data — NOT from RSC revalidation
- The RSC refresh happens in the background and reconciles to the same state
  (item already in local state) — no visible flash

**The rule that prevents the flash:**

```ts
// CORRECT — update from return value, not from revalidation-driven re-render
const { data: saved } = await createItem(...)
setItems(prev => [...prev, saved])    // immediate, from returned data
// revalidatePath runs server-side for cache correctness — not the UI driver

// WRONG — relying on revalidatePath to drive the UI update
await createItem(...)
router.refresh()  // ← UI update from here causes the flash
```

---

## router.refresh() — when it is and is not appropriate

```ts
router.refresh();
// - Clears Router Cache for the CURRENT route
// - Triggers a new RSC fetch from the server
// - Does NOT reset React state (useState, useReducer)
// - Reconciles new RSC result with existing client state
```

**Appropriate uses:**

- After an action that changes server-rendered data for the current route that
  is NOT tracked in local state (e.g., a count in a shared layout)
- As a background sync call AFTER optimistic state is already updated

**Inappropriate uses (anti-patterns):**

- As the primary mechanism to show mutation results (`router.refresh()` then wait)
- Instead of `onRefresh()` for context tab data
- As a substitute for returning data from server actions

**In this codebase:** After optimistic state is updated from the server action
return value, `router.refresh()` may be called as a background cache sync — but
it must never be the thing the user waits for.

---

## Migration path: React 18 → React 19

When the codebase upgrades to Next.js 15 (React 19), the optimistic pattern can
be migrated incrementally:

1. The `useState`-based optimistic code continues to work — no forced migration
2. New components or rewrites can use `useOptimistic` + async `startTransition`
3. The dedup guard logic is the same regardless of which pattern is used
4. The `onRefresh()` pattern remains valid and correct in both versions

The Phase 1 code written for React 18 does not need to be removed or rewritten
when upgrading — it continues to work and can be migrated on a per-component
basis.

---

## Quick reference

```ts
// ✅ React 18 — correct optimistic pattern
const [items, setItems] = useState(initialItems)

const handleCreate = async (data) => {
  const tempId = `temp-${crypto.randomUUID()}`
  setItems(prev => [{ id: tempId, ...data, pending: true }, ...prev])  // optimistic

  const { data: saved, error } = await serverAction(data)

  if (error) {
    setItems(prev => prev.filter(i => i.id !== tempId))  // rollback
    return
  }
  setItems(prev => prev.map(i => i.id === tempId ? saved : i))  // commit
}

// ❌ React 18 — do NOT use (requires React 19)
const [optimistic, addOptimistic] = useOptimistic(items, reducer)
startTransition(async () => { ... })  // async startTransition = React 19 only

// ✅ React 18 — useTransition for UI feedback (navigation, non-data transitions)
const [isPending, startTransition] = useTransition()
startTransition(() => { router.push(url) })  // sync only

// ✅ Phase 2 Realtime dedup guard — same regardless of React version
.on('postgres_changes', { event: 'INSERT', ... }, (payload) => {
  setItems(prev => {
    if (prev.some(i => i.id === payload.new.id)) return prev  // echo guard
    return [payload.new, ...prev]
  })
})
```
