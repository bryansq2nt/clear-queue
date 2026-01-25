'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, MoreVertical, Edit, Trash2 } from 'lucide-react'
import { deleteCategory } from '../actions'
import { ItemsList } from './ItemsList'

interface CategorySectionProps {
  category: {
    id: string
    name: string
    description: string | null
    items: any[]
    category_total: number
    acquired_total: number
    item_count: number
  }
  budgetId: string
  onRefresh: () => void
}

export function CategorySection({ category, budgetId, onRefresh }: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${category.name}"? All items in this category will be deleted.`)) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteCategory(category.id, budgetId)
      onRefresh()
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('Failed to delete category')
      setIsDeleting(false)
    }
  }

  const progress = category.category_total > 0 
    ? (category.acquired_total / category.category_total) * 100 
    : 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Category Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center justify-between">
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
                  {category.item_count} items
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
                Subtotal
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(category.category_total)}
              </div>
            </div>
          </button>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-gray-500" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                  }}
                />
                <div className="absolute top-10 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-20 min-w-[160px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowMenu(false)
                      alert('Edit category - TODO')
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowMenu(false)
                      handleDelete()
                    }}
                    disabled={isDeleting}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {category.category_total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
              <span>Progress</span>
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

      {/* Items List - Collapsed/Expanded */}
      {isExpanded && (
        <div className="p-0">
          <ItemsList
            items={category.items}
            categoryId={category.id}
            budgetId={budgetId}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  )
}
