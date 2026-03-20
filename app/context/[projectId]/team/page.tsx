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
  listMySubTeamMemberships,
  getSubTeamsPermissions,
} from '@/app/actions/sub-teams';
import { getProjectModules } from '@/app/actions/modules';
import { can } from '@/lib/rbac/resolver';
import ContextTeamClient from './ContextTeamClient';

export default async function ContextTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireAuth();
  const { projectId } = await params;

  const canInvite = await can(user.id, 'teams.invite', {
    type: 'project',
    projectId,
  });
  const canManageMembers = await can(user.id, 'teams.manage_members', {
    type: 'project',
    projectId,
  });

  const [
    members,
    invites,
    rejectedInvites,
    roles,
    project,
    teams,
    mySubTeamMemberships,
    subTeamsPermissions,
    projectModules,
  ] = await Promise.all([
    listProjectMembers(projectId),
    canInvite ? listPendingInvites(projectId) : Promise.resolve([]),
    canInvite ? listRejectedInvites(projectId) : Promise.resolve([]),
    listProjectRoles(),
    getProjectById(projectId),
    listProjectTeams(projectId),
    listMySubTeamMemberships(projectId),
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
      initialMySubTeamMemberships={mySubTeamMemberships}
      subTeamsPermissions={subTeamsPermissions}
      enabledInviteModuleKeys={enabledInviteModuleKeys}
      canInvite={canInvite}
      canManageMembers={canManageMembers}
    />
  );
}
