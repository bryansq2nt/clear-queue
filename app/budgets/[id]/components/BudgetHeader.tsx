'use client'

import { ArrowLeft, Edit2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface BudgetHeaderProps {
  budget: {
    id: string
    name: string
    description: string | null
    projects: { id: string; name: string } | null
  }
  stats: {
    total: number
    acquired: number
    pending: number
    progress: number
  }
}

export function BudgetHeader({ budget, stats }: BudgetHeaderProps) {
  const router = useRouter()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
      {/* Back button + Title */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <button
            onClick={() => router.push('/budgets')}
            className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Budgets
          </button>

          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {budget.name}
              </h1>
              
              {budget.description && (
                <p className="text-gray-600 dark:text-gray-400">
                  {budget.description}
                </p>
              )}

              {budget.projects && (
                <div className="mt-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    📁 {budget.projects.name}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => alert('Edit budget - TODO next')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Edit2 className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Total Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Budget */}
        <div className="col-span-1 md:col-span-2">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Total Budget
          </div>
          <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {formatCurrency(stats.total)}
          </div>
        </div>

        {/* Acquired */}
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            ✅ Acquired
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
            ⏳ Pending
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
