'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { Plus } from 'lucide-react'
import { getBudgetWithData } from './actions'
import { BudgetHeader } from './components/BudgetHeader'
import { CategorySection } from './components/CategorySection'
import { CreateCategoryModal } from './components/CreateCategoryModal'

type Project = Database['public']['Tables']['projects']['Row']

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
    loadBudgetData() // Refresh data
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-slate-50">
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
            onSelectProject={() => {}}
            onCategoryChange={() => {}}
            onShowArchivedChange={() => {}}
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
      <div className="flex flex-col h-screen bg-slate-50">
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
            onSelectProject={() => {}}
            onCategoryChange={() => {}}
            onShowArchivedChange={() => {}}
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
    <div className="flex flex-col h-screen bg-slate-50">
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
          onSelectProject={() => {}}
          onCategoryChange={() => {}}
          onShowArchivedChange={() => {}}
          onProjectUpdated={loadProjects}
        />
        <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
          {/* Header with totals */}
          <BudgetHeader budget={budgetData.budget} stats={stats} />

          {/* Categories */}
          <div className="space-y-4">
            {budgetData.categories.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mb-6">
                  <Plus className="w-10 h-10 text-white" />
                </div>
                
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  No categories yet
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  Start organizing your budget by creating categories like Equipment, Establishment, or Cleaning.
                </p>
                
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create First Category
                </button>
              </div>
            ) : (
              <>
                {budgetData.categories.map((category: any) => (
                  <CategorySection
                    key={category.id}
                    category={category}
                    budgetId={budgetId}
                    onRefresh={loadBudgetData}
                  />
                ))}

                {/* Add Category Button */}
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="w-full p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all group"
                >
                  <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
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
        budgetId={budgetId}
      />
    </div>
  )
}
