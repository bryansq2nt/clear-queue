'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getNoteById, getNoteLinks, touchNote } from '@/app/actions/notes';
import { listFolders } from '@/app/actions/note-folders';
import type { Database } from '@/lib/supabase/types';
import { SkeletonNoteDetail } from '@/components/skeletons/SkeletonNoteDetail';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import ContextNoteDetailClient from './ContextNoteDetailClient';

type NoteLink = Database['public']['Tables']['note_links']['Row'];

type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

type NoteDetailData = {
  note: {
    title: string;
    content: string;
    project_id: string;
    folder_id: string | null;
  };
  links: NoteLink[];
  folders: NoteFolder[];
};

interface ContextNoteDetailFromCacheProps {
  projectId: string;
  noteId: string;
}

/**
 * Note detail: show from cache if available, otherwise fetch and show shimmer.
 * Invalidates cache on save/delete so next open gets fresh data.
 */
export default function ContextNoteDetailFromCache({
  projectId,
  noteId,
}: ContextNoteDetailFromCacheProps) {
  const cache = useContextDataCache();
  const router = useRouter();
  const listHref = `/context/${projectId}/notes`;
  const cached = cache.get<NoteDetailData>({ type: 'noteDetail', noteId });
  const [data, setData] = useState<NoteDetailData | null>(() => {
    if (cached && cached.note.project_id === projectId && cached.folders)
      return cached;
    return null;
  });
  const [loading, setLoading] = useState(
    !cached || cached.note.project_id !== projectId || !cached.folders
  );

  const invalidateNote = () => {
    cache.invalidate({ type: 'noteDetail', noteId });
  };

  useEffect(() => {
    const c = cache.get<NoteDetailData>({ type: 'noteDetail', noteId });
    if (c && c.note.project_id === projectId && c.folders) {
      setData(c);
      setLoading(false);
      return;
    }
    setData(null);
    setLoading(true);
    let cancelled = false;
    Promise.all([
      getNoteById(noteId),
      getNoteLinks(noteId),
      listFolders(projectId),
    ]).then(([note, links, folders]) => {
      if (cancelled) return;
      if (!note || note.project_id !== projectId) {
        setLoading(false);
        router.replace(listHref);
        return;
      }
      void touchNote(noteId);
      const next: NoteDetailData = {
        note: {
          title: note.title,
          content: note.content ?? '',
          project_id: note.project_id ?? '',
          folder_id: note.folder_id ?? null,
        },
        links: links ?? [],
        folders: folders ?? [],
      };
      cache.set({ type: 'noteDetail', noteId }, next);
      setData(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, noteId, listHref, router, cache]);

  if (loading || !data) {
    return <SkeletonNoteDetail />;
  }

  return (
    <ContextNoteDetailClient
      projectId={projectId}
      noteId={noteId}
      initialNote={data.note}
      initialLinks={data.links}
      folders={data.folders}
      initialFolderId={data.note.folder_id}
      onSaveSuccess={invalidateNote}
      onDeleteSuccess={invalidateNote}
    />
  );
}
