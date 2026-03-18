# RLS and Query Performance — Production Patterns

Research into confirmed, benchmarked performance improvements for Supabase RLS
and Postgres queries. All numbers from Supabase official documentation.

ClearQueue-specific audit results are at the end of each section.

---

## 1. The `(select auth.uid())` wrapper — 94% improvement

### What it is

By default, writing `auth.uid() = owner_id` in a policy causes Postgres to call
`auth.uid()` once per row being evaluated. On a table with 10,000 rows, that is
10,000 function calls to retrieve the same JWT claim.

Wrapping with `(select auth.uid())` turns it into a subquery that Postgres evaluates
once per statement and inlines the result:

```sql
-- Bare call — evaluated per row (slow)
USING (auth.uid() = owner_id)

-- Wrapped — evaluated once per statement (fast)
USING ((select auth.uid()) = owner_id)
```

### Benchmark

Supabase official docs: **94.97% improvement** — 179ms → 9ms on a policy applied to
a meaningful table size.

### ClearQueue audit

**334 bare `auth.uid()` calls in policies. Zero wrapped.**

The bare calls appear in migrations:

- `001_initial_schema` — projects, tasks, original tables
- `20260208*` — notes, clients, budgets, favorites, links
- `20260214000000` — profiles, branding (11 occurrences in one file)
- `20260224*` — documents, folders
- `20260228*` — calendar events
- `20260308*` — billing categories
- `20260310*` — early RBAC tables

The newer RBAC migrations (post-`20260310100009`) use `is_project_member()` and
`is_org_member()` helper functions — these already avoid the per-row call problem
because they are `SECURITY DEFINER` functions. They do not need this fix.

**The 334 bare calls are in the older user-owned tables** (profiles, personal notes,
early project tables). These are the ones that need the wrapper.

### Fix pattern

New migration: `YYYYMMDDHHMMSS_rls_auth_uid_optimization.sql`

```sql
-- Example: profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
```

Repeat for every table that has `auth.uid()` in its policies. The migration
`DROP POLICY IF EXISTS` + `CREATE POLICY` pattern is safe and instantaneous — no
table lock, no downtime.

**The fix for all 334 calls is one migration file** that drops and recreates each
affected policy. It does not change any application code.

---

## 2. Add explicit query filters even when RLS already filters — 94% improvement

### What it is

RLS policies execute as implicit WHERE clauses. Even with a correct policy, the
database planner does not always know the filter in advance — it may evaluate the
policy against many rows before returning the filtered result.

Adding `.eq('owner_id', userId)` (or `.eq('project_id', projectId)`) to the
application query gives the planner a concrete index hint before the RLS check runs.

```ts
// Without explicit filter — planner scans, policy filters afterward
supabase.from('notes').select(COLS);

// With explicit filter — planner uses index, policy is secondary check
supabase.from('notes').select(COLS).eq('owner_id', userId);
```

### Benchmark

Supabase official docs: **94.74% improvement** on queries without explicit filters
on indexed columns.

### ClearQueue audit

AGENTS.md mandates this pattern ("scope all queries by owner_id or project_id"). Most
server actions in `app/actions/` already do this correctly:

- `getNotes` → `.eq('owner_id', user.id)`
- `getTasksByProjectId` → `.eq('project_id', projectId)`
- `getBudgetsByProjectId` → `.eq('project_id', projectId)`

**This is already correct in ClearQueue**. No action needed beyond ensuring new code
follows the same convention. The mandate in AGENTS.md exists specifically because of
this performance impact.

---

## 3. Index every column used in RLS policies

### What it is

RLS policies execute SQL. If the column referenced (`owner_id`, `project_id`,
`user_id`) has no index, Postgres sequential-scans the table to evaluate the policy.

```sql
-- After migration: index supports the policy lookup
CREATE INDEX ON public.notes (owner_id);
CREATE INDEX ON public.tasks (project_id, status); -- compound for common query
```

### Benchmark

Supabase official docs: example unindexed `user_id` policy ran at **171ms**. After
adding the index: **under 0.1ms** — a 99.94% improvement.

### ClearQueue audit

CONVENTIONS.md mandates compound indexes for every table:

> "One index per common query pattern (e.g. (owner_id, project_id, archived_at),
> (project_id, created_at DESC)). Don't rely on the PK alone."

The early migrations (`001_initial_schema`, `20260208*`) predate this convention and
may be missing indexes on tables created before the rule was established. This should
be verified when the `auth.uid()` optimization migration is written — add any missing
indexes in the same migration.

**How to check in production:**

```sql
-- Find tables with RLS policies where the filtered column has no index
SELECT
  pol.tablename,
  pol.policyname,
  idx.indexname
FROM pg_policies pol
LEFT JOIN pg_indexes idx
  ON idx.tablename = pol.tablename
  AND idx.indexdef LIKE '%owner_id%'
WHERE pol.schemaname = 'public'
  AND pol.qual LIKE '%owner_id%'
  AND idx.indexname IS NULL;
```

---

## 4. `is_project_member()` helper — already optimal

### What it is

The `is_project_member(project_id)` and `is_org_member(org_id)` functions in
ClearQueue are `SECURITY DEFINER` functions that bypass RLS on the membership
tables. When used in policies they execute as a single subquery call, not a per-row
join.

```sql
-- This IS the optimal pattern for multi-tenant membership checks
USING (public.is_project_member(project_id))
```

This is the pattern Supabase itself recommends to avoid the "EXISTS with subquery
against the same table" anti-pattern (which causes recursive RLS and N×N joins).

### ClearQueue audit

187 uses of `is_project_member` / `is_org_member` in migrations. These are all
from the RBAC phase (`20260310*` onwards). **This is already correct.**

The performance impact of these is bounded because the function executes as a
single `SELECT` against `project_members`, backed by its primary key, once per
statement. No per-row evaluation.

---

## 5. Connection pooling for serverless — transaction mode

### What it is

Supabase provides two connection endpoints:

- **Direct** (`db.xxx.supabase.co:5432`) — one persistent connection per caller
- **Pooler** (`aws-0-region.pooler.supabase.com:6543`) — Supavisor transaction mode

Next.js server components and server actions run as serverless functions. Each
invocation opens a new connection. Without pooling, concurrent requests can exhaust
the Postgres `max_connections` limit.

### Production tip

The connection string used by `lib/supabase/server.ts` should route through the
Supavisor pooler. Supabase automatically uses the pooler when `createServerClient`
is called with the standard `NEXT_PUBLIC_SUPABASE_URL` — but this should be verified
in the Supabase dashboard under **Project Settings → Database → Connection string**.

When using transaction mode, **prepared statements must be disabled**:

```ts
// If configuring explicitly:
db: {
  url: process.env.DATABASE_POOLER_URL, // port 6543
  // Do not use prepared statements in transaction mode
}
```

For ClearQueue (small team, low concurrency now), the default Supabase client
configuration is likely sufficient. This becomes important at >20 concurrent users.

---

## Quick reference

| Fix                                               | Impact                         | Files                         | Already done?                |
| ------------------------------------------------- | ------------------------------ | ----------------------------- | ---------------------------- |
| Wrap `auth.uid()` with `(select auth.uid())`      | ~95% query improvement         | New migration                 | No — 334 bare calls          |
| Explicit `.eq()` filters in queries               | ~95% query improvement         | `app/actions/`                | Yes — mandated by AGENTS.md  |
| Index RLS policy columns                          | ~99% per-query improvement     | New migration (same as above) | Partially — newer tables yes |
| Use `is_project_member()` for multi-tenant checks | Prevents per-row joins         | Migrations                    | Yes — 187 uses               |
| Connection pooler for serverless                  | Prevents connection exhaustion | Supabase dashboard            | Verify — not a code change   |
