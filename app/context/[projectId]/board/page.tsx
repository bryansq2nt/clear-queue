import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getBoardPermissions, getBoardInitialData } from '@/app/actions/tasks';
import { listProjectMembers } from '@/app/actions/teams';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBoardClient from './ContextBoardClient';

export default async function ContextBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const currentUser = await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions, members, boardData] =
    await Promise.all([
      getCanViewModule(projectId, 'board'),
      getBoardPermissions(projectId),
      listProjectMembers(projectId),
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

  const projectMembers = members.map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
  }));

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
