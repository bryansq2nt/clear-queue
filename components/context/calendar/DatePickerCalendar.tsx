'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DatePickerCalendarProps {
  year: number;
  month: number;
  value: string | null;
  onSelect: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  className?: string;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

function getPaddingStart(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DatePickerCalendar({
  year,
  month,
  value,
  onSelect,
  onPrevMonth,
  onNextMonth,
  className,
}: DatePickerCalendarProps) {
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const paddingStart = useMemo(
    () => getPaddingStart(year, month),
    [year, month]
  );
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const monthTitle = useMemo(
    () =>
      new Date(year, month).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [year, month]
  );

  return (
    <div
      className={cn('rounded-lg border border-border bg-card p-2', className)}
    >
      <div className="flex items-center justify-between px-1 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold capitalize">{monthTitle}</span>
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
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="py-1 font-medium">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: paddingStart }, (_, i) => (
          <div key={`pad-${i}`} className="aspect-square w-8" />
        ))}
        {days.map((d) => {
          const dateKey = toDateKey(d);
          const isSelected = value === dateKey;
          const isToday = dateKey === todayKey;
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelect(dateKey)}
              className={cn(
                'aspect-square w-8 rounded-md text-sm transition-colors',
                'hover:bg-accent flex items-center justify-center',
                isSelected &&
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                isToday && !isSelected && 'ring-1 ring-primary'
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
