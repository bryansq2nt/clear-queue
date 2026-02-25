'use client';

import { NoteEditor } from '../components/NoteEditor';
import { Database } from '@/lib/supabase/types';

type NoteLink = Database['public']['Tables']['note_links']['Row'];
type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];

interface ContextNoteDetailClientProps {
  projectId: string;
  noteId: string;
  initialNote: {
    title: string;
    content: string;
    project_id: string;
    folder_id?: string | null;
  };
  initialLinks: NoteLink[];
  folders: NoteFolder[];
  initialFolderId: string | null;
  onSaveSuccess?: () => void;
  onDeleteSuccess?: () => void;
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
  folders,
  initialFolderId,
  onSaveSuccess,
  onDeleteSuccess,
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
        preselectedProjectId={projectId}
        listHref={listHref}
        getDetailHref={getDetailHref}
        deleteAsFab
        folders={folders}
        initialFolderId={initialFolderId}
        onSaveSuccess={onSaveSuccess}
        onDeleteSuccess={onDeleteSuccess}
      />
    </div>
  );
}
