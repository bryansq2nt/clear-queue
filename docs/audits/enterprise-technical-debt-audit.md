# Enterprise-Grade Technical Debt Audit

## Status

✅ **Completed Phase 1: Data Flow Consistency Analysis**  
⏸️ Per instruction, this report stops after Phase 1 before proceeding to Phase 2+.

---

## Phase 1.1 — Map ALL Read Paths

### Read-path matrix (Projects, Tasks, Clients, Businesses, Billings)

| Domain     | Client-Side Reads                                                                                                                                                                                                                      | Server Action Reads                                                                                                                   | Mixed Pattern?     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| projects   | `components/AnalyticsDashboard.tsx:45-51`, `components/ProjectKanbanClient.tsx:41,114-115`, `app/clients/ClientsPageClient.tsx:29-36`, `app/businesses/BusinessesPageClient.tsx:27-33`, `app/billings/BillingsPageClient.tsx:52,54-56` | `app/actions/projects.ts:196-207`, `app/clients/actions.ts:48-80`, `app/businesses/actions.ts:23-28`, `app/billings/actions.ts:30-33` | **YES — CRITICAL** |
| tasks      | `components/AnalyticsDashboard.tsx:45,55`, `components/ProjectKanbanClient.tsx:116`, `components/dashboard/DashboardFocusTasksSection.tsx:18,26,57`, `components/dashboard/CriticalTasksWidget.tsx:46,51`                              | `app/actions/tasks.ts:23-28`, `app/actions/tasks.ts:141-169`, `app/actions/tasks.ts:198-201`                                          | **YES — CRITICAL** |
| clients    | _(none found via client Supabase `from('clients')` in client components)_                                                                                                                                                              | `app/clients/actions.ts:10-31`, `app/clients/actions.ts:34-44`, `app/billings/actions.ts:41-45`                                       | NO                 |
| businesses | _(none found via client Supabase `from('businesses')` in client components)_                                                                                                                                                           | `app/clients/actions.ts:181-212`, `app/clients/actions.ts:214-234`                                                                    | NO                 |
| billings   | _(none found via client Supabase `from('billings')` in client components)_                                                                                                                                                             | `app/billings/actions.ts:10-57`                                                                                                       | NO                 |

### Phase 1.1 findings

## 🚨 CRITICAL: Mixed read architecture for Projects and Tasks

**Location:**

- Projects: `components/AnalyticsDashboard.tsx:45-55` + `app/clients/actions.ts:48-80`
- Tasks: `components/AnalyticsDashboard.tsx:55` + `app/actions/tasks.ts:23-28`

**Pattern:**

```typescript
// Client-side direct reads
const supabase = createClient();
await supabase.from('projects').select('*');
await supabase.from('tasks').select('*');

// Parallel server-action reads elsewhere
await createClient().from('projects').select('id, name, color, category');
await createClient().from('tasks').select('order_index, status');
```

**Why This Breaks Enterprise:**

- Two query layers (client direct + server action) create inconsistent caching, invalidation, and ownership of freshness.
- Observability and policy evolution become harder: read logic is duplicated across UI and server modules.
- Any future business rule added to server selectors can be bypassed by direct client reads.

**Proof of Impact:**

- A write can trigger `revalidatePath` while a mounted client component still relies on independent local fetch timing.
- Under high interaction (multiple open tabs/users), KPI cards and board views can diverge transiently, producing conflicting UI state.

**Fix Priority:** P0  
**Estimated Fix Complexity:** 2–4 days  
**Suggested Fix:** Consolidate to server-owned read selectors/actions for domain data; client components consume those responses only.

---

## Phase 1.2 — Map ALL Write Paths + Refresh Strategy

### Write-path matrix (with refresh behavior)

| Action                                | File                              |            revalidatePath? |                                                                                               Manual Refetch? | Double Refresh? |
| ------------------------------------- | --------------------------------- | -------------------------: | ------------------------------------------------------------------------------------------------------------: | --------------: |
| `createProject`                       | `app/actions/projects.ts:8-49`    |              YES (`46-47`) |                         YES (`components/AddProjectModal.tsx:105` -> `onProjectAdded`; parent loads projects) |    **CRITICAL** |
| `updateProject`                       | `app/actions/projects.ts:51-119`  |            YES (`116-117`) |                                         YES (`components/EditProjectModal.tsx:113,161` -> `onProjectUpdated`) |    **CRITICAL** |
| `archiveProject` / `unarchiveProject` | `app/actions/projects.ts:121-176` | YES (`140-141`, `173-174`) |                                               YES (`components/Sidebar.tsx:109-116` calls `onProjectUpdated`) |    **CRITICAL** |
| `deleteProject`                       | `app/actions/projects.ts:178-193` |            YES (`191-192`) |                                 YES (`components/Sidebar.tsx:123-126`; `components/EditProjectModal.tsx:131`) |    **CRITICAL** |
| `createTask`                          | `app/actions/tasks.ts:10-53`      |                 YES (`52`) |                              Usually YES via callbacks (`components/AddTaskModal.tsx:73-76` -> `onTaskAdded`) |    **CRITICAL** |
| `updateTask`                          | `app/actions/tasks.ts:56-87`      |                 YES (`86`) |                                    YES (`components/EditTaskModal.tsx` uses `onTaskUpdated` callback pattern) |    **CRITICAL** |
| `deleteTask`                          | `app/actions/tasks.ts:90-105`     |            YES (`103-104`) |                                                         YES (`components/EditTaskModal.tsx` callback pattern) |    **CRITICAL** |
| `deleteTasksByIds`                    | `app/actions/tasks.ts:108-127`    |            YES (`125-126`) |                    YES (`components/ProjectKanbanClient.tsx:100,104` calls `loadData()` in both success/fail) |    **CRITICAL** |
| `updateTaskOrder`                     | `app/actions/tasks.ts:130-241`    |            YES (`239-240`) |                                                      YES (`components/KanbanBoard.tsx:162` -> `onTaskUpdate`) |    **CRITICAL** |
| `createClientAction`                  | `app/clients/actions.ts:84-114`   |            YES (`112-113`) |                                        YES (`app/clients/components/CreateClientModal.tsx:50` -> `onCreated`) |    **CRITICAL** |
| `updateClientAction`                  | `app/clients/actions.ts:117-150`  |            YES (`148-149`) |                                          YES (`app/clients/components/EditClientModal.tsx:62` -> `onUpdated`) |    **CRITICAL** |
| `deleteClientAction`                  | `app/clients/actions.ts:153-162`  |            YES (`160-161`) |                                               YES (`app/clients/components/ClientCard.tsx:70` -> `onDeleted`) |    **CRITICAL** |
| `createBusinessAction`                | `app/clients/actions.ts:248-286`  |            YES (`284-285`) |                                      YES (`app/clients/components/CreateBusinessModal.tsx:57` -> `onCreated`) |    **CRITICAL** |
| `updateBusinessAction`                | `app/clients/actions.ts:289-326`  |            YES (`324-325`) |                                        YES (`app/clients/components/EditBusinessModal.tsx:47` -> `onUpdated`) |    **CRITICAL** |
| `updateBusinessFieldsAction`          | `app/clients/actions.ts:332-373`  |            YES (`369-372`) | YES (`app/businesses/[id]/BusinessDetailClient.tsx:151,181` invokes and updates local state/reloads sections) |    **CRITICAL** |
| `deleteBusinessAction`                | `app/clients/actions.ts:376-383`  |            YES (`381-382`) |                                             YES (`app/clients/components/BusinessCard.tsx:92` -> `onDeleted`) |    **CRITICAL** |
| `createBilling`                       | `app/billings/actions.ts:59-92`   |                 YES (`90`) |                                                               YES (`app/billings/BillingsPageClient.tsx:176`) |    **CRITICAL** |
| `updateBilling`                       | `app/billings/actions.ts:114-149` |                YES (`147`) |                                                               YES (`app/billings/BillingsPageClient.tsx:176`) |    **CRITICAL** |
| `updateBillingStatus`                 | `app/billings/actions.ts:94-112`  |                YES (`110`) |                                                               YES (`app/billings/BillingsPageClient.tsx:184`) |    **CRITICAL** |

### Phase 1.2 findings

## 🚨 CRITICAL: Double-refresh strategy is systemic

**Location:**

- Broadly across `app/actions/projects.ts`, `app/actions/tasks.ts`, `app/clients/actions.ts`, `app/billings/actions.ts`
- Plus UI callbacks invoking explicit loaders (e.g., `app/billings/BillingsPageClient.tsx:64-69,176,184`; `components/ProjectKanbanClient.tsx:110-121`; `components/Sidebar.tsx:109-126`)

**Pattern:**

```typescript
// Server action
revalidatePath('/dashboard')

// UI also refetches explicitly after await action
await updateTaskOrder(...)
onTaskUpdate() // loadData() executes another fetch cycle
```

**Why This Breaks Enterprise:**

- Duplicated refresh creates thundering-herd fetch behavior at scale.
- Increases race windows where UI can momentarily show stale + then refreshed state.
- Makes performance and consistency nondeterministic across modules.

**Proof of Impact:**

- On rapid task drag-drop, each mutation triggers server invalidation and local reload; query volume scales superlinearly with interaction rate.
- In list-heavy pages (clients/billings), every create/update/delete does both invalidation and manual reload, multiplying network and DB load.

**Fix Priority:** P0  
**Estimated Fix Complexity:** 3–5 days  
**Suggested Fix:** Standardize one refresh contract per route: either (A) server revalidation-driven render, or (B) client-owned cache + targeted mutation updates; do not combine by default.

---

## Phase 1 Executive Summary

1. **Projects and tasks are read through mixed channels (client direct + server action): CRITICAL.**
2. **Write operations across all audited domains use systemic double-refresh: CRITICAL.**
3. This combination is a high-blast-radius scalability blocker because it amplifies request count and consistency drift under concurrent usage.

---

## Phase 2.1 — Concurrent User Impact (Race Condition Matrix)

## Scope for this subsection

Analyzed **16 high-traffic write actions** from Phase 1:

1. createProject, 2) updateProject, 3) archiveProject, 4) unarchiveProject, 5) deleteProject, 6) createTask, 7) updateTask, 8) deleteTask, 9) deleteTasksByIds, 10) updateTaskOrder, 11) createClientAction, 12) updateClientAction, 13) deleteClientAction, 14) createBilling, 15) updateBilling, 16) updateBillingStatus.

### 2.1.1 Race condition matrix

| Action              | Concurrent Collision Timeline (A vs B)                                                                                                                                | Collision Points                   | Stale Refetch Window | Corruption Risk |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------- | --------------- |
| createProject       | T0 A submit → T1 A insert+revalidate → T2 A client callback reloads projects → T3 B submit → T4 B insert+revalidate → T5 A reload may complete before B write visible | last-writer visibility skew        | YES                  | Medium          |
| updateProject       | T0 A edit save → T1 DB update → T2 revalidate → T3 A UI callback reload → T4 B edit save old form snapshot → T5 overwrite                                             | lost update (no version check)     | YES                  | **High**        |
| archiveProject      | T0 A archive → T1 update category archived → T2 reload A → T3 B un/archive opposite state                                                                             | toggling overwrite                 | YES                  | Medium          |
| unarchiveProject    | same as archiveProject with inverse category                                                                                                                          | toggling overwrite                 | YES                  | Medium          |
| deleteProject       | T0 A delete → T1 cascade/set-null effects → T2 reload A → T3 B update same project -> fails/not found                                                                 | action against deleted entity      | YES                  | Medium          |
| createTask          | T0 A compute max order_index → T1 B compute same max → T2 both insert same order_index                                                                                | **duplicate order_index**          | YES                  | **High**        |
| updateTask          | T0 A update status/notes → T1 B update stale form → T2 overwrite                                                                                                      | lost update                        | YES                  | Medium          |
| deleteTask          | T0 A delete row → T1 B update/delete same row                                                                                                                         | not-found branch divergence        | YES                  | Low             |
| deleteTasksByIds    | T0 A optimistic remove local rows → T1 server delete + revalidate → T2 B overlapping bulk delete                                                                      | partial success ambiguity          | YES                  | Medium          |
| updateTaskOrder     | T0 A reads column tasks → T1 B reads same column tasks → T2 both run looped updates                                                                                   | interleaved reorder loops          | YES                  | **High**        |
| createClientAction  | T0 A create → T1 revalidate → T2 A reload list → T3 B create same entity                                                                                              | duplicate logical client records   | YES                  | Medium          |
| updateClientAction  | T0 A update contact fields → T1 B update stale values                                                                                                                 | lost update                        | YES                  | Medium          |
| deleteClientAction  | T0 A delete client → T1 B updates same client/business relation                                                                                                       | FK/set-null timing side effects    | YES                  | Medium          |
| createBilling       | T0 A create billing → T1 revalidate → T2 A loadBillings → T3 B creates similar billing                                                                                | duplicate charge records           | YES                  | Medium          |
| updateBilling       | T0 A change amount/status context → T1 B saves stale form                                                                                                             | lost update                        | YES                  | Medium          |
| updateBillingStatus | T0 A sets paid (paid_at now) → T1 B sets overdue/pending shortly after                                                                                                | status flip-flop + paid_at nulling | YES                  | **High**        |

### 2.1.2 Detailed race findings (with proof)

## 🔴 RACE CONDITION: createTask concurrent insert collision

**Location:** `app/actions/tasks.ts:21-44`

**Bug Pattern:**

```typescript
const { data: maxOrder } = await supabase
  .from('tasks')
  .select('order_index')
  .eq('status', status)
  .order('order_index', { ascending: false })
  .limit(1)
  .single()

const orderIndex = (maxOrder as any)?.order_index != null
  ? (maxOrder as any).order_index + 1
  : 0

await supabase.from('tasks').insert({ ..., order_index: orderIndex })
```

**Reproduction Steps:**

1. User A and B open same project/status column with current max `order_index=5`.
2. Both submit `createTask` nearly simultaneously.
3. Both reads return `5`, both insert with `6`.

**Data Corruption Proof:**

- Duplicate `order_index` in same column is possible because read+insert is non-transactional and unguarded by uniqueness constraint.

**Cascade Impact:**

- Breaks deterministic ordering in kanban column.
- Amplifies issue in `updateTaskOrder` loop logic (see below).

**Fix Priority:** P0  
**Fix Dependency:** none  
**Estimated Effort:** 1–2 days

---

## 🔴 RACE CONDITION: updateTaskOrder interleaving loop updates

**Location:** `app/actions/tasks.ts:154-231`

**Bug Pattern:**

```typescript
const { data: oldColumnTasks } = await supabase
  .from('tasks')
  .select('id, order_index')
  .eq('status', actualOldStatus)
  .neq('id', taskId)
  .order('order_index', { ascending: true });

for (const t of oldColumnTasks as any[]) {
  if (t.order_index > oldIndex) {
    await supabase
      .from('tasks')
      .update({ order_index: t.order_index - 1 })
      .eq('id', t.id);
  }
}
```

**Reproduction Steps:**

1. User A drags task X in column `next`; User B drags task Y in same column concurrently.
2. Both read old column snapshot before either finishes updates.
3. Both execute row-by-row updates from stale snapshots.

**Data Corruption Proof:**

- Non-atomic multi-row reorder can produce duplicate indices, skipped indices, or task jumps.

**Cascade Impact:**

- Kanban optimistic UI (`components/KanbanBoard.tsx:153-163`) may briefly diverge, then reload to an already corrupted order set.

**Fix Priority:** P0  
**Fix Dependency:** none  
**Estimated Effort:** 2–3 days

---

## 🔴 RACE CONDITION: updateBillingStatus status flip-flop

**Location:** `app/billings/actions.ts:94-111`

**Bug Pattern:**

```typescript
const payload = {
  status,
  paid_at: status === 'paid' ? new Date().toISOString() : null,
};
await supabase.from('billings').update(payload).eq('id', id);
```

**Reproduction Steps:**

1. User A sets billing to `paid`.
2. User B (stale view) sets same billing to `pending` or `overdue` seconds later.
3. A’s `paid_at` is cleared by B’s update.

**Data Corruption Proof:**

- Payment timestamp history is destructively overwritten without conflict check.

**Cascade Impact:**

- Downstream revenue/collection metrics become non-auditable.

**Fix Priority:** P0  
**Fix Dependency:** none  
**Estimated Effort:** 0.5–1 day

---

## ⚠️ RACE CONDITION: Double-refresh stale-window amplification

**Location:**

- Server invalidation: `app/actions/tasks.ts:125-126`, `app/actions/projects.ts:46-47`, `app/billings/actions.ts:90,110,147`
- Manual refetch: `components/ProjectKanbanClient.tsx:100-105`, `components/KanbanBoard.tsx:156-163`, `app/billings/BillingsPageClient.tsx:175-177,182-184`, `components/Sidebar.tsx:115,125`

**Bug Pattern:**

```typescript
// server action
revalidatePath('/dashboard');

// client flow
await action();
loadData(); // or loadBillings(), onProjectUpdated()
```

**Reproduction Steps:**

1. A submits write; revalidate enqueued.
2. A immediately performs manual refetch.
3. B submits overlapping write before A’s refetch completes.

**Data Corruption Proof:**

- Even when DB remains correct, UI can render pre-B snapshot then post-B snapshot out-of-order, causing user-visible reversions/flicker and invalid operator decisions.

**Cascade Impact:**

- Increases operational error rate in high-frequency workflows (kanban drag/drop, billing status triage).

**Fix Priority:** P1 (becomes P0 when combined with reorder races)  
**Fix Dependency:** none  
**Estimated Effort:** 2–4 days

---

## Phase 2.1 conclusion (stop point)

- Concurrent-user risk is **not theoretical**: at least 3 actions (`createTask`, `updateTaskOrder`, `updateBillingStatus`) have clear high-severity race windows that can corrupt business state.
- Remaining actions mostly present lost-update or stale-read windows due to missing optimistic locking and mixed refresh orchestration.
- Per instruction, this report now stops before Phase 2.2.

### 2.1.3 Suggested fix sketches (for Phase 2.1 findings)

**For `createTask` collision:**

```typescript
// move to SQL function / RPC with transaction:
// 1) lock target project+status scope
// 2) compute next order_index inside txn
// 3) insert row
await supabase.rpc('create_task_with_scoped_order', {
  p_project_id: projectId,
  p_status: status,
  p_title: title,
  p_priority: priority,
  p_due_date: dueDate,
  p_notes: notes,
});
```

**For `updateTaskOrder` interleaving:**

```typescript
// single RPC that reorders atomically inside DB transaction
await supabase.rpc('reorder_task_atomic', {
  p_task_id: taskId,
  p_new_status: newStatus,
  p_new_order_index: newOrderIndex,
});
```

**For `updateBillingStatus` flip-flop:**

```typescript
// optimistic check on updated_at to prevent stale overwrite
const { data: current } = await supabase
  .from('billings')
  .select('updated_at, status')
  .eq('id', id)
  .single();

if (current.updated_at !== expectedUpdatedAt) {
  throw new Error('Conflict: billing changed by another user');
}

await supabase.from('billings').update(payload).eq('id', id);
```

**For double-refresh amplification:**

```typescript
// Pick one contract per screen. Example: client-owned refresh only.
// Remove revalidatePath from hot actions on fully client-driven screens,
// and keep explicit loadData()/loadBillings() after mutation.
```
