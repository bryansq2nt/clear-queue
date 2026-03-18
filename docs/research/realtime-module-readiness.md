# Realtime Module Readiness Audit

Audit of all 12 context-tab Client components for Phase 2 Supabase Realtime readiness.
Findings are based on direct file inspection, not assumptions.

---

## Summary

| #   | Finding                                                                           | Blocking?                    |
| --- | --------------------------------------------------------------------------------- | ---------------------------- |
| 1   | No `ALTER PUBLICATION supabase_realtime ADD TABLE` in any migration               | **YES — must fix first**     |
| 2   | `lib/supabase/client.ts` missing `realtime: { worker: true }`                     | Yes — add before Phase 2     |
| 3   | `ContextIdeasClient.tsx` renders `initialBoards` directly (not in state)          | Yes — needs refactor         |
| 4   | All other 11 modules have primary data in `useState`                              | Ready                        |
| 5   | All 12 modules have commented subscription slot ready to uncomment                | Ready                        |
| 6   | All core table SELECT policies use `is_project_member()` — WALRUS-compatible      | Ready                        |
| 7   | Calendar uses `get_project_calendar_feed` RPC (not a direct table query)          | Special handling needed      |
| 8   | Documents and Media share `project_files` table — differentiated by `kind` column | Filter-able per subscription |

---

## 1. Blocking prerequisite — publication

**No `ALTER PUBLICATION supabase_realtime ADD TABLE` statement exists in any migration.**

Supabase does not add tables to the `supabase_realtime` publication by default. Without this
statement for each table, `postgres_changes` events will never fire — the channel subscribes
but receives nothing, silently.

**Required migration must include:**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.tasks,
  public.notes,
  public.project_links,
  public.milestones,
  public.idea_boards,
  public.billings,
  public.billing_categories,
  public.budgets,
  public.calendar_events,
  public.project_files;
```

This is a single statement, one migration. No schema or RLS changes needed — just the
publication registration.

**Todo module**: `todo_lists` and `todo_items` do not need Realtime — todos are per-user,
single-session edits. Not included above.

**Team module**: `project_members` does not need Realtime on this list — team changes
are low-frequency and handled via the existing `router.refresh()` background sync.

---

## 2. Client configuration — Web Worker heartbeat

`lib/supabase/client.ts` currently:

```ts
export const createClient = () => {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};
```

No `realtime` option is set. Must add `worker: true` before enabling any subscriptions:

```ts
export const createClient = () => {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        worker: true, // heartbeat in Web Worker — survives background tab throttling
      },
    }
  );
};
```

This is a one-line change, one file, zero risk.

---

## 3. Module-by-module state readiness

### Ready (data in useState, subscription slot present)

| Module     | File                                     | Primary state                       | Table to subscribe                       |
| ---------- | ---------------------------------------- | ----------------------------------- | ---------------------------------------- |
| Board      | `board/ContextBoardClient.tsx`           | `tasksByStatus` (useState)          | `tasks`                                  |
| Notes      | `notes/ContextNotesClient.tsx`           | `notes`, `folders` (useState)       | `notes`                                  |
| Links      | `links/ContextLinksClient.tsx`           | `links` (useState)                  | `project_links`                          |
| Milestones | `milestones/ContextMilestonesClient.tsx` | `milestones` (useState)             | `milestones`                             |
| Billings   | `billings/ContextBillingsClient.tsx`     | `billings`, `categories` (useState) | `billings`                               |
| Budgets    | `budgets/ContextBudgetsClient.tsx`       | `budgets` (useState)                | `budgets`                                |
| Documents  | `documents/ContextDocumentsClient.tsx`   | `files` (useState)                  | `project_files` where `kind=eq.document` |
| Media      | `media/ContextMediaClient.tsx`           | `files` (useState)                  | `project_files` where `kind=eq.media`    |
| Owner      | `owner/ContextOwnerClient.tsx`           | `client`, `business` (useState)     | Not needed — low frequency               |
| Team       | `team/ContextTeamClient.tsx`             | `members`, `invites` (useState)     | Not needed — low frequency               |
| Copilot    | `copilot/ContextCopilotClient.tsx`       | Session bootstrap — no list state   | Not needed                               |

### Needs refactor before Realtime

**`ContextIdeasClient.tsx`** — `initialBoards` is rendered directly from props:

```tsx
// Line 82 — not in state, cannot be updated by Realtime events
{initialBoards.map((board) => (
  ...
))}

// Line 105 — also direct prop usage
{initialBoards.length === 0 && !newBoardOpen && (
```

Fix: Add `const [boards, setBoards] = useState<Board[]>(initialBoards)` and replace
both `initialBoards` references with `boards`. The subscription slot comment at line 41
(in the same file) is already there. Without this fix, INSERT/UPDATE/DELETE events on
`idea_boards` have nowhere to write their result.

### Special case — Calendar

`ContextCalendarClient.tsx` fetches via the `get_project_calendar_feed` RPC, not a
direct table query. The subscription slot already references `calendar_events`:

```ts
// Line 57–60 (commented subscription slot)
// const channel = supabase
//   .channel(`calendar:${projectId}`)
//   .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events',
```

The payload from a `calendar_events` INSERT/UPDATE/DELETE event is a raw DB row, not
the `CalendarFeedItem` shape that the RPC returns (which aggregates across tasks,
milestones, and calendar_events). Reconciling the payload directly is not feasible.

**Strategy for Calendar:** On any Realtime event, call `onRefresh()` to re-invoke
the RPC. This is the same as the pattern described in the connection lifecycle doc
for modules that cannot reconcile payload.new directly.

```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events',
  filter: `project_id=eq.${projectId}` }, () => {
  onRefresh(); // re-call the RPC — payload.new is not the right shape
})
```

This is still better than the current state (no subscription) — the calendar will
update within the Realtime event latency window after another user adds/changes an event.

---

## 4. Shared table — Documents and Media

Both modules use `project_files` and both filter by the `kind` column:

- Documents: `.eq('kind', 'document')` throughout `app/actions/documents.ts`
- Media: `.eq('kind', 'media')` throughout `app/actions/media.ts`

Supabase Realtime `postgres_changes` supports simple equality filters:

```ts
// Documents subscription — receives only document rows
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'project_files',
  filter: `project_id=eq.${projectId}`,
}, (payload) => {
  if (payload.new?.kind !== 'document' && payload.old?.kind !== 'document') return;
  // reconcile
})

// Media subscription — receives only media rows
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'project_files',
  filter: `project_id=eq.${projectId}`,
}, (payload) => {
  if (payload.new?.kind !== 'media' && payload.old?.kind !== 'media') return;
  // reconcile
})
```

Note: Supabase Realtime filter syntax is `column=eq.value` and only supports one
filter per binding. The `project_id` filter is the primary one. The `kind` guard
is applied in the handler (not the filter string) since the filter string supports
only one column equality. Both subscriptions will receive all `project_files` events
for the project but discard irrelevant ones in the handler — this is fine at low volume.

---

## 5. RLS compatibility

All core tables have SELECT policies using `is_project_member(project_id)`:

- `tasks` — `USING (is_project_member(project_id))` ✓
- `notes` — `USING (project_id IS NOT NULL AND public.is_project_member(project_id))` ✓
- `billings` — `USING (is_project_member(project_id))` ✓
- `budgets` — `USING (is_project_member(project_id))` ✓
- `milestones` — `USING (is_project_member(project_id))` ✓
- `project_links` — `USING (is_project_member(project_id))` ✓
- `project_files` — `USING (is_project_member(project_id))` ✓
- `calendar_events` — `USING (is_project_member(project_id))` ✓
- `idea_boards` — `USING (is_project_member(project_id))` ✓

WALRUS (Supabase's Realtime RLS engine) applies the SELECT policy per event per
subscriber. If `is_project_member(project_id)` returns true for the subscribed user,
the event is delivered. If false, it is silently dropped. No code changes needed
on the RLS side — the policies are already correct.

---

## 6. Subscription slot status

All 12 context-tab Client files have the commented subscription slot:

```ts
// ── Realtime subscription slot (empty until Realtime phase) ───────────────
// useEffect(() => {
//   const channel = supabase
//     .channel(`<module>:${projectId}`)
//     ...
//   return () => { supabase.removeChannel(channel); };
// }, [projectId]);
```

This was added during the cache removal phase. Uncomment + fill in the handler to
activate. The cleanup (`removeChannel`) is already in the slot.

---

## Pre-Phase-2 checklist

Before any subscription code is written:

- [ ] Add migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.<tables>` for all target tables
- [ ] Add `realtime: { worker: true }` to `lib/supabase/client.ts`
- [ ] Refactor `ContextIdeasClient.tsx`: `initialBoards` → `useState<Board[]>(initialBoards)`

Once those three are done, Phase 2 implementation proceeds module by module,
uncommenting the subscription slot and adding the reconciliation handler.

---

## Implementation order recommendation

Low complexity first (pure INSERT-append list), then UPDATE/DELETE reconciliation:

| Priority | Module     | Complexity         | Notes                                                  |
| -------- | ---------- | ------------------ | ------------------------------------------------------ |
| 1        | Notes      | Low                | Simple list, INSERT append, UPDATE/DELETE by id        |
| 2        | Links      | Low                | Simple list                                            |
| 3        | Milestones | Low                | Simple list                                            |
| 4        | Billings   | Medium             | Has categories (second subscription or onRefresh)      |
| 5        | Budgets    | Low                | Simple list                                            |
| 6        | Board      | Medium             | `tasksByStatus` is a map — reconciler groups by status |
| 7        | Documents  | Medium             | Shared table, `kind` guard in handler                  |
| 8        | Media      | Medium             | Shared table, `kind` guard in handler                  |
| 9        | Calendar   | Low code / special | onRefresh-only strategy (no payload reconciliation)    |
| 10       | Ideas      | After refactor     | Requires useState fix first                            |
