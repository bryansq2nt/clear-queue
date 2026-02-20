'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProjectTodoBoardAction } from '@/app/todo/actions';
import type { TodoItem } from '@/lib/todo/lists';
import { SkeletonTodos } from '@/components/skeletons/SkeletonTodos';
import { useContextDataCache } from '../../ContextDataCache';
import ContextTodosClient from './ContextTodosClient';

type TodosData = {
  projectName: string;
  defaultListId: string;
  items: TodoItem[];
};

interface ContextTodosFromCacheProps {
  projectId: string;
}

export default function ContextTodosFromCache({
  projectId,
}: ContextTodosFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<TodosData>({ type: 'todos', projectId });
  const [data, setData] = useState<TodosData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'todos', projectId });
    const result = await getProjectTodoBoardAction(projectId);
    if (!result.ok) return;
    const next: TodosData = result.data;
    cache.set({ type: 'todos', projectId }, next);
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
    getProjectTodoBoardAction(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) return;
      const next: TodosData = result.data;
      cache.set({ type: 'todos', projectId }, next);
      setData(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || !data) {
    return <SkeletonTodos />;
  }

  return (
    <ContextTodosClient
      projectId={projectId}
      initialProjectName={data.projectName}
      initialDefaultListId={data.defaultListId}
      initialItems={data.items}
    />
  );
}
