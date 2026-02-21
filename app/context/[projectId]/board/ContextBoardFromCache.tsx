'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBoardInitialData } from '@/app/actions/tasks';
import type { BoardInitialData } from '@/lib/board';
import { SkeletonBoard } from '@/components/skeletons/SkeletonBoard';
import { useContextDataCache } from '../../ContextDataCache';
import ContextBoardClient from './ContextBoardClient';

interface ContextBoardFromCacheProps {
  projectId: string;
}

/**
 * Board tab: show from cache if available, otherwise fetch once and cache.
 * Uses paginated initial data (max 5 tasks per column) and optional "Ver más" per column.
 */
export default function ContextBoardFromCache({
  projectId,
}: ContextBoardFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<BoardInitialData>({ type: 'board', projectId });
  const [data, setData] = useState<BoardInitialData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'board', projectId });
    const next = await getBoardInitialData(projectId);
    if (!next) return;
    cache.set({ type: 'board', projectId }, next);
    setData(next);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBoardInitialData(projectId).then((next) => {
      if (cancelled) return;
      if (!next) return;
      cache.set({ type: 'board', projectId }, next);
      setData(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || !data) {
    return <SkeletonBoard />;
  }

  return (
    <ContextBoardClient
      projectId={projectId}
      initialProject={data.project}
      initialCounts={data.counts}
      initialTasksByStatus={data.tasksByStatus}
      onRefresh={loadData}
    />
  );
}
