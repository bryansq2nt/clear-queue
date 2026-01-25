'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Package, TrendingUp, Clock, MoreVertical, Trash2, Edit } from 'lucide-react'
import { getBudgetStats, deleteBudget } from '../actions'

interface BudgetCardProps {
  budget: {
    id: string
    name: string
    description: string | null
    created_at: string
    projects: { id: string; name: string } | null
  }
  onDeleted?: () => void
}

export function BudgetCard({ budget, onDeleted }: BudgetCardProps) {
  const [stats, setStats] = useState({
    total: 0,
    acquired: 0,
    pending: 0,
    itemCount: 0,
    categoryCount: 0,
    progress: 0
  })
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    getBudgetStats(budget.id).then(setStats)
  }, [budget.id])

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm(`Are you sure you want to delete "${budget.name}"? This action cannot be undone.`)) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteBudget(budget.id)
      if (onDeleted) {
        onDeleted()
      }
    } catch (error) {
      console.error('Error deleting budget:', error)
      alert('Failed to delete budget')
      setIsDeleting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <Link href={`/budgets/${budget.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-all hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer relative group">
        {/* Menu button */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
          className="absolute top-4 right-4 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
        >
          <MoreVertical className="w-4 h-4 text-gray-500" />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowMenu(false)
              }}
            />
            <div className="absolute top-12 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-30 min-w-[150px]">
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // TODO: Implement edit in next step
                  alert('Edit functionality coming soon')
                  setShowMenu(false)
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </>
        )}

        {/* Budget name */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 pr-8">
          {budget.name}
        </h3>

        {/* Description */}
        {budget.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
            {budget.description}
          </p>
        )}

        {/* Project badge */}
        {budget.projects && (
          <div className="mb-4">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {budget.projects.name}
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Package className="w-3 h-3" />
              Items
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.itemCount}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <TrendingUp className="w-3 h-3" />
              Categories
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.categoryCount}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="w-3 h-3" />
              Progress
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.progress}%
            </div>
          </div>
        </div>

        {/* Total amount */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Budget</div>
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
        <div className="mt-4">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
