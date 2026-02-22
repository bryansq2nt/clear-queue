import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getBudgetProjectId } from '@/app/actions/budgets';
import { notFound } from 'next/navigation';
import BudgetDetailClient from './BudgetDetailClient';

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
