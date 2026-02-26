'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { NoteEditor } from '../components/NoteEditor';
import { ArrowLeft } from 'lucide-react';

interface ContextNewNoteClientProps {
  projectId: string;
  preselectedProjectId: string;
  /** When opening new note from inside a folder, pass folder id so the note is created in that folder */
  defaultFolderId?: string | null;
}

/**
 * New note inside context layout. Project preselected; redirects go to context list/detail.
 */
export default function ContextNewNoteClient({
  projectId,
  preselectedProjectId,
  defaultFolderId,
}: ContextNewNoteClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const cache = useContextDataCache();
  const folderQuery =
    defaultFolderId !== undefined
      ? `?folderId=${defaultFolderId === null || defaultFolderId === 'root' ? 'root' : defaultFolderId}`
      : '';
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
        mode="create"
        initialNote={{
          title: '',
          content: '',
          project_id: preselectedProjectId,
        }}
        initialLinks={[]}
        preselectedProjectId={preselectedProjectId}
        defaultFolderId={defaultFolderId}
        listHref={listHref}
        getDetailHref={getDetailHref}
      />
    </div>
  );
}
