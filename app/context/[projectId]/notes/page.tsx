import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextNotesFromCache from './ContextNotesFromCache';

export default async function ContextNotesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { folderId?: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const { canView, reason } = await getCanViewModule(projectId, 'notes');
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="notes"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  const folderId = searchParams.folderId ?? undefined;
  return (
    <ContextNotesFromCache projectId={projectId} initialFolderId={folderId} />
  );
}
