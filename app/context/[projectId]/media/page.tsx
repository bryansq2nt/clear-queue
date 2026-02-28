import { requireAuth } from '@/lib/auth';
import ContextMediaFromCache from './ContextMediaFromCache';

export default async function ContextMediaPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  return <ContextMediaFromCache projectId={projectId} />;
}
