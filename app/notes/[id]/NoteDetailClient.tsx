'use client';

import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/I18nProvider';
import { DetailLayout } from '@/components/DetailLayout';
import { NoteEditor } from '../components/NoteEditor';

type NoteLink = Database['public']['Tables']['note_links']['Row'];

interface NoteDetailClientProps {
  noteId: string;
  initialNote: { title: string; content: string; project_id: string };
  initialLinks: NoteLink[];
}

export default function NoteDetailClient({
  noteId,
  initialNote,
  initialLinks,
}: NoteDetailClientProps) {
  const { t } = useI18n();

  return (
    <DetailLayout
      backHref="/notes"
      backLabel=""
      title={initialNote.title || t('notes.title')}
      contentClassName="p-4 sm:p-6"
    >
      <NoteEditor
        mode="edit"
        noteId={noteId}
        initialNote={initialNote}
        initialLinks={initialLinks}
      />
    </DetailLayout>
  );
}
