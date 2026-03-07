'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMilestonesWithProgress } from '@/app/actions/milestones';
import type { MilestoneWithProgress } from '@/lib/milestones/schema';
import { SkeletonMilestones } from '@/components/skeletons/SkeletonMilestones';
import { useContextDataCache } from '../../ContextDataCache';
import ContextMilestonesClient from './ContextMilestonesClient';

interface ContextMilestonesFromCacheProps {
  projectId: string;
}

export default function ContextMilestonesFromCache({
  projectId,
}: ContextMilestonesFromCacheProps) {
  const cache = useContextDataCache();
  const cacheKey = useMemo(
    () => ({ type: 'milestones' as const, projectId }),
    [projectId]
  );
  const cached = cache.get<MilestoneWithProgress[]>(cacheKey);
  const [data, setData] = useState<MilestoneWithProgress[] | null>(
    cached ?? null
  );
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate(cacheKey);
    const list = await getMilestonesWithProgress(projectId);
    cache.set(cacheKey, list);
    setData(list);
  }, [projectId, cache, cacheKey]);

  useEffect(() => {
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMilestonesWithProgress(projectId).then((list) => {
      if (cancelled) return;
      cache.set(cacheKey, list);
      setData(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache, cacheKey]);

  if (loading || data === null) {
    return <SkeletonMilestones />;
  }

  return (
    <ContextMilestonesClient
      projectId={projectId}
      initialMilestones={data}
      onRefresh={loadData}
    />
  );
}
