import { requireAuth } from '@/lib/auth';
import ContextMilestonesFromCache from './ContextMilestonesFromCache';

export default async function ContextMilestonesPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;
  return <ContextMilestonesFromCache projectId={projectId} />;
}
