import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextDocumentsFromCache from './ContextDocumentsFromCache';

export default async function ContextDocumentsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const { canView, reason } = await getCanViewModule(projectId, 'documents');
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="documents"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return <ContextDocumentsFromCache projectId={projectId} />;
}
