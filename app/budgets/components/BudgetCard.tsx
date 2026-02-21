'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import {
  Package,
  TrendingUp,
  Clock,
  MoreVertical,
  Trash2,
  Copy,
  Eye,
  Pencil,
} from 'lucide-react';
import {
  getBudgetStats,
  deleteBudget,
  duplicateBudget,
  getProjects,
} from '../actions';
import { EditBudgetModal } from '../[id]/components/EditBudgetModal';

interface BudgetCardProps {
  budget: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    projects: { id: string; name: string } | null;
  };
  onDeleted?: () => void;
  /** When provided (e.g. context view), links and redirects use this instead of /budgets/[id] */
  getDetailHref?: (budgetId: string) => string;
}

export function BudgetCard({
  budget,
  onDeleted,
  getDetailHref,
}: BudgetCardProps) {
  const { t } = useI18n();
  const [stats, setStats] = useState({
    total: 0,
    acquired: 0,
    pending: 0,
    itemCount: 0,
    categoryCount: 0,
    progress: 0,
  });
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [projectsForEdit, setProjectsForEdit] = useState<
    { id: string; name: string }[]
  >([]);
  const router = useRouter();

  const budgetForModal = {
    id: budget.id,
    name: budget.name,
    description: budget.description ?? null,
    project_id:
      (budget as { project_id?: string | null }).project_id ??
      budget.projects?.id ??
      null,
  };

  useEffect(() => {
    getBudgetStats(budget.id).then(setStats);
  }, [budget.id]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(t('budgets.delete_confirm', { name: budget.name }))) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteBudget(budget.id);
      if (onDeleted) {
        onDeleted();
      }
    } catch (error) {
      captureWithContext(error, {
        module: 'budgets',
        action: 'deleteBudget',
        userIntent: 'Eliminar presupuesto',
        expected: 'El presupuesto se elimina de la lista',
        extra: { budgetId: budget.id },
      });
      alert(t('budgets.delete_error'));
      setIsDeleting(false);
    }
  };

  const detailHref = getDetailHref?.(budget.id) ?? `/budgets/${budget.id}`;

  const handleView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(false);
    router.push(detailHref);
  };

  const handleEdit = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(false);
    const list = await getProjects();
    setProjectsForEdit(list ?? []);
    setShowEditModal(true);
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDuplicating(true);
    try {
      const result = await duplicateBudget(budget.id);
      setShowMenu(false);
      if (onDeleted) {
        onDeleted();
      }
      if (result?.budgetId) {
        router.push(
          getDetailHref?.(result.budgetId) ?? `/budgets/${result.budgetId}`
        );
      } else {
        setIsDuplicating(false);
      }
    } catch (error) {
      captureWithContext(error, {
        module: 'budgets',
        action: 'duplicateBudget',
        userIntent: 'Duplicar presupuesto',
        expected: 'Se crea una copia y se navega al nuevo',
        extra: { budgetId: budget.id },
      });
      alert('Failed to duplicate budget');
      setIsDuplicating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <>
      <Link href={detailHref} className="h-full min-h-0 flex">
        <div className="bg-card rounded-lg shadow-sm border border-border p-6 hover:shadow-md transition-all hover:border-primary/50 cursor-pointer relative group flex flex-col w-full min-h-0">
          {/* Menu button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="absolute top-4 right-4 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent z-10"
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              />
              <div className="absolute top-12 right-4 bg-card rounded-lg shadow-lg border border-border py-2 z-30 min-w-[150px]">
                <button
                  type="button"
                  onClick={handleView}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-foreground"
                >
                  <Eye className="w-4 h-4" />
                  {t('budgets.view')}
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-foreground"
                >
                  <Pencil className="w-4 h-4" />
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={handleDuplicate}
                  disabled={isDuplicating}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 disabled:opacity-50 text-foreground"
                >
                  <Copy className="w-4 h-4" />
                  {isDuplicating
                    ? t('budgets.duplicating')
                    : t('budgets.duplicate')}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? t('budgets.deleting') : t('common.delete')}
                </button>
              </div>
            </>
          )}

          {/* Top: title, description, badge */}
          <div className="flex-shrink-0">
            <h3 className="text-lg font-semibold text-foreground mb-1 pr-8 line-clamp-2">
              {budget.name}
            </h3>

            {budget.description && (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {budget.description}
              </p>
            )}

            {budget.projects && (
              <div className="mb-4">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {budget.projects.name}
                </span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-4 flex-shrink-0">
            <div>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <Package className="w-3 h-3" />
                {t('budgets.items')}
              </div>
              <div className="text-lg font-semibold text-foreground">
                {stats.itemCount}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <TrendingUp className="w-3 h-3" />
                {t('budgets.categories')}
              </div>
              <div className="text-lg font-semibold text-foreground">
                {stats.categoryCount}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <Clock className="w-3 h-3" />
                {t('budgets.progress')}
              </div>
              <div className="text-lg font-semibold text-foreground">
                {stats.progress}%
              </div>
            </div>
          </div>

          {/* Spacer so total + progress stick to bottom */}
          <div className="flex-1 min-h-2" />

          {/* Total amount */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {t('budgets.total_budget')}
                </div>
                <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {formatCurrency(stats.total)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-green-600 dark:text-green-400 mb-1">
                  ✓ {formatCurrency(stats.acquired)}
                </div>
                <div className="text-xs text-yellow-600 dark:text-yellow-400">
                  ⏳ {formatCurrency(stats.pending)}
                </div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 flex-shrink-0">
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
        </div>
      </Link>

      <EditBudgetModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onUpdated={() => {
          setShowEditModal(false);
          onDeleted?.();
        }}
        projects={projectsForEdit}
        budget={budgetForModal}
      />
    </>
  );
}
