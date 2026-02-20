'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBoardsByProjectIdAction } from '@/app/ideas/boards/actions';
import { useContextDataCache } from '../../ContextDataCache';
import ContextIdeasClient from './ContextIdeasClient';

interface Board {
  id: string;
  name: string;
  description: string | null;
  project_id?: string | null;
}

interface ContextIdeasFromCacheProps {
  projectId: string;
}

export default function ContextIdeasFromCache({
  projectId,
}: ContextIdeasFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<Board[]>({ type: 'ideas', projectId });
  const [boards, setBoards] = useState<Board[] | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'ideas', projectId });
    const data = await getBoardsByProjectIdAction(projectId);
    cache.set({ type: 'ideas', projectId }, data);
    setBoards(data);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setBoards(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBoardsByProjectIdAction(projectId).then((data) => {
      if (cancelled) return;
      cache.set({ type: 'ideas', projectId }, data);
      setBoards(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || boards === null) {
    return (
      <div className="p-4 md:p-6 flex-1 overflow-auto flex items-center justify-center text-muted-foreground text-sm">
        Loading ideas…
      </div>
    );
  }

  return (
    <ContextIdeasClient
      projectId={projectId}
      initialBoards={boards}
      onRefresh={loadData}
    />
  );
}
