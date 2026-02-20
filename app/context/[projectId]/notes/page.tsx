import { requireAuth } from '@/lib/auth';
import ContextNotesFromCache from './ContextNotesFromCache';

export default async function ContextNotesPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return <ContextNotesFromCache projectId={projectId} />;
}
