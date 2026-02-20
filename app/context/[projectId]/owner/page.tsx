import { requireAuth } from '@/lib/auth';
import ContextOwnerFromCache from './ContextOwnerFromCache';

export default async function ContextOwnerPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return <ContextOwnerFromCache projectId={projectId} />;
}
