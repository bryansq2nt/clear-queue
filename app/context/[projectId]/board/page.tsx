import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getTasksByProjectId } from '@/app/actions/tasks';
import ContextBoardClient from './ContextBoardClient';

export default async function ContextBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  const [project, tasks] = await Promise.all([
    getProjectById(projectId),
    getTasksByProjectId(projectId),
  ]);

  if (!project) {
    return null; // layout already redirects if no project
  }

  return (
    <ContextBoardClient
      projectId={projectId}
      initialProject={project}
      initialTasks={tasks ?? []}
    />
  );
}
