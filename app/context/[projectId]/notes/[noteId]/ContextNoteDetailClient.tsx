'use client';

import { NoteEditor } from '@/app/notes/components/NoteEditor';
import { Database } from '@/lib/supabase/types';

type NoteLink = Database['public']['Tables']['note_links']['Row'];

interface ContextNoteDetailClientProps {
  projectId: string;
  noteId: string;
  initialNote: { title: string; content: string; project_id: string };
  initialLinks: NoteLink[];
}

/**
 * Note detail inside context layout. No back link — user navigates via Notes tab.
 * Delete is shown as FAB (deleteAsFab).
 */
export default function ContextNoteDetailClient({
  projectId,
  noteId,
  initialNote,
  initialLinks,
}: ContextNoteDetailClientProps) {
  const listHref = `/context/${projectId}/notes`;
  const getDetailHref = (id: string) => `/context/${projectId}/notes/${id}`;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <NoteEditor
        mode="edit"
        noteId={noteId}
        initialNote={initialNote}
        initialLinks={initialLinks}
        listHref={listHref}
        getDetailHref={getDetailHref}
        deleteAsFab
      />
    </div>
  );
}
