import { requireAuth } from '@/lib/auth';
import ContextBudgetsFromCache from './ContextBudgetsFromCache';

export default async function ContextBudgetsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return <ContextBudgetsFromCache projectId={projectId} />;
}
