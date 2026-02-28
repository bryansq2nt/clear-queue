'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMedia } from '@/app/actions/media';
import { MEDIA_PAGE_SIZE } from '@/lib/validation/project-media';
import type { Database } from '@/lib/supabase/types';
import { SkeletonMedia } from '@/components/skeletons/SkeletonMedia';
import { useContextDataCache } from '../../ContextDataCache';
import ContextMediaClient from './ContextMediaClient';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

type PaginatedMediaCache = {
  items: ProjectFile[];
  hasMore: boolean;
  loadedCount: number;
};

interface ContextMediaFromCacheProps {
  projectId: string;
}

export default function ContextMediaFromCache({
  projectId,
}: ContextMediaFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<PaginatedMediaCache>({ type: 'media', projectId });

  const [media, setMedia] = useState<ProjectFile[] | null>(
    cached?.items ?? null
  );
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false);
  const [loadedCount, setLoadedCount] = useState(cached?.loadedCount ?? 0);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    const result = await getMedia(projectId, {
      offset: 0,
      limit: MEDIA_PAGE_SIZE,
    });
    const newCache: PaginatedMediaCache = {
      items: result.items,
      hasMore: result.hasMore,
      loadedCount: result.items.length,
    };
    cache.set({ type: 'media', projectId }, newCache);
    setMedia(result.items);
    setHasMore(result.hasMore);
    setLoadedCount(result.items.length);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setMedia(cached.items);
      setHasMore(cached.hasMore);
      setLoadedCount(cached.loadedCount);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMedia(projectId, { offset: 0, limit: MEDIA_PAGE_SIZE }).then(
      (result) => {
        if (cancelled) return;
        const newCache: PaginatedMediaCache = {
          items: result.items,
          hasMore: result.hasMore,
          loadedCount: result.items.length,
        };
        cache.set({ type: 'media', projectId }, newCache);
        setMedia(result.items);
        setHasMore(result.hasMore);
        setLoadedCount(result.items.length);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || media === null) {
    return <SkeletonMedia />;
  }

  return (
    <ContextMediaClient
      projectId={projectId}
      initialMedia={media}
      initialHasMore={hasMore}
      initialLoadedCount={loadedCount}
    />
  );
}
