'use client';

import type { CalendarFeedItem } from '@/app/actions/calendar';
import { cn } from '@/lib/utils';
import { Calendar, FileText, Receipt, CheckSquare } from 'lucide-react';

const SOURCE_ICONS: Record<
  CalendarFeedItem['source_type'],
  React.ComponentType<{ className?: string }>
> = {
  task: Calendar,
  billing: Receipt,
  todo_item: CheckSquare,
  event: FileText,
};

const SOURCE_BADGE_CLASS: Record<CalendarFeedItem['source_type'], string> = {
  task: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  billing: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  todo_item: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
  event: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
};

interface CalendarItemRowProps {
  item: CalendarFeedItem;
  onEditEvent?: (sourceId: string) => void;
  onDeleteEvent?: (sourceId: string) => void;
}

export function CalendarItemRow({
  item,
  onEditEvent,
  onDeleteEvent,
}: CalendarItemRowProps) {
  const Icon = SOURCE_ICONS[item.source_type];
  const badgeClass = SOURCE_BADGE_CLASS[item.source_type];
  const isEvent = item.source_type === 'event';
  const canEditDelete = isEvent && onEditEvent && onDeleteEvent;

  const handleRowClick = () => {
    if (canEditDelete && onEditEvent) onEditEvent(item.source_id);
  };

  return (
    <div
      role={canEditDelete ? 'button' : undefined}
      tabIndex={canEditDelete ? 0 : undefined}
      onClick={canEditDelete ? handleRowClick : undefined}
      onKeyDown={
        canEditDelete
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRowClick();
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm',
        'hover:bg-muted/50 transition-colors',
        canEditDelete && 'cursor-pointer'
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
          badgeClass
        )}
      >
        <Icon className="h-3 w-3" />
        <span className="capitalize">{item.source_type.replace('_', ' ')}</span>
      </span>
      <span className="flex-1 truncate font-medium">{item.title}</span>
      {item.status && (
        <span className="text-muted-foreground text-xs capitalize">
          {item.status.replace('_', ' ')}
        </span>
      )}
      {item.amount != null && (
        <span className="text-muted-foreground text-xs">
          {new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: 'USD',
          }).format(Number(item.amount))}
        </span>
      )}
      {canEditDelete && (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onEditEvent(item.source_id)}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDeleteEvent(item.source_id)}
            className="text-muted-foreground hover:text-destructive text-xs"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
