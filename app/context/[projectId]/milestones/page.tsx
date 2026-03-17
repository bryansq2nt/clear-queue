import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import {
  getMilestonesPermissions,
  getMilestonesWithProgress,
} from '@/app/actions/milestones';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextMilestonesClient from './ContextMilestonesClient';

export default async function ContextMilestonesPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;
  const [{ canView, reason }, permissions, milestones] = await Promise.all([
    getCanViewModule(projectId, 'milestones'),
    getMilestonesPermissions(projectId),
    getMilestonesWithProgress(projectId),
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
    <ContextMilestonesClient
      projectId={projectId}
      initialMilestones={milestones}
      permissions={permissions}
    />
  );
}
