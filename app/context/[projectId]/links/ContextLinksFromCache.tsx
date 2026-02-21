'use client';

import { useCallback, useEffect, useState } from 'react';
import { listProjectLinksAction } from './actions';
import type { Database } from '@/lib/supabase/types';
import { SkeletonLinks } from '@/components/skeletons/SkeletonLinks';
import { useContextDataCache } from '../../ContextDataCache';
import ContextLinksClient from './ContextLinksClient';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];

interface ContextLinksFromCacheProps {
  projectId: string;
}

export default function ContextLinksFromCache({
  projectId,
}: ContextLinksFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<ProjectLinkRow[]>({ type: 'links', projectId });
  const [links, setLinks] = useState<ProjectLinkRow[] | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'links', projectId });
    const data = await listProjectLinksAction(projectId);
    cache.set({ type: 'links', projectId }, data);
    setLinks(data);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setLinks(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listProjectLinksAction(projectId).then((data) => {
      if (cancelled) return;
      cache.set({ type: 'links', projectId }, data);
      setLinks(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || links === null) {
    return <SkeletonLinks />;
  }

  return (
    <ContextLinksClient
      projectId={projectId}
      initialLinks={links}
      onRefresh={loadData}
    />
  );
}
