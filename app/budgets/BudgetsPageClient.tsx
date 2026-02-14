'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { signOut } from '@/app/actions/auth'
import { Plus } from 'lucide-react'
import { getBudgets } from './actions'
import { BudgetCard } from './components/BudgetCard'
import { CreateBudgetModal } from './components/CreateBudgetModal'
import { EmptyState } from './components/EmptyState'

type Project = Database['public']['Tables']['projects']['Row']

export default function BudgetsPageClient() {
  const [projects, setProjects] = useState<Project[]>([])
  const [budgets, setBudgets] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
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

  const loadBudgets = useCallback(async () => {
    setIsLoading(true)
    const data = await getBudgets()
    setBudgets(data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadProjects()
    loadBudgets()
  }, [loadProjects, loadBudgets])

  // Reload budgets when modal closes
  const handleModalClose = () => {
    setIsModalOpen(false)
    loadBudgets()
  }

  // Filter budgets by search query
  const filteredBudgets = budgets.filter(budget => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      budget.name.toLowerCase().includes(query) ||
      (budget.description && budget.description.toLowerCase().includes(query)) ||
      (budget.projects && budget.projects.name.toLowerCase().includes(query))
    )
  })

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSignOut={signOut}
          onProjectAdded={loadProjects}
          onProjectUpdated={loadProjects}
          projectName="Presupuestos"
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
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignOut={signOut}
        onProjectAdded={loadProjects}
        onProjectUpdated={loadProjects}
        projectName="Presupuestos"
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
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Presupuestos
              </h1>
              <p className="text-muted-foreground mt-2">
                Gestiona tus presupuestos y compras por proyecto
              </p>
            </div>

            {filteredBudgets.length > 0 && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-5 h-5 mr-2" />
                New Budget
              </button>
            )}
          </div>

          {/* Content */}
          {filteredBudgets.length === 0 && budgets.length === 0 ? (
            <EmptyState onCreateClick={() => setIsModalOpen(true)} />
          ) : filteredBudgets.length === 0 ? (
            <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No budgets found matching &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBudgets.map((budget) => (
                <BudgetCard
                  key={budget.id}
                  budget={budget}
                  onDeleted={loadBudgets}
                />
              ))}
            </div>
          )}

          {/* Show create button when no results but budgets exist */}
          {filteredBudgets.length === 0 && budgets.length > 0 && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-5 h-5 mr-2" />
                New Budget
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <CreateBudgetModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
      />
    </div>
  )
}
