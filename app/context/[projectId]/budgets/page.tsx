import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getBudgetsPermissions } from '@/app/actions/budgets';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBudgetsFromCache from './ContextBudgetsFromCache';

export default async function ContextBudgetsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'budgets'),
    getBudgetsPermissions(projectId),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="budgets"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextBudgetsFromCache projectId={projectId} permissions={permissions} />
  );
}
