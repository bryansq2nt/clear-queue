import { getProjectById } from '@/app/actions/projects';
import { getTasksByProjectId } from '@/app/actions/tasks';
import ContextBoardClient from './ContextBoardClient';

/**
 * Async server component: fetches project + tasks and renders the board.
 * Wrapped in Suspense by the page so the shell shows immediately with SkeletonBoard fallback.
 */
export default async function BoardContent({
  projectId,
}: {
  projectId: string;
}) {
  const [project, tasks] = await Promise.all([
    getProjectById(projectId),
    getTasksByProjectId(projectId),
  ]);

  if (!project) {
    return null;
  }

  return (
    <ContextBoardClient
      projectId={projectId}
      initialProject={project}
      initialTasks={tasks ?? []}
    />
  );
}
