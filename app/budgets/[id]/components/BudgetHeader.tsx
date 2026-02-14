'use client'

import { ArrowLeft, Edit2 } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EditBudgetModal } from './EditBudgetModal'

interface BudgetHeaderProps {
  budget: {
    id: string
    name: string
    description: string | null
    project_id: string | null
    projects: { id: string; name: string } | null
  }
  projects: { id: string; name: string }[]
  stats: {
    total: number
    acquired: number
    pending: number
    progress: number
  }
  onUpdated: () => void
  /** When true, back button and h1 are omitted (used inside DetailLayout) */
  compact?: boolean
}

export function BudgetHeader({ budget, projects, stats, onUpdated, compact }: BudgetHeaderProps) {
  const { t, formatCurrency: formatCurr } = useI18n()
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const editButton = (
    <button
      onClick={() => setIsEditOpen(true)}
      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      aria-label={t('common.edit')}
    >
      <Edit2 className="w-5 h-5 text-gray-500" />
    </button>
  )

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6 mb-4 sm:mb-6">
      {!compact && (
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <button
              onClick={() => router.push('/budgets')}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('budgets.back_to_budgets')}
            </button>

            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                  {budget.name}
                </h1>
                {budget.description && (
                  <p className="text-muted-foreground">
                    {budget.description}
                  </p>
                )}
                {budget.projects && (
                  <div className="mt-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
                      📁 {budget.projects.name}
                    </span>
                  </div>
                )}
              </div>
              {editButton}
            </div>
          </div>
        </div>
      )}

      {compact && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            {budget.description && (
              <p className="text-sm text-muted-foreground">{budget.description}</p>
            )}
            {budget.projects && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mt-2">
                📁 {budget.projects.name}
              </span>
            )}
          </div>
          {editButton}
        </div>
      )}

      <EditBudgetModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onUpdated={onUpdated}
        projects={projects}
        budget={budget}
      />

      {/* Total Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Budget */}
        <div className="col-span-1 md:col-span-2">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {t('budgets.total_budget')}
          </div>
          <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {formatCurrency(stats.total)}
          </div>
        </div>

        {/* Acquired */}
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {t('budgets.item_status_acquired')}
          </div>
          <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(stats.acquired)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats.progress}%
          </div>
        </div>

        {/* Pending */}
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {t('budgets.item_status_pending')}
          </div>
          <div className="text-2xl font-semibold text-yellow-600 dark:text-yellow-400">
            {formatCurrency(stats.pending)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {100 - stats.progress}%
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${stats.progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
