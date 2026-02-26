'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NoteEditor } from '../components/NoteEditor';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { useI18n } from '@/components/shared/I18nProvider';
import { Database } from '@/lib/supabase/types';
import { ArrowLeft } from 'lucide-react';

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
 * Note detail inside context layout. Back link returns to current folder. Delete is FAB (deleteAsFab).
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
  const { t } = useI18n();
  const router = useRouter();
  const cache = useContextDataCache();
  const folderQuery = `?folderId=${initialFolderId === null ? 'root' : initialFolderId}`;
  const listHref = `/context/${projectId}/notes${folderQuery}`;
  const getDetailHref = (id: string) => `/context/${projectId}/notes/${id}`;

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    cache.invalidate({ type: 'notes', projectId });
    cache.invalidate({ type: 'noteFolders', projectId });
    router.push(listHref);
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <Link
        href={listHref}
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('notes.back_to_notes')}
      </Link>
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
