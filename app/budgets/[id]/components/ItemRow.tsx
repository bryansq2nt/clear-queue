'use client'

import { useEffect, useState } from 'react'
import { Edit, Trash2, ExternalLink, RefreshCw } from 'lucide-react'
import { Database } from '@/lib/supabase/types'

type BudgetItem = Database['public']['Tables']['budget_items']['Row']

interface ItemRowProps {
  item: BudgetItem
  budgetId: string
  onEdit: (item: BudgetItem) => void
  onDelete: (itemId: string) => void
  selectionMode?: boolean
  selected?: boolean
  onToggleSelected?: (itemId: string) => void
  flash?: boolean
}

export function ItemRow({
  item,
  budgetId,
  onEdit,
  onDelete,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  flash = false,
}: ItemRowProps) {
  const [showMenu, setShowMenu] = useState(false)
  // Start highlighted immediately when the row mounts with flash=true
  const [isFlashing, setIsFlashing] = useState(flash)

  useEffect(() => {
    if (!flash) {
      setIsFlashing(false)
      return
    }

    // Ensure it's highlighted now, then fade out
    setIsFlashing(true)
    const t = setTimeout(() => setIsFlashing(false), 1600)
    return () => clearTimeout(t)
  }, [flash])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const subtotal = Number(item.quantity) * Number(item.unit_price)

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    quoted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    acquired: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  }

  const statusLabels = {
    pending: '⏳ Pending',
    quoted: '💬 Quoted',
    acquired: '✅ Acquired',
  }

  return (
    <div
      className={`group border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors duration-700 ease-out ${
        selectionMode
          ? 'hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer'
          : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
      } ${
        isFlashing
          ? 'bg-emerald-200/70 dark:bg-emerald-900/35 hover:bg-emerald-200/70 dark:hover:bg-emerald-900/35'
          : ''
      }`}
      onClick={() => {
        if (!selectionMode) return
        onToggleSelected?.(item.id)
      }}
    >
      <div className="p-4 flex items-start gap-4">
        {selectionMode && (
          <div className="pt-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelected?.(item.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                {item.name}
              </h4>
              {item.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {item.description}
                </p>
              )}
            </div>

            {/* Subtotal */}
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {formatCurrency(subtotal)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {item.quantity} × {formatCurrency(Number(item.unit_price))}
              </div>
            </div>
          </div>

          {/* Metadata Row */}
          <div className="flex items-center gap-3 flex-wrap mt-2">
            {/* Status */}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
              {statusLabels[item.status]}
            </span>

            {/* Recurrent Badge */}
            {item.is_recurrent && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                <RefreshCw className="w-3 h-3" />
                Recurrent
              </span>
            )}

            {/* Link */}
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                View Link
              </a>
            )}

            {/* Notes indicator */}
            {item.notes && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                📝 Has notes
              </span>
            )}
          </div>

          {/* Notes preview */}
          {item.notes && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
              {item.notes}
            </div>
          )}
        </div>

        {/* Actions Menu */}
        {!selectionMode && (
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            >
              <Edit className="w-4 h-4 text-gray-500" />
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
                      onEdit(item)
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
                      if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
                        onDelete(item.id)
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
