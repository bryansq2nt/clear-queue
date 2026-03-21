import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import {
  getBoardPermissions,
  getBoardInitialData,
  listTaskAssignableMembers,
} from '@/app/actions/tasks';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBoardClient from './ContextBoardClient';

export default async function ContextBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const currentUser = await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions, boardData] = await Promise.all([
    getCanViewModule(projectId, 'board'),
    getBoardPermissions(projectId),
    getBoardInitialData(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="board"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  if (!boardData) return null;

  const projectMembers = permissions.canAssign
    ? await listTaskAssignableMembers(projectId)
    : [];

  return (
    <ContextBoardClient
      projectId={projectId}
      initialProject={boardData.project}
      initialCounts={boardData.counts}
      initialTasksByStatus={boardData.tasksByStatus}
      permissions={permissions}
      projectMembers={projectMembers}
      currentUserId={currentUser.id}
    />
  );
}
