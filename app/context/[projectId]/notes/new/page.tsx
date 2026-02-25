import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import ContextNewNoteClient from './ContextNewNoteClient';

export default async function ContextNewNotePage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { folderId?: string };
}) {
  await requireAuth();
  const project = await getProjectById(params.projectId);

  if (!project) {
    return null;
  }

  const { folderId } = searchParams;

  return (
    <ContextNewNoteClient
      projectId={params.projectId}
      preselectedProjectId={params.projectId}
      defaultFolderId={folderId ?? undefined}
    />
  );
}
