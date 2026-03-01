/**
 * Calendar validation: events and feed range.
 * - Title required, trimmed
 * - start_at required, valid ISO
 * - end_at >= start_at when present
 * - event_type / status: valid enums
 * - Feed range: max 42 days (month view)
 */

const TITLE_MIN = 1;
const TITLE_MAX = 500;
const MAX_FEED_DAYS = 42;

export const CALENDAR_EVENT_TYPES = [
  'meeting',
  'site_visit',
  'inspection',
  'reminder',
  'focus_block',
  'other',
] as const;

export const CALENDAR_EVENT_STATUSES = [
  'scheduled',
  'done',
  'cancelled',
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];
export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number];

function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function validateCalendarEventTitle(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < TITLE_MIN) return { ok: false, error: 'Title is required' };
  if (s.length > TITLE_MAX) return { ok: false, error: 'Title is too long' };
  return { ok: true, value: s };
}

export function validateCalendarEventType(
  value: unknown
): { ok: true; value: CalendarEventType } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!CALENDAR_EVENT_TYPES.includes(s as CalendarEventType))
    return { ok: false, error: 'Invalid event type' };
  return { ok: true, value: s as CalendarEventType };
}

export function validateCalendarEventStatus(
  value: unknown
): { ok: true; value: CalendarEventStatus } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!CALENDAR_EVENT_STATUSES.includes(s as CalendarEventStatus))
    return { ok: false, error: 'Invalid status' };
  return { ok: true, value: s as CalendarEventStatus };
}

export function validateStartAt(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const d = parseDate(value);
  if (!d) return { ok: false, error: 'Valid start date/time is required' };
  return { ok: true, value: d.toISOString() };
}

export function validateEndAt(
  value: unknown,
  startAt: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null };
  const d = parseDate(value);
  if (!d) return { ok: false, error: 'Invalid end date/time' };
  const start = new Date(startAt);
  if (d.getTime() < start.getTime())
    return { ok: false, error: 'End must be after start' };
  return { ok: true, value: d.toISOString() };
}

/** Clamp feed range to max 42 days; returns { start, end } as ISO date strings (YYYY-MM-DD). */
export function clampFeedRange(
  start: string,
  end: string
): { start: string; end: string } {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) {
    const today = toISODate(new Date());
    return { start: today, end: today };
  }
  if (endDate.getTime() < startDate.getTime()) {
    const s = toISODate(startDate);
    return { start: s, end: s };
  }
  const startStr = toISODate(startDate);
  const endStr = toISODate(endDate);
  const days =
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
  if (days <= MAX_FEED_DAYS) return { start: startStr, end: endStr };
  const clampedEnd = new Date(startDate);
  clampedEnd.setDate(clampedEnd.getDate() + MAX_FEED_DAYS - 1);
  return { start: startStr, end: toISODate(clampedEnd) };
}

export function validateFeedRange(
  start: string,
  end: string
):
  | {
      ok: true;
      start: string;
      end: string;
    }
  | {
      ok: false;
      error: string;
    } {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate) return { ok: false, error: 'Valid start date is required' };
  if (!endDate) return { ok: false, error: 'Valid end date is required' };
  if (endDate.getTime() < startDate.getTime())
    return { ok: false, error: 'End date must be >= start date' };
  const { start: s, end: e } = clampFeedRange(
    startDate.toISOString().slice(0, 10),
    endDate.toISOString().slice(0, 10)
  );
  return { ok: true, start: s, end: e };
}
