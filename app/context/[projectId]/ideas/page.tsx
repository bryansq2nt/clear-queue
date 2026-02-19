import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { listBoardsByProjectId } from '@/lib/idea-graph/boards';
import ContextIdeasClient from './ContextIdeasClient';

export default async function ContextIdeasPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;
  const project = await getProjectById(projectId);

  if (!project) {
    return null;
  }

  const boards = await listBoardsByProjectId(projectId);

  return (
    <ContextIdeasClient projectId={projectId} initialBoards={boards} />
  );
}
