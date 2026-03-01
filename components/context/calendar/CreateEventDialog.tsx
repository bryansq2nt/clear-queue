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

function toLocalDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** When set, dialog is in edit mode and loads this event. */
  eventId?: string | null;
  onSuccess: () => void;
  onError?: (message: string) => void;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  projectId,
  eventId,
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
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
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
          setStartAt(toLocalDateTime(data.start_at));
          setEndAt(data.end_at ? toLocalDateTime(data.end_at) : '');
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
      setStartAt(
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T09:00`
      );
      setEndAt('');
      setLoadError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const startIso = new Date(startAt).toISOString();
    const endIso = endAt ? new Date(endAt).toISOString() : null;

    if (isEdit && eventId) {
      const result = await updateCalendarEvent(eventId, {
        title,
        description: description || null,
        location: location || null,
        event_type: eventType,
        status,
        all_day: allDay,
        start_at: startIso,
        end_at: endIso,
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
        start_at: startIso,
        end_at: endIso,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
            <Label htmlFor="cal-event-start">Start</Label>
            <Input
              id="cal-event-start"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? startAt.slice(0, 10) : startAt}
              onChange={(e) =>
                setStartAt(allDay ? `${e.target.value}T00:00` : e.target.value)
              }
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cal-event-end">End (optional)</Label>
            <Input
              id="cal-event-end"
              type={allDay ? 'date' : 'datetime-local'}
              value={endAt ? (allDay ? endAt.slice(0, 10) : endAt) : ''}
              onChange={(e) =>
                setEndAt(
                  e.target.value
                    ? allDay
                      ? `${e.target.value}T23:59`
                      : e.target.value
                    : ''
                )
              }
              className="mt-1"
            />
          </div>
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
