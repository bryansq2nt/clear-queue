'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getNoteById, getNoteLinks } from '@/app/actions/notes';
import type { Database } from '@/lib/supabase/types';
import { SkeletonNoteDetail } from '@/components/skeletons/SkeletonNoteDetail';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import ContextNoteDetailClient from './ContextNoteDetailClient';

type NoteLink = Database['public']['Tables']['note_links']['Row'];

type NoteDetailData = {
  note: { title: string; content: string; project_id: string };
  links: NoteLink[];
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
    if (cached && cached.note.project_id === projectId) return cached;
    return null;
  });
  const [loading, setLoading] = useState(
    !cached || cached.note.project_id !== projectId
  );

  const invalidateNote = () => {
    cache.invalidate({ type: 'noteDetail', noteId });
  };

  useEffect(() => {
    const c = cache.get<NoteDetailData>({ type: 'noteDetail', noteId });
    if (c && c.note.project_id === projectId) {
      setData(c);
      setLoading(false);
      return;
    }
    setData(null);
    setLoading(true);
    let cancelled = false;
    Promise.all([getNoteById(noteId), getNoteLinks(noteId)]).then(
      ([note, links]) => {
        if (cancelled) return;
        if (!note || note.project_id !== projectId) {
          setLoading(false);
          router.replace(listHref);
          return;
        }
        const next: NoteDetailData = {
          note: {
            title: note.title,
            content: note.content ?? '',
            project_id: note.project_id ?? '',
          },
          links: links ?? [],
        };
        cache.set({ type: 'noteDetail', noteId }, next);
        setData(next);
        setLoading(false);
      }
    );
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
      onSaveSuccess={invalidateNote}
      onDeleteSuccess={invalidateNote}
    />
  );
}
