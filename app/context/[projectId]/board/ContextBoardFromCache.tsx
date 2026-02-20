'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProjectById } from '@/app/actions/projects';
import { getTasksByProjectId } from '@/app/actions/tasks';
import type { Database } from '@/lib/supabase/types';
import { SkeletonBoard } from '@/components/skeletons/SkeletonBoard';
import { useContextDataCache } from '../../ContextDataCache';
import ContextBoardClient from './ContextBoardClient';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

type BoardData = { project: Project; tasks: Task[] };

interface ContextBoardFromCacheProps {
  projectId: string;
}

/**
 * Board tab: show from cache if available, otherwise fetch once and cache.
 * Phase 3: no refetch when navigating back to this project's board.
 */
export default function ContextBoardFromCache({
  projectId,
}: ContextBoardFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<BoardData>({ type: 'board', projectId });
  const [data, setData] = useState<BoardData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'board', projectId });
    const [project, tasks] = await Promise.all([
      getProjectById(projectId),
      getTasksByProjectId(projectId),
    ]);
    if (!project) return;
    const next: BoardData = { project, tasks: tasks ?? [] };
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
    Promise.all([
      getProjectById(projectId),
      getTasksByProjectId(projectId),
    ]).then(([project, tasks]) => {
      if (cancelled) return;
      if (!project) return;
      const next: BoardData = { project, tasks: tasks ?? [] };
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
      initialTasks={data.tasks}
      onRefresh={loadData}
    />
  );
}
