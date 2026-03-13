import { requireAuth } from '@/lib/auth';
import ContextTeamFromCache from './ContextTeamFromCache';

export default async function ContextTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireAuth();
  const { projectId } = await params;
  return <ContextTeamFromCache projectId={projectId} />;
}
