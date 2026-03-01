'use client';

import { useMemo } from 'react';
import type { CalendarFeedItem } from '@/app/actions/calendar';
import type { SourceFilter } from './CalendarFilters';
import { CalendarItemRow } from './CalendarItemRow';

interface CalendarAgendaProps {
  items: CalendarFeedItem[];
  sourceFilter: SourceFilter;
  searchQuery: string;
  onEditEvent?: (sourceId: string) => void;
  onDeleteEvent?: (sourceId: string) => void;
}

function groupByDate(
  items: CalendarFeedItem[]
): Map<string, CalendarFeedItem[]> {
  const map = new Map<string, CalendarFeedItem[]>();
  for (const item of items) {
    const key = item.date_key;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const aStart = a.start_at ? new Date(a.start_at).getTime() : 0;
      const bStart = b.start_at ? new Date(b.start_at).getTime() : 0;
      return aStart - bStart;
    });
  }
  return map;
}

function formatDateKey(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dDay = new Date(d);
  dDay.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (dDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (diff === 0) return `Today — ${dateStr}`;
  if (diff === 1) return `Tomorrow — ${dateStr}`;
  if (diff === -1) return `Yesterday — ${dateStr}`;
  return dateStr;
}

export function CalendarAgenda({
  items,
  sourceFilter,
  searchQuery,
  onEditEvent,
  onDeleteEvent,
}: CalendarAgendaProps) {
  const filtered = useMemo(() => {
    let list = items;
    if (sourceFilter !== 'all') {
      list = list.filter((i) => i.source_type === sourceFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    return list;
  }, [items, sourceFilter, searchQuery]);

  const byDate = useMemo(() => groupByDate(filtered), [filtered]);
  const sortedDates = useMemo(() => {
    const keys = Array.from(byDate.keys()).sort();
    return keys;
  }, [byDate]);

  if (sortedDates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        No items in this range. Create an event or add due dates to tasks and
        billings.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((dateKey) => (
        <div key={dateKey} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground sticky top-0 bg-background py-1">
            {formatDateKey(dateKey)}
          </h3>
          <div className="space-y-2 pl-0">
            {byDate.get(dateKey)!.map((item) => (
              <CalendarItemRow
                key={`${item.source_type}-${item.source_id}`}
                item={item}
                onEditEvent={onEditEvent}
                onDeleteEvent={onDeleteEvent}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
