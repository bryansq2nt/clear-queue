import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getProjectTodoBoardAction } from '@/app/todo/actions';
import { notFound } from 'next/navigation';
import ContextTodosClient from './ContextTodosClient';

export default async function ContextTodosPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const result = await getProjectTodoBoardAction(projectId);

  if (!result.ok) {
    notFound();
  }

  const { projectName, defaultListId, items } = result.data;

  return (
    <ContextTodosClient
      projectId={projectId}
      initialProjectName={projectName}
      initialDefaultListId={defaultListId}
      initialItems={items}
    />
  );
}
