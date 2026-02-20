'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProjectById } from '@/app/actions/projects';
import { getClientById, getBusinessById } from '@/app/clients/actions';
import type { Database } from '@/lib/supabase/types';
import { SkeletonOwner } from '@/components/skeletons/SkeletonOwner';
import { useContextDataCache } from '../../ContextDataCache';
import ContextOwnerClient from './ContextOwnerClient';

type Project = Database['public']['Tables']['projects']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Business = Database['public']['Tables']['businesses']['Row'];

type OwnerData = {
  project: Project;
  client: Client | null;
  business: Business | null;
};

interface ContextOwnerFromCacheProps {
  projectId: string;
}

export default function ContextOwnerFromCache({
  projectId,
}: ContextOwnerFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<OwnerData>({ type: 'owner', projectId });
  const [data, setData] = useState<OwnerData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'owner', projectId });
    const project = await getProjectById(projectId);
    if (!project) return;
    const [client, business] = await Promise.all([
      project.client_id
        ? getClientById(project.client_id)
        : Promise.resolve(null),
      project.business_id
        ? getBusinessById(project.business_id)
        : Promise.resolve(null),
    ]);
    const next: OwnerData = { project, client, business };
    cache.set({ type: 'owner', projectId }, next);
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
    getProjectById(projectId).then(async (project) => {
      if (cancelled) return;
      if (!project) {
        setLoading(false);
        return;
      }
      const [client, business] = await Promise.all([
        project.client_id
          ? getClientById(project.client_id)
          : Promise.resolve(null),
        project.business_id
          ? getBusinessById(project.business_id)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const next: OwnerData = { project, client, business };
      cache.set({ type: 'owner', projectId }, next);
      setData(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || !data) {
    return <SkeletonOwner />;
  }

  return (
    <ContextOwnerClient
      project={data.project}
      client={data.client}
      business={data.business}
    />
  );
}
