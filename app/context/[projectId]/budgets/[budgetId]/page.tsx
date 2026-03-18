import { requireAuth } from '@/lib/auth';
import { getProjectById, getProjectsForSidebar } from '@/app/actions/projects';
import { getBudgetProjectId } from '@/app/actions/budgets';
import { getBudgetWithData } from '@/app/actions/budget-detail';
import { notFound } from 'next/navigation';
import BudgetDetailClient from './BudgetDetailClient';

export default async function ContextBudgetDetailPage({
  params,
}: {
  params: { projectId: string; budgetId: string };
}) {
  await requireAuth();
  const { projectId, budgetId } = params;

  const [project, budgetProjectId, initialBudgetData, initialProjects] =
    await Promise.all([
      getProjectById(projectId),
      getBudgetProjectId(budgetId),
      getBudgetWithData(budgetId),
      getProjectsForSidebar(),
    ]);

  if (!project || budgetProjectId !== projectId) {
    notFound();
  }

  return (
    <BudgetDetailClient
      budgetId={budgetId}
      initialBudgetData={initialBudgetData}
      initialProjects={initialProjects}
      backHref={`/context/${projectId}/budgets`}
      hideBackHeader
    />
  );
}
