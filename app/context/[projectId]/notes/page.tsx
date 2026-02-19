import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getNotes } from '@/app/notes/actions';
import ContextNotesClient from './ContextNotesClient';

export default async function ContextNotesPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;
  const [project, notes] = await Promise.all([
    getProjectById(projectId),
    getNotes({ projectId }),
  ]);

  if (!project) {
    return null;
  }

  return (
    <ContextNotesClient projectId={projectId} initialNotes={notes} />
  );
}
