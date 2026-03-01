# Calendar — Module Plan Document

**Version:** 1.0  
**Status:** Ready for implementation (pending this plan approval)  
**Scope:** Project-scoped Calendar module (NO Google/iOS sync)  
**Route:** `app/context/[projectId]/calendar/`  
**Pattern:** server page → `*FromCache` → `*Client`  
**Core idea:** Calendar as **Lens** (Tasks/Billings/Todos) + minimal **Native Events** table

---

## 0) Non-Goals (Hard boundaries for this implementation)

- No Google Calendar sync
- No iOS Calendar sync
- No recurring events
- No push/email/SMS reminders (no notification infrastructure)
- No team calendars / shared calendars
- No complex availability engine

---

## 1) Implementation Strategy Summary

Calendar will be implemented in **four phases**:

1. **DB & RLS foundations**: add `calendar_events` table + enums + indexes + RLS + missing due_date indexes for Tasks/Todos.
2. **Server actions**: create `app/actions/calendar.ts` with a single “project calendar feed” read + native event CRUD.
3. **UI module route**: `/context/[projectId]/calendar` with cache integration + Agenda view (MVP) + create/edit event dialog.
4. **Polish + integration**: add tab entry + i18n + performance guardrails + write-through date editing hooks (optional in MVP if time).

Each phase has clear acceptance criteria.

---

## 2) Phase 1 — Database & RLS Foundations

### 2.1 Create migration file

**Migration name (example):**
`supabase/migrations/20260228XXXX00_calendar_events.sql`

### 2.2 Add enums

- `calendar_event_type_enum`
- `calendar_event_status_enum`

### 2.3 Add table: `calendar_events`

Columns:

- `id` uuid pk
- `owner_id` uuid not null
- `project_id` uuid null
- `title` text not null
- `description` text null
- `location` text null
- `event_type` enum not null
- `status` enum not null default `scheduled`
- `all_day` boolean default false
- `start_at` timestamptz not null
- `end_at` timestamptz null
- `created_at`, `updated_at`

### 2.4 Add indexes

- `idx_calendar_events_project_start (project_id, start_at desc)`
- `idx_calendar_events_owner_start (owner_id, start_at desc)`

### 2.5 Add missing due_date indexes (required for Calendar performance)

- `idx_tasks_project_due_date (project_id, due_date)`
- `idx_todo_items_owner_due_date (owner_id, due_date)`

> These are required because Calendar range queries will otherwise scan.

### 2.6 Add updated_at trigger

- Use shared `update_updated_at_column()` trigger function.

### 2.7 Enable RLS and policies

RLS must ensure:

- Users can only access their own events (`owner_id = auth.uid()`).
- If `project_id` is present, it must belong to the same owner (EXISTS join to projects).

### Phase 1 Acceptance Criteria

- Migration applies cleanly.
- `calendar_events` exists with RLS enabled.
- Indexes exist.
- New indexes on Tasks/Todos exist.
- Supabase types can be regenerated (or validated if you generate later).

---

## 3) Phase 2 — Server Actions (Read & Mutations)

### 3.1 Create file

`app/actions/calendar.ts`

### 3.2 Required exports

#### A) Read: `getProjectCalendarFeed`

Signature (example):

```ts
getProjectCalendarFeed(input: {
  projectId: string;
  start: string; // ISO date
  end: string;   // ISO date
}): Promise<CalendarFeedItem[]>
```

**Rules:**

- Must call `requireAuth()` first.
- Must use `createClient()` from server Supabase.
- Must explicitly select columns (no `select('*')`).
- Must return a single normalized list: `CalendarFeedItem[]`.
- Must be wrapped with `cache()`.

**Feed sources (4 queries max):**

- `calendar_events` (project_id filter, start_at range overlap)
- `tasks` (project_id filter, due_date between start/end)
- `billings` (project_id filter, due_date between start/end)
- `todo_items` (scoped to lists attached to the project, due_date between start/end)

**Normalization rule:**

- Derived items (task/billing/todo) must include `sourceType` and `sourceId` for deep-link.
- All items must include `dateKey` for grouping in the UI.

#### B) Mutations: Native events CRUD

- `createCalendarEvent`
- `updateCalendarEvent`
- `deleteCalendarEvent`

**Rules:**

- `owner_id` is ALWAYS set server-side from auth user.
- Validate `end_at >= start_at` if end exists.
- `revalidatePath` after mutations: `/context`, `/context/[projectId]`, `/context/[projectId]/calendar`
- **Return shapes:** Reads: list of items; Writes: `{ success: boolean; error?: string; data?: ... }`

### 3.3 (Optional in MVP) Write-through due date updates

If included in v1:

- Prefer calling existing actions in their modules (tasks/billings/todo).
- If those actions are not exposed as small helpers, add minimal wrapper actions in `calendar.ts` that delegate.

### Phase 2 Acceptance Criteria

- `getProjectCalendarFeed` returns correct combined data.
- Event CRUD works and respects RLS.
- Revalidation is path-based only.
- No client-side Supabase usage introduced.

---

## 4) Phase 3 — UI Module Route + Cache Integration

### 4.1 Create route folder

`app/context/[projectId]/calendar/`

- `page.tsx`
- `ContextCalendarFromCache.tsx`
- `ContextCalendarClient.tsx`

### 4.2 page.tsx (server)

- Must call `requireAuth()`
- Render `<ContextCalendarFromCache projectId={params.projectId} />`

### 4.3 Cache integration

- Add cache key support in `app/context/ContextDataCache.tsx`: `{ type: 'calendar', projectId }`
- **ContextCalendarFromCache behavior:**
  - If cache hit → render immediately.
  - If cache miss → show `<SkeletonCalendar />`, fetch, set cache.
  - Provide `onRefresh` to invalidate + refetch.

### 4.4 UI Components

Create under `components/context/calendar/`:

- `CalendarAgenda.tsx`
- `CalendarItemRow.tsx`
- `CalendarFilters.tsx`
- `CreateEventDialog.tsx`

Create skeleton: `components/skeletons/SkeletonCalendar.tsx`

### 4.5 MVP UI features

- Agenda view only (Today → +14 days)
- Day grouping headers
- Source filters (Task/Billing/Todo/Event)
- Search by title
- Create event dialog (native events)
- Edit event dialog
- Month grid is optional for MVP. If it risks timeline, add in Phase 4.

### Phase 3 Acceptance Criteria

- `/context/[projectId]/calendar` renders.
- Agenda shows combined items for the range.
- Create/edit/delete native events works and reflects immediately (cache invalidation + refresh).
- Skeleton-only loading (no spinners).

---

## 5) Phase 4 — Navigation, i18n, Polish, and Optional Enhancements

### 5.1 Add Calendar tab

**Edit:** `components/context/ContextTabBar.tsx`

**Add:** `{ slug: 'calendar', labelKey: 'context.calendar', icon: Calendar }`

### 5.2 Add translation key

Add to i18n dictionaries: `context.calendar` = "Calendar"

### 5.3 Optional: Month grid view

- Add: `CalendarMonthGrid.tsx`, `CalendarDayDialog.tsx`
- Keep month grid navigation-only: click day → open dialog listing that day’s agenda.

### 5.4 Optional: Write-through editing UI

If included:

- From Calendar row menu: “Change due date” for task/billing/todo
- Uses same date input pattern already in repo (`<input type="date">`)
- Calls write-through server action

### 5.5 Performance guardrails

- Ensure date range queries are bounded: Agenda window 14 days; Month view 42 days max (6-week grid).
- Ensure no N+1 queries in feed assembly.
- Ensure list rendering is stable (keys, memoization where needed).

### Phase 4 Acceptance Criteria

- Calendar tab appears and routes correctly.
- Month view (if included) works without lag.
- Write-through edits (if included) update canonical tables correctly.
- No regressions in other context tabs.

---

## 6) Testing & Verification Checklist (Manual)

### 6.1 Data correctness

- Tasks due date appears in calendar on correct day.
- Billing due date appears; paid billings show correct badge.
- Todo due date appears (only those associated with the project through lists).
- Native event appears in agenda immediately after create.

### 6.2 Security checks

- User cannot read another user’s calendar events (RLS).
- User cannot create an event linked to a project they don’t own.
- Feed query respects ownership constraints for tasks/billings/todos.

### 6.3 UX checks

- Cache hit renders instantly (no flicker).
- Cache miss shows skeleton.
- After mutation, list updates via refresh pattern (no `router.refresh()`).

---

## 7) Files & Touchpoints Summary

**New files:**

- `supabase/migrations/20260228XXXX00_calendar_events.sql`
- `app/actions/calendar.ts`
- `app/context/[projectId]/calendar/page.tsx`
- `app/context/[projectId]/calendar/ContextCalendarFromCache.tsx`
- `app/context/[projectId]/calendar/ContextCalendarClient.tsx`
- `components/context/calendar/*` (CalendarAgenda, CalendarItemRow, CalendarFilters, CreateEventDialog, etc.)
- `components/skeletons/SkeletonCalendar.tsx`
- `lib/validation/calendar.ts` (if you enforce validation centrally)

**Modified files:**

- `app/context/ContextDataCache.tsx` (add calendar cache key)
- `components/context/ContextTabBar.tsx` (add calendar tab)
- i18n dictionaries (add `context.calendar`)

---

## 8) Final Implementation Notes (Constraints)

- No client Supabase in components.
- Explicit column selection in server actions.
- Path-based revalidation only.
- Skeleton loading only, no spinners.
- Calendar is a lens: do not duplicate due dates.
