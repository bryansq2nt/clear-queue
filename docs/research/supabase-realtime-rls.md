# Supabase Realtime + Row Level Security

Research before implementing Realtime subscriptions. Critical for ClearQueue's RBAC
model where users are project members with different roles and access levels.

---

## The one-sentence summary

Realtime checks your **SELECT RLS policy per-event, per-subscriber** — if the policy
passes, the event is delivered; if it fails, it is silently dropped. Tables must also be
explicitly added to the `supabase_realtime` publication or zero events fire regardless.

---

## How it works internally (WALRUS)

Supabase uses a system called WALRUS to apply RLS to the WAL stream. For every change
event on a subscribed table, it runs this loop:

```
For each subscriber on this table:
  1. Set request.jwt.claims to the subscriber's session JWT
  2. Set PostgreSQL role to 'authenticated'
  3. Run: SELECT EXISTS (SELECT 1 FROM table WHERE id = $pk)
  4. If SELECT policy passes → deliver event to subscriber
  5. If SELECT policy fails → silently drop event for this subscriber
```

This means:

- A user only receives events for rows their SELECT policy allows them to read
- `auth.uid()` resolves correctly during these checks (WALRUS sets the JWT context)
- **Cost: 100 subscribers + 1 INSERT = 100 separate SELECT existence checks**, serialized
  on a single thread. This is a well-known bottleneck — optimize your SELECT policies.

---

## The `supabase_realtime` publication — required setup

**No table is included by default.** You must explicitly add each table you want to
subscribe to. If a table is not in the publication, zero events fire — silently.

```sql
-- Add individual tables (run in migrations)
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.billings;
-- etc. for every table you plan to subscribe to

-- Verify what is currently in the publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

This is the **#1 cause** of "I subscribed but get no events" — table not in publication.

---

## auth.uid() during Realtime checks

WALRUS sets `request.jwt.claims` from the subscriber's session JWT before running each
RLS check. `auth.uid()` therefore resolves to the logged-in user's UUID — exactly the
same as during a normal PostgREST API request.

The client must be authenticated when subscribing. If the session expires or the user
is not signed in, `auth.uid()` returns NULL and all SELECT policies that depend on it
will fail → zero events delivered.

```ts
// Always verify auth before subscribing
const {
  data: { session },
} = await supabase.auth.getSession();
if (!session) return; // do not subscribe unauthenticated
```

---

## SELECT policy patterns for project-scoped tables

### Using the is_project_member() helper (matches this codebase's pattern)

```sql
-- ✅ CORRECT for ClearQueue — uses the existing SECURITY DEFINER helper
CREATE POLICY "realtime: project members select tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING ((SELECT public.is_project_member(project_id)));
```

The `(SELECT ...)` wrapper is critical — it tells the Postgres optimizer to evaluate
`is_project_member()` once per WALRUS check as an `initPlan` rather than once per row.

### Why SECURITY DEFINER helpers work correctly here

During a WALRUS check, the JWT claims context is set to the subscriber. When the SELECT
policy calls `is_project_member()`:

1. The function runs with SECURITY DEFINER privileges (bypasses RLS on `project_members`)
2. But `auth.uid()` inside the function still resolves to the **subscriber's UUID**
   because WALRUS set `request.jwt.claims` before invoking the check

This is exactly right. No changes needed to the existing `is_project_member()` helper.

### Performance optimization — mark helpers as STABLE

```sql
-- STABLE allows the planner to cache results within a query execution
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE              -- ← this matters for Realtime performance
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;
```

### Indexes are critical — Realtime amplifies missing indexes

Every WALRUS check runs a SELECT through your RLS policy. With N concurrent subscribers,
a missing index is hit N times per event.

```sql
-- These indexes are required before enabling Realtime
CREATE INDEX IF NOT EXISTS idx_project_members_user_project
  ON project_members (user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id
  ON tasks (project_id);
-- Repeat for every subscribed table's project_id column
```

---

## Table with RLS enabled but no SELECT policy

If RLS is enabled and there is no SELECT policy for `authenticated`, **zero events are
delivered to any subscriber** — silently, with no error. The channel shows `SUBSCRIBED`
but nothing arrives.

Debug checklist when events are not arriving:

```sql
-- 1. Is the table in the publication?
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 2. Is RLS enabled?
SELECT relrowsecurity FROM pg_class WHERE relname = 'your_table';

-- 3. Is there a SELECT policy for authenticated?
SELECT * FROM pg_policies WHERE tablename = 'your_table' AND cmd = 'SELECT';

-- 4. Quick test: temporarily allow all to isolate the policy
-- ALTER POLICY "..." ON public.your_table USING (true);
-- If events now arrive, the USING clause is the problem
```

---

## DELETE events — the most important gotcha

DELETE events **cannot be filtered** and **bypass RLS filtering**. This is a fundamental
PostgreSQL constraint — by the time WALRUS sees the DELETE event, the row no longer
exists, so RLS cannot be checked against it.

| Configuration                    | What payload.old contains                      | Who receives it              |
| -------------------------------- | ---------------------------------------------- | ---------------------------- |
| Default REPLICA IDENTITY, RLS on | Primary key only                               | All subscribers of the table |
| REPLICA IDENTITY FULL, RLS on    | Primary key only (Supabase strips non-PK cols) | All subscribers of the table |
| REPLICA IDENTITY FULL, RLS off   | Full deleted row                               | All subscribers of the table |

**Key implication for this app:** A user subscribed to the `tasks` table will receive
DELETE events for ALL deleted tasks rows — including tasks from projects they are not a
member of. The `filter: 'project_id=eq.xxx'` parameter is **ignored for DELETE events**.

### Safe handling of DELETE events in client code

Since `payload.old` only contains the PK anyway, a subscriber receiving a foreign
project's DELETE only learns a UUID was deleted — no sensitive data leaks (UUIDs alone
are not sensitive). The client-side handler should be defensive:

```ts
.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
  // Only apply if the deleted ID is in our current local state.
  // If it's from another project, it won't be in our state → no-op.
  setTasks(prev => prev.filter(t => t.id !== payload.old.id))
})
```

### Recommended: soft deletes for critical data

Soft deletes turn a DELETE into an UPDATE event, which IS RLS-filtered:

```sql
-- Instead of: DELETE FROM tasks WHERE id = $id
UPDATE tasks SET deleted_at = NOW() WHERE id = $id AND project_id = $project_id;
-- ↑ Fires as UPDATE event → RLS-filtered → only authorized subscribers see it
```

For tables where you want guaranteed project-scoped delete propagation, prefer
`deleted_at TIMESTAMPTZ NULL` over hard deletes.

---

## postgres_changes vs private channels — two separate systems

These do not interact. Setting `private: true` on a channel does NOT affect
`postgres_changes` authorization.

| System             | Controls                                  | Policy target                 | When checked               |
| ------------------ | ----------------------------------------- | ----------------------------- | -------------------------- |
| `postgres_changes` | Which WAL events reach which client       | RLS SELECT on your data table | Per-event, per-subscriber  |
| Private channels   | Access to Broadcast and Presence features | RLS on `realtime.messages`    | At connection time, cached |

For ClearQueue's use case (syncing data changes across project members), only the
`postgres_changes` + table SELECT policy system is relevant.

---

## Recursive RLS — the failure mode already fixed in this codebase

The `project_members` table SELECT policy must not query `project_members` itself.
This codebase already fixes this with the `is_project_member()` SECURITY DEFINER helper.
The same fix applies to Realtime — no new work needed here. When Realtime phases in,
use the same `is_project_member()` helper in SELECT policies on all project-scoped tables.

---

## Migration template — enabling a table for Realtime

When adding Realtime support for any module, this is the migration checklist:

```sql
-- 1. Add to publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- 2. Ensure SELECT policy exists and uses the SECURITY DEFINER helper
-- (policy may already exist from RBAC work — verify USING clause)
CREATE POLICY "realtime: project members select tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING ((SELECT public.is_project_member(project_id)));

-- 3. Ensure required indexes exist
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);

-- 4. Decide on hard vs soft delete
-- If hard delete: client must handle receiving all-subscriber DELETE events
-- If soft delete: add deleted_at column + index
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks (project_id, deleted_at);
```

---

## Quick reference

```
supabase_realtime publication → must ADD TABLE explicitly, nothing included by default
SELECT policy → what WALRUS checks per-event per-subscriber
auth.uid() → works correctly in Realtime policy checks (WALRUS sets JWT context)
SECURITY DEFINER helpers (is_project_member) → work correctly, no changes needed
DELETE events → cannot be filtered, payload.old = PK only when RLS enabled
private: true → affects Broadcast/Presence only, not postgres_changes
No SELECT policy → zero events, silent failure, SUBSCRIBED status still shows
Missing index → catastrophic under load (N checks per event, single thread)
Soft deletes → turn DELETE into UPDATE, which IS RLS-filtered
```
