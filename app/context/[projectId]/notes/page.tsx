import { requireAuth } from '@/lib/auth';
import ContextNotesFromCache from './ContextNotesFromCache';

export default async function ContextNotesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { folderId?: string };
}) {
  await requireAuth();
  const projectId = params.projectId;
  const folderId = searchParams.folderId ?? undefined;

  return (
    <ContextNotesFromCache projectId={projectId} initialFolderId={folderId} />
  );
}
