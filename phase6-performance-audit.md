# Phase 6: Performance Anti-Patterns Audit

## Executive Summary

This Phase 6 audit confirms systemic performance anti-patterns across read and mutation paths in the Next.js + Supabase codebase. The most expensive issues are (1) query amplification patterns (N+1-style loops and per-row write loops), (2) broad `SELECT *` usage in hot client views, and (3) duplicated fetches for the same entities (especially `projects`, `tasks`, `clients`, and `billings`) without a shared cache contract.

The current architecture will work at small scale, but latency and database load rise non-linearly with team size and dataset growth. On high-traffic pages (dashboard/project/todo/billings), multiple components repeatedly query the same tables with overlapping payloads. This creates avoidable p95 latency and cost pressure while also amplifying stale-window behavior already identified in Phases 1–3.

Recommended sequencing: (1) remove the highest-blast-radius query amplification patterns, (2) shrink payloads by replacing `SELECT *` with explicit projections/count RPCs, and (3) introduce a unified cache strategy for repeated project/profile/list datasets.

---

## 6.1 N+1 Query Detection

### 🐌 N+1 Pattern #1: Per-project item fetch loop in todo summary

**Location:** `app/todo/actions.ts:303-338`

**Code Pattern:**

```typescript
const projects = await getProjects()
...
for (const project of projects) {
  const listIds = projectListIds[project.id] || []
  if (listIds.length === 0) continue

  const items = await getTodoItemsByListIds(listIds)
  ...
}
```

**Impact:**

- Query count scales with project count: `1 (projects) + 1 (lists) + N (items-by-project)`.
- With 25 projects: ~27 queries for one summary load.
- If each round-trip is ~120ms, total serialized latency approaches multi-second UX stalls.

**Suggested Fix:**

- Fetch all items once by all list IDs, then aggregate in memory by `project_id`.
- Or move to a single SQL/RPC that returns project summary counts + previews.

**Priority:** **P0** (hot dashboard action, linear scaling issue).

---

### 🐌 N+1 Pattern #2: Reorder writes loop over old status column

**Location:** `app/actions/tasks.ts:173-181`

**Code Pattern:**

```typescript
for (const t of oldColumnTasks as any[]) {
  if (t.order_index > oldIndex) {
    await supabase
      .from('tasks')
      .update({ order_index: t.order_index - 1 })
      .eq('id', t.id);
  }
}
```

**Impact:**

- One DB update per affected row.
- 100 tasks shifted = 100 discrete update statements.
- Adds lock contention and high tail latency under concurrent drag-and-drop.

**Suggested Fix:**

- Replace per-row updates with a set-based `UPDATE ... WHERE ...` in one SQL function.
- Wrap reorder in one atomic RPC/transaction.

**Priority:** **P0** (hot interaction + concurrency-sensitive path).

---

### 🐌 N+1 Pattern #3: Reorder writes loop over new status column

**Location:** `app/actions/tasks.ts:185-193`

**Code Pattern:**

```typescript
for (const t of newColumnTasks as any[]) {
  if (t.order_index >= newOrderIndex) {
    await supabase
      .from('tasks')
      .update({ order_index: t.order_index + 1 })
      .eq('id', t.id);
  }
}
```

**Impact:**

- Same query amplification as Pattern #2.
- Worst case doubles when moving between columns (old + new column loops).

**Suggested Fix:**

- Single transaction with two set-based updates scoped by `project_id` + `status`.

**Priority:** **P0**.

---

### 🐌 N+1 Pattern #4: Sequential category duplication writes

**Location:** `app/budgets/actions.ts:309-351`

**Code Pattern:**

```typescript
for (const category of categoriesData) {
  const { data: newCategory } = await supabase.from('budget_categories').insert(...).select().single()
  ...
  await supabase.from('budget_items').insert(itemInserts)
}
```

**Impact:**

- `1 insert category + 1 insert items` per category.
- 30 categories ⇒ up to 60 separate writes during one duplicate operation.
- Highly sensitive to network jitter/timeouts midway.

**Suggested Fix:**

- Use one RPC to duplicate budget tree server-side in SQL.
- Return mapping/new IDs from a single transaction.

**Priority:** **P1** (heavier admin workflow, but high amplification).

---

### 🐌 N+1 Pattern #5: Batch reorder executed as many individual updates

**Location:** `app/budgets/[id]/actions.ts:220-228` and `app/budgets/[id]/actions.ts:435-440`

**Code Pattern:**

```typescript
const updates = categoryIds.map((id, index) =>
  supabase.from('budget_categories').update({ sort_order: index }).eq('id', id)
);
await Promise.all(updates);
```

(and similarly for `budget_items`).

**Impact:**

- Parallelized but still N separate SQL updates.
- Large reorder payloads increase statement overhead and lock conflicts.

**Suggested Fix:**

- Bulk update via one SQL statement (`UPDATE ... FROM unnest(...)`) in RPC.

**Priority:** **P1**.

---

## 6.2 Unoptimized Query Patterns (`SELECT *`)

> Requirement target met: **10+** optimization candidates.

### 📊 Query #1

**Location:** `components/AnalyticsDashboard.tsx:48-57`

```typescript
supabase.from('projects').select('*');
supabase.from('tasks').select('*');
```

**Used fields:** projects: `id,name,color,category`; tasks: `id,project_id,status,priority,due_date,updated_at,title`.
**Optimization:** select only referenced fields.

---

### 📊 Query #2

**Location:** `components/DashboardClient.tsx:30-33`

```typescript
supabase.from('projects').select('*');
supabase.from('tasks').select('*');
```

**Used fields:** filtered/render fields only; not full row payload.
**Optimization:** explicit projection + server aggregate for counts.

---

### 📊 Query #3

**Location:** `components/ProjectKanbanClient.tsx:113-117`

```typescript
supabase.from('projects').select('*').order(...)
supabase.from('projects').select('*').eq('id', projectId).single()
supabase.from('tasks').select('*').eq('project_id', projectId)
```

**Issue:** full-table `projects` rowset + full single project + full tasks payload in one load.
**Optimization:**

- list query: `id,name,color,category`
- single query: `id,name,color,category,client_id,business_id`
- tasks query: only fields rendered in board cards.

---

### 📊 Query #4

**Location:** `app/billings/BillingsPageClient.tsx:54-56`

```typescript
supabase.from('projects').select('*').order('created_at');
```

**Used fields:** project selector needs `id,name,color,category`.
**Optimization:** narrow projection to selector fields.

---

### 📊 Query #5

**Location:** `app/clients/actions.ts:14-17`

```typescript
supabase.from('clients').select('*').order('full_name');
```

**Used fields:** list/search pages mostly use identity/contact subset.
**Optimization:** split “list view” selector from “detail view” selector.

---

### 📊 Query #6

**Location:** `app/clients/actions.ts:38-41`

```typescript
supabase.from('clients').select('*').eq('id', id).single();
```

**Used fields:** depends on details page, but still can avoid heavy JSON/text columns unless opened.
**Optimization:** staged fetch (basic info first, details lazily).

---

### 📊 Query #7

**Location:** `app/clients/actions.ts:185-187`

```typescript
supabase.from('businesses').select('*').eq('owner_id', user.id);
```

**Used fields:** business list + client label mapping.
**Optimization:** list projection + fetch large/rare columns on detail route.

---

### 📊 Query #8

**Location:** `lib/todo/lists.ts:41-46`

```typescript
supabase.from('todo_lists').select('*').eq('owner_id', ownerId);
```

**Used fields:** panel/list view often needs subset (`id,title,project_id,is_archived,position`).
**Optimization:** use lightweight list projection and separate detail fetch.

---

### 📊 Query #9

**Location:** `lib/todo/lists.ts:267-273` and `291-297`

```typescript
supabase.from('todo_items').select('*').eq('list_id', listId);
supabase.from('todo_items').select('*').in('list_id', listIds);
```

**Used fields:** board summary generally uses completion/content/date subset.
**Optimization:** project-specific summary query should fetch minimal columns + counts.

---

### 📊 Query #10

**Location:** `components/todo/TodoListsPanel.tsx:45-48`

```typescript
supabase.from('projects').select('*').order('created_at');
```

**Used fields:** sidebar grouping needs only basic project identity fields.
**Optimization:** `select('id,name,color,category')`.

---

### 📊 Query #11

**Location:** `app/todo/TodoPageClient.tsx:19-22`

```typescript
supabase.from('projects').select('*').order('created_at');
```

**Optimization:** same as above; avoid full row hydration on every todo page mount.

---

### 📊 Query #12

**Location:** `app/settings/SettingsLayoutClient.tsx:27`

```typescript
supabase.from('projects').select('*').order('created_at');
```

**Optimization:** settings layout only needs sidebar-safe project subset.

---

### 📊 Query #13

**Location:** `app/notes/NotesPageClient.tsx:66-69`

```typescript
supabase.from('projects').select('*').order('created_at');
```

**Issue:** duplicated with additional `getProjects()` call right after.
**Optimization:** one source of truth for project list and typed lightweight projection.

---

### 📊 Query #14

**Location:** `app/ideas/IdeasPageClient.tsx:31-34`

```typescript
supabase.from('projects').select('*').order('created_at');
```

**Optimization:** shared cached project list query (same projection as other shells).

---

### 📊 Query #15

**Location:** `app/budgets/BudgetsPageClient.tsx:25-28`

```typescript
supabase.from('projects').select('*').order('created_at');
```

**Optimization:** use shell-level shared project cache + lightweight projection.

---

## 6.3 Cache Opportunities

> Requirement target met: **5+** cache opportunities.

### 💾 Cache Opportunity #1: Shared projects list across app shells

**Evidence locations:**

- `components/DashboardClient.tsx:30-33`
- `app/clients/ClientsPageClient.tsx:31-37`
- `app/billings/BillingsPageClient.tsx:54-57`
- `app/todo/TodoPageClient.tsx:18-23`
- `app/settings/SettingsLayoutClient.tsx:26-29`
- `app/notes/NotesPageClient.tsx:65-73`
- `app/ideas/IdeasPageClient.tsx:30-35`
- `app/budgets/BudgetsPageClient.tsx:24-33`

**Pattern:** Same `projects` query repeated per route/mount.

**Recommendation:**

- Centralize in React Query/SWR key `['projects','sidebar']` with 2–5 min staleTime.
- Invalidate only on project create/update/archive/delete actions.

**Expected gain:** major request elimination for navigation-heavy sessions.

---

### 💾 Cache Opportunity #2: Dashboard datasets (`projects` + `tasks`)

**Evidence:** `components/AnalyticsDashboard.tsx:44-58`, `components/DashboardClient.tsx:27-39`.

**Pattern:** Both dashboard variants fetch overlapping data from scratch.

**Recommendation:**

- Use shared query keys + derived selectors for charts/KPIs.
- Optionally precompute summary view server-side (RPC/materialized endpoint).

**Expected gain:** reduced duplicate table scans and faster dashboard TTI.

---

### 💾 Cache Opportunity #3: Project detail + kanban task loads

**Evidence:** `components/ProjectKanbanClient.tsx:113-117`.

**Pattern:** Same project/tasks can be refetched repeatedly (initial mount + post-action reload).

**Recommendation:**

- Split keys: `['project',id]`, `['projectTasks',id]`.
- Invalidate `projectTasks` on create/update/delete/reorder instead of full reload.

**Expected gain:** lower duplicate requests after task operations.

---

### 💾 Cache Opportunity #4: Billings supporting entities

**Evidence:** `app/billings/BillingsPageClient.tsx:54-75` and `app/billings/actions.ts:17-56`.

**Pattern:** Billings page repeatedly loads projects + clients + billings; supporting maps are rebuilt each load.

**Recommendation:**

- Cache `clients-lite` and `projects-lite` for form selectors.
- Cache billings list with background refresh and optimistic mutation updates.

**Expected gain:** reduced page-load fanout and smoother list edits/status toggles.

---

### 💾 Cache Opportunity #5: Todo panel/list/project data

**Evidence:** `components/todo/TodoListsPanel.tsx:44-52`, `app/todo/TodoPageClient.tsx:18-32`, `app/todo/actions.ts:303-338`, `lib/todo/lists.ts:34-67`.

**Pattern:** Repeated list/project reads with no memoized shared cache layer.

**Recommendation:**

- Cache todo lists by owner and project scope.
- Cache projects-lite once and reuse in panel/grouping views.

**Expected gain:** fewer repeated sidebar/list queries and lower per-navigation latency.

---

### 💾 Cache Opportunity #6: Notes page duplicated project retrieval

**Evidence:** `app/notes/NotesPageClient.tsx:65-73`.

**Pattern:** `supabase.from('projects').select('*')` plus `getProjects()` in same loader.

**Recommendation:**

- Remove one of the two reads; keep a single cached source.

**Expected gain:** immediate 50% reduction for that data slice on notes page load.

---

## Prioritized Remediation Plan

1. **P0:** Replace task reorder per-row loops (`updateTaskOrder`) with one transactional RPC.
2. **P0:** Remove per-project todo summary fetch loop (single bulk query + group).
3. **P1:** Trim `SELECT *` on dashboard/project shell hotspots to explicit projections.
4. **P1:** Introduce shared `projects-lite` cache used by all shell pages.
5. **P1:** Add query metrics instrumentation (request count per route, p95 query time).

---

## Execution Checklist

- [x] Found **5+** N+1 / query-amplification patterns.
- [x] Found **10+** `SELECT *` queries to optimize.
- [x] Identified **5+** cache opportunities.
- [x] Provided performance impact and concrete fix direction for each category.
