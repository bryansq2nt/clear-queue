'use client';

import { useState, useCallback } from 'react';
import { Database } from '@/lib/supabase/types';
import { AppShell } from '@/components/AppShell';
import { Plus } from 'lucide-react';
import { getBudgets } from './actions';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { BudgetCard } from './components/BudgetCard';
import { CreateBudgetModal } from './components/CreateBudgetModal';
import { EmptyState } from './components/EmptyState';
import { useI18n } from '@/components/I18nProvider';

type Project = Database['public']['Tables']['projects']['Row'];

interface BudgetWithProject {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  projects: { id: string; name: string } | null;
}

interface BudgetsPageClientProps {
  initialProjects: Project[];
  initialBudgets: BudgetWithProject[];
}

export default function BudgetsPageClient({
  initialProjects,
  initialBudgets,
}: BudgetsPageClientProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [budgets, setBudgets] = useState<any[]>(initialBudgets);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

  const loadBudgets = useCallback(async () => {
    setIsLoading(true);
    const data = await getBudgets();
    setBudgets(data);
    setIsLoading(false);
  }, []);

  const handleModalClose = () => {
    setIsModalOpen(false);
    loadBudgets();
  };

  if (isLoading) {
    return (
      <AppShell
        title={t('budgets.title')}
        projects={projects}
        selectedProject={null}
        selectedCategory={null}
        showArchived={false}
        onSelectProject={() => {}}
        onCategoryChange={() => {}}
        onShowArchivedChange={() => {}}
        onProjectUpdated={loadProjects}
        contentClassName="p-6"
      >
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('budgets.title')}
      projects={projects}
      selectedProject={null}
      selectedCategory={null}
      showArchived={false}
      onSelectProject={() => {}}
      onCategoryChange={() => {}}
      onShowArchivedChange={() => {}}
      onProjectUpdated={loadProjects}
      contentClassName="p-4 sm:p-6"
    >
      <div className="max-w-5xl mx-auto relative">
        <p className="text-muted-foreground text-sm mb-6">
          {t('budgets.subtitle')}
        </p>

        {budgets.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {budgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onDeleted={loadBudgets}
              />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        aria-label={t('budgets.new_budget')}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CreateBudgetModal isOpen={isModalOpen} onClose={handleModalClose} />
    </AppShell>
  );
}
