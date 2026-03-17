'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  CalendarFeedItem,
  CalendarPermissions,
} from '@/app/actions/calendar';
import {
  deleteCalendarEvent,
  getProjectCalendarFeed,
} from '@/app/actions/calendar';
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
}

function getMonthRangeFor(
  year: number,
  month: number
): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const s = new Date(year, month, 1);
  const e = new Date(year, month + 1, 0);
  return {
    start: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
    end: `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`,
  };
}

export default function ContextCalendarClient({
  projectId,
  initialItems,
  start: _start,
  end: _end,
  permissions,
}: ContextCalendarClientProps) {
  const [items, setItems] = useState<CalendarFeedItem[]>(initialItems);
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // ── Realtime subscription slot (empty until Realtime phase) ───────────────
  // useEffect(() => {
  //   const channel = supabase
  //     .channel(`calendar:${projectId}`)
  //     .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events',
  //         filter: `project_id=eq.${projectId}` },
  //       (payload) => { /* reconcile setItems */ })
  //     .subscribe();
  //   return () => { supabase.removeChannel(channel); };
  // }, [projectId]);
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

  const loadMonthItems = useCallback(
    async (year: number, month: number) => {
      const range = getMonthRangeFor(year, month);
      const result = await getProjectCalendarFeed({
        projectId,
        start: range.start,
        end: range.end,
      });
      setItems(result);
    },
    [projectId]
  );

  const handlePrevMonth = useCallback(() => {
    const d = new Date(viewYear, viewMonth - 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    void loadMonthItems(d.getFullYear(), d.getMonth());
  }, [viewYear, viewMonth, loadMonthItems]);

  const handleNextMonth = useCallback(() => {
    const d = new Date(viewYear, viewMonth + 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    void loadMonthItems(d.getFullYear(), d.getMonth());
  }, [viewYear, viewMonth, loadMonthItems]);

  const handleRefresh = useCallback(() => {
    void loadMonthItems(viewYear, viewMonth);
  }, [loadMonthItems, viewYear, viewMonth]);

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
