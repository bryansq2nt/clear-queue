import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getBudgetsByProjectId } from '@/app/budgets/actions';
import ContextBudgetsClient from './ContextBudgetsClient';

type BudgetWithProject = Awaited<
  ReturnType<typeof getBudgetsByProjectId>
>[number];

export default async function ContextBudgetsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;
  const [project, budgets] = await Promise.all([
    getProjectById(projectId),
    getBudgetsByProjectId(projectId),
  ]);

  if (!project) {
    return null;
  }

  return (
    <ContextBudgetsClient
      projectId={projectId}
      initialBudgets={budgets as BudgetWithProject[]}
    />
  );
}
