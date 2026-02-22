'use client';

import { useCallback, useEffect, useState } from 'react';
import { getNotes } from '@/app/actions/notes';
import type { Database } from '@/lib/supabase/types';
import { SkeletonNotes } from '@/components/skeletons/SkeletonNotes';
import { useContextDataCache } from '../../ContextDataCache';
import ContextNotesClient from './ContextNotesClient';

type Note = Database['public']['Tables']['notes']['Row'];

interface ContextNotesFromCacheProps {
  projectId: string;
}

export default function ContextNotesFromCache({
  projectId,
}: ContextNotesFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<Note[]>({ type: 'notes', projectId });
  const [notes, setNotes] = useState<Note[] | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'notes', projectId });
    const data = await getNotes({ projectId });
    cache.set({ type: 'notes', projectId }, data);
    setNotes(data);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setNotes(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getNotes({ projectId }).then((data) => {
      if (cancelled) return;
      cache.set({ type: 'notes', projectId }, data);
      setNotes(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || notes === null) {
    return <SkeletonNotes />;
  }

  return (
    <ContextNotesClient
      projectId={projectId}
      initialNotes={notes}
      onRefresh={loadData}
    />
  );
}
