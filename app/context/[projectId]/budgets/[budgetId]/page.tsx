import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getBudgetProjectId } from '@/app/budgets/actions';
import { notFound } from 'next/navigation';
import BudgetDetailClient from '@/app/budgets/[id]/BudgetDetailClient';

export default async function ContextBudgetDetailPage({
  params,
}: {
  params: { projectId: string; budgetId: string };
}) {
  await requireAuth();
  const { projectId, budgetId } = params;

  const [project, budgetProjectId] = await Promise.all([
    getProjectById(projectId),
    getBudgetProjectId(budgetId),
  ]);

  if (!project || budgetProjectId !== projectId) {
    notFound();
  }

  return (
    <BudgetDetailClient
      budgetId={budgetId}
      backHref={`/context/${projectId}/budgets`}
      hideBackHeader
    />
  );
}
