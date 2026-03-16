import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getDocumentsPermissions } from '@/app/actions/documents';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextDocumentsFromCache from './ContextDocumentsFromCache';

export default async function ContextDocumentsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'documents'),
    getDocumentsPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="documents"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextDocumentsFromCache
      projectId={projectId}
      permissions={permissions}
    />
  );
}
