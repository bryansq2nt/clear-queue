import { getBoardInitialData } from '@/app/actions/tasks';
import ContextBoardClient from './ContextBoardClient';

/**
 * Async server component: fetches board initial data (project + counts + first 5 tasks per column) and renders the board.
 * Wrapped in Suspense by the page so the shell shows immediately with SkeletonBoard fallback.
 */
export default async function BoardContent({
  projectId,
}: {
  projectId: string;
}) {
  const data = await getBoardInitialData(projectId);

  if (!data) {
    return null;
  }

  return (
    <ContextBoardClient
      projectId={projectId}
      initialProject={data.project}
      initialCounts={data.counts}
      initialTasksByStatus={data.tasksByStatus}
    />
  );
}
