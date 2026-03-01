'use client';

import type { CalendarFeedItem } from '@/app/actions/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CalendarItemRow } from './CalendarItemRow';

function formatDayHeader(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dDay = new Date(d);
  dDay.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (dDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  if (diff === 0) return `Today — ${dateStr}`;
  if (diff === 1) return `Tomorrow — ${dateStr}`;
  if (diff === -1) return `Yesterday — ${dateStr}`;
  return dateStr;
}

interface CalendarDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateKey: string;
  items: CalendarFeedItem[];
  onAddEvent?: (dateKey: string) => void;
  onEditEvent?: (sourceId: string) => void;
  onDeleteEvent?: (sourceId: string) => void;
}

export function CalendarDayDialog({
  open,
  onOpenChange,
  dateKey,
  items,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}: CalendarDayDialogProps) {
  const sorted = [...items].sort((a, b) => {
    const aStart = a.start_at ? new Date(a.start_at).getTime() : 0;
    const bStart = b.start_at ? new Date(b.start_at).getTime() : 0;
    return aStart - bStart;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {formatDayHeader(dateKey)}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto space-y-2 pr-2">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-muted-foreground text-sm text-center">
                No events this day.
              </p>
              {onAddEvent && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onAddEvent(dateKey)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add event
                </Button>
              )}
            </div>
          ) : (
            sorted.map((item) => (
              <CalendarItemRow
                key={`${item.source_type}-${item.source_id}`}
                item={item}
                onEditEvent={onEditEvent}
                onDeleteEvent={onDeleteEvent}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
