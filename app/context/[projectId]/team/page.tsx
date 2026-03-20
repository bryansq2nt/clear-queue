import { requireAuth } from '@/lib/auth';
import {
  listProjectMembers,
  listPendingInvites,
  listRejectedInvites,
  listProjectRoles,
} from '@/app/actions/teams';
import { getProjectById } from '@/app/actions/projects';
import {
  listProjectTeams,
  getSubTeamsPermissions,
} from '@/app/actions/sub-teams';
import { getProjectModules } from '@/app/actions/modules';
import ContextTeamClient from './ContextTeamClient';

export default async function ContextTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireAuth();
  const { projectId } = await params;

  const [
    members,
    invites,
    rejectedInvites,
    roles,
    project,
    teams,
    subTeamsPermissions,
    projectModules,
  ] = await Promise.all([
    listProjectMembers(projectId),
    listPendingInvites(projectId),
    listRejectedInvites(projectId),
    listProjectRoles(),
    getProjectById(projectId),
    listProjectTeams(projectId),
    getSubTeamsPermissions(projectId),
    getProjectModules(projectId),
  ]);

  const enabledInviteModuleKeys = projectModules
    .filter((m) => m.enabled)
    .map((m) => m.key)
    .filter((key) => key !== 'owner' && key !== 'team');

  return (
    <ContextTeamClient
      projectId={projectId}
      projectName={project?.name ?? ''}
      currentUserId={user.id}
      initialMembers={members}
      initialInvites={invites}
      initialRejectedInvites={rejectedInvites}
      roles={roles}
      initialTeams={teams}
      subTeamsPermissions={subTeamsPermissions}
      enabledInviteModuleKeys={enabledInviteModuleKeys}
    />
  );
}
