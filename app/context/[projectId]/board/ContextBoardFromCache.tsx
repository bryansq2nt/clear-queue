'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getBoardInitialData,
  type BoardPermissions,
} from '@/app/actions/tasks';
import type { BoardInitialData } from '@/lib/board';
import type { TaskAssignee } from '@/components/board/AddTaskModal';
import { SkeletonBoard } from '@/components/skeletons/SkeletonBoard';
import { useContextDataCache } from '../../ContextDataCache';
import ContextBoardClient from './ContextBoardClient';

interface ContextBoardFromCacheProps {
  projectId: string;
  permissions: BoardPermissions;
  projectMembers?: TaskAssignee[];
  currentUserId?: string;
}

/**
 * Board tab: show from cache if available, otherwise fetch once and cache.
 * Uses paginated initial data (max 5 tasks per column) and optional "Ver más" per column.
 */
export default function ContextBoardFromCache({
  projectId,
  permissions,
  projectMembers,
  currentUserId,
}: ContextBoardFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<BoardInitialData>({ type: 'board', projectId });

  // If the cached data was fetched under a different read scope (e.g. the
  // member's permissions were tightened since the last visit), discard it so
  // we re-fetch with the current scope.
  const cachedValid =
    cached && cached.readScope === permissions.readScope ? cached : null;

  const [data, setData] = useState<BoardInitialData | null>(
    cachedValid ?? null
  );
  const [loading, setLoading] = useState(!cachedValid);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'board', projectId });
    const next = await getBoardInitialData(projectId);
    if (!next) return;
    cache.set({ type: 'board', projectId }, next);
    setData(next);
  }, [projectId, cache]);

  useEffect(() => {
    if (cachedValid) {
      setData(cachedValid);
      setLoading(false);
      return;
    }
    // Cache miss or stale scope — always invalidate before re-fetching so we
    // don't serve the old (wrong-scope) entry to the next navigation.
    cache.invalidate({ type: 'board', projectId });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading || !data) {
    return <SkeletonBoard />;
  }

  return (
    <ContextBoardClient
      projectId={projectId}
      initialProject={data.project}
      initialCounts={data.counts}
      initialTasksByStatus={data.tasksByStatus}
      permissions={permissions}
      onRefresh={loadData}
      projectMembers={projectMembers}
      currentUserId={currentUserId}
    />
  );
}
