# Calendar Module — Execution Plan

**Created:** 2026-02-28  
**Based on:** calendar-module-implementation-plan.md + calendar-module-plan-analysis.md

This plan incorporates analysis fixes: single RPC for feed (≤3 DB round trips), `{ data?, error? }` return shape, Sentry, and bounded date range.

---

## Phase 1 — Database & RLS

1. Create migration `supabase/migrations/YYYYMMDDHHMMSS_calendar_events.sql`:
   - Enums: `calendar_event_type_enum`, `calendar_event_status_enum`
   - Table: `calendar_events` (id, owner_id, project_id, title, description, location, event_type, status, all_day, start_at, end_at, created_at, updated_at)
   - Indexes: calendar_events (project_id, start_at), (owner_id, start_at); tasks (project_id, due_date); todo_items (owner_id, due_date)
   - Trigger: `update_updated_at_column()` on calendar_events
   - RLS: select/insert/update/delete with owner_id + optional project ownership
   - RPC: `get_project_calendar_feed(p_project_id uuid, p_start_date date, p_end_date date)` returning unified feed rows (1 DB round trip)

2. Regenerate or validate Supabase types.

**Acceptance:** Migration applies; RPC returns rows; RLS enforced.

---

## Phase 2 — Validation + Server Actions

1. Add `lib/validation/calendar.ts`: title required; start_at required; end_at >= start_at; valid enums; safe date parsing; max range 42 days.
2. Add `app/actions/calendar.ts`:
   - `getProjectCalendarFeed({ projectId, start, end })`: validate range (clamp max 42 days), call RPC, return `CalendarFeedItem[]`; wrap with `cache()`.
   - `createCalendarEvent(formData)`: validate; set owner_id from auth; insert; revalidatePath; return `{ data?, error? }`; use `captureWithContext` on error.
   - `updateCalendarEvent(id, formData)`: same pattern.
   - `deleteCalendarEvent(id)`: same pattern.

**Acceptance:** Feed respects bounds; CRUD works; mutations return `{ data, error }`; Sentry on all error paths.

---

## Phase 3 — UI Route, Cache, Components

1. Add cache key `{ type: 'calendar', projectId }` in `ContextDataCache.tsx`.
2. Create `app/context/[projectId]/calendar/page.tsx` (requireAuth, render FromCache).
3. Create `ContextCalendarFromCache.tsx`: cache get/set; on miss show SkeletonCalendar, fetch getProjectCalendarFeed, set cache, render Client with onRefresh.
4. Create `ContextCalendarClient.tsx`: agenda list by date_key; source badges; filters (source type, search); Create event dialog; Edit/delete event.
5. Create `components/context/calendar/`: CalendarAgenda, CalendarItemRow, CalendarFilters, CreateEventDialog.
6. Create `components/skeletons/SkeletonCalendar.tsx`.

**Acceptance:** Route renders; agenda shows feed; create/edit/delete event updates UI via onRefresh; skeleton on load.

---

## Phase 4 — Tab & i18n

1. Add Calendar tab in `ContextTabBar.tsx`: `{ slug: 'calendar', labelKey: 'context.calendar', icon: Calendar }`.
2. Add `context.calendar` to locales (en + es).

**Acceptance:** Tab appears; label translates; navigation works.
