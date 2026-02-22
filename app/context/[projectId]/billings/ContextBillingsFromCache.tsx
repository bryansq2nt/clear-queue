'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBillingsByProjectId } from '@/app/actions/billings';
import { SkeletonBillings } from '@/components/skeletons/SkeletonBillings';
import { useContextDataCache } from '../../ContextDataCache';
import ContextBillingsClient from './ContextBillingsClient';

type BillingWithRelations = Awaited<
  ReturnType<typeof getBillingsByProjectId>
>[number];

interface ContextBillingsFromCacheProps {
  projectId: string;
}

export default function ContextBillingsFromCache({
  projectId,
}: ContextBillingsFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<BillingWithRelations[]>({
    type: 'billings',
    projectId,
  });
  const [billings, setBillings] = useState<BillingWithRelations[] | null>(
    cached ?? null
  );
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'billings', projectId });
    const data = await getBillingsByProjectId(projectId);
    cache.set({ type: 'billings', projectId }, data as BillingWithRelations[]);
    setBillings(data as BillingWithRelations[]);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setBillings(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBillingsByProjectId(projectId).then((data) => {
      if (cancelled) return;
      const list = data as BillingWithRelations[];
      cache.set({ type: 'billings', projectId }, list);
      setBillings(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || billings === null) {
    return <SkeletonBillings />;
  }

  return (
    <ContextBillingsClient
      projectId={projectId}
      initialBillings={billings}
      onRefresh={loadData}
    />
  );
}
