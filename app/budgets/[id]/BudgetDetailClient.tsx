'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Database } from '@/lib/supabase/types';
import { DetailLayout } from '@/components/DetailLayout';
import { Plus, FolderPlus, Package, ChevronLeft } from 'lucide-react';
import { getProjectsForSidebar } from '@/app/actions/projects';
import { getBudgetWithData, reorderCategories, reorderItems } from './actions';
import { BudgetHeader } from './components/BudgetHeader';
import { CategorySection } from './components/CategorySection';
import { CreateCategoryModal } from './components/CreateCategoryModal';
import { CreateItemModal } from './components/CreateItemModal';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

type Project = Database['public']['Tables']['projects']['Row'];
type BudgetItem = Database['public']['Tables']['budget_items']['Row'];
type BudgetCategory = Database['public']['Tables']['budget_categories']['Row'];

interface BudgetDetailClientProps {
  budgetId: string;
}

export default function BudgetDetailClient({
  budgetId,
}: BudgetDetailClientProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgetData, setBudgetData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [fabSubView, setFabSubView] = useState<'main' | 'pick-category'>(
    'main'
  );
  const [categoryIdForNewItem, setCategoryIdForNewItem] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fabRef = useRef<HTMLDivElement>(null);

  // Close FAB menu when clicking outside
  useEffect(() => {
    if (!fabMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setFabMenuOpen(false);
        setFabSubView('main');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fabMenuOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const loadProjects = useCallback(async () => {
    const data = await getProjectsForSidebar();
    setProjects(data);
  }, []);

  const loadBudgetData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getBudgetWithData(budgetId);
      setBudgetData(data);
    } catch (error) {
      console.error('Error loading budget:', error);
      alert('Failed to load budget');
    } finally {
      setIsLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    loadProjects();
    loadBudgetData();
  }, [loadProjects, loadBudgetData]);

  const handleCategoryModalClose = () => {
    setIsCategoryModalOpen(false);
  };

  const handleCategoryCreated = useCallback((created: BudgetCategory) => {
    setBudgetData((prev: any) => {
      if (!prev) return prev;
      const nextCategory = {
        ...created,
        items: [],
        category_total: 0,
        acquired_total: 0,
        item_count: 0,
      };
      const nextCategories = [...(prev.categories || []), nextCategory].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );
      return { ...prev, categories: nextCategories };
    });
  }, []);

  const handleItemCreated = useCallback(
    (categoryId: string, item: BudgetItem) => {
      setBudgetData((prev: any) => {
        if (!prev) return prev;
        const nextCategories = (prev.categories || []).map((cat: any) => {
          if (cat.id !== categoryId) return cat;

          const qty = Number(item.quantity) || 0;
          const price = Number(item.unit_price) || 0;
          const delta = qty * price;
          const acquiredDelta = item.status === 'acquired' ? delta : 0;

          const nextItems = [...(cat.items || []), item];
          return {
            ...cat,
            items: nextItems,
            item_count: (cat.item_count ?? (cat.items || []).length) + 1,
            category_total: (Number(cat.category_total) || 0) + delta,
            acquired_total: (Number(cat.acquired_total) || 0) + acquiredDelta,
          };
        });
        return { ...prev, categories: nextCategories };
      });
    },
    []
  );

  const handleItemDeleted = useCallback(
    (categoryId: string, item: BudgetItem) => {
      setBudgetData((prev: any) => {
        if (!prev) return prev;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        const delta = qty * price;
        const acquiredDelta = item.status === 'acquired' ? delta : 0;

        const nextCategories = (prev.categories || []).map((cat: any) => {
          if (cat.id !== categoryId) return cat;
          const nextItems = (cat.items || []).filter(
            (i: any) => i.id !== item.id
          );
          return {
            ...cat,
            items: nextItems,
            item_count: Math.max(
              0,
              (cat.item_count ?? (cat.items || []).length) - 1
            ),
            category_total: (Number(cat.category_total) || 0) - delta,
            acquired_total: (Number(cat.acquired_total) || 0) - acquiredDelta,
          };
        });
        return { ...prev, categories: nextCategories };
      });
    },
    []
  );

  const handleItemsDeleted = useCallback(
    (categoryId: string, items: BudgetItem[]) => {
      setBudgetData((prev: any) => {
        if (!prev) return prev;

        const ids = new Set(items.map((i) => i.id));
        const totalDelta = items.reduce(
          (sum, i) =>
            sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
          0
        );
        const acquiredDelta = items
          .filter((i) => i.status === 'acquired')
          .reduce(
            (sum, i) =>
              sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
            0
          );

        const nextCategories = (prev.categories || []).map((cat: any) => {
          if (cat.id !== categoryId) return cat;
          const nextItems = (cat.items || []).filter(
            (i: any) => !ids.has(i.id)
          );
          return {
            ...cat,
            items: nextItems,
            item_count: Math.max(
              0,
              (cat.item_count ?? (cat.items || []).length) - items.length
            ),
            category_total: (Number(cat.category_total) || 0) - totalDelta,
            acquired_total: (Number(cat.acquired_total) || 0) - acquiredDelta,
          };
        });

        return { ...prev, categories: nextCategories };
      });
    },
    []
  );

  const handleItemUpdated = useCallback(
    (categoryId: string, updated: BudgetItem) => {
      setBudgetData((prev: any) => {
        if (!prev) return prev;

        const nextCategories = (prev.categories || []).map((cat: any) => {
          if (cat.id !== categoryId) return cat;

          const existing = (cat.items || []).find(
            (i: any) => i.id === updated.id
          ) as BudgetItem | undefined;
          if (!existing) {
            // If we don't have it locally, fall back to replacing nothing.
            return cat;
          }

          const oldTotal =
            (Number(existing.quantity) || 0) *
            (Number(existing.unit_price) || 0);
          const newTotal =
            (Number(updated.quantity) || 0) * (Number(updated.unit_price) || 0);
          const deltaTotal = newTotal - oldTotal;

          const oldAcquired = existing.status === 'acquired' ? oldTotal : 0;
          const newAcquired = updated.status === 'acquired' ? newTotal : 0;
          const deltaAcquired = newAcquired - oldAcquired;

          const nextItems = (cat.items || []).map((i: any) =>
            i.id === updated.id ? updated : i
          );

          return {
            ...cat,
            items: nextItems,
            category_total: (Number(cat.category_total) || 0) + deltaTotal,
            acquired_total: (Number(cat.acquired_total) || 0) + deltaAcquired,
          };
        });

        return { ...prev, categories: nextCategories };
      });
    },
    []
  );

  const handleItemsReordered = useCallback(
    (categoryId: string, itemIds: string[]) => {
      if (!budgetData?.categories) return;

      const prevCategories = budgetData.categories;

      // Optimistically reorder locally
      setBudgetData((prev: any) => {
        if (!prev) return prev;
        const nextCategories = (prev.categories || []).map((cat: any) => {
          if (cat.id !== categoryId) return cat;
          const byId = new Map((cat.items || []).map((i: any) => [i.id, i]));
          const nextItems = itemIds
            .map((id, idx) => {
              const it = byId.get(id);
              return it ? { ...it, sort_order: idx } : it;
            })
            .filter(Boolean);
          return { ...cat, items: nextItems };
        });
        return { ...prev, categories: nextCategories };
      });
      (async () => {
        try {
          await reorderItems(budgetId, categoryId, itemIds);
        } catch (e) {
          console.error('Failed to reorder items:', e);
          // revert if the save fails
          setBudgetData((prev: any) =>
            prev ? { ...prev, categories: prevCategories } : prev
          );
          alert('Failed to reorder items');
        }
      })();
    },
    [budgetData?.categories, budgetId]
  );

  const handleCategoryDragEnd = useCallback(
    ({ active, over }: { active: any; over: any }) => {
      if (!budgetData?.categories) return;
      if (!over) return;
      if (active.id === over.id) return;

      const prevCategories = budgetData.categories;
      const oldIndex = prevCategories.findIndex((c: any) => c.id === active.id);
      const newIndex = prevCategories.findIndex((c: any) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const nextCategories = arrayMove(prevCategories, oldIndex, newIndex).map(
        (c: any, idx: number) => ({
          ...c,
          sort_order: idx,
        })
      );

      setBudgetData((prev: any) =>
        prev ? { ...prev, categories: nextCategories } : prev
      );

      const nextIds = nextCategories.map((c: any) => c.id);
      (async () => {
        try {
          await reorderCategories(budgetId, nextIds);
        } catch (e) {
          console.error('Failed to reorder categories:', e);
          // revert if the save fails
          setBudgetData((prev: any) =>
            prev ? { ...prev, categories: prevCategories } : prev
          );
          alert('Failed to reorder categories');
        }
      })();
    },
    [budgetData?.categories, budgetId]
  );

  if (isLoading) {
    return (
      <DetailLayout
        backHref="/budgets"
        backLabel=""
        title={t('budgets.detail_title')}
        contentClassName="p-4 sm:p-6"
      >
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
        </div>
      </DetailLayout>
    );
  }

  if (!budgetData) {
    return (
      <DetailLayout
        backHref="/budgets"
        backLabel=""
        title={t('budgets.detail_title')}
        contentClassName="p-4 sm:p-6"
      >
        <div className="bg-destructive/10 border border-destructive rounded-lg p-6 text-center">
          <p className="text-destructive">Budget not found</p>
        </div>
      </DetailLayout>
    );
  }

  // Calculate overall stats
  const totalBudget = budgetData.categories.reduce(
    (sum: number, cat: any) => sum + cat.category_total,
    0
  );
  const totalAcquired = budgetData.categories.reduce(
    (sum: number, cat: any) => sum + cat.acquired_total,
    0
  );
  const totalPending = totalBudget - totalAcquired;
  const overallProgress =
    totalBudget > 0 ? (totalAcquired / totalBudget) * 100 : 0;

  const stats = {
    total: totalBudget,
    acquired: totalAcquired,
    pending: totalPending,
    progress: Math.round(overallProgress),
  };

  return (
    <>
      <DetailLayout
        backHref="/budgets"
        backLabel=""
        title={t('budgets.detail_title')}
        contentClassName="p-4 sm:p-6 max-w-7xl mx-auto w-full"
      >
        <BudgetHeader
          budget={budgetData.budget}
          projects={projects}
          stats={stats}
          onUpdated={loadBudgetData}
          compact
        />

        {/* Categories */}
        <div className="space-y-4 mt-4">
          {budgetData.categories.length === 0 ? (
            <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
              <div className="mx-auto w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-6">
                <Plus className="w-10 h-10 text-primary-foreground" />
              </div>

              <h3 className="text-xl font-semibold text-foreground mb-2">
                No categories yet
              </h3>

              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Start organizing your budget by creating categories like
                Equipment, Establishment, or Cleaning.
              </p>

              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create First Category
              </button>
            </div>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleCategoryDragEnd}
              >
                <SortableContext
                  items={budgetData.categories.map((c: any) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {budgetData.categories.map((category: any) => (
                    <CategorySection
                      key={category.id}
                      category={category}
                      budgetId={budgetId}
                      onRefresh={loadBudgetData}
                      onItemCreated={handleItemCreated}
                      onItemUpdated={handleItemUpdated}
                      onItemDeleted={handleItemDeleted}
                      onItemsDeleted={handleItemsDeleted}
                      onItemsReordered={handleItemsReordered}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Add Category Button */}
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="w-full p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-center justify-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">
                    {t('budgets.add_category')}
                  </span>
                </div>
              </button>
            </>
          )}
        </div>

        {/* Floating action button with menu */}
        <div
          ref={fabRef}
          className="fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8 flex flex-col items-end gap-2"
        >
          {fabMenuOpen && (
            <div className="mb-2 w-56 rounded-lg border border-border bg-background shadow-xl overflow-hidden">
              {fabSubView === 'main' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFabMenuOpen(false);
                      setIsCategoryModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <FolderPlus className="w-5 h-5 text-muted-foreground shrink-0" />
                    {t('budgets.add_category')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const categories = budgetData?.categories ?? [];
                      if (categories.length === 0) {
                        setFabMenuOpen(false);
                        setIsCategoryModalOpen(true);
                        return;
                      }
                      setFabSubView('pick-category');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent transition-colors border-t border-border"
                  >
                    <Package className="w-5 h-5 text-muted-foreground shrink-0" />
                    {t('budgets.add_item')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setFabSubView('main')}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-accent transition-colors border-b border-border"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t('budgets.select_category')}
                  </button>
                  <div className="max-h-48 overflow-y-auto">
                    {(budgetData?.categories ?? []).map((cat: any) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setCategoryIdForNewItem(cat.id);
                          setFabMenuOpen(false);
                          setFabSubView('main');
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-accent transition-colors"
                      >
                        <span className="truncate">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setFabMenuOpen((open) => !open)}
            aria-label={t('budgets.add_category')}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:h-14 md:w-14"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </DetailLayout>

      <CreateCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={handleCategoryModalClose}
        onCreated={handleCategoryCreated}
        budgetId={budgetId}
      />

      {categoryIdForNewItem && (
        <CreateItemModal
          isOpen={!!categoryIdForNewItem}
          onClose={() => setCategoryIdForNewItem(null)}
          onCreated={(item) => {
            handleItemCreated(categoryIdForNewItem, item);
            setCategoryIdForNewItem(null);
          }}
          categoryId={categoryIdForNewItem}
          budgetId={budgetId}
        />
      )}
    </>
  );
}
