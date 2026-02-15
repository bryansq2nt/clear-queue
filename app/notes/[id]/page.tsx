import { requireAuth } from '@/lib/auth';
import { getNoteById, getNoteLinks } from '@/app/notes/actions';
import { notFound } from 'next/navigation';
import NoteDetailClient from './NoteDetailClient';

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const [note, links] = await Promise.all([getNoteById(id), getNoteLinks(id)]);
  if (!note) notFound();

  return (
    <NoteDetailClient
      noteId={id}
      initialNote={{
        title: note.title,
        content: note.content ?? '',
        project_id: note.project_id ?? '',
      }}
      initialLinks={links}
    />
  );
}
