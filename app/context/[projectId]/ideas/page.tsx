import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import {
  getBoardsByProjectIdAction,
  getIdeasPermissions,
} from '@/app/actions/idea-boards';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextIdeasClient from './ContextIdeasClient';

export default async function ContextIdeasPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;
  const [{ canView, reason }, permissions, boards] = await Promise.all([
    getCanViewModule(projectId, 'ideas'),
    getIdeasPermissions(projectId),
    getBoardsByProjectIdAction(projectId),
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
    <ContextIdeasClient
      projectId={projectId}
      initialBoards={boards}
      permissions={permissions}
    />
  );
}
