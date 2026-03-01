'use client';

import { useMemo } from 'react';
import type { CalendarFeedItem } from '@/app/actions/calendar';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarMonthGridProps {
  /** Current month to display (year, month 0-11) */
  year: number;
  month: number;
  items: CalendarFeedItem[];
  onDayClick: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  className?: string;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

/** Pad start so first day aligns with weekday (0 = Sunday). */
function getPaddingStart(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarMonthGrid({
  year,
  month,
  items,
  onDayClick,
  onPrevMonth,
  onNextMonth,
  className,
}: CalendarMonthGridProps) {
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarFeedItem[]>();
    for (const item of items) {
      const key = item.date_key;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const paddingStart = useMemo(
    () => getPaddingStart(year, month),
    [year, month]
  );

  const todayKey = useMemo(() => {
    const t = new Date();
    return toDateKey(t);
  }, []);

  const monthTitle = useMemo(() => {
    return new Date(year, month).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }, [year, month]);

  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold capitalize">{monthTitle}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-2">
        <div className="grid grid-cols-7 gap-px text-center text-xs text-muted-foreground">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="py-1 font-medium">
              {h}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: paddingStart }, (_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.map((d) => {
            const dateKey = toDateKey(d);
            const dayItems = itemsByDate.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onDayClick(dateKey)}
                className={cn(
                  'aspect-square rounded-md p-1 text-sm transition-colors',
                  'hover:bg-accent flex flex-col items-center justify-center gap-0.5',
                  isToday && 'bg-primary/15 font-semibold text-primary',
                  dayItems.length > 0 && 'ring-1 ring-primary/30'
                )}
              >
                <span>{d.getDate()}</span>
                {dayItems.length > 0 && (
                  <span className="flex gap-0.5">
                    {dayItems.slice(0, 3).map((_, i) => (
                      <span
                        key={i}
                        className="h-1 w-1 rounded-full bg-primary"
                        aria-hidden
                      />
                    ))}
                    {dayItems.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayItems.length - 3}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
