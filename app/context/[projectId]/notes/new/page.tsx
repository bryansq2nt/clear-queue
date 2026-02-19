import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import ContextNewNoteClient from './ContextNewNoteClient';

export default async function ContextNewNotePage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const project = await getProjectById(params.projectId);

  if (!project) {
    return null;
  }

  return (
    <ContextNewNoteClient
      projectId={params.projectId}
      preselectedProjectId={params.projectId}
    />
  );
}
