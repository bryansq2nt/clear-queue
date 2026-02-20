import { requireAuth } from '@/lib/auth';
import ContextTodosFromCache from './ContextTodosFromCache';

export default async function ContextTodosPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return <ContextTodosFromCache projectId={projectId} />;
}
