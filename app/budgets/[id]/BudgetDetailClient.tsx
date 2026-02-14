'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { Plus } from 'lucide-react'
import { getBudgetWithData, reorderCategories, reorderItems } from './actions'
import { BudgetHeader } from './components/BudgetHeader'
import { CategorySection } from './components/CategorySection'
import { CreateCategoryModal } from './components/CreateCategoryModal'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'

type Project = Database['public']['Tables']['projects']['Row']
type BudgetItem = Database['public']['Tables']['budget_items']['Row']
type BudgetCategory = Database['public']['Tables']['budget_categories']['Row']

interface BudgetDetailClientProps {
  budgetId: string
}

export default function BudgetDetailClient({ budgetId }: BudgetDetailClientProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [budgetData, setBudgetData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })

    if (data) {
      setProjects(data as Project[])
    }
  }, [supabase])

  const loadBudgetData = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getBudgetWithData(budgetId)
      setBudgetData(data)
    } catch (error) {
      console.error('Error loading budget:', error)
      alert('Failed to load budget')
    } finally {
      setIsLoading(false)
    }
  }, [budgetId])

  useEffect(() => {
    loadProjects()
    loadBudgetData()
  }, [loadProjects, loadBudgetData])

  const handleCategoryModalClose = () => {
    setIsCategoryModalOpen(false)
  }

  const handleCategoryCreated = useCallback((created: BudgetCategory) => {
    setBudgetData((prev: any) => {
      if (!prev) return prev
      const nextCategory = {
        ...created,
        items: [],
        category_total: 0,
        acquired_total: 0,
        item_count: 0,
      }
      const nextCategories = [...(prev.categories || []), nextCategory].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )
      return { ...prev, categories: nextCategories }
    })
  }, [])

  const handleItemCreated = useCallback((categoryId: string, item: BudgetItem) => {
    setBudgetData((prev: any) => {
      if (!prev) return prev
      const nextCategories = (prev.categories || []).map((cat: any) => {
        if (cat.id !== categoryId) return cat

        const qty = Number(item.quantity) || 0
        const price = Number(item.unit_price) || 0
        const delta = qty * price
        const acquiredDelta = item.status === 'acquired' ? delta : 0

        const nextItems = [...(cat.items || []), item]
        return {
          ...cat,
          items: nextItems,
          item_count: (cat.item_count ?? (cat.items || []).length) + 1,
          category_total: (Number(cat.category_total) || 0) + delta,
          acquired_total: (Number(cat.acquired_total) || 0) + acquiredDelta,
        }
      })
      return { ...prev, categories: nextCategories }
    })
  }, [])

  const handleItemDeleted = useCallback((categoryId: string, item: BudgetItem) => {
    setBudgetData((prev: any) => {
      if (!prev) return prev
      const qty = Number(item.quantity) || 0
      const price = Number(item.unit_price) || 0
      const delta = qty * price
      const acquiredDelta = item.status === 'acquired' ? delta : 0

      const nextCategories = (prev.categories || []).map((cat: any) => {
        if (cat.id !== categoryId) return cat
        const nextItems = (cat.items || []).filter((i: any) => i.id !== item.id)
        return {
          ...cat,
          items: nextItems,
          item_count: Math.max(0, (cat.item_count ?? (cat.items || []).length) - 1),
          category_total: (Number(cat.category_total) || 0) - delta,
          acquired_total: (Number(cat.acquired_total) || 0) - acquiredDelta,
        }
      })
      return { ...prev, categories: nextCategories }
    })
  }, [])

  const handleItemsDeleted = useCallback((categoryId: string, items: BudgetItem[]) => {
    setBudgetData((prev: any) => {
      if (!prev) return prev

      const ids = new Set(items.map((i) => i.id))
      const totalDelta = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
      const acquiredDelta = items
        .filter((i) => i.status === 'acquired')
        .reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)

      const nextCategories = (prev.categories || []).map((cat: any) => {
        if (cat.id !== categoryId) return cat
        const nextItems = (cat.items || []).filter((i: any) => !ids.has(i.id))
        return {
          ...cat,
          items: nextItems,
          item_count: Math.max(0, (cat.item_count ?? (cat.items || []).length) - items.length),
          category_total: (Number(cat.category_total) || 0) - totalDelta,
          acquired_total: (Number(cat.acquired_total) || 0) - acquiredDelta,
        }
      })

      return { ...prev, categories: nextCategories }
    })
  }, [])

  const handleItemUpdated = useCallback((categoryId: string, updated: BudgetItem) => {
    setBudgetData((prev: any) => {
      if (!prev) return prev

      const nextCategories = (prev.categories || []).map((cat: any) => {
        if (cat.id !== categoryId) return cat

        const existing = (cat.items || []).find((i: any) => i.id === updated.id) as BudgetItem | undefined
        if (!existing) {
          // If we don't have it locally, fall back to replacing nothing.
          return cat
        }

        const oldTotal = (Number(existing.quantity) || 0) * (Number(existing.unit_price) || 0)
        const newTotal = (Number(updated.quantity) || 0) * (Number(updated.unit_price) || 0)
        const deltaTotal = newTotal - oldTotal

        const oldAcquired = existing.status === 'acquired' ? oldTotal : 0
        const newAcquired = updated.status === 'acquired' ? newTotal : 0
        const deltaAcquired = newAcquired - oldAcquired

        const nextItems = (cat.items || []).map((i: any) => (i.id === updated.id ? updated : i))

        return {
          ...cat,
          items: nextItems,
          category_total: (Number(cat.category_total) || 0) + deltaTotal,
          acquired_total: (Number(cat.acquired_total) || 0) + deltaAcquired,
        }
      })

      return { ...prev, categories: nextCategories }
    })
  }, [])

  const handleItemsReordered = useCallback(
    (categoryId: string, itemIds: string[]) => {
      if (!budgetData?.categories) return

      const prevCategories = budgetData.categories

      // Optimistically reorder locally
      setBudgetData((prev: any) => {
        if (!prev) return prev
        const nextCategories = (prev.categories || []).map((cat: any) => {
          if (cat.id !== categoryId) return cat
          const byId = new Map((cat.items || []).map((i: any) => [i.id, i]))
          const nextItems = itemIds.map((id, idx) => {
            const it = byId.get(id)
            return it ? { ...it, sort_order: idx } : it
          }).filter(Boolean)
          return { ...cat, items: nextItems }
        })
        return { ...prev, categories: nextCategories }
      })

      ;(async () => {
        try {
          await reorderItems(budgetId, categoryId, itemIds)
        } catch (e) {
          console.error('Failed to reorder items:', e)
          // revert if the save fails
          setBudgetData((prev: any) => (prev ? { ...prev, categories: prevCategories } : prev))
          alert('Failed to reorder items')
        }
      })()
    },
    [budgetData?.categories, budgetId]
  )

  const handleCategoryDragEnd = useCallback(
    ({ active, over }: { active: any; over: any }) => {
      if (!budgetData?.categories) return
      if (!over) return
      if (active.id === over.id) return

      const prevCategories = budgetData.categories
      const oldIndex = prevCategories.findIndex((c: any) => c.id === active.id)
      const newIndex = prevCategories.findIndex((c: any) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const nextCategories = arrayMove(prevCategories, oldIndex, newIndex).map((c: any, idx: number) => ({
        ...c,
        sort_order: idx,
      }))

      setBudgetData((prev: any) => (prev ? { ...prev, categories: nextCategories } : prev))

      const nextIds = nextCategories.map((c: any) => c.id)
      ;(async () => {
        try {
          await reorderCategories(budgetId, nextIds)
        } catch (e) {
          console.error('Failed to reorder categories:', e)
          // revert if the save fails
          setBudgetData((prev: any) => (prev ? { ...prev, categories: prevCategories } : prev))
          alert('Failed to reorder categories')
        }
      })()
    },
    [budgetData?.categories, budgetId]
  )

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSignOut={signOut}
          onProjectAdded={loadProjects}
          onProjectUpdated={loadProjects}
          projectName={budgetData?.budget?.name || 'Budget'}
          currentProject={null}
        />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            projects={projects}
            selectedProject={null}
            selectedCategory={null}
            showArchived={false}
            onSelectProject={() => { }}
            onCategoryChange={() => { }}
            onShowArchivedChange={() => { }}
            onProjectUpdated={loadProjects}
          />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!budgetData) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSignOut={signOut}
          onProjectAdded={loadProjects}
          onProjectUpdated={loadProjects}
          projectName="Budget"
          currentProject={null}
        />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            projects={projects}
            selectedProject={null}
            selectedCategory={null}
            showArchived={false}
            onSelectProject={() => { }}
            onCategoryChange={() => { }}
            onShowArchivedChange={() => { }}
            onProjectUpdated={loadProjects}
          />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
              <p className="text-red-800 dark:text-red-400">Budget not found</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Calculate overall stats
  const totalBudget = budgetData.categories.reduce(
    (sum: number, cat: any) => sum + cat.category_total,
    0
  )
  const totalAcquired = budgetData.categories.reduce(
    (sum: number, cat: any) => sum + cat.acquired_total,
    0
  )
  const totalPending = totalBudget - totalAcquired
  const overallProgress = totalBudget > 0 ? (totalAcquired / totalBudget) * 100 : 0

  const stats = {
    total: totalBudget,
    acquired: totalAcquired,
    pending: totalPending,
    progress: Math.round(overallProgress)
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignOut={signOut}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName={budgetData.budget.name}
        currentProject={null}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          projects={projects}
          selectedProject={null}
          selectedCategory={null}
          showArchived={false}
          onSelectProject={() => { }}
          onCategoryChange={() => { }}
          onShowArchivedChange={() => { }}
          onProjectUpdated={loadProjects}
        />
        <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
          {/* Header with totals */}
          <BudgetHeader
            budget={budgetData.budget}
            projects={projects}
            stats={stats}
            onUpdated={loadBudgetData}
          />

          {/* Categories */}
          <div className="space-y-4">
            {budgetData.categories.length === 0 ? (
              <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
                <div className="mx-auto w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-6">
                  <Plus className="w-10 h-10 text-primary-foreground" />
                </div>

                <h3 className="text-xl font-semibold text-foreground mb-2">
                  No categories yet
                </h3>

                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Start organizing your budget by creating categories like Equipment, Establishment, or Cleaning.
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
                    <span className="font-medium">Add Category</span>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create Category Modal */}
      <CreateCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={handleCategoryModalClose}
        onCreated={handleCategoryCreated}
        budgetId={budgetId}
      />
    </div>
  )
}
