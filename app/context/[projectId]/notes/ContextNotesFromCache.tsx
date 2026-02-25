'use client';

import { useCallback, useEffect, useState } from 'react';
import { getNotes } from '@/app/actions/notes';
import { listFolders } from '@/app/actions/note-folders';
import type { Database } from '@/lib/supabase/types';
import { SkeletonNotes } from '@/components/skeletons/SkeletonNotes';
import { useContextDataCache } from '../../ContextDataCache';
import ContextNotesClient from './ContextNotesClient';

type Note = Database['public']['Tables']['notes']['Row'];
type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

interface ContextNotesFromCacheProps {
  projectId: string;
}

export default function ContextNotesFromCache({
  projectId,
}: ContextNotesFromCacheProps) {
  const cache = useContextDataCache();
  const cachedNotes = cache.get<Note[]>({ type: 'notes', projectId });
  const cachedFolders = cache.get<NoteFolder[]>({
    type: 'noteFolders',
    projectId,
  });
  const [notes, setNotes] = useState<Note[] | null>(cachedNotes ?? null);
  const [folders, setFolders] = useState<NoteFolder[] | null>(
    cachedFolders !== undefined ? cachedFolders : null
  );
  const [loading, setLoading] = useState(
    !cachedNotes || cachedFolders === undefined
  );

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'notes', projectId });
    cache.invalidate({ type: 'noteFolders', projectId });
    const [data, folderList] = await Promise.all([
      getNotes({ projectId }),
      listFolders(projectId),
    ]);
    cache.set({ type: 'notes', projectId }, data);
    cache.set({ type: 'noteFolders', projectId }, folderList);
    setNotes(data);
    setFolders(folderList);
  }, [projectId, cache]);

  useEffect(() => {
    if (cachedNotes && cachedFolders !== undefined) {
      setNotes(cachedNotes);
      setFolders(cachedFolders);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([getNotes({ projectId }), listFolders(projectId)]).then(
      ([data, folderList]) => {
        if (cancelled) return;
        cache.set({ type: 'notes', projectId }, data);
        cache.set({ type: 'noteFolders', projectId }, folderList);
        setNotes(data);
        setFolders(folderList);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, cachedNotes, cachedFolders, cache]);

  if (loading || notes === null || folders === null) {
    return <SkeletonNotes />;
  }

  return (
    <ContextNotesClient
      projectId={projectId}
      initialNotes={notes}
      initialFolders={folders}
      onRefresh={loadData}
    />
  );
}
