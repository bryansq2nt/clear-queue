import { requireAuth } from '@/lib/auth';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { getBudgets } from './actions';
import BudgetsPageClient from './BudgetsPageClient';

export default async function BudgetsPage() {
  await requireAuth();
  const [projects, budgets] = await Promise.all([
    getProjectsForSidebar(),
    getBudgets(),
  ]);

  return (
    <BudgetsPageClient initialProjects={projects} initialBudgets={budgets} />
  );
}
