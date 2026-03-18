# Realtime Subscription Placement in Next.js App Router

Research on where subscriptions belong in the component tree, their lifecycle,
and how to call `createClient()` from a `*Client.tsx` file without triggering
the ESLint rule that bans it.

Versions: Next.js 14.2.35, React 18.3.1, @supabase/supabase-js ^2.39.0.

---

## 1. Component lifecycle during tab navigation

**Tab switches are route navigations — the previous \*Client.tsx fully unmounts.**

Each context tab is its own route:

```
/context/[projectId]/notes    → page.tsx → ContextNotesClient
/context/[projectId]/billings → page.tsx → ContextBillingsClient
```

When the user clicks the Billings tab while on Notes:

1. App Router starts the navigation
2. `ContextNotesClient` unmounts → useEffect cleanup fires → `removeChannel()` called
3. `loading.tsx` skeleton is shown while the new page's server fetch runs
4. `ContextBillingsClient` mounts → its useEffect fires → new subscription created

**Practical result:** Subscriptions self-clean on every tab switch. No teardown code
beyond the `removeChannel()` in the useEffect cleanup is needed. Two \*Client.tsx
instances cannot overlap — navigation is sequential, not concurrent.

**For a single-project session:** `projectId` never changes while a tab is open.
The subscription is created once on mount and removed once on unmount.

---

## 2. Dependency array

**Use `[projectId]` only.**

The subscription useEffect depends only on `projectId` because:

- The channel name embeds `projectId`
- The filter string embeds `projectId`
- `projectId` changing means a different project — subscription must rebuild

No `*Client.tsx` receives an `onRefresh` callback. State updates inside the
subscription handler use the module's own `setX` setters (e.g., `setNotes`),
which are stable React dispatch functions — they do not need to be in the
dependency array.

```ts
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`notes:${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        // setNotes is stable — not in deps
        if (payload.eventType === 'INSERT') {
          setNotes((prev) =>
            prev.some((n) => n.id === payload.new.id)
              ? prev
              : [payload.new as Note, ...prev]
          );
        }
        // ...
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') router.refresh(); // safety refetch
    });
  return () => {
    supabase.removeChannel(channel);
  };
}, [projectId]); // only projectId
```

---

## 3. React StrictMode double-invoke

`next.config.mjs` does not set `reactStrictMode`. Next.js 14 does not auto-enable
StrictMode. In production, useEffect fires exactly once per mount.

In development, React 18 can double-invoke effects (fire → cleanup → fire) via
StrictMode or Suspense boundary remounts. The subscription pattern handles this
correctly:

- First effect: channel created, subscription starts
- First cleanup: `removeChannel()` called — channel sent `phx_leave`, removed from list
- Second effect: `createClient()` called again, new channel created — fresh subscription

`removeChannel()` is safe to call on a channel that is mid-join or already left.
If called before `SUBSCRIBED`, the pending join is cancelled. The second mount
creates a fresh channel with the same topic name — no conflict because the
first channel was already removed from the internal list.

**No special StrictMode handling needed** — the standard `useEffect` + `removeChannel`
pattern is correct.

---

## 4. Browser tab visibility — no React lifecycle impact

When the user backgrounds the browser tab (switches to another browser tab or window):

- React components stay mounted (no unmount, no cleanup)
- `useEffect` does not re-fire
- Subscriptions stay active
- State updates from incoming Realtime events are queued and processed normally

Visibility change is a page-level event, not a React lifecycle event. It has no
effect on component mounting or useEffect timing. This is independent of the
Web Worker heartbeat (covered in `realtime-connection-lifecycle.md`).

---

## 5. The ESLint rule — `createClient()` is banned in `*Client.tsx` files

The custom ESLint rule `clear-queue/no-client-supabase-in-components` flags any
`createClient()` call in files that:

- Contain `'use client'` AND
- Match `app/**/*Client.tsx` or `components/**`

Source: `eslint-plugin-clear-queue/rules/no-client-supabase-in-components.js`

The rule exists to prevent data fetches from running in client components.
Realtime subscriptions are not data fetches, but the rule does not distinguish —
any `createClient()` call in a `*Client.tsx` file will fail the lint check.

### The fix: a custom hook in `lib/`

Move the `createClient()` call into a custom hook outside the banned path:

```ts
// lib/realtime/use-project-channel.ts  ← not *Client.tsx, not components/
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface Options {
  projectId: string;
  table: string;
  onEvent: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ) => void;
  onStatus?: (status: string) => void;
}

export function useProjectChannel({
  projectId,
  table,
  onEvent,
  onStatus,
}: Options) {
  // Use refs for callbacks so they don't need to be in the dependency array
  const onEventRef = useRef(onEvent);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`${table}:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => onEventRef.current(payload)
      )
      .subscribe((status, err) => {
        onStatusRef.current?.(status);
        if (status === 'CHANNEL_ERROR') {
          console.error(`[realtime:${table}]`, err?.message);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, table]); // stable — table never changes within a tab's life
}
```

Usage in a `*Client.tsx`:

```ts
// ContextNotesClient.tsx
useProjectChannel({
  projectId,
  table: 'notes',
  onEvent: (payload) => {
    if (payload.eventType === 'INSERT') {
      setNotes((prev) =>
        prev.some((n) => n.id === payload.new.id)
          ? prev
          : [payload.new as Note, ...prev]
      );
    }
    if (payload.eventType === 'UPDATE') {
      setNotes((prev) =>
        prev.map((n) => (n.id === payload.new.id ? (payload.new as Note) : n))
      );
    }
    if (payload.eventType === 'DELETE') {
      setNotes((prev) => prev.filter((n) => n.id !== payload.old.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh(); // safety refetch on disconnect
  },
});
```

**Benefits of this hook:**

- ESLint rule does not apply — `lib/realtime/use-project-channel.ts` is not a \*Client.tsx
- `onEvent` and `onStatus` are kept in refs — stable, never cause subscription teardown
- Dependency array `[projectId, table]` is minimal and correct
- Single subscription per channel name (Realtime deduplicates by topic name anyway)
- Cleanup is encapsulated — \*Client.tsx files never call `removeChannel` directly

### Alternative: eslint-disable comment

For cases where the hook abstraction is too much (e.g., the Calendar tab which needs a
special onRefresh-only strategy), a targeted disable comment is acceptable:

```ts
// eslint-disable-next-line clear-queue/no-client-supabase-in-components
const supabase = createClient();
```

The hook approach is preferred for the standard pattern. The disable comment is
acceptable for the Calendar tab's custom strategy.

---

## 6. Where NOT to place subscriptions

### Layout files

`app/context/[projectId]/ContextLayoutWrapper.tsx` has a commented subscription slot
at lines 39–48. **Do not use this.**

A subscription in the layout would stay active across all tab navigations, which means:

- It must handle events for all tables (one layout channel ≠ one table)
- When an event fires, the active \*Client.tsx may be a different tab — there's no way to
  route the event to the right state setter
- The layout cannot call `setNotes` — that state lives inside `ContextNotesClient`

The commented slot in the layout was a placeholder from the cache-removal phase.
It should be removed, not implemented.

### components/ directory

Components under `components/` are reusable UI — they do not own data state and cannot
call `setNotes` or any module-specific state setter. No subscriptions here.

---

## 7. Quick reference — subscription checklist per \*Client.tsx

```ts
// In a *Client.tsx, add ONE of these:

// Option A — use the shared hook (preferred)
useProjectChannel({
  projectId,
  table: 'notes', // the table this tab owns
  onEvent: (payload) => {
    // reconcile payload into setNotes(...)
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});

// Option B — inline (use only for special cases like Calendar)
// eslint-disable-next-line clear-queue/no-client-supabase-in-components
const supabase = createClient(); // inside useEffect only
```

Dependency array: `[projectId]` (or `[projectId, table]` in the hook).
Cleanup: `supabase.removeChannel(channel)` — always, always in the cleanup.
Status handler: call `router.refresh()` when status is not `SUBSCRIBED` (safety refetch).
