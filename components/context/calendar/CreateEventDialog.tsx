'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  createCalendarEvent,
  updateCalendarEvent,
  getCalendarEvent,
} from '@/app/actions/calendar';
import type {
  CalendarEventType,
  CalendarEventStatus,
} from '@/lib/validation/calendar';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_STATUSES,
} from '@/lib/validation/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePickerCalendar } from './DatePickerCalendar';
import { Calendar } from 'lucide-react';

function formatDisplayDate(dateKey: string, allDay: boolean): string {
  const d = new Date(dateKey + 'T12:00:00');
  if (allDay) {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** When set, dialog is in edit mode and loads this event. */
  eventId?: string | null;
  /** When set and not editing, pre-fill start and end date (YYYY-MM-DD). */
  defaultDateKey?: string | null;
  onSuccess: () => void;
  onError?: (message: string) => void;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  projectId,
  eventId,
  defaultDateKey,
  onSuccess,
  onError,
}: CreateEventDialogProps) {
  const { t } = useI18n();
  const isEdit = Boolean(eventId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('meeting');
  const [status, setStatus] = useState<CalendarEventStatus>('scheduled');
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('17:00');
  const [calendarOpen, setCalendarOpen] = useState<'start' | 'end' | null>(
    null
  );
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (open && eventId) {
      setLoadError(null);
      getCalendarEvent(eventId).then(({ data, error }) => {
        if (error) {
          setLoadError(error);
          return;
        }
        if (data) {
          setTitle(data.title);
          setDescription(data.description || '');
          setLocation(data.location || '');
          setEventType(data.event_type);
          setStatus(data.status);
          setAllDay(data.all_day);
          const start = new Date(data.start_at);
          const pad = (n: number) => String(n).padStart(2, '0');
          setStartDate(
            `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
          );
          setStartTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
          if (data.end_at) {
            const end = new Date(data.end_at);
            setEndDate(
              `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
            );
            setEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
          } else {
            setEndDate('');
            setEndTime('17:00');
          }
        }
      });
    }
  }, [open, eventId]);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setLocation('');
      setEventType('meeting');
      setStatus('scheduled');
      setAllDay(false);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setStartDate(
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      );
      setStartTime('09:00');
      setEndDate('');
      setEndTime('17:00');
      setCalendarOpen(null);
      setLoadError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && !eventId && defaultDateKey) {
      setStartDate(defaultDateKey);
      setEndDate(defaultDateKey);
    }
  }, [open, eventId, defaultDateKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const startIso = `${startDate}T${allDay ? '00:00' : startTime}:00`;
    const endIso = endDate
      ? `${endDate}T${allDay ? '23:59' : endTime}:00`
      : null;

    if (isEdit && eventId) {
      const result = await updateCalendarEvent(eventId, {
        title,
        description: description || null,
        location: location || null,
        event_type: eventType,
        status,
        all_day: allDay,
        start_at: new Date(startIso).toISOString(),
        end_at: endIso ? new Date(endIso).toISOString() : null,
      });
      setLoading(false);
      if (result.error) {
        onError?.(result.error);
        return;
      }
    } else {
      const result = await createCalendarEvent(projectId, {
        title,
        description: description || null,
        location: location || null,
        event_type: eventType,
        status,
        all_day: allDay,
        start_at: new Date(startIso).toISOString(),
        end_at: endIso ? new Date(endIso).toISOString() : null,
      });
      setLoading(false);
      if (result.error) {
        onError?.(result.error);
        return;
      }
    }
    onOpenChange(false);
    onSuccess();
  }

  const handleCalendarSelect = (dateKey: string) => {
    if (calendarOpen === 'start') {
      setStartDate(dateKey);
      setCalendarOpen(null);
    } else if (calendarOpen === 'end') {
      setEndDate(dateKey);
      setCalendarOpen(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('common.edit') : 'New event'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update event details.'
              : 'Add a meeting, site visit, or other event.'}
          </DialogDescription>
        </DialogHeader>
        {loadError && (
          <p className="text-sm text-destructive" role="alert">
            {loadError}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title, Type, Status, Dates first */}
          <div>
            <Label htmlFor="cal-event-title">Title</Label>
            <Input
              id="cal-event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cal-event-type">Type</Label>
            <Select
              value={eventType}
              onValueChange={(v) => setEventType(v as CalendarEventType)}
            >
              <SelectTrigger id="cal-event-type" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALENDAR_EVENT_TYPES.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cal-event-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CalendarEventStatus)}
            >
              <SelectTrigger id="cal-event-status" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALENDAR_EVENT_STATUSES.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="cal-event-allday"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded border-input"
            />
            <Label htmlFor="cal-event-allday">All day</Label>
          </div>
          <div>
            <Label>Start</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 justify-start gap-2"
                onClick={() => {
                  setCalYear(
                    startDate
                      ? new Date(startDate + 'T12:00:00').getFullYear()
                      : new Date().getFullYear()
                  );
                  setCalMonth(
                    startDate
                      ? new Date(startDate + 'T12:00:00').getMonth()
                      : new Date().getMonth()
                  );
                  setCalendarOpen('start');
                }}
              >
                <Calendar className="h-4 w-4" />
                {startDate ? formatDisplayDate(startDate, allDay) : 'Pick date'}
              </Button>
              {!allDay && (
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-28"
                />
              )}
            </div>
          </div>
          <div>
            <Label>End (optional)</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 justify-start gap-2"
                onClick={() => {
                  setCalYear(
                    endDate
                      ? new Date(endDate + 'T12:00:00').getFullYear()
                      : new Date(startDate + 'T12:00:00').getFullYear()
                  );
                  setCalMonth(
                    endDate
                      ? new Date(endDate + 'T12:00:00').getMonth()
                      : new Date(startDate + 'T12:00:00').getMonth()
                  );
                  setCalendarOpen('end');
                }}
              >
                <Calendar className="h-4 w-4" />
                {endDate ? formatDisplayDate(endDate, allDay) : 'Pick date'}
              </Button>
              {!allDay && (
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-28"
                />
              )}
            </div>
          </div>

          {/* Description and Location at the end */}
          <div>
            <Label htmlFor="cal-event-desc">Description (optional)</Label>
            <Textarea
              id="cal-event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cal-event-location">Location (optional)</Label>
            <Input
              id="cal-event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Inline calendar picker when "Pick date" is opened */}
          {calendarOpen && (
            <div className="rounded-lg border border-border bg-muted/30 p-2">
              <DatePickerCalendar
                year={calYear}
                month={calMonth}
                value={calendarOpen === 'start' ? startDate : endDate}
                onSelect={handleCalendarSelect}
                onPrevMonth={() => {
                  const d = new Date(calYear, calMonth - 1);
                  setCalYear(d.getFullYear());
                  setCalMonth(d.getMonth());
                }}
                onNextMonth={() => {
                  const d = new Date(calYear, calMonth + 1);
                  setCalYear(d.getFullYear());
                  setCalMonth(d.getMonth());
                }}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
