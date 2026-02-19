'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Plus } from 'lucide-react';
import { getBudgetsByProjectId } from '@/app/budgets/actions';
import { BudgetCard } from '@/app/budgets/components/BudgetCard';
import { CreateBudgetModal } from '@/app/budgets/components/CreateBudgetModal';
import { EmptyState } from '@/app/budgets/components/EmptyState';

type BudgetWithProject = Awaited<
  ReturnType<typeof getBudgetsByProjectId>
>[number];

interface ContextBudgetsClientProps {
  projectId: string;
  initialBudgets: BudgetWithProject[];
}

/**
 * Budgets tab for context view — project-scoped budget list.
 * Reuses BudgetCard and CreateBudgetModal; links go to context detail.
 */
export default function ContextBudgetsClient({
  projectId,
  initialBudgets,
}: ContextBudgetsClientProps) {
  const { t } = useI18n();
  const [budgets, setBudgets] = useState<BudgetWithProject[]>(initialBudgets);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadBudgets = useCallback(async () => {
    setIsLoading(true);
    const data = await getBudgetsByProjectId(projectId);
    setBudgets(data);
    setIsLoading(false);
  }, [projectId]);

  const handleModalClose = () => {
    setIsModalOpen(false);
    loadBudgets();
  };

  const getDetailHref = (budgetId: string) =>
    `/context/${projectId}/budgets/${budgetId}`;

  return (
    <div className="p-4 md:p-6 min-h-full">
      <p className="text-muted-foreground text-sm mb-6">
        {t('budgets.subtitle')}
      </p>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : budgets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onDeleted={loadBudgets}
              getDetailHref={getDetailHref}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        aria-label={t('budgets.new_budget')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CreateBudgetModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        defaultProjectId={projectId}
      />
    </div>
  );
}
