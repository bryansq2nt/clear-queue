'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  CalendarFeedItem,
  CalendarPermissions,
} from '@/app/actions/calendar';
import { deleteCalendarEvent } from '@/app/actions/calendar';
import { CalendarMonthGrid } from '@/components/context/calendar/CalendarMonthGrid';
import { CalendarDayDialog } from '@/components/context/calendar/CalendarDayDialog';
import {
  CalendarFilters,
  type SourceFilter,
} from '@/components/context/calendar/CalendarFilters';
import { CreateEventDialog } from '@/components/context/calendar/CreateEventDialog';

interface ContextCalendarClientProps {
  projectId: string;
  initialItems: CalendarFeedItem[];
  start: string;
  end: string;
  permissions: CalendarPermissions;
  onRefresh?: () => void | Promise<void>;
  onLoadMonth?: (year: number, month: number) => void | Promise<void>;
}

export default function ContextCalendarClient({
  projectId,
  initialItems,
  start,
  end,
  permissions,
  onRefresh,
  onLoadMonth,
}: ContextCalendarClientProps) {
  const [items, setItems] = useState<CalendarFeedItem[]>(initialItems);
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [defaultDateKeyForCreate, setDefaultDateKeyForCreate] = useState<
    string | null
  >(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
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

  const itemsForSelectedDay = useMemo(() => {
    if (!selectedDateKey) return [];
    return filteredItems.filter((i) => i.date_key === selectedDateKey);
  }, [filteredItems, selectedDateKey]);

  const handleDayClick = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
    setDayDialogOpen(true);
  }, []);

  const handlePrevMonth = useCallback(() => {
    const d = new Date(viewYear, viewMonth - 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    onLoadMonth?.(d.getFullYear(), d.getMonth());
  }, [viewYear, viewMonth, onLoadMonth]);

  const handleNextMonth = useCallback(() => {
    const d = new Date(viewYear, viewMonth + 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    onLoadMonth?.(d.getFullYear(), d.getMonth());
  }, [viewYear, viewMonth, onLoadMonth]);

  const handleRefresh = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const handleEditEvent = useCallback((sourceId: string) => {
    setDayDialogOpen(false);
    setEditingEventId(sourceId);
  }, []);

  const handleDeleteEvent = useCallback(
    async (sourceId: string) => {
      if (!confirm('Delete this event?')) return;
      const result = await deleteCalendarEvent(sourceId);
      if (result.error) {
        setMutationError(result.error);
        return;
      }
      setMutationError(null);
      handleRefresh();
    },
    [handleRefresh]
  );

  const handleAddEventForDay = useCallback((dateKey: string) => {
    setDefaultDateKeyForCreate(dateKey);
    setDayDialogOpen(false);
    setCreateOpen(true);
  }, []);

  const handleCreateOpenChange = useCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open) setDefaultDateKeyForCreate(null);
  }, []);

  const handleCreateSuccess = useCallback(() => {
    setCreateOpen(false);
    setDefaultDateKeyForCreate(null);
    handleRefresh();
  }, [handleRefresh]);

  const handleEditSuccess = useCallback(() => {
    setEditingEventId(null);
    handleRefresh();
  }, [handleRefresh]);

  return (
    <div className="p-4 md:p-6 min-h-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <CalendarFilters
          items={items}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />
      </div>

      {mutationError && (
        <p className="text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      )}

      <CalendarMonthGrid
        year={viewYear}
        month={viewMonth}
        items={filteredItems}
        onDayClick={handleDayClick}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      <CalendarDayDialog
        open={dayDialogOpen}
        onOpenChange={setDayDialogOpen}
        dateKey={selectedDateKey ?? ''}
        items={itemsForSelectedDay}
        onAddEvent={permissions.canCreate ? handleAddEventForDay : undefined}
        onEditEvent={permissions.canUpdate ? handleEditEvent : undefined}
        onDeleteEvent={permissions.canDelete ? handleDeleteEvent : undefined}
      />

      {permissions.canCreate && (
        <CreateEventDialog
          open={createOpen}
          onOpenChange={handleCreateOpenChange}
          projectId={projectId}
          defaultDateKey={defaultDateKeyForCreate}
          onSuccess={handleCreateSuccess}
          onError={setMutationError}
        />
      )}

      {permissions.canUpdate && (
        <CreateEventDialog
          open={editingEventId !== null}
          onOpenChange={(open) => !open && setEditingEventId(null)}
          projectId={projectId}
          eventId={editingEventId}
          onSuccess={handleEditSuccess}
          onError={setMutationError}
        />
      )}
    </div>
  );
}
