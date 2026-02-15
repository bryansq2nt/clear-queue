# Implementation Plan

Based on: AUDIT_SUMMARY.md  
Strategy: Phased incremental fixes with validation gates

---

## Phasing Strategy

**Phase 1:** Fix critical data integrity issues (foundation)  
**Phase 2:** Remove architectural anti-patterns (systematic cleanup)  
**Phase 3:** Add safeguards (optimistic locking, tests)  
**Phase 4:** Performance optimization  
**Phase 5:** Quality improvements

Each phase has a **validation gate** - must pass before proceeding to next phase.

---

## Phase 1: Data Integrity Foundation

**Objective:** Eliminate known corruption vectors in task ordering and cross-table business updates.  
**Duration:** 8-10 days  
**Risk Level:** High (SQL transaction/RPC work)

### Tasks

#### Task 1.1: Create Atomic Task Reorder RPC

**Why:** Fixes P0-1/P0-3 from AUDIT_SUMMARY.

**Files to create:**

- `supabase/migrations/20260215xxxxxx_atomic_task_reorder_rpc.sql`

**Files to modify:**

- `app/actions/tasks.ts`

**Implementation details:**

```sql
CREATE OR REPLACE FUNCTION public.reorder_task_atomic(
  p_task_id UUID,
  p_project_id UUID,
  p_old_status task_status,
  p_new_status task_status,
  p_old_order_index INTEGER,
  p_new_order_index INTEGER
) RETURNS void AS $$
BEGIN
  -- advisory lock on logical lane
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id::text || ':' || p_old_status::text));

  -- set-based peer shift updates scoped by project + status
  UPDATE tasks
  SET order_index = order_index - 1
  WHERE project_id = p_project_id
    AND status = p_old_status
    AND order_index > p_old_order_index;

  UPDATE tasks
  SET order_index = order_index + 1
  WHERE project_id = p_project_id
    AND status = p_new_status
    AND order_index >= p_new_order_index;

  UPDATE tasks
  SET status = p_new_status,
      order_index = p_new_order_index
  WHERE id = p_task_id
    AND project_id = p_project_id;
END;
$$ LANGUAGE plpgsql;
```

**Key requirements:**

- Advisory lock on `(project_id, status)` tuple.
- Set-based updates only (no per-row loops).
- Scope every ordering mutation by `project_id` + `status`.

**Validation:**

- [ ] Migration runs without errors.
- [ ] Unit/integration test: no cross-project pollution.
- [ ] Unit/integration test: concurrent reorders remain contiguous.
- [ ] Performance: reorder path p95 < 100ms locally for 200 tasks.

**Effort:** 6 hours  
**Risk:** High  
**Blocks:** Task 1.2, Task 2.1

---

#### Task 1.2: Replace `createTask` max-order race with atomic insert logic

**Why:** Fixes P0-2.

**Files to create:**

- `supabase/migrations/20260215xxxxxx_create_task_atomic_rpc.sql`

**Files to modify:**

- `app/actions/tasks.ts`

**Implementation details:**

```sql
CREATE OR REPLACE FUNCTION public.create_task_atomic(
  p_project_id UUID,
  p_title TEXT,
  p_status task_status,
  p_priority INTEGER,
  p_due_date DATE,
  p_notes TEXT
) RETURNS tasks AS $$
DECLARE
  v_next_index INTEGER;
  v_task tasks;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id::text || ':' || p_status::text));

  SELECT COALESCE(MAX(order_index), -1) + 1
    INTO v_next_index
  FROM tasks
  WHERE project_id = p_project_id
    AND status = p_status;

  INSERT INTO tasks (project_id, title, status, priority, due_date, notes, order_index)
  VALUES (p_project_id, p_title, p_status, p_priority, p_due_date, p_notes, v_next_index)
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$ LANGUAGE plpgsql;
```

**Key requirements:**

- Fully scoped by project/status.
- Single transaction boundary.
- Deterministic next index assignment.

**Validation:**

- [ ] Concurrent create test (50 parallel inserts) yields unique contiguous indexes.
- [ ] No regression in create-task UI behavior.

**Effort:** 5 hours  
**Risk:** Medium  
**Blocks:** Task 2.1

---

#### Task 1.3: Atomicize `updateBusinessFieldsAction`

**Why:** Fixes P0-4.

**Files to create:**

- `supabase/migrations/20260215xxxxxx_atomic_update_business_and_projects.sql`

**Files to modify:**

- `app/clients/actions.ts`

**Implementation details:**

```sql
CREATE OR REPLACE FUNCTION public.atomic_update_business_and_projects(
  p_business_id UUID,
  p_owner_id UUID,
  p_payload JSONB,
  p_new_client_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE businesses
  SET ...
  WHERE id = p_business_id
    AND owner_id = p_owner_id;

  IF p_new_client_id IS NOT NULL THEN
    UPDATE projects
    SET client_id = p_new_client_id
    WHERE business_id = p_business_id
      AND owner_id = p_owner_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

**Key requirements:**

- Strict owner scoping on both tables.
- Checked errors propagated to action caller.

**Validation:**

- [ ] Mutation test: failure in second update fully rolls back.
- [ ] Integration test: business/client/project linkage remains consistent.

**Effort:** 6 hours  
**Risk:** Medium-High  
**Blocks:** Task 3.2

---

#### Task 1.4: Add ordering indexes/constraints for integrity + speed

**Why:** Supports P0-1 and P1-6.

**Files to create:**

- `supabase/migrations/20260215xxxxxx_tasks_order_scope_constraints.sql`

**Implementation details:**

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_order
  ON tasks(project_id, status, order_index);

-- Optional after data backfill/check:
-- ALTER TABLE tasks ADD CONSTRAINT uq_tasks_project_status_order
--   UNIQUE (project_id, status, order_index) DEFERRABLE INITIALLY IMMEDIATE;
```

**Validation:**

- [ ] Constraint/index migration passes on realistic seed data.
- [ ] EXPLAIN plan shows index usage for reorder reads.

**Effort:** 4 hours  
**Risk:** Medium (may require dedupe pre-migration script)  
**Blocks:** Phase 4 indexing rollout

---

### Phase 1 Validation Gate

**Must pass before Phase 2:**

- [ ] All migrations run successfully on local DB.
- [ ] Zero cross-project `order_index` pollution in integration tests.
- [ ] `npm run build` succeeds.
- [ ] No new Sentry errors during manual smoke flows.

**If gate fails:** fix failures before proceeding.

---

## Phase 2: Read Ownership & Refresh Contract

**Objective:** Remove duplicate reload architecture and stale windows.  
**Duration:** 7-9 days  
**Risk Level:** Medium

### Tasks

#### Task 2.1: Define per-route read ownership (server-owned vs client-owned)

**Why:** Fixes P0-5.

**Files to modify:**

- `components/ProjectKanbanClient.tsx`
- `components/DashboardClient.tsx`
- `app/billings/BillingsPageClient.tsx`
- `docs/architecture/read-ownership.md` (new)

**Implementation details:**

- Establish contract matrix by route.
- If server-owned: rely on revalidate only; remove explicit `loadData()` callback reload.
- If client-owned: disable broad revalidate and use targeted cache invalidation.

**Validation:**

- [ ] Architecture document approved.
- [ ] No route has mixed ownership after refactor.

**Effort:** 8 hours  
**Risk:** Medium  
**Blocks:** Task 2.2, Task 4.1

---

#### Task 2.2: Remove double-refresh callbacks in mutation flows

**Why:** Fixes P0-6.

**Files to modify:**

- `components/KanbanBoard.tsx`
- `components/EditProjectModal.tsx`
- `components/EditTaskModal.tsx`
- `app/billings/BillingsPageClient.tsx`

**Implementation details:**

```ts
// Before: await action(); await onUpdated?.();
// After: await action(); // ownership-specific invalidation only
```

**Validation:**

- [ ] Request count per mutation path reduced by >=30% in dev telemetry.
- [ ] No stale/flicker regressions in manual UAT flows.

**Effort:** 10 hours  
**Risk:** Medium  
**Blocks:** Phase 4 cache work

---

#### Task 2.3: Eliminate todo summary N+1 loop

**Why:** Fixes P0-7.

**Files to modify:**

- `app/todo/actions.ts`

**Implementation details:**

```ts
// fetch all list ids once
// fetch all items in one query by list_ids
// group in memory by project_id
```

**Validation:**

- [ ] Query count stable O(1) w.r.t. project count.
- [ ] Summary output parity test vs previous implementation.

**Effort:** 6 hours  
**Risk:** Low-Medium  
**Blocks:** Phase 4 metrics

---

### Phase 2 Validation Gate

- [ ] End-to-end checks show no duplicate refresh loops.
- [ ] `npm run build` + core smoke flows pass.
- [ ] Query-per-action baseline improved by >=25% on target journeys.

---

## Phase 3: Concurrency Safeguards & Security Evidence

**Objective:** Prevent lost updates and codify security behavior.  
**Duration:** 8-11 days  
**Risk Level:** Medium

### Tasks

#### Task 3.1: Add optimistic locking helper + conflict contract

**Why:** Fixes P1-1/P1-2.

**Files to create:**

- `lib/db/optimistic-lock.ts`
- `lib/errors/conflict-error.ts`

**Files to modify:**

- `app/actions/projects.ts`
- `app/actions/tasks.ts`
- `app/clients/actions.ts`
- `app/billings/actions.ts`

**Implementation details:**

```ts
.update(payload)
.eq('id', id)
.eq('updated_at', expectedUpdatedAt)
.select()
```

If 0 rows updated, return typed conflict error for UX handling.

**Validation:**

- [ ] Unit test: stale write returns conflict.
- [ ] Integration test: concurrent updates do not silently overwrite.

**Effort:** 12 hours  
**Risk:** Medium  
**Blocks:** Task 5.2

---

#### Task 3.2: Add budget atomic RPCs for duplicate/reorder operations

**Why:** Fixes P1-4.

**Files to create:**

- `supabase/migrations/20260215xxxxxx_atomic_duplicate_budget.sql`
- `supabase/migrations/20260215xxxxxx_atomic_reorder_budget_items.sql`

**Files to modify:**

- `app/budgets/actions.ts`
- `app/budgets/[id]/actions.ts`

**Validation:**

- [ ] Duplicate budget tree remains complete under fault injection tests.
- [ ] Reorder operations are contiguous and deterministic.

**Effort:** 14 hours  
**Risk:** Medium-High

---

#### Task 3.3: Add RLS regression tests + policy intent docs

**Why:** Fixes P2-3.

**Files to create:**

- `tests/rls/projects.rls.spec.ts`
- `tests/rls/tasks.rls.spec.ts`
- `docs/security/rls-policy-intent.md`

**Validation:**

- [ ] CI test suite includes 5 table groups from audit.
- [ ] Partial CRUD policy rationale documented for `profiles`, `user_preferences`, `user_assets`, `project_favorites`.

**Effort:** 10 hours  
**Risk:** Low

---

### Phase 3 Validation Gate

- [ ] Conflict-handling tests green.
- [ ] Budget atomic operation tests green.
- [ ] RLS regression suite green in CI.
- [ ] No increase in error-rate alerts after staging soak.

---

## Phase 4: Performance Optimization

**Objective:** Reduce payload size, improve p95 query time, and reuse shared datasets.  
**Duration:** 6-8 days  
**Risk Level:** Low-Medium

### Tasks

#### Task 4.1: Replace `SELECT *` with explicit projections in hotspots

**Why:** Fixes P1-5.

**Files to modify:**

- `components/AnalyticsDashboard.tsx`
- `components/DashboardClient.tsx`
- `components/ProjectKanbanClient.tsx`
- `app/billings/BillingsPageClient.tsx`

**Validation:**

- [ ] Payload snapshots show reduced column count.
- [ ] No missing field runtime errors in smoke tests.

**Effort:** 12 hours  
**Risk:** Low

---

#### Task 4.2: Add compound indexes from query audit

**Why:** Fixes P1-6.

**Files to create:**

- `supabase/migrations/20260215xxxxxx_compound_indexes_phase4.sql`

**Validation:**

- [ ] EXPLAIN ANALYZE confirms index usage.
- [ ] p95 query time reduction on target list endpoints.

**Effort:** 8 hours  
**Risk:** Low-Medium

---

#### Task 4.3: Introduce shared `projects-lite`/`clients-lite` cache keys

**Why:** Fixes P1-7.

**Files to create:**

- `lib/cache/projects-lite.ts`
- `lib/cache/clients-lite.ts`

**Files to modify:**

- Shell clients in dashboard/todo/settings/notes/ideas/billings.

**Validation:**

- [ ] Navigation test shows reduced repeated queries.
- [ ] Cache invalidation on project/client mutations verified.

**Effort:** 12 hours  
**Risk:** Medium

---

### Phase 4 Validation Gate

- [ ] p95 query time improves vs baseline by >=30% on audited hot paths.
- [ ] Query count per navigation reduced measurably.
- [ ] No stale cache defects in manual regression.

---

## Phase 5: Structural Quality & Maintainability

**Objective:** Reduce coupling and improve long-term change safety.  
**Duration:** 10-14 days  
**Risk Level:** Medium

### Tasks

#### Task 5.1: Split `app/clients/actions.ts` by responsibility

**Why:** Fixes P1-8.

**Files to create:**

- `app/clients/actions/clients.ts`
- `app/clients/actions/businesses.ts`
- `app/clients/actions/project-links.ts`
- `app/clients/actions/index.ts`

**Validation:**

- [ ] Existing routes pass smoke + unit tests.
- [ ] Import graph shows reduced fan-in to one god file.

**Effort:** 16 hours  
**Risk:** Medium

---

#### Task 5.2: Extract sidebar and detail-page command hooks

**Why:** Fixes P2-2.

**Files to create:**

- `components/sidebar/useProjectCommands.ts`
- `app/businesses/[id]/hooks/useBusinessProfile.ts`
- `app/clients/[id]/hooks/useClientRelationships.ts`

**Validation:**

- [ ] Components become primarily presentational.
- [ ] Hook-level tests cover command logic.

**Effort:** 18 hours  
**Risk:** Medium

---

#### Task 5.3: Remove unsafe casts and add schema drift guardrail

**Why:** Fixes P2-4.

**Files to modify/create:**

- Key actions files removing `as any`/`as never`
- `scripts/check-schema-drift.sh`
- CI workflow update for drift check

**Validation:**

- [ ] Type-check catches previously hidden type mismatches.
- [ ] Drift script runs in CI without false positives.

**Effort:** 12 hours  
**Risk:** Low-Medium

---

### Phase 5 Validation Gate

- [ ] Coupling metrics improve (reduced hub fan-in for targeted files).
- [ ] Typecheck + tests pass with stricter typing.
- [ ] No behavioral regressions in full end-to-end smoke.

---

## Risk Mitigation

### High-Risk Changes

1. **Task ordering RPC refactor** - highest integrity risk; requires heavy concurrency testing.
2. **Read ownership contract migration** - broad UI impact; do route-by-route rollout.
3. **Budget atomic RPCs** - nested data complexity and potential lock contention.

### Rollback Strategy

- Every migration gets explicit rollback migration file.
- Route-level feature flags for read-ownership and cache rollout.
- Staged promotion: local -> staging (1 week soak) -> production gradual rollout.

### Monitoring Plan

- [ ] Sentry alerts tuned before deployment.
- [ ] Dashboard for query count per route + p95 query latency.
- [ ] Conflict error rates monitored for optimistic lock adoption.

---

## Success Metrics

| Metric                           | Baseline     | Target              | Measure Via                   |
| -------------------------------- | ------------ | ------------------- | ----------------------------- |
| Queries per core journey         | ~5           | <=3                 | Sentry + app telemetry        |
| Task reorder mutation statements | O(n)         | O(1)                | SQL logs / instrumentation    |
| P95 query time (hot paths)       | ~450ms       | <200ms              | Sentry performance            |
| Dashboard load time              | ~2.5s        | <1.5s               | Playwright test               |
| Cross-project ordering bugs      | Reproducible | 0                   | Integration concurrency tests |
| Lost-update incidents            | Present      | 0 silent overwrites | Conflict telemetry + tests    |

---

## Effort Summary

| Phase     | Tasks  | Estimated Hours   | Risk       |
| --------- | ------ | ----------------- | ---------- |
| Phase 1   | 4      | 21-27             | High       |
| Phase 2   | 3      | 24-30             | Medium     |
| Phase 3   | 3      | 32-40             | Medium     |
| Phase 4   | 3      | 28-34             | Low-Medium |
| Phase 5   | 3      | 40-48             | Medium     |
| **Total** | **16** | **145-179 hours** | -          |

Estimated calendar time: **6-8 weeks** (assuming ~6 productive engineering hours/day).

---

## Approval Checkpoints

Before proceeding with implementation, confirm:

1. [ ] Priorities in AUDIT_SUMMARY are correct
2. [ ] Phasing strategy makes sense
3. [ ] Effort estimates are reasonable
4. [ ] Risk mitigation is adequate
5. [ ] Success metrics are measurable

**Human approval required before execution begins.**
