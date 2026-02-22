'use client';

import { useState, useCallback, useEffect } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { Plus } from 'lucide-react';
import { getBudgetsByProjectId } from '@/app/actions/budgets';
import { BudgetCard } from './components/BudgetCard';
import { CreateBudgetModal } from './components/CreateBudgetModal';
import { EmptyState } from './components/EmptyState';

type BudgetWithProject = Awaited<
  ReturnType<typeof getBudgetsByProjectId>
>[number];

interface ContextBudgetsClientProps {
  projectId: string;
  initialBudgets: BudgetWithProject[];
  /** When provided (context cache), used instead of local fetch for refresh */
  onRefresh?: () => void | Promise<void>;
}

/**
 * Budgets tab for context view — project-scoped budget list.
 * Reuses BudgetCard and CreateBudgetModal; links go to context detail.
 */
export default function ContextBudgetsClient({
  projectId,
  initialBudgets,
  onRefresh,
}: ContextBudgetsClientProps) {
  const { t } = useI18n();
  const [budgets, setBudgets] = useState<BudgetWithProject[]>(initialBudgets);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setBudgets(initialBudgets);
  }, [initialBudgets]);

  const loadBudgets = useCallback(async () => {
    if (onRefresh) {
      setIsLoading(true);
      await onRefresh();
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const data = await getBudgetsByProjectId(projectId);
    setBudgets(data);
    setIsLoading(false);
  }, [projectId, onRefresh]);

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
