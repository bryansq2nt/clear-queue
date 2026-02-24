'use client';

import { useCallback, useEffect, useState } from 'react';
import { getDocuments } from '@/app/actions/documents';
import type { Database } from '@/lib/supabase/types';
import { SkeletonDocuments } from '@/components/skeletons/SkeletonDocuments';
import { useContextDataCache } from '../../ContextDataCache';
import ContextDocumentsClient from './ContextDocumentsClient';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

interface ContextDocumentsFromCacheProps {
  projectId: string;
}

export default function ContextDocumentsFromCache({
  projectId,
}: ContextDocumentsFromCacheProps) {
  const cache = useContextDataCache();
  const cached = cache.get<ProjectFile[]>({ type: 'documents', projectId });
  const [documents, setDocuments] = useState<ProjectFile[] | null>(
    cached ?? null
  );
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'documents', projectId });
    const data = await getDocuments(projectId);
    cache.set({ type: 'documents', projectId }, data);
    setDocuments(data);
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setDocuments(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDocuments(projectId).then((data) => {
      if (cancelled) return;
      cache.set({ type: 'documents', projectId }, data);
      setDocuments(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading || documents === null) {
    return <SkeletonDocuments />;
  }

  return (
    <ContextDocumentsClient
      projectId={projectId}
      initialDocuments={documents}
      onRefresh={loadData}
    />
  );
}
