import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import {
  getBudgetsPermissions,
  getBudgetsByProjectId,
} from '@/app/actions/budgets';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBudgetsClient from './ContextBudgetsClient';

export default async function ContextBudgetsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [{ canView, reason }, permissions, budgets] = await Promise.all([
    getCanViewModule(projectId, 'budgets'),
    getBudgetsPermissions(projectId),
    getBudgetsByProjectId(projectId),
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
    <ContextBudgetsClient
      projectId={projectId}
      initialBudgets={budgets}
      permissions={permissions}
    />
  );
}
