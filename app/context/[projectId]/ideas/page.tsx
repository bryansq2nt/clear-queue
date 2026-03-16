import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getIdeasPermissions } from '@/app/actions/idea-boards';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextIdeasFromCache from './ContextIdeasFromCache';

export default async function ContextIdeasPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'ideas'),
    getIdeasPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="ideas"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextIdeasFromCache projectId={projectId} permissions={permissions} />
  );
}
