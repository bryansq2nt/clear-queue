'use client';

import { useState, useCallback, useEffect } from 'react';
import type { CalendarFeedItem } from '@/app/actions/calendar';
import { deleteCalendarEvent } from '@/app/actions/calendar';
import { CalendarAgenda } from '@/components/context/calendar/CalendarAgenda';
import {
  CalendarFilters,
  type SourceFilter,
} from '@/components/context/calendar/CalendarFilters';
import { CreateEventDialog } from '@/components/context/calendar/CreateEventDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface ContextCalendarClientProps {
  projectId: string;
  initialItems: CalendarFeedItem[];
  start: string;
  end: string;
  onRefresh?: () => void | Promise<void>;
}

export default function ContextCalendarClient({
  projectId,
  initialItems,
  start,
  end,
  onRefresh,
}: ContextCalendarClientProps) {
  const [items, setItems] = useState<CalendarFeedItem[]>(initialItems);
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const handleEditEvent = useCallback((sourceId: string) => {
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

  const handleCreateSuccess = useCallback(() => {
    setCreateOpen(false);
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
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New event
        </Button>
      </div>

      {mutationError && (
        <p className="text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      )}

      <CalendarAgenda
        items={items}
        sourceFilter={sourceFilter}
        searchQuery={searchQuery}
        onEditEvent={handleEditEvent}
        onDeleteEvent={handleDeleteEvent}
      />

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onSuccess={handleCreateSuccess}
        onError={setMutationError}
      />

      <CreateEventDialog
        open={editingEventId !== null}
        onOpenChange={(open) => !open && setEditingEventId(null)}
        projectId={projectId}
        eventId={editingEventId}
        onSuccess={handleEditSuccess}
        onError={setMutationError}
      />
    </div>
  );
}
