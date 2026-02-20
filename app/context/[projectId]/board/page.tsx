import { requireAuth } from '@/lib/auth';
import ContextBoardFromCache from './ContextBoardFromCache';

export default async function ContextBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return <ContextBoardFromCache projectId={projectId} />;
}
