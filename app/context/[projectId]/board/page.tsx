import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getBoardPermissions } from '@/app/actions/tasks';
import { listProjectMembers } from '@/app/actions/teams';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBoardFromCache from './ContextBoardFromCache';

export default async function ContextBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const currentUser = await requireAuth();
  const { projectId } = params;

  const { canView, reason } = await getCanViewModule(projectId, 'board');
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="board"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  const [permissions, members] = await Promise.all([
    getBoardPermissions(projectId),
    listProjectMembers(projectId),
  ]);

  const projectMembers = members.map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
  }));

  return (
    <ContextBoardFromCache
      projectId={projectId}
      permissions={permissions}
      projectMembers={projectMembers}
      currentUserId={currentUser.id}
    />
  );
}
