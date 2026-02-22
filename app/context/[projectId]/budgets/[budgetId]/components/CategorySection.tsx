'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { captureWithContext } from '@/lib/sentry';
import {
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2,
  ListChecks,
  GripVertical,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { deleteCategory } from '@/app/actions/budget-detail';
import { ItemsList } from './ItemsList';
import { EditCategoryModal } from './EditCategoryModal';

interface CategorySectionProps {
  category: {
    id: string;
    name: string;
    description: string | null;
    items: any[];
    category_total: number;
    acquired_total: number;
    item_count: number;
  };
  budgetId: string;
  onRefresh: () => void;
  onItemCreated?: (categoryId: string, item: any) => void;
  onItemUpdated?: (categoryId: string, item: any) => void;
  onItemDeleted?: (categoryId: string, item: any) => void;
  onItemsDeleted?: (categoryId: string, items: any[]) => void;
  onItemsReordered?: (categoryId: string, itemIds: string[]) => void;
}

export function CategorySection({
  category,
  budgetId,
  onRefresh,
  onItemCreated,
  onItemUpdated,
  onItemDeleted,
  onItemsDeleted,
  onItemsReordered,
}: CategorySectionProps) {
  const { t } = useI18n();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSelectingItems, setIsSelectingItems] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  } as React.CSSProperties;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${category.name}"? All items in this category will be deleted.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteCategory(category.id, budgetId);
      onRefresh();
    } catch (error) {
      captureWithContext(error, {
        module: 'budgets',
        action: 'deleteCategory',
        userIntent: 'Eliminar categoría del presupuesto',
        expected: 'La categoría y sus ítems se eliminan',
        extra: { budgetId, categoryId: category.id },
      });
      alert('Failed to delete category');
      setIsDeleting(false);
    }
  };

  const openEdit = () => {
    setShowMenu(false);
    setIsEditOpen(true);
  };

  const toggleSelectItems = () => {
    setShowMenu(false);
    setIsExpanded(true);
    setIsSelectingItems((v) => !v);
  };

  const progress =
    category.category_total > 0
      ? (category.acquired_total / category.category_total) * 100
      : 0;

  // Position dropdown via portal when open so it's not clipped by overflow
  useEffect(() => {
    if (!showMenu) {
      setMenuPosition(null);
      return;
    }
    if (!menuButtonRef.current) return;
    const rect = menuButtonRef.current.getBoundingClientRect();
    const menuWidth = 160;
    setMenuPosition({
      top: rect.bottom + 4,
      left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
    });
  }, [showMenu]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* Category Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center justify-between">
          {/* Drag handle */}
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="mr-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag to reorder category"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-3 flex-1 text-left group"
          >
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-gray-500 transition-transform" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-500 transition-transform" />
            )}

            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {category.name}
                </h3>
                <span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-full">
                  {t('budgets.items_count', { count: category.item_count })}
                </span>
              </div>

              {category.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {category.description}
                </p>
              )}
            </div>

            {/* Category Total */}
            <div className="text-right mr-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {t('budgets.subtotal')}
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(category.category_total)}
              </div>
            </div>
          </button>

          {/* Menu */}
          <div className="relative">
            <button
              ref={menuButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((v) => !v);
              }}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-gray-500" />
            </button>

            {showMenu &&
              typeof document !== 'undefined' &&
              menuPosition &&
              createPortal(
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  <div
                    className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-20 min-w-[160px]"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit();
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectItems();
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <ListChecks className="w-4 h-4" />
                      {isSelectingItems
                        ? t('budgets.exit_multi_select')
                        : t('budgets.multi_select_items')}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        handleDelete();
                      }}
                      disabled={isDeleting}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isDeleting ? t('budgets.deleting') : t('common.delete')}
                    </button>
                  </div>
                </>,
                document.body
              )}
          </div>
        </div>

        {/* Progress bar */}
        {category.category_total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
              <span>{t('budgets.progress')}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <EditCategoryModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onUpdated={onRefresh}
        category={category}
        budgetId={budgetId}
      />

      {/* Items List - Collapsed/Expanded */}
      {isExpanded && (
        <div className="p-0">
          <ItemsList
            items={category.items}
            categoryId={category.id}
            budgetId={budgetId}
            onRefresh={onRefresh}
            onItemCreated={(item) => onItemCreated?.(category.id, item)}
            onItemUpdated={(item) => onItemUpdated?.(category.id, item)}
            onItemDeleted={(item) => onItemDeleted?.(category.id, item)}
            onItemsDeleted={(items) => onItemsDeleted?.(category.id, items)}
            onItemsReordered={(itemIds) =>
              onItemsReordered?.(category.id, itemIds)
            }
            selectionMode={isSelectingItems}
            onExitSelectionMode={() => setIsSelectingItems(false)}
          />
        </div>
      )}
    </div>
  );
}
