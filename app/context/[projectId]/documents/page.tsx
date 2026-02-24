import { requireAuth } from '@/lib/auth';
import ContextDocumentsFromCache from './ContextDocumentsFromCache';

export default async function ContextDocumentsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  return <ContextDocumentsFromCache projectId={projectId} />;
}
