# Calendar Module — Plan Analysis & Approval

**Date:** 2026-02-28  
**Purpose:** Validate the audit, design plan, and implementation plan before execution. No code changes.

---

## 1. Summary

The **audit**, **design plan**, and **implementation plan** are **aligned and consistent**. The approach (Calendar as lens + minimal `calendar_events` table, project-scoped route, same context cache pattern as Notes/Documents) is the right one and matches repo invariants. **Approved to proceed**, with a few concrete adjustments and one architectural recommendation below.

---

## 2. Cross-Document Consistency

| Topic              | Audit                                                               | Design                             | Implementation                     | Verdict                |
| ------------------ | ------------------------------------------------------------------- | ---------------------------------- | ---------------------------------- | ---------------------- |
| **Model**          | Lens over tasks/billings/todo + minimal native table                | Same                               | Same (Phase 2 feed from 4 sources) | ✅                     |
| **Table name**     | `calendar_items` or `calendar_events`                               | `calendar_events`                  | `calendar_events`                  | ✅ (design/impl fixed) |
| **No duplication** | Source of truth in canonical tables                                 | Write-through only                 | Feed reads from sources; no copies | ✅                     |
| **Indexes**        | Add `tasks(project_id, due_date)`, `todo_items(owner_id, due_date)` | Same in §3.4                       | Phase 1 §2.5 same                  | ✅                     |
| **RLS**            | owner_id + project ownership when project_id set                    | §3.6 policies                      | Phase 1 §2.7                       | ✅                     |
| **Route**          | `/context/[projectId]/calendar`                                     | `app/context/[projectId]/calendar` | Phase 3 same                       | ✅                     |
| **Cache key**      | `{ type: 'calendar', projectId }`                                   | §6                                 | Phase 4.3                          | ✅                     |
| **Todo scope**     | todo_items via lists; lists can have project_id                     | —                                  | “lists attached to the project”    | ✅                     |
| **Non-goals**      | No Google/iOS sync, no reminders                                    | §9                                 | §0 Non-Goals                       | ✅                     |

---

## 3. Alignment with Repo Patterns

- **Context session cache:** FromCache on cache miss → fetch → set cache → render Client; `onRefresh` to invalidate + refetch. Implementation follows this (Phase 3, 4.3). Reference: `ContextNotesFromCache`, `docs/patterns/context-session-cache.md`.
- **Server actions:** `requireAuth()` first, explicit columns, path-based `revalidatePath`, no client Supabase. All called out in the implementation plan.
- **Naming:** Verb-first, no `Action` suffix (e.g. `getProjectCalendarFeed`, `createCalendarEvent`). Design/implementation use these names.
- **Layering:** UI in components; actions in `app/actions/calendar.ts`; validation in `lib/validation/calendar.ts`. No business logic in components.

---

## 4. Required Adjustments Before / During Implementation

### 4.1 DB round-trip budget (important)

**Rule (AGENTS.md):** Context tab initial load ≤ **3 DB round trips**.

**Current plan:** `getProjectCalendarFeed` is described as up to **4 queries** (calendar_events, tasks, billings, todo_items). That is **4 DB round trips** from the app to Postgres, so the calendar tab would exceed the contract.

**Recommendation (choose one):**

- **Option A (preferred):** Implement a **Postgres RPC** (e.g. `get_project_calendar_feed(p_project_id, p_start_date, p_end_date)`) that runs the four logical reads inside the DB (e.g. four `SELECT`/CTEs or a UNION over normalized rows) and returns a **single result set** (e.g. with columns like `source_type`, `source_id`, `date_key`, `title`, …). The server action then calls this RPC once → **1 DB round trip**, within budget.
- **Option B:** Keep four separate Supabase queries in the server action and **document an explicit exception** for the calendar tab (“Calendar tab: 4 DB round trips”) in AGENTS.md or the plan, and ensure no other DB work is done on that tab’s initial load.

Implementing Option A is the cleanest way to stay within the performance contract.

### 4.2 Return shape for mutations

**Repo norm:** Mutations return `{ data?, error? }` (e.g. notes, documents). The implementation plan mentions “`{ success: boolean; error?: string; data?: ... }`”.

**Recommendation:** Use the existing pattern: **`{ data?, error? }`** for create/update/delete (e.g. on success `return { data: createdRow }`, on failure `return { error: message }`). Align Phase 2 and design §4 with this.

### 4.3 Error handling and Sentry

**AGENTS.md:** Use `captureWithContext` from `@/lib/sentry` in every server action error path (with `module`, `action`, `userIntent`, `expected`).

**Recommendation:** Add to Phase 2 acceptance criteria (or Phase 8 constraints): “All calendar server actions use `captureWithContext` on error (module `'calendar'`, action name, userIntent, expected).” Reference: `app/actions/documents.ts`.

### 4.4 Validation and bounded range

**Audit:** Recommends shared date validation and safe parsing. Design §8 and implementation §7 include `lib/validation/calendar.ts`.

**Recommendation:** In `getProjectCalendarFeed`, **validate** that `start` and `end` are within a reasonable range (e.g. max 42 days for month view, or 14 for agenda). Reject or clamp out-of-range requests to avoid heavy queries. Implementation plan 5.5 already bounds the UI (14 days agenda, 42 days month); enforce the same bounds in the action.

---

## 5. Risks Already Mitigated by the Plans

- **Data duplication:** Design and implementation keep task/billing/todo as source of truth; calendar only reads and write-through edits. No duplicate due-date storage.
- **RLS:** Design and Phase 1 RLS match the audit (owner_id + project ownership for calendar_events). Feed must only use project-scoped + owner-scoped queries; RLS on tasks/billings/todo_items already enforces that when the action filters by project_id / owner.
- **Todos tab:** Todos tab can stay commented out; calendar can still show todo due dates by reading `todo_items` from lists where `todo_lists.project_id = projectId`. No dependency on enabling the Todos tab.
- **N+1:** Plan forbids per-row DB calls; feed is one (or four) bulk queries. No N+1 if we keep a single RPC or a small number of bulk queries.

---

## 6. Optional Follow-Ups (not blocking)

- **Shared date validation:** Audit suggests `lib/validation/dates.ts` for reuse across tasks/billings/todo/calendar. Implementation plan already has `lib/validation/calendar.ts`. If calendar validation is generic (e.g. “valid ISO date”, “end >= start”), consider a small shared helper used by calendar and optionally by other modules later.
- **Timezone:** Audit notes that `profiles.timezone` exists but isn’t consistently used for display. For MVP, continuing to use browser/local for display is acceptable; document that “display timezone” is local and that future work may respect profile timezone.

---

## 7. Approval

- **Audit:** Reflects the codebase and date/time inventory correctly; recommendations are sound.
- **Design plan:** Matches the audit and defines a minimal, project-scoped calendar with clear boundaries.
- **Implementation plan:** Phases are ordered correctly (DB first, then actions, then UI, then polish), and acceptance criteria are testable.

**Verdict:** **Approved to proceed** with implementation, with the following applied:

1. **Resolve 4 vs 3 DB round trips:** Prefer a single RPC for the calendar feed (Option A); otherwise document the exception (Option B).
2. **Use `{ data?, error? }`** for mutation return values and align design/implementation text.
3. **Add Sentry:** Use `captureWithContext` in all calendar server action error paths.
4. **Enforce date range:** Validate or clamp `start`/`end` in `getProjectCalendarFeed` (e.g. max 42 days).

Once these are reflected in the implementation plan (or in the first implementation PR), the plan is ready to execute as-is.
