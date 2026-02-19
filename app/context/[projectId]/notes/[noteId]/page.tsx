import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getNoteById, getNoteLinks } from '@/app/notes/actions';
import { notFound } from 'next/navigation';
import ContextNoteDetailClient from './ContextNoteDetailClient';

export default async function ContextNoteDetailPage({
  params,
}: {
  params: { projectId: string; noteId: string };
}) {
  await requireAuth();
  const { projectId, noteId } = params;

  const [project, note, links] = await Promise.all([
    getProjectById(projectId),
    getNoteById(noteId),
    getNoteLinks(noteId),
  ]);

  if (!project || !note) notFound();
  if (note.project_id !== projectId) notFound();

  return (
    <ContextNoteDetailClient
      projectId={projectId}
      noteId={noteId}
      initialNote={{
        title: note.title,
        content: note.content ?? '',
        project_id: note.project_id ?? '',
      }}
      initialLinks={links}
    />
  );
}
