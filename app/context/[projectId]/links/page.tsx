import { requireAuth } from '@/lib/auth';
import ContextLinksFromCache from './ContextLinksFromCache';

export default async function ContextLinksPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return <ContextLinksFromCache projectId={projectId} />;
}
