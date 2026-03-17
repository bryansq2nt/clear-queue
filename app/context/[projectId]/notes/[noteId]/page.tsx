import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getNoteById, getNoteLinks, touchNote } from '@/app/actions/notes';
import { listFolders } from '@/app/actions/note-folders';
import ContextNoteDetailClient from './ContextNoteDetailClient';

export default async function ContextNoteDetailPage({
  params,
}: {
  params: { projectId: string; noteId: string };
}) {
  await requireAuth();
  const { projectId, noteId } = params;

  const [note, links, folders] = await Promise.all([
    getNoteById(noteId),
    getNoteLinks(noteId),
    listFolders(projectId),
  ]);

  if (!note || note.project_id !== projectId) {
    redirect(`/context/${projectId}/notes`);
  }

  void touchNote(noteId);

  return (
    <ContextNoteDetailClient
      projectId={projectId}
      noteId={noteId}
      initialNote={{
        title: note.title,
        content: note.content ?? '',
        project_id: note.project_id ?? '',
        folder_id: note.folder_id ?? null,
      }}
      initialLinks={links ?? []}
      folders={folders ?? []}
      initialFolderId={note.folder_id ?? null}
    />
  );
}
