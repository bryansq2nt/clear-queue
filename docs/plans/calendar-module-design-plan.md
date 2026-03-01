# Calendar Module — Design Document

**Version:** 1.0  
**Status:** Draft (Pending Approval)  
**Scope:** Project-scoped calendar module (No Google/iOS sync)  
**Architecture Pattern:** Server page → `*FromCache` → `*Client`  
**Integration Model:** Calendar as Lens + Minimal Native Events

---

# 1. Overview

The Calendar module is a **project-scoped scheduling lens** with minimal native event support.

It does NOT replace Tasks, Billings, or Todos.

It does NOT duplicate due dates.

Its responsibilities are:

1. Aggregate existing date-driven work inside the active project.
2. Provide minimal native events (meetings, site visits, inspections, etc.).
3. Enable write-through editing to original source modules.
4. Improve time visibility without bloating the system.

Calendar lives inside: `app/context/[projectId]/calendar`

It follows the same architecture pattern used by Notes and Documents.

---

# 2. Functional Scope

## 2.1 Calendar as Lens

Calendar aggregates:

- `tasks.due_date`
- `billings.due_date`
- `billings.paid_at`
- `todo_items.due_date`
- `calendar_events.start_at`

Calendar does NOT create copies of task/billing/todo due dates.

Editing from Calendar updates the original source.

---

## 2.2 Views (MVP)

### Default View: Agenda

- Today → next 14 days
- Grouped by day
- Source badges:
  - Task
  - Billing
  - Todo
  - Event
- Status badges:
  - Overdue
  - Due
  - Paid
  - Done
  - Cancelled
- Filters:
  - Source type
  - Status
  - Search by title

### Secondary View: Month Grid

- Month grid is navigation-only.
- Clicking a day opens a Dialog drawer with that day's agenda.

---

## 2.3 Native Events

Events are the only new records Calendar owns.

Supported types:

- meeting
- site_visit
- inspection
- reminder
- focus_block
- other

Fields:

- title (required)
- start_at (required)
- end_at (optional)
- all_day (boolean)
- location (optional)
- description (optional)
- status: scheduled | done | cancelled

---

## 2.4 Write-Through Editing

Calendar edits update source modules:

- Editing Task deadline updates `tasks.due_date`
- Editing Billing due date updates `billings.due_date`
- Editing Todo due date updates `todo_items.due_date`

Calendar never stores duplicates.

---

# 3. Database Design

## 3.1 Enum: calendar_event_type_enum

```sql
CREATE TYPE public.calendar_event_type_enum AS ENUM (
  'meeting',
  'site_visit',
  'inspection',
  'reminder',
  'focus_block',
  'other'
);
```

## 3.2 Enum: calendar_event_status_enum

```sql
CREATE TYPE public.calendar_event_status_enum AS ENUM (
  'scheduled',
  'done',
  'cancelled'
);
```

## 3.3 Table: calendar_events

```sql
CREATE TABLE public.calendar_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    UUID NULL REFERENCES public.projects(id) ON DELETE SET NULL,

  title         TEXT NOT NULL,
  description   TEXT NULL,
  location      TEXT NULL,

  event_type    public.calendar_event_type_enum NOT NULL,
  status        public.calendar_event_status_enum NOT NULL DEFAULT 'scheduled',

  all_day       BOOLEAN NOT NULL DEFAULT false,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

## 3.4 Indexes

```sql
CREATE INDEX idx_calendar_events_project_start
  ON public.calendar_events (project_id, start_at DESC);

CREATE INDEX idx_calendar_events_owner_start
  ON public.calendar_events (owner_id, start_at DESC);

-- Additional required indexes (from audit)
CREATE INDEX idx_tasks_project_due_date
  ON public.tasks (project_id, due_date);

CREATE INDEX idx_todo_items_owner_due_date
  ON public.todo_items (owner_id, due_date);
```

## 3.5 updated_at Trigger

Reuse existing `update_updated_at_column()` trigger.

## 3.6 RLS Policies

```sql
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own calendar events"
  ON public.calendar_events FOR SELECT
  USING (
    owner_id = auth.uid()
    AND (
      project_id IS NULL OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = calendar_events.project_id
          AND p.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert own calendar events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      project_id IS NULL OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = calendar_events.project_id
          AND p.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own calendar events"
  ON public.calendar_events FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own calendar events"
  ON public.calendar_events FOR DELETE
  USING (owner_id = auth.uid());
```

---

# 4. Server Actions

**File:** `app/actions/calendar.ts`

**Required actions:**

- `getProjectCalendarFeed(projectId, start, end)`
- `createCalendarEvent`
- `updateCalendarEvent`
- `deleteCalendarEvent`
- Write-through deadline updates (reuse existing actions)

**All actions must:**

- Call `requireAuth()` first
- Use explicit column selection (no `select('*')`)
- Use path-based `revalidatePath`
- Return structured `{ success, error }` (or `{ data, error }`) objects

---

# 5. UI Architecture

**Route:** `app/context/[projectId]/calendar/`

- `page.tsx`
- `ContextCalendarFromCache.tsx`
- `ContextCalendarClient.tsx`

**Components:** `components/context/calendar/`

- `CalendarAgenda.tsx`
- `CalendarMonthGrid.tsx`
- `CalendarDayDialog.tsx`
- `CreateEventDialog.tsx`
- `CalendarItemRow.tsx`
- `CalendarFilters.tsx`

**Skeletons:** `components/skeletons/`

- `SkeletonCalendar.tsx`

---

# 6. Cache Integration

- Add new cache key type: `{ type: 'calendar', projectId }`
- Follow existing invalidate + refresh pattern
- No `router.refresh()`

---

# 7. Navigation

**Update:** `components/context/ContextTabBar.tsx`

Add tab:

- `{ slug: 'calendar', labelKey: 'context.calendar', icon: Calendar }`

**Translation key:**

- `context.calendar` = "Calendar"

---

# 8. Validation

**Create:** `lib/validation/calendar.ts`

**Rules:**

- Title required
- `start_at` required
- `end_at` >= `start_at` when present
- Valid enum values
- Safe date parsing

---

# 9. Non-Goals (This Version)

- No Google Calendar sync
- No iOS Calendar sync
- No recurring events
- No email/SMS reminders
- No push notifications

---

# 10. Design Principles

- Calendar is a lens, not a second source of truth
- No duplication of due dates
- All writes go to canonical tables
- Server-first architecture
- Explicit queries only
- No client Supabase
- No spinners (skeleton only)
- Path-based revalidation only
