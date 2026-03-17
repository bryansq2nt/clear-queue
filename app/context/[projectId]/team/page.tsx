import { requireAuth } from '@/lib/auth';
import {
  listProjectMembers,
  listPendingInvites,
  listRejectedInvites,
  listProjectRoles,
  listProjectAccessProfiles,
  listReusableInviteRoles,
} from '@/app/actions/teams';
import { getProjectById } from '@/app/actions/projects';
import {
  listProjectTeams,
  getSubTeamsPermissions,
} from '@/app/actions/sub-teams';
import ContextTeamClient from './ContextTeamClient';

export default async function ContextTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireAuth();
  const { projectId } = await params;

  const [
    members,
    invites,
    rejectedInvites,
    roles,
    profiles,
    reusableRoles,
    project,
    teams,
    subTeamsPermissions,
  ] = await Promise.all([
    listProjectMembers(projectId),
    listPendingInvites(projectId),
    listRejectedInvites(projectId),
    listProjectRoles(),
    listProjectAccessProfiles(projectId),
    listReusableInviteRoles(projectId),
    getProjectById(projectId),
    listProjectTeams(projectId),
    getSubTeamsPermissions(projectId),
  ]);

  return (
    <ContextTeamClient
      projectId={projectId}
      projectName={project?.name ?? ''}
      initialMembers={members}
      initialInvites={invites}
      initialRejectedInvites={rejectedInvites}
      roles={roles}
      profiles={profiles}
      reusableRoles={reusableRoles}
      initialTeams={teams}
      subTeamsPermissions={subTeamsPermissions}
    />
  );
}
