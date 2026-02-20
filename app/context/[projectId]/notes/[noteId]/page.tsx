import { requireAuth } from '@/lib/auth';
import ContextNoteDetailFromCache from './ContextNoteDetailFromCache';

export default async function ContextNoteDetailPage({
  params,
}: {
  params: { projectId: string; noteId: string };
}) {
  await requireAuth();
  const { projectId, noteId } = params;

  return (
    <ContextNoteDetailFromCache
      key={noteId}
      projectId={projectId}
      noteId={noteId}
    />
  );
}
