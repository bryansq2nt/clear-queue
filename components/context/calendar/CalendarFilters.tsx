'use client';

import { useMemo, useState } from 'react';
import type { CalendarFeedItem } from '@/app/actions/calendar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type SourceFilter = 'all' | CalendarFeedItem['source_type'];

interface CalendarFiltersProps {
  items: CalendarFeedItem[];
  sourceFilter: SourceFilter;
  onSourceFilterChange: (v: SourceFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  className?: string;
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'task', label: 'Task' },
  { value: 'billing', label: 'Billing' },
  { value: 'todo_item', label: 'To-do' },
  { value: 'event', label: 'Event' },
];

export function CalendarFilters({
  items,
  sourceFilter,
  onSourceFilterChange,
  searchQuery,
  onSearchQueryChange,
  className,
}: CalendarFiltersProps) {
  const filteredCount = useMemo(() => {
    let list = items;
    if (sourceFilter !== 'all') {
      list = list.filter((i) => i.source_type === sourceFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    return list.length;
  }, [items, sourceFilter, searchQuery]);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex flex-wrap gap-1">
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSourceFilterChange(opt.value)}
            className={cn(
              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              sourceFilter === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <Input
        type="search"
        placeholder="Search by title..."
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        className="h-9 w-48 max-w-full"
      />
      <span className="text-muted-foreground text-xs">
        {filteredCount} item{filteredCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
