import { requireAuth } from '@/lib/auth';
import { getSubTeamsPermissions } from '@/app/actions/sub-teams';
import ContextTeamFromCache from './ContextTeamFromCache';

export default async function ContextTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireAuth();
  const { projectId } = await params;
  const subTeamsPermissions = await getSubTeamsPermissions(projectId);
  return (
    <ContextTeamFromCache
      projectId={projectId}
      subTeamsPermissions={subTeamsPermissions}
    />
  );
}
