'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getBillingsByProjectId,
  getBillingCategories,
  type BillingWithRelations,
  type BillingCategory,
} from '@/app/actions/billings';
import { getClients } from '@/app/actions/clients';
import { SkeletonBillings } from '@/components/skeletons/SkeletonBillings';
import { useContextDataCache } from '../../ContextDataCache';
import ContextBillingsClient from './ContextBillingsClient';

interface Client {
  id: string;
  full_name: string;
}

interface ContextBillingsFromCacheProps {
  projectId: string;
  projectClientId?: string | null;
}

export default function ContextBillingsFromCache({
  projectId,
  projectClientId,
}: ContextBillingsFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<BillingWithRelations[]>({
    type: 'billings',
    projectId,
  });
  const [billings, setBillings] = useState<BillingWithRelations[] | null>(
    cached ?? null
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'billings', projectId });
    const [data, cats] = await Promise.all([
      getBillingsByProjectId(projectId),
      getBillingCategories(),
    ]);
    cache.set({ type: 'billings', projectId }, data);
    setBillings(data);
    setCategories(cats);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setBillings(cached);
      setLoading(false);
      // Still fetch categories + clients eagerly (fast, cached server-side)
      Promise.all([getBillingCategories(), getClients()]).then(
        ([cats, cls]) => {
          setCategories(cats);
          setClients(cls as Client[]);
        }
      );
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getBillingsByProjectId(projectId),
      getBillingCategories(),
      getClients(),
    ]).then(([data, cats, cls]) => {
      if (cancelled) return;
      cache.set({ type: 'billings', projectId }, data);
      setBillings(data);
      setCategories(cats);
      setClients(cls as Client[]);
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
      initialClients={clients}
      initialCategories={categories}
      projectClientId={projectClientId ?? null}
      onRefresh={loadData}
    />
  );
}
