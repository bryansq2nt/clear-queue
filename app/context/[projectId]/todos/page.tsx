import { requireAuth } from '@/lib/auth';
import { getProjectTodoBoardAction } from '@/app/actions/todo';
import ContextTodosClient from './ContextTodosClient';

export default async function ContextTodosPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;
  const result = await getProjectTodoBoardAction(projectId);
  if (!result.ok) return null;
  return (
    <ContextTodosClient
      projectId={projectId}
      initialProjectName={result.data.projectName}
      initialDefaultListId={result.data.defaultListId}
      initialItems={result.data.items}
    />
  );
}
