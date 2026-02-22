'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBudgetsByProjectId } from '@/app/actions/budgets';
import { SkeletonBudgets } from '@/components/skeletons/SkeletonBudgets';
import { useContextDataCache } from '../../ContextDataCache';
import ContextBudgetsClient from './ContextBudgetsClient';

type BudgetWithProject = Awaited<
  ReturnType<typeof getBudgetsByProjectId>
>[number];

interface ContextBudgetsFromCacheProps {
  projectId: string;
}

export default function ContextBudgetsFromCache({
  projectId,
}: ContextBudgetsFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<BudgetWithProject[]>({ type: 'budgets', projectId });
  const [budgets, setBudgets] = useState<BudgetWithProject[] | null>(
    cached ?? null
  );
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'budgets', projectId });
    const data = await getBudgetsByProjectId(projectId);
    cache.set({ type: 'budgets', projectId }, data as BudgetWithProject[]);
    setBudgets(data as BudgetWithProject[]);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setBudgets(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBudgetsByProjectId(projectId).then((data) => {
      if (cancelled) return;
      const list = data as BudgetWithProject[];
      cache.set({ type: 'budgets', projectId }, list);
      setBudgets(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || budgets === null) {
    return <SkeletonBudgets />;
  }

  return (
    <ContextBudgetsClient
      projectId={projectId}
      initialBudgets={budgets}
      onRefresh={loadData}
    />
  );
}
