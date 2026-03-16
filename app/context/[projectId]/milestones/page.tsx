import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getMilestonesPermissions } from '@/app/actions/milestones';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextMilestonesFromCache from './ContextMilestonesFromCache';

export default async function ContextMilestonesPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'milestones'),
    getMilestonesPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="milestones"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextMilestonesFromCache
      projectId={projectId}
      permissions={permissions}
    />
  );
}
