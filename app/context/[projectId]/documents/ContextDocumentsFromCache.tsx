'use client';

import { useCallback, useEffect, useState } from 'react';
import { getDocuments } from '@/app/actions/documents';
import { listFolders } from '@/app/actions/document-folders';
import type { Database } from '@/lib/supabase/types';
import { SkeletonDocuments } from '@/components/skeletons/SkeletonDocuments';
import { useContextDataCache } from '../../ContextDataCache';
import ContextDocumentsClient from './ContextDocumentsClient';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];
type DocumentFolder =
  Database['public']['Tables']['project_document_folders']['Row'];

interface ContextDocumentsFromCacheProps {
  projectId: string;
}

export default function ContextDocumentsFromCache({
  projectId,
}: ContextDocumentsFromCacheProps) {
  const cache = useContextDataCache();
  const cachedDocs = cache.get<ProjectFile[]>({ type: 'documents', projectId });
  const cachedFolders = cache.get<DocumentFolder[]>({
    type: 'documentFolders',
    projectId,
  });
  const [documents, setDocuments] = useState<ProjectFile[] | null>(
    cachedDocs ?? null
  );
  const [folders, setFolders] = useState<DocumentFolder[] | null>(
    cachedFolders !== undefined ? cachedFolders : null
  );
  const [loading, setLoading] = useState(
    !cachedDocs || cachedFolders === undefined
  );

  /** Background refresh: fetch and update cache + state without invalidating. */
  const loadData = useCallback(async () => {
    const [data, folderList] = await Promise.all([
      getDocuments(projectId),
      listFolders(projectId),
    ]);
    cache.set({ type: 'documents', projectId }, data);
    cache.set({ type: 'documentFolders', projectId }, folderList);
    setDocuments(data);
    setFolders(folderList);
  }, [projectId, cache]);

  useEffect(() => {
    if (cachedDocs && cachedFolders !== undefined) {
      setDocuments(cachedDocs);
      setFolders(cachedFolders);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([getDocuments(projectId), listFolders(projectId)]).then(
      ([docs, folderList]) => {
        if (cancelled) return;
        cache.set({ type: 'documents', projectId }, docs);
        cache.set({ type: 'documentFolders', projectId }, folderList);
        setDocuments(docs);
        setFolders(folderList);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, cachedDocs, cachedFolders, cache]);

  if (loading || documents === null || folders === null) {
    return <SkeletonDocuments />;
  }

  return (
    <ContextDocumentsClient
      projectId={projectId}
      initialDocuments={documents}
      initialFolders={folders}
      onRefresh={loadData}
    />
  );
}
