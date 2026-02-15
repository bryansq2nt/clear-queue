import { requireAuth } from '@/lib/auth';
import BudgetDetailClient from './BudgetDetailClient';

export default async function BudgetPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuth();

  return <BudgetDetailClient budgetId={params.id} />;
}
