import { requireAuth } from '@/lib/auth';
import ContextIdeasFromCache from './ContextIdeasFromCache';

export default async function ContextIdeasPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return <ContextIdeasFromCache projectId={projectId} />;
}
