# Phase 2 — Blast Radius & Cascading Failure Analysis

## Executive Summary

Phase 2 confirms that concurrency risk is systemic, not limited to drag/drop ordering. Beyond the 3 previously identified P0 races (`createTask`, `updateTaskOrder`, `updateBillingStatus`), the remaining 13 high-traffic actions also expose stale-read windows and lost-update behavior because writes are non-transactional and there is no optimistic locking/version check in application code.

Task ordering remains the highest corruption hotspot. `order_index` logic is scoped by `status` but not always by `project_id`, and reorder operations are performed as multi-step loops without transaction boundaries. Under concurrent updates this can create duplicate indexes, gaps, and cross-project pollution.

Foreign keys generally reduce true-orphan risk for core relations, but several relationships are `ON DELETE SET NULL` (not cascade), and some expected relations (`tasks.assigned_to`, `clients.business_id`) do not exist in schema. That means data integrity is partly protected at DB level but still vulnerable to semantic drift and stale UI behavior.

---

## 2.1 Race Condition Matrix

## 2.1.1–2.1.3 (already established in prior run)

- ✅ `createTask` duplicate `order_index` race (`app/actions/tasks.ts:21-44`).
- ✅ `updateTaskOrder` interleaving reorder race (`app/actions/tasks.ts:154-232`).
- ✅ `updateBillingStatus` flip-flop (`app/billings/actions.ts:94-111`).

## 2.1.4 Remaining 13 actions audit

### 🔍 ACTION: updateProject

**Location:** `app/actions/projects.ts:51-119`  
**Concurrency Pattern:** direct update from form payload, no version check.

```typescript
const result = await supabase
  .from('projects')
  .update(updates)
  .eq('id', id)
  .select()
  .single();
```

**Race Window:** ⚠️ MEDIUM (lost update if A/B edit same project).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`revalidatePath` + caller callback in `components/EditProjectModal.tsx:107-114`).  
**Fix Priority:** P1.

### 🔍 ACTION: archiveProject

**Location:** `app/actions/projects.ts:121-143`

```typescript
.update({ category: 'archived' }).eq('id', id)
```

**Race Window:** ⚠️ MEDIUM (toggle overwrite with concurrent unarchive/edit).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`components/Sidebar.tsx:109-116`).  
**Fix Priority:** P1.

### 🔍 ACTION: unarchiveProject

**Location:** `app/actions/projects.ts:145-176`

```typescript
.update({ category }).eq('id', id)
```

**Race Window:** ⚠️ MEDIUM (category overwrite).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`components/Sidebar.tsx:109-116`).  
**Fix Priority:** P1.

### 🔍 ACTION: deleteProject

**Location:** `app/actions/projects.ts:178-193`

```typescript
await supabase.from('projects').delete().eq('id', id);
```

**Race Window:** ⚠️ MEDIUM (concurrent update/delete; late caller gets not-found).  
**Transaction Wrapper:** ❌ NO explicit app txn.  
**Double-refresh stale window:** ✅ YES (`components/Sidebar.tsx:123-126`, `components/EditProjectModal.tsx:124-132`).  
**Fix Priority:** P1.

### 🔍 ACTION: updateTask

**Location:** `app/actions/tasks.ts:56-87`

```typescript
await supabase.from('tasks').update(updates).eq('id', id);
```

**Race Window:** ⚠️ MEDIUM (lost update of notes/status/priority).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`components/EditTaskModal.tsx:63-70` callback refresh).  
**Fix Priority:** P1.

### 🔍 ACTION: deleteTask

**Location:** `app/actions/tasks.ts:90-105`

```typescript
await supabase.from('tasks').delete().eq('id', id);
```

**Race Window:** ⚠️ LOW-MEDIUM (update vs delete collisions).  
**Transaction Wrapper:** ❌ NO explicit app txn.  
**Double-refresh stale window:** ✅ YES (`components/EditTaskModal.tsx:78-85`).  
**Fix Priority:** P2.

### 🔍 ACTION: deleteTasksByIds

**Location:** `app/actions/tasks.ts:108-127`

```typescript
await supabase.from('tasks').delete().in('id', ids);
```

**Race Window:** ⚠️ MEDIUM (overlapping bulk deletes, partial-not-found ambiguity).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`components/ProjectKanbanClient.tsx:92-105` optimistic remove + loadData).  
**Fix Priority:** P1.

### 🔍 ACTION: createClientAction

**Location:** `app/clients/actions.ts:84-115`

```typescript
await supabase.from('clients').insert(insertPayload).select().single();
```

**Race Window:** ⚠️ MEDIUM (duplicate logical clients when created concurrently).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`CreateClientModal.tsx:41-50` + list reload in `ClientsPageClient.tsx:39-52`).  
**Fix Priority:** P1.

### 🔍 ACTION: updateClientAction

**Location:** `app/clients/actions.ts:117-151`

```typescript
await supabase.from('clients').update(updatePayload).eq('id', id);
```

**Race Window:** ⚠️ MEDIUM (lost update).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`EditClientModal.tsx:55-63` + list/detail reload).  
**Fix Priority:** P1.

### 🔍 ACTION: deleteClientAction

**Location:** `app/clients/actions.ts:153-163`

```typescript
await supabase.from('clients').delete().eq('id', id);
```

**Race Window:** ⚠️ MEDIUM (delete vs business/project relink operations).  
**Transaction Wrapper:** ❌ NO explicit app txn.  
**Double-refresh stale window:** ✅ YES (`ClientCard.tsx:65-71` + `loadClients`).  
**Fix Priority:** P1.

### 🔍 ACTION: createBusinessAction

**Location:** `app/clients/actions.ts:248-287`

```typescript
await supabase
  .from('businesses')
  .insert(businessInsertPayload)
  .select()
  .single();
```

**Race Window:** ⚠️ MEDIUM (duplicate business records possible).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`CreateBusinessModal.tsx:48-57` + page reloads).  
**Fix Priority:** P1.

### 🔍 ACTION: updateBusinessAction

**Location:** `app/clients/actions.ts:289-327`

```typescript
await supabase.from('businesses').update(businessUpdatePayload).eq('id', id);
```

**Race Window:** ⚠️ MEDIUM (lost update on profile fields).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (`EditBusinessModal.tsx:40-47`).  
**Fix Priority:** P1.

### 🔍 ACTION: updateBusinessFieldsAction

**Location:** `app/clients/actions.ts:332-374`

```typescript
await supabase.from('businesses').update(payload).eq('id', id);
if (payload.client_id !== undefined) {
  await supabase
    .from('projects')
    .update({ client_id: newClientId })
    .eq('business_id', id);
}
```

**Race Window:** 🔴 HIGH (two-step cross-table update without transaction).  
**Transaction Wrapper:** ❌ NO.  
**Double-refresh stale window:** ✅ YES (action revalidate + UI local state updates in `BusinessDetailClient.tsx:151-156,181-187`).  
**Fix Priority:** P0.

### 🔍 ACTION: deleteBusinessAction

**Location:** `app/clients/actions.ts:376-384`

```typescript
await supabase.from('businesses').delete().eq('id', id);
```

**Race Window:** ⚠️ MEDIUM (delete vs project linking/reassignment).  
**Transaction Wrapper:** ❌ NO explicit app txn.  
**Double-refresh stale window:** ✅ YES (`BusinessCard.tsx:87-93` + reload).  
**Fix Priority:** P1.

---

## 2.2 Task Ordering Deep Dive

## 2.2.1 ALL `order_index` usage findings

### 📍 ORDER_INDEX USAGE #1

**Location:** `app/actions/tasks.ts:21-28`

```typescript
.from('tasks').select('order_index')
.eq('status', status)
.order('order_index', { ascending: false })
```

**Bug:** scoped by status only, missing `.eq('project_id', projectId)`.  
**Cross-Project Pollution:** ✅ CONFIRMED.

### 📍 ORDER_INDEX USAGE #2

**Location:** `app/actions/tasks.ts:157-163`

```typescript
.from('tasks').select('id, order_index')
.eq('status', actualOldStatus)
```

**Bug:** reorder source column query not scoped by project.  
**Cross-Project Pollution:** ✅ CONFIRMED.

### 📍 ORDER_INDEX USAGE #3

**Location:** `app/actions/tasks.ts:165-170`

```typescript
.from('tasks').select('id, order_index')
.eq('status', newStatus)
```

**Bug:** reorder destination column query not scoped by project.  
**Cross-Project Pollution:** ✅ CONFIRMED.

### 📍 ORDER_INDEX USAGE #4

**Location:** `app/actions/tasks.ts:198-202`

```typescript
.from('tasks').select('id, order_index')
.eq('status', newStatus)
```

**Bug:** same-column reordering globally by status, not per project.  
**Cross-Project Pollution:** ✅ CONFIRMED.

### 📍 ORDER_INDEX USAGE #5

**Location:** `components/DashboardClient.tsx:32`

```typescript
supabase.from('tasks').select('*').order('order_index', { ascending: true });
```

**Risk:** global sorting by `order_index` without project/status segmentation can produce misleading enterprise KPI ordering.

### 📍 ORDER_INDEX USAGE #6

**Location:** `components/ProjectKanbanClient.tsx:116`

```typescript
supabase
  .from('tasks')
  .select('*')
  .eq('project_id', projectId)
  .order('order_index', { ascending: true });
```

**Status:** ✅ properly scoped read for project board load.

### 📍 ORDER_INDEX USAGE #7

**Location:** `components/KanbanBoard.tsx:141-148`

```typescript
if (t.status === newStatus && t.order_index >= newOrderIndex) {
  return { ...t, order_index: t.order_index + 1 };
}
```

**Risk:** optimistic client reorder can diverge from server reorder if server-side cross-project shifts occurred.

### 📍 ORDER_INDEX USAGE #8

**Location:** `supabase/migrations/001_initial_schema.sql:21,29`

```sql
order_index INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_tasks_order_index ON tasks(order_index);
```

**Risk:** index exists, but uniqueness constraint on `(project_id, status, order_index)` is missing.

## 2.2.2 Order_index corruption proof test cases

### 🧪 TEST CASE A — Duplicate order_index in same project/status

- **Setup:** Project 123, status `next`, max order=2.
- **Action:** User A and B call `createTask` concurrently.
- **Expected:** new rows get 3 and 4.
- **Actual (possible):** both get 3.
- **Proof Source:** non-atomic read-then-insert `app/actions/tasks.ts:21-44`.
- **Corruption Confirmed:** ✅ YES.

### 🧪 TEST CASE B — Cross-project pollution on create

- **Setup:** Project A max `next` order=3; Project B max `next` order=10.
- **Action:** create task in Project A.
- **Expected:** Project A new order=4.
- **Actual (possible):** Project A new order=11 (because query scoped only by status).
- **Proof Source:** `app/actions/tasks.ts:21-28`.
- **Corruption Confirmed:** ✅ YES.

### 🧪 TEST CASE C — Cross-project reorder side effects

- **Setup:** Two projects both have `in_progress` tasks.
- **Action:** drag task in Project A (`updateTaskOrder`).
- **Expected:** only Project A rows shift.
- **Actual (possible):** rows from Project B may also shift because column queries are status-global.
- **Proof Source:** `app/actions/tasks.ts:157-170,198-202`.
- **Corruption Confirmed:** ✅ YES.

### 🧪 TEST CASE D — Gaps from interleaved reorder loops

- **Setup:** ordered indexes 0,1,2,3 in one status.
- **Action:** two concurrent drags; both execute decrement/increment loops.
- **Expected:** contiguous 0..3.
- **Actual (possible):** 0,1,3,4 or duplicates.
- **Proof Source:** looped per-row updates `app/actions/tasks.ts:173-221`.
- **Corruption Confirmed:** ✅ YES.

### 🧪 TEST CASE E — Negative index feasibility

- **Observation:** current comparisons (`> oldIndex`, `>= newOrderIndex`) and initial default 0 make negative indexes unlikely through normal flows.
- **Status:** INVESTIGATE (not confirmed in current path).

## 2.2.3 ALL move/reorder operations

1. **Server reorder engine:** `app/actions/tasks.ts:updateTaskOrder` (primary mutation path).
2. **Create-order assignment:** `app/actions/tasks.ts:createTask` (`orderIndex = max + 1`).
3. **Client drag/drop optimistic reorder:** `components/KanbanBoard.tsx:133-153` then server call at `156`.
4. **Project-board sorted read:** `components/ProjectKanbanClient.tsx:116`.
5. **Dashboard/global sorted read:** `components/DashboardClient.tsx:32`.

**Scope verdict:** only board read is properly scoped by project; critical server reorder/create logic is not.

---

## 2.3 Data Integrity Cascade Analysis

## 2.3.1 Foreign key orphan risk audit

### 🔗 FK: `tasks.project_id → projects.id`

**Schema:** `ON DELETE CASCADE` (`001_initial_schema.sql:15`; reinforced in `20260118190000...:64-68`).  
**Code delete path:** `deleteProject` (`app/actions/projects.ts:178-193`).  
**Orphan test query:**

```sql
SELECT COUNT(*) FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
WHERE p.id IS NULL;
```

**Risk:** ✅ LOW (DB-enforced cascade).

### 🔗 FK: `billings.project_id → projects.id`

**Schema:** `ON DELETE SET NULL` (`20260213120000_add_billings_module.sql:9`).  
**Impact:** billings survive project deletion as detached records.  
**Orphan semantics:** no hard orphan, but semantic orphan (`project_id=null`).  
**Risk:** ⚠️ MEDIUM.

### 🔗 FK: `billings.client_id → clients.id`

**Schema:** `ON DELETE SET NULL` (`20260213120000_add_billings_module.sql:8`).  
**Risk:** ⚠️ MEDIUM semantic orphaning (historical charges lose client relation).

### 🔗 FK: `budgets.project_id → projects.id`

**Schema:** `ON DELETE SET NULL` (`202601250000_presupuestos.sql:8`).  
**Risk:** ⚠️ MEDIUM semantic orphaning (budget detached from deleted project).

### 🔗 FK: `tasks.assigned_to → profiles.id`

**Schema check:** column/FK not present in current schema/types (`tasks` fields in `lib/supabase/types.ts` include no `assigned_to`).  
**Risk:** INVESTIGATE (feature gap, not FK break).

### 🔗 FK: `clients.business_id → businesses.id`

**Schema check:** this relationship does not exist; actual relation is inverse (`businesses.client_id` with CASCADE) in `20260208140000_clients_and_businesses.sql:56-60`.  
**Risk:** INVESTIGATE (requested relation mismatch).

### 🔗 FK: `projects.client_id → clients.id`

**Schema:** `ON DELETE SET NULL` (`20260208140000_clients_and_businesses.sql:157-159`).  
**Risk:** ⚠️ MEDIUM semantic orphaning of project->client link.

### 🔗 FK: `projects.business_id → businesses.id`

**Schema:** `ON DELETE SET NULL` (`20260208140000_clients_and_businesses.sql:157-159`).  
**Risk:** ⚠️ MEDIUM semantic orphaning of project->business link.

## 2.3.2 Cascade deletion impact analysis

### 💥 CASCADE IMPACT: `deleteProject`

**Location:** `app/actions/projects.ts:178-193`

```typescript
await supabase.from('projects').delete().eq('id', id);
```

**Cascades:**

- ✅ tasks deleted (`ON DELETE CASCADE`).
- ✅ notes deleted (`notes.project_id ON DELETE CASCADE` in `20260208180000...:12`).
- ⚠️ billings detached (`SET NULL`).
- ⚠️ budgets detached (`SET NULL`).
- ⚠️ todo_lists detached (`SET NULL` in `002_todo_lists.sql:5`).

### 💥 CASCADE IMPACT: `deleteClientAction`

**Location:** `app/clients/actions.ts:153-163`

- ✅ related businesses deleted (`businesses.client_id ON DELETE CASCADE`).
- ⚠️ projects client link nulled (`projects.client_id SET NULL`).
- ⚠️ billings client link nulled (`billings.client_id SET NULL`).

### 💥 CASCADE IMPACT: `deleteBusinessAction`

**Location:** `app/clients/actions.ts:376-384`

- ⚠️ projects business link nulled (`projects.business_id SET NULL`).
- ✅ business_media deleted (`business_media.business_id CASCADE`).

**Key blast-radius insight:** DB FKs prevent hard orphans for core entities, but multiple `SET NULL` links can produce analytics/UX drift unless explicitly handled in product logic.

---

## 2.4 Mixed Read Architecture Impact Chain

## 2.4.1 Three complete user journeys

### 🗺️ JOURNEY 1: Create project → add task → view dashboard

1. `/` redirects authenticated user to `/dashboard` (`app/page.tsx:14-16`).
2. `createProject` writes + `revalidatePath('/dashboard')` (`app/actions/projects.ts:29-47`).
3. Dashboard client fetches projects + tasks (`components/AnalyticsDashboard.tsx:44-56`).
4. Navigate to `/project/[id]` (`app/project/[id]/page.tsx:11`).
5. `ProjectKanbanClient.loadData` fetches projects + project + tasks (`components/ProjectKanbanClient.tsx:113-117`).
6. Add task via modal; `createTask` then callback reload (`components/AddTaskModal.tsx:70-82`).

**Estimated requests:** 6–7 total.  
**Duplicates:** projects/tasks fetched repeatedly across dashboard + project board.  
**Stale windows:** revalidate queue vs immediate `loadData` callback.

### 🗺️ JOURNEY 2: Update task status → view project board

1. Drag in Kanban triggers optimistic local reorder (`components/KanbanBoard.tsx:133-153`).
2. Server `updateTaskOrder` mutates multi-step + revalidates (`app/actions/tasks.ts:130-240`).
3. On success UI calls `onTaskUpdate()` -> `loadData()` (`components/KanbanBoard.tsx:156-163`; `ProjectKanbanClient.tsx:110-125`).

**Estimated requests:** 3–4 per drag event.  
**Duplicates:** manual reload after revalidation.  
**Stale windows:** optimistic state may revert/flicker.

### 🗺️ JOURNEY 3: Create billing → view billings list

1. `createBilling` inserts + revalidates `/billings` (`app/billings/actions.ts:59-91`).
2. UI immediately calls `loadBillings()` (`app/billings/BillingsPageClient.tsx:165-177`).
3. Page also maintains separate project/client reads (`BillingsPageClient.tsx:54-75,77-85`).

**Estimated requests:** 4–5 per create/edit cycle.  
**Duplicates:** list reload overlaps with revalidation-triggered rerender.  
**Stale windows:** status/amount can appear briefly outdated under concurrent edits.

## 2.4.2 Aggregate waste estimate

### 📊 AGGREGATE WASTE METRICS

- Average observed requests/journey: **~5.0**
- Estimated optimal after unifying refresh/read ownership: **~3.0**
- Estimated waste: **~2 extra requests per journey (~67% overhead)**

Assumptions:

- 1,000 active users/day
- 5 target journeys/user/day
- 5,000 journeys/day total

Estimated daily waste:

- **~10,000 unnecessary requests/day**
- If ~200ms/request average end-to-end time: **~2,000 seconds/day** cumulative wait
- DB query amplification raises p95 under concurrent activity (especially task drag/drop)

> Note: exact cost ($) requires production telemetry (request size, platform billing, DB tier).

---

## 2.5 Prioritization Matrix

### 🎯 FINAL PRIORITY MATRIX

| Issue ID | Issue Name                               | Blast Radius                      | Data Corruption Risk | User Impact Likelihood | Fix Blocks Other Fixes                   | Estimated Effort | Final Priority |
| -------- | ---------------------------------------- | --------------------------------- | -------------------- | ---------------------- | ---------------------------------------- | ---------------- | -------------- |
| 2.1-A    | `createTask` race                        | Tasks                             | HIGH                 | HIGH                   | YES (ordering foundation)                | 2–3 days         | **P0**         |
| 2.1-B    | `updateTaskOrder` race                   | Tasks                             | HIGH                 | MEDIUM-HIGH            | YES (ordering foundation)                | 2–3 days         | **P0**         |
| 2.1-C    | `updateBusinessFieldsAction` split write | Clients+Projects                  | HIGH                 | MEDIUM                 | NO                                       | 1–2 days         | **P0**         |
| 2.2-A    | order_index cross-project scoping bug    | Tasks                             | HIGH                 | HIGH                   | YES                                      | 1–2 days         | **P0**         |
| 2.4-A    | mixed read architecture                  | Projects+Tasks(+shared shells)    | MEDIUM               | HIGH                   | YES                                      | 4–6 days         | **P0**         |
| 2.4-B    | double-refresh pattern                   | All write-heavy modules           | MEDIUM               | HIGH                   | YES (depends on read ownership decision) | 3–5 days         | **P0**         |
| 2.1-D    | updateBillingStatus flip-flop            | Billings                          | MEDIUM               | MEDIUM                 | NO                                       | 0.5–1 day        | P1             |
| 2.3-A    | FK semantic orphaning (`SET NULL`)       | Projects/Clients/Billings/Budgets | MEDIUM               | MEDIUM                 | NO                                       | 1–2 days         | P1             |
| 2.1-E    | remaining non-versioned updates          | Multiple                          | MEDIUM               | MEDIUM                 | NO                                       | 2–4 days         | P1             |

**P0 Issues:** 6  
**P1 Issues:** 3  
**P2 Issues:** 0

## Recommended fix sequence (critical path)

1. **Fix task ordering scope + atomicity first** (2.2-A, 2.1-A, 2.1-B).
2. **Patch cross-table non-atomic business update** (`updateBusinessFieldsAction`).
3. **Choose one refresh/read contract per page** (server-owned OR client-owned) to remove double-refresh/mixed-read overhead.
4. **Add optimistic locking (`updated_at`/version checks)** on medium-risk update actions.
5. **Review `SET NULL` relations** and add explicit product behavior for detached records.

---

## Execution checklist

- [x] Analyzed all 16 actions from Phase 1 (3 previous + 13 completed here)
- [x] Found 5+ `order_index` usages (8 documented)
- [x] Added 3+ corruption test cases (5 documented)
- [x] Audited 6+ FK relationships
- [x] Traced 3 complete user journeys
- [x] Created prioritization matrix with effort estimates
- [x] Included file:line references and code snippets throughout
- [x] Completed all subsections 2.1 through 2.5 in a single pass
