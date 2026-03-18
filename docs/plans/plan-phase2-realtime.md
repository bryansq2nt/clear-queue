# Phase 2 — Supabase Realtime Subscriptions

Goal: every context tab reflects changes made by other collaborators in real time,
without requiring a page reload or manual refresh.

Research basis:

- `docs/research/realtime-connection-lifecycle.md`
- `docs/research/realtime-module-readiness.md`
- `docs/research/realtime-subscription-placement.md`
- Internet research: confirmed production failure modes (see section 0)

---

## 0. Known failure modes and how the plan addresses them

These are real-world pitfalls found in community research, GitHub issues, and
Supabase documentation. Each one is a confirmed silent failure — no error is
thrown, but events simply do not arrive. The plan is structured to eliminate
all of them before any subscription code is written.

| #   | Failure                                      | Why it happens                                                      | Addressed by                                                            |
| --- | -------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| F1  | Events never arrive                          | Table not in `supabase_realtime` publication                        | Migration in A1                                                         |
| F2  | Events never arrive                          | Missing SELECT RLS policy (WALRUS drops silently)                   | Already correct — all tables have `is_project_member()` SELECT policies |
| F3  | DELETE events never arrive                   | `project_id` not in WAL old-record; filter can't evaluate           | `REPLICA IDENTITY FULL` in A1 migration                                 |
| F4  | DELETE events arrive from wrong projects     | Server-side filter unreliable for DELETE (confirmed Supabase bug)   | Client-side guard in every DELETE handler                               |
| F5  | Channels multiply until TooManyChannels      | `removeChannel` missing from cleanup                                | Already in hook pattern (Part B)                                        |
| F6  | Events missed after reconnect                | Realtime has no replay mechanism                                    | `onStatus` → `router.refresh()` on every re-SUBSCRIBED                  |
| F7  | Channels silently die after 1+ hr offline    | JWT expires while offline, channel removed, token refresh misses it | `TOKEN_REFRESHED` listener in hook (Part B)                             |
| F8  | Events arrive but `payload.new` is `{}`      | Row exceeds 1 MiB — WALRUS truncates silently (Error 413)           | `payload.errors` check in hook; fetch by id on 413                      |
| F9  | Events lost when browser tab is backgrounded | Browser throttles JS timers; heartbeat stops                        | `realtime: { worker: true }` in A2                                      |
| F10 | `supabase db reset` wipes publication        | CLI reset drops `supabase_realtime` config                          | Publication in migration file, not dashboard toggle                     |

**Overall approach:** subscriptions are a best-effort live layer on top of the
existing `router.refresh()` safety net. Every module calls `router.refresh()` on
disconnect and on tab re-focus. If a subscription silently stops working, the user
still gets correct data — they just lose the live update and don't notice unless
they are actively collaborating.

---

## What this plan does NOT do

- No changes to optimistic mutation pattern from Phase 1 — Realtime sits alongside it
- No new global state layer — each tab manages its own subscription
- No changes to server actions or page.tsx files
- No changes to the `router.refresh()` fallback — it stays as the safety net

---

## Part A — Prerequisites (must be done before any subscription code)

### A1 — Publication + REPLICA IDENTITY migration

**Two separate blockers resolved in one migration:**

**Blocker 1:** No table is in the `supabase_realtime` publication. Events never fire.

**Blocker 2 (discovered in research, F3):** Without `REPLICA IDENTITY FULL`, Postgres
WAL only includes the primary key in the `old` record for DELETE. The subscription filter
`project_id=eq.${projectId}` cannot be evaluated against an `old` record that only has
`id` → the event is silently dropped. Every DELETE subscription requires REPLICA
IDENTITY FULL on the table.

**New migration:** `YYYYMMDDHHMMSS_realtime_publication.sql`

```sql
-- ── Publication ─────────────────────────────────────────────────────────────
-- Register tables with the Supabase Realtime publication.
-- postgres_changes events will not fire for any table until it appears here.
-- Do NOT use the dashboard toggle — it has a known bug where disabling one
-- table disables all. Use this migration; it re-applies correctly on db reset.

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.tasks,
  public.notes,
  public.project_note_folders,
  public.project_links,
  public.milestones,
  public.idea_boards,
  public.billings,
  public.budgets,
  public.calendar_events,
  public.project_files;

-- ── REPLICA IDENTITY FULL ───────────────────────────────────────────────────
-- Required so DELETE events include project_id in payload.old.
-- Without this, the subscription filter `project_id=eq.${id}` cannot evaluate
-- on DELETE (only PK is in old-record by default) and the event is silently dropped.
-- FULL causes all column values to be written to WAL on every change.
-- Trade-off: slightly higher WAL volume. Acceptable for these table sizes.

ALTER TABLE public.tasks                REPLICA IDENTITY FULL;
ALTER TABLE public.notes                REPLICA IDENTITY FULL;
ALTER TABLE public.project_note_folders REPLICA IDENTITY FULL;
ALTER TABLE public.project_links        REPLICA IDENTITY FULL;
ALTER TABLE public.milestones           REPLICA IDENTITY FULL;
ALTER TABLE public.idea_boards          REPLICA IDENTITY FULL;
ALTER TABLE public.billings             REPLICA IDENTITY FULL;
ALTER TABLE public.budgets              REPLICA IDENTITY FULL;
ALTER TABLE public.calendar_events      REPLICA IDENTITY FULL;
ALTER TABLE public.project_files        REPLICA IDENTITY FULL;

-- ── Verification query (run after applying) ─────────────────────────────────
-- SELECT schemaname, tablename, rowsecurity, relreplident
-- FROM pg_publication_tables
-- JOIN pg_class ON pg_class.relname = pg_publication_tables.tablename
-- WHERE pubname = 'supabase_realtime';
-- Expected: all 10 tables listed, relreplident = 'f' (FULL)
```

**How to verify after applying:**
Run the verification query in the Supabase SQL editor. All 10 tables should appear
with `relreplident = 'f'`. If any table is missing, the events for that table will not fire.

### A2 — Client configuration

**File:** `lib/supabase/client.ts`

```ts
export const createClient = () => {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        worker: true, // heartbeat in Web Worker — survives browser tab throttling (F9)
      },
    }
  );
};
```

### A3 — Ideas module: `initialBoards` not in state

**File:** `app/context/[projectId]/ideas/ContextIdeasClient.tsx`

```ts
// Add before existing state declarations
const [boards, setBoards] = useState<Board[]>(initialBoards);

// Replace all initialBoards references with boards
// Line 82: initialBoards.map → boards.map
// Line 105: initialBoards.length → boards.length
```

---

## Part B — Shared hook: `use-project-channel`

**New file:** `lib/realtime/use-project-channel.ts`

This hook lives outside `app/**/*Client.tsx` to avoid the ESLint ban on
`createClient()` in client components (the rule targets data fetching; this is a
subscription, but the AST check does not distinguish).

```ts
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseProjectChannelOptions {
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
}: UseProjectChannelOptions) {
  // Refs keep callbacks stable — prevents subscription teardown on every render
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
        (payload) => {
          // F8: payload truncated — row exceeded 1 MiB limit
          if ((payload as { errors?: string[] }).errors?.length) {
            console.warn(
              `[realtime:${table}] payload too large, falling back to refresh`
            );
            onStatusRef.current?.('CHANNEL_ERROR'); // triggers router.refresh() in caller
            return;
          }
          onEventRef.current(payload);
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(`[realtime:${table}:${projectId}]`, err?.message);
        }
        onStatusRef.current?.(status);
      });

    // F7: JWT expiry after >1hr offline — channel is removed from internal list,
    // setAuth() with new token misses it. Recreate on TOKEN_REFRESHED if dead.
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          // If channel is no longer in 'joined' state, it was killed by expiry.
          // The next useEffect cleanup + remount cycle will recreate it.
          // This timeout gives the auto-reconnect 2 seconds to succeed first.
          if ((channel as unknown as { _state?: string })._state !== 'joined') {
            // Force a re-render by calling onStatus — caller's router.refresh() handles sync
            onStatusRef.current?.('CLOSED');
          }
        }, 2000);
      }
    });

    return () => {
      supabase.removeChannel(channel); // F5: always removeChannel, never unsubscribe()
      authSub.unsubscribe();
    };
  }, [projectId, table]);
}
```

---

## Part C — Visibility refetch

Add to every \*Client.tsx that receives a subscription. Handles F6 (missed events
during reconnect) as a belt-and-suspenders measure beyond the `onStatus` handler.

```ts
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') router.refresh();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () =>
    document.removeEventListener('visibilitychange', handleVisibility);
}, [router]);
```

---

## Part D — Module implementations

### Reconciliation strategy per module

| Module       | Table                  | INSERT                                      | UPDATE                                       | DELETE                    | Notes                                                          |
| ------------ | ---------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| Milestones   | `milestones`           | prepend + dedup                             | replace, preserve `tasks_total`/`tasks_done` | remove by id              | Progress fields not in payload                                 |
| Links        | `project_links`        | append + dedup                              | replace                                      | remove by id              | Check categories table schema before subscribing to categories |
| Budgets      | `budgets`              | append + copy `projects` from existing item | replace + keep `projects`                    | remove by id              | `projects` field is same for all items                         |
| Notes        | `notes`                | prepend + dedup                             | replace                                      | remove by id              | —                                                              |
| Note folders | `project_note_folders` | append                                      | replace                                      | remove by id              | Second channel on same tab                                     |
| Board        | `tasks`                | add to correct status bucket + dedup        | move between buckets if status changed       | remove from all buckets   | Most complex reconciliation                                    |
| Documents    | `project_files`        | prepend + dedup + kind guard                | replace + kind guard                         | remove by id + kind guard | Shared table with Media                                        |
| Media        | `project_files`        | prepend + dedup + kind guard                | replace + kind guard                         | remove by id + kind guard | Shared table with Documents                                    |
| Billings     | `billings`             | `router.refresh()`                          | `router.refresh()`                           | remove by id              | Has joined client + category not in payload                    |
| Calendar     | `calendar_events`      | `router.refresh()`                          | `router.refresh()`                           | `router.refresh()`        | Data from RPC; payload shape does not match CalendarFeedItem   |
| Ideas        | `idea_boards`          | append + dedup                              | replace                                      | remove by id              | Requires A3 first                                              |

**DELETE handler pattern (applies to all modules):**

Every DELETE handler must include a client-side project_id guard (F4 — server-side
filter is unreliable for DELETE events per confirmed Supabase bug):

```ts
if (payload.eventType === 'DELETE') {
  // F4: server-side filter may not apply to DELETE — guard client-side
  if (payload.old?.project_id !== projectId) return;
  setItems((prev) => prev.filter((i) => i.id !== payload.old?.id));
}
```

Note: With REPLICA IDENTITY FULL (A1), `payload.old` on DELETE contains all columns
including `project_id`. The guard is safe to apply.

---

### D1 — Milestones

**File:** `app/context/[projectId]/milestones/ContextMilestonesClient.tsx`

`MilestoneWithProgress` adds `tasks_total` + `tasks_done` computed from task
associations. These are not in the raw `milestones` row payload. On UPDATE, preserve
the existing item's progress values.

```ts
useProjectChannel({
  projectId,
  table: 'milestones',
  onEvent: (payload) => {
    if (payload.eventType === 'INSERT') {
      const item = {
        ...payload.new,
        tasks_total: 0,
        tasks_done: 0,
      } as MilestoneWithProgress;
      setMilestones((prev) =>
        prev.some((m) => m.id === item.id) ? prev : [...prev, item]
      );
    }
    if (payload.eventType === 'UPDATE') {
      setMilestones((prev) =>
        prev.map((m) =>
          m.id === payload.new.id
            ? {
                ...(payload.new as MilestoneWithProgress),
                tasks_total: m.tasks_total,
                tasks_done: m.tasks_done,
              }
            : m
        )
      );
    }
    if (payload.eventType === 'DELETE') {
      if (payload.old?.project_id !== projectId) return; // F4
      setMilestones((prev) => prev.filter((m) => m.id !== payload.old?.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D2 — Links

**File:** `app/context/[projectId]/links/ContextLinksClient.tsx`

**Before implementing categories channel:** verify `link_categories` table has a
`project_id` column by reading `app/actions/links.ts`. If the table is `owner_id`-scoped
(not project-scoped), the `project_id=eq.${projectId}` filter will return nothing.
In that case, skip the categories subscription and rely on `onStatus` refresh.

```ts
useProjectChannel({
  projectId,
  table: 'project_links',
  onEvent: (payload) => {
    if (payload.eventType === 'INSERT') {
      setLinks((prev) =>
        prev.some((l) => l.id === payload.new.id)
          ? prev
          : [...prev, payload.new as ProjectLinkRow]
      );
    }
    if (payload.eventType === 'UPDATE') {
      setLinks((prev) =>
        prev.map((l) =>
          l.id === payload.new.id ? (payload.new as ProjectLinkRow) : l
        )
      );
    }
    if (payload.eventType === 'DELETE') {
      if (payload.old?.project_id !== projectId) return; // F4
      setLinks((prev) => prev.filter((l) => l.id !== payload.old?.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D3 — Budgets

**File:** `app/context/[projectId]/budgets/ContextBudgetsClient.tsx`

`BudgetWithProject` adds `projects: { id, name } | null`. The project name is the
same for all budgets in this view — copy it from the first existing item on INSERT.

```ts
useProjectChannel({
  projectId,
  table: 'budgets',
  onEvent: (payload) => {
    if (payload.eventType === 'INSERT') {
      setBudgets((prev) => {
        if (prev.some((b) => b.id === payload.new.id)) return prev;
        const projectInfo = prev[0]?.projects ?? null;
        return [
          { ...payload.new, projects: projectInfo } as BudgetWithProject,
          ...prev,
        ];
      });
    }
    if (payload.eventType === 'UPDATE') {
      setBudgets((prev) =>
        prev.map((b) =>
          b.id === payload.new.id
            ? ({ ...payload.new, projects: b.projects } as BudgetWithProject)
            : b
        )
      );
    }
    if (payload.eventType === 'DELETE') {
      if (payload.old?.project_id !== projectId) return; // F4
      setBudgets((prev) => prev.filter((b) => b.id !== payload.old?.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D4 — Notes

**File:** `app/context/[projectId]/notes/ContextNotesClient.tsx`

Two subscriptions: one for notes, one for folders.

```ts
// Notes
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
      if (payload.old?.project_id !== projectId) return; // F4
      setNotes((prev) => prev.filter((n) => n.id !== payload.old?.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});

// Folders — no onStatus (notes channel already handles refresh)
useProjectChannel({
  projectId,
  table: 'project_note_folders',
  onEvent: (payload) => {
    if (payload.eventType === 'INSERT') {
      setFolders((prev) =>
        prev.some((f) => f.id === payload.new.id)
          ? prev
          : [...prev, payload.new as NoteFolder]
      );
    }
    if (payload.eventType === 'UPDATE') {
      setFolders((prev) =>
        prev.map((f) =>
          f.id === payload.new.id ? (payload.new as NoteFolder) : f
        )
      );
    }
    if (payload.eventType === 'DELETE') {
      if (payload.old?.project_id !== projectId) return; // F4
      setFolders((prev) => prev.filter((f) => f.id !== payload.old?.id));
    }
  },
});
```

---

### D5 — Board

**File:** `app/context/[projectId]/board/ContextBoardClient.tsx`

Most complex reconciliation — tasks are grouped by status. UPDATE may change a task's
status, requiring it to move between buckets.

```ts
useProjectChannel({
  projectId,
  table: 'tasks',
  onEvent: (payload) => {
    if (payload.eventType === 'INSERT') {
      const task = payload.new as Task;
      setTasksByStatus((prev) => {
        const bucket = prev[task.status as TaskStatus] ?? [];
        if (bucket.some((t) => t.id === task.id)) return prev;
        return { ...prev, [task.status]: [task, ...bucket] };
      });
    }
    if (payload.eventType === 'UPDATE') {
      const updated = payload.new as Task;
      const prevStatus = (payload.old as Partial<Task>)?.status as
        | TaskStatus
        | undefined;
      setTasksByStatus((prev) => {
        const next = { ...prev };
        // Remove from old bucket if status changed
        if (prevStatus && prevStatus !== updated.status) {
          next[prevStatus] = (next[prevStatus] ?? []).filter(
            (t) => t.id !== updated.id
          );
        }
        // Upsert into new status bucket
        const target = next[updated.status as TaskStatus] ?? [];
        next[updated.status as TaskStatus] = target.some(
          (t) => t.id === updated.id
        )
          ? target.map((t) => (t.id === updated.id ? updated : t))
          : [...target, updated];
        return next;
      });
    }
    if (payload.eventType === 'DELETE') {
      if (payload.old?.project_id !== projectId) return; // F4
      const deletedId = payload.old?.id as string;
      setTasksByStatus((prev) => {
        const next = { ...prev };
        for (const status of Object.keys(next) as TaskStatus[]) {
          next[status] = next[status].filter((t) => t.id !== deletedId);
        }
        return next;
      });
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D6 — Documents

**File:** `app/context/[projectId]/documents/ContextDocumentsClient.tsx`

Shared table with Media. Guard by `kind === 'document'` in every handler.

```ts
useProjectChannel({
  projectId,
  table: 'project_files',
  onEvent: (payload) => {
    const newKind = (payload.new as Partial<ProjectFile>)?.kind;
    const oldKind = (payload.old as Partial<ProjectFile>)?.kind;

    if (payload.eventType === 'INSERT') {
      if (newKind !== 'document') return;
      setDocuments((prev) =>
        prev.some((d) => d.id === payload.new.id)
          ? prev
          : [payload.new as ProjectFile, ...prev]
      );
    }
    if (payload.eventType === 'UPDATE') {
      if (newKind !== 'document') return;
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === payload.new.id ? (payload.new as ProjectFile) : d
        )
      );
    }
    if (payload.eventType === 'DELETE') {
      if (oldKind !== 'document') return;
      if (payload.old?.project_id !== projectId) return; // F4
      setDocuments((prev) => prev.filter((d) => d.id !== payload.old?.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D7 — Media

**File:** `app/context/[projectId]/media/ContextMediaClient.tsx`

Same pattern as Documents with `kind === 'media'`.

```ts
useProjectChannel({
  projectId,
  table: 'project_files',
  onEvent: (payload) => {
    const newKind = (payload.new as Partial<ProjectFile>)?.kind;
    const oldKind = (payload.old as Partial<ProjectFile>)?.kind;

    if (payload.eventType === 'INSERT') {
      if (newKind !== 'media') return;
      setMedia((prev) =>
        prev.some((m) => m.id === payload.new.id)
          ? prev
          : [payload.new as ProjectFile, ...prev]
      );
    }
    if (payload.eventType === 'UPDATE') {
      if (newKind !== 'media') return;
      setMedia((prev) =>
        prev.map((m) =>
          m.id === payload.new.id ? (payload.new as ProjectFile) : m
        )
      );
    }
    if (payload.eventType === 'DELETE') {
      if (oldKind !== 'media') return;
      if (payload.old?.project_id !== projectId) return; // F4
      setMedia((prev) => prev.filter((m) => m.id !== payload.old?.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D8 — Billings

**File:** `app/context/[projectId]/billings/ContextBillingsClient.tsx`

`BillingWithRelations` adds joined `client` and `billing_categories` — not available
in the raw payload. DELETE handled locally; INSERT/UPDATE trigger a refresh.

```ts
useProjectChannel({
  projectId,
  table: 'billings',
  onEvent: (payload) => {
    if (payload.eventType === 'DELETE') {
      if (payload.old?.project_id !== projectId) return; // F4
      setBillings((prev) => prev.filter((b) => b.id !== payload.old?.id));
      return;
    }
    // INSERT or UPDATE: need joined data — trigger full refresh
    router.refresh();
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D9 — Calendar

**File:** `app/context/[projectId]/calendar/ContextCalendarClient.tsx`

Data comes from `get_project_calendar_feed` RPC. Raw `calendar_events` rows do not
match `CalendarFeedItem` shape. All events trigger a refresh.

```ts
useProjectChannel({
  projectId,
  table: 'calendar_events',
  onEvent: () => {
    router.refresh();
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

### D10 — Ideas

**File:** `app/context/[projectId]/ideas/ContextIdeasClient.tsx`
**Requires A3 first.**

```ts
useProjectChannel({
  projectId,
  table: 'idea_boards',
  onEvent: (payload) => {
    if (payload.eventType === 'INSERT') {
      setBoards((prev) =>
        prev.some((b) => b.id === payload.new.id)
          ? prev
          : [...prev, payload.new as Board]
      );
    }
    if (payload.eventType === 'UPDATE') {
      setBoards((prev) =>
        prev.map((b) => (b.id === payload.new.id ? (payload.new as Board) : b))
      );
    }
    if (payload.eventType === 'DELETE') {
      if (payload.old?.project_id !== projectId) return; // F4
      setBoards((prev) => prev.filter((b) => b.id !== payload.old?.id));
    }
  },
  onStatus: (status) => {
    if (status !== 'SUBSCRIBED') router.refresh();
  },
});
```

---

## Part E — ContextLayoutWrapper slot (remove)

`app/context/[projectId]/ContextLayoutWrapper.tsx` lines 39–48: remove the commented
subscription slot. The layout is not the right place for subscriptions, and the
comment is misleading. If project name live-sync becomes a requirement later, that
is a separate feature.

---

## How to verify subscriptions are working (test before declaring done)

Silent failures are the main risk. After applying the migration and implementing each
module, verify with this sequence — do not trust "no errors" alone:

1. **Verify the publication:** Run in Supabase SQL editor:

   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```

   All 10 tables must appear. If any is missing, the migration did not apply.

2. **Verify REPLICA IDENTITY:**

   ```sql
   SELECT relname, relreplident FROM pg_class
   WHERE relname IN ('tasks','notes','project_links','milestones','idea_boards',
                     'billings','budgets','calendar_events','project_files',
                     'project_note_folders');
   ```

   All rows must show `relreplident = 'f'` (FULL). Default is `d` (DEFAULT = PK only).

3. **Smoke test each module:** Open the same project in two browser windows.
   In window A, create an item. Confirm window B shows it without refreshing.
   Then delete the item. Confirm window B removes it.

4. **Check browser console for these error patterns:**
   - `[realtime:<table>]` CHANNEL_ERROR — subscription failed
   - `payload too large` — rows exceed 1 MiB limit
   - `TooManyChannels` — cleanup not working

5. **Background tab test:** Open a tab, switch to another browser tab for 10 minutes,
   return, make a change in another window — confirm it appears. This verifies F9
   (`worker: true` is working).

---

## Implementation order

| Step | Part    | What                                                  | Risk               |
| ---- | ------- | ----------------------------------------------------- | ------------------ |
| 1    | A1      | Publication + REPLICA IDENTITY migration              | Low — additive SQL |
| 2    | —       | **Verify migration** (SQL queries above)              | —                  |
| 3    | A2      | `realtime: { worker: true }` in client.ts             | Very low           |
| 4    | A3      | Ideas `initialBoards` → useState                      | Very low           |
| 5    | B       | Create `lib/realtime/use-project-channel.ts`          | Low — new file     |
| 6    | —       | **Smoke test hook** with a single module (Milestones) | —                  |
| 7    | C + D1  | Milestones: visibility refetch + subscription         | Low                |
| 8    | C + D2  | Links (check categories schema first)                 | Low                |
| 9    | C + D3  | Budgets                                               | Low                |
| 10   | C + D4  | Notes (two channels)                                  | Low                |
| 11   | C + D5  | Board                                                 | Medium             |
| 12   | C + D6  | Documents                                             | Low                |
| 13   | C + D7  | Media                                                 | Low                |
| 14   | C + D8  | Billings                                              | Low                |
| 15   | C + D9  | Calendar                                              | Very low           |
| 16   | C + D10 | Ideas (after A3)                                      | Low                |
| 17   | E       | Remove ContextLayoutWrapper comment                   | Very low           |

**Key safety rule:** complete the verification step (step 2) before writing any
subscription code. If the publication or REPLICA IDENTITY is wrong, no amount of
correct application code will make it work, and the failure will be completely silent.

---

## Files changed

| File                                                             | Change                           |
| ---------------------------------------------------------------- | -------------------------------- |
| `supabase/migrations/YYYYMMDDHHMMSS_realtime_publication.sql`    | New                              |
| `lib/supabase/client.ts`                                         | Add `realtime: { worker: true }` |
| `lib/realtime/use-project-channel.ts`                            | New — shared hook                |
| `app/context/[projectId]/ideas/ContextIdeasClient.tsx`           | A3: useState fix                 |
| `app/context/[projectId]/milestones/ContextMilestonesClient.tsx` | D1 + C                           |
| `app/context/[projectId]/links/ContextLinksClient.tsx`           | D2 + C                           |
| `app/context/[projectId]/budgets/ContextBudgetsClient.tsx`       | D3 + C                           |
| `app/context/[projectId]/notes/ContextNotesClient.tsx`           | D4 + C                           |
| `app/context/[projectId]/board/ContextBoardClient.tsx`           | D5 + C                           |
| `app/context/[projectId]/documents/ContextDocumentsClient.tsx`   | D6 + C                           |
| `app/context/[projectId]/media/ContextMediaClient.tsx`           | D7 + C                           |
| `app/context/[projectId]/billings/ContextBillingsClient.tsx`     | D8 + C                           |
| `app/context/[projectId]/calendar/ContextCalendarClient.tsx`     | D9 + C                           |
| `app/context/[projectId]/ideas/ContextIdeasClient.tsx`           | D10 + C                          |
| `app/context/[projectId]/ContextLayoutWrapper.tsx`               | Remove comment                   |

**Files NOT touched:** any `page.tsx`, any server action, ContextTeamClient, ContextOwnerClient.

---

## Definition of done

- [ ] Verification queries confirm all 10 tables in publication with `relreplident = 'f'`
- [ ] `realtime: { worker: true }` in `lib/supabase/client.ts`
- [ ] `lib/realtime/use-project-channel.ts` exists and passes lint
- [ ] No `createClient()` call in any `*Client.tsx` file (`npm run lint` passes)
- [ ] Every INSERT handler has a dedup guard (`prev.some(i => i.id === payload.new.id)`)
- [ ] Every DELETE handler has `if (payload.old?.project_id !== projectId) return` guard
- [ ] All 10 subscribing tabs call `useProjectChannel` with correct table
- [ ] All 10 subscribing tabs have visibility refetch `useEffect`
- [ ] `onStatus` → `router.refresh()` on every status !== SUBSCRIBED
- [ ] Smoke test passes: change in window A appears in window B without reload
- [ ] Background tab test passes: reconnect after 10 min shows correct state
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` pass
