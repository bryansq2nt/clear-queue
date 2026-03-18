# React and Next.js Performance Patterns

Production-validated patterns for reducing perceived latency and preventing
unnecessary renders in a Next.js 14 / React 18 list-heavy SaaS application.

These patterns are Realtime-compatible — none of them need to change when
Supabase subscriptions are added.

---

## 1. `optimizePackageImports` for lucide-react — 15–40% faster cold starts

### What it is

When a component imports `import { Plus, Trash2, Edit } from 'lucide-react'`, the
bundler loads lucide's barrel file (`index.js`) which re-exports all ~1,400 icons,
then tree-shakes. Even with tree-shaking, the barrel load itself adds to cold start
time. `optimizePackageImports` in `next.config` pre-maps imports to direct paths,
bypassing the barrel entirely.

### Benchmark

Vercel: **15–70% faster local dev cold start**, ~28% faster production build,
up to 40% faster serverless function cold starts for apps heavy with icon library usage.

### ClearQueue audit

`next.config.mjs` currently has no `optimizePackageImports` setting. ClearQueue uses
`lucide-react` in essentially every component file — this is a high-impact miss.

### Fix

```js
// next.config.mjs
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};
```

One line. No application code changes. Takes effect on next build.

---

## 2. Hover-only prefetch on long link lists

### What it is

Next.js `<Link>` components trigger a prefetch call when they enter the viewport by
default. On a page that renders 30+ links (notes list, links module, tasks per column),
this fires 30 simultaneous prefetch requests when the page loads — most of which are
never navigated to.

Setting `prefetch={false}` on list items and re-enabling on `onMouseEnter` limits
prefetch to the 1–3 items the user actually hovers over.

### ClearQueue audit

No hover-prefetch pattern exists in the codebase. The notes list, links list, and
board task cards all render `<Link>` components without `prefetch={false}`. On a
project with 50 notes, 50 simultaneous prefetch requests fire on tab load.

### Fix pattern

```tsx
// components/shared/HoverPrefetchLink.tsx
'use client';

import Link from 'next/link';
import { useState, type ComponentProps } from 'react';

type Props = ComponentProps<typeof Link>;

export function HoverPrefetchLink({ onMouseEnter, ...props }: Props) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  return (
    <Link
      {...props}
      prefetch={shouldPrefetch}
      onMouseEnter={(e) => {
        setShouldPrefetch(true);
        onMouseEnter?.(e);
      }}
    />
  );
}
```

**Apply to:** any list that renders 10+ navigable items. In ClearQueue:

- Notes list (`ContextNotesClient` — each note links to `/notes/[noteId]`)
- Board task cards (each opens a detail modal, not a route — N/A)
- Links module (`ContextLinksClient` — external links, not Next.js routes — N/A)
- Documents and media (open via API route, not Next.js route — N/A)

In practice, the most applicable location is the notes list. Other modules open
drawers or modals rather than navigating.

---

## 3. `useLinkStatus` for tab bar feedback on slow networks

### What it is

Next.js's `useLinkStatus()` hook returns `{ pending: boolean }` that is `true` while
a transition triggered by a `<Link>` click is in progress (waiting for the server
component to stream). On fast connections the pending state never visibly triggers
(resolves in <16ms). On slow connections it gives the user immediate feedback that
their click was received.

### Why it matters

Without feedback, a user on a 500ms connection clicks a tab and sees nothing for
half a second. They click again, navigate twice, and end up confused. A subtle
indicator (slightly dimmed tab, small dot) with a 100ms CSS animation delay eliminates
the dead zone without adding visual noise for fast users.

### Fix pattern

```tsx
// components/context/ContextTabBar.tsx
// Wrap each tab button in a component that uses useLinkStatus

'use client';
import { useLinkStatus } from 'next/navigation';

function TabButton({ href, children, isActive }) {
  const { pending } = useLinkStatus();
  return (
    <Link
      href={href}
      className={cn(
        'tab-button',
        isActive && 'tab-active',
        pending && 'opacity-70 transition-opacity delay-100' // only visible after 100ms
      )}
    >
      {children}
    </Link>
  );
}
```

The `delay-100` (100ms CSS transition delay) means fast navigations (cached routes)
show no visual change. Only genuinely slow navigations show the dim effect.

**Note:** `useLinkStatus` must be called inside a component that is a child of the
`<Link>` component's closest ancestor in the component tree, or wrapped directly in
the link component. Read the Next.js docs before implementing.

---

## 4. Composition over memoization for container components

### What it is

When a parent component manages local state (modal open/closed, scroll position,
selected item), children defined inside its JSX body re-render every time the parent's
state changes. Passing children via the `children` prop instead causes React to skip
re-rendering them — they came from an outer scope where nothing changed.

```tsx
// Pattern A — child rerenders on every parent state change
function Container() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <ExpensiveList /> {/* ← rerenders when open changes */}
      <Modal open={open} />
    </div>
  );
}

// Pattern B — composition, child does not rerender
function Container({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {children} {/* ← does NOT rerender when open changes */}
      <Modal open={open} />
    </div>
  );
}
// Usage: <Container><ExpensiveList /></Container>
```

### Why this beats memo()

`memo()` requires every prop passed to `ExpensiveList` to be stable (no new object
or function references). That requires `useMemo`/`useCallback` on the parent, which
adds its own overhead and maintenance burden. The composition pattern achieves the
same result with no memoization at all.

### ClearQueue application

In `ContextBoardClient`, the modal state (`isAddTaskOpen`, `errorDialog`) causes
rerenders. The `KanbanBoard` component (which renders all task cards) is declared
inside the same component. If `KanbanBoard` is computationally expensive, this
causes unnecessary work on every modal state change.

This is a low-priority optimization — only worth doing if profiling shows the board
rerenders are measurable.

---

## 5. useMemo and useCallback — when to use and when NOT to

### The rule

`useCallback` only provides value when:

1. The function is passed as a prop AND
2. The receiving component is wrapped in `memo()` AND
3. Profiling confirms that component is unnecessarily re-rendering

`useMemo` only provides value when:

1. The computation takes >1ms (measure it) OR
2. The result is an object/array passed to a `memo()`-wrapped child

**Filtering a 50-item list in JavaScript takes ~0.01ms.** Memoizing it costs more
than it saves.

### The mistake ClearQueue should avoid

Adding `useMemo` to filter/sort operations in list components (notes filtered by
folder, tasks filtered by status) is premature optimization. React 18 renders are
fast enough that these operations are negligible.

### When it IS worth it in ClearQueue

- `useCallback` on handlers passed to `KanbanBoard` task card rows IF those rows
  are `memo()`-wrapped (they likely are for drag-and-drop performance)
- `useMemo` on the calendar view's date grid computation (generates ~35 day cells
  with computed properties from the items array — worth checking)
- `useMemo` on the billing module's `filteredBillings` computation if the list
  can be 200+ items with multiple active filters

---

## 6. Always use the updater function form in setState

### What it is

React 18's automatic batching means multiple `setState` calls in the same event
handler fire as a single render. This is good. But it also means a `setState` that
closes over `items` from the current render may operate on a stale value if another
`setState` has already queued an update to `items`.

```ts
// Stale closure — may operate on old items if another update is pending
const handleAdd = () => {
  setItems([...items, newItem]); // ← items captured in closure
};

// Updater form — always gets the latest committed state
const handleAdd = () => {
  setItems((prev) => [...prev, newItem]); // ← prev is guaranteed current
};
```

### When this matters in ClearQueue

Any handler that could be called twice in quick succession:

- Double-click on a delete button (before it's disabled)
- Rapid status changes on tasks (drag-and-drop + keyboard shortcut simultaneously)
- Realtime events arriving while an optimistic mutation is in-flight

The updater form costs nothing and prevents a class of race condition bugs. All
`setX(prev => ...)` patterns are correct. All `setX([...items, newItem])` patterns
are at risk.

### ClearQueue audit guidance

Search for `setNotes\|setLinks\|setBillings\|setTasks` calls that do NOT use the
updater form and change them preemptively.

---

## 7. Never define components inside other components

### The problem

```tsx
function NotesList({ notes }) {
  // ❌ NoteRow is a new component type on every render
  const NoteRow = ({ note }) => <li>{note.title}</li>;
  return (
    <ul>
      {notes.map((n) => (
        <NoteRow key={n.id} note={n} />
      ))}
    </ul>
  );
}
```

React sees `NoteRow` as a new component type every render (it's a new function
reference). It unmounts and remounts the DOM nodes for every row on every render.
At 50 notes this is 50 unmount/mount cycles.

### Fix

Move any component defined inside another component to module scope.

### ClearQueue audit

This pattern occasionally appears in drawer and modal components that define their
own sub-components inline for convenience. It is a low-priority fix but should be
watched for in code review.

---

## 8. React 18 automatic batching — what changed

React 18 batches ALL state updates into a single render regardless of where they
occur (setTimeout, Promise callbacks, native events). In React 17, only React
event handlers were batched.

**For ClearQueue this means:**

```ts
// In a server action callback (Promise context)
const handleSave = async () => {
  const result = await saveNote(data);
  // React 18: these three setStates trigger ONE render (batched automatically)
  setNote(result);
  setIsLoading(false);
  setError(null);
};
```

No code changes needed. This is already working. The payoff: mutation handlers that
previously triggered 3 renders now trigger 1.

**What to avoid:** `flushSync()` opts out of batching and should only be used when
you genuinely need an intermediate render (e.g., measuring DOM size after a specific
state change). Do not add it "just in case."

---

## Quick reference

| Pattern                                    | Impact                                    | Action needed                 | Priority |
| ------------------------------------------ | ----------------------------------------- | ----------------------------- | -------- |
| `optimizePackageImports: ['lucide-react']` | 15–40% faster cold start                  | 1 line in next.config.mjs     | **High** |
| Hover-only prefetch on notes list          | Eliminates 30–50 wasted prefetch requests | `HoverPrefetchLink` component | Medium   |
| `useLinkStatus` on tab bar                 | Better UX on slow connections             | `ContextTabBar.tsx`           | Low      |
| Updater form in all `setItems` calls       | Prevents stale closure race conditions    | Audit `*Client.tsx` files     | Medium   |
| Composition over memo for containers       | Avoids rerender cascades                  | Architecture review only      | Low      |
| Never define components inside components  | Prevents remount cycles                   | Code review rule              | Low      |
| React 18 automatic batching                | Already working, no action needed         | —                             | Done     |
