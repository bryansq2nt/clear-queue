'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X, CheckSquare } from 'lucide-react'
import { ItemRow } from './ItemRow'
import { CreateItemModal } from './CreateItemModal'
import { EditItemModal } from './EditItemModal'
import { deleteItem, deleteItems } from '../actions'
import { Database } from '@/lib/supabase/types'

type BudgetItem = Database['public']['Tables']['budget_items']['Row']

interface ItemsListProps {
  items: BudgetItem[]
  categoryId: string
  budgetId: string
  onRefresh: () => void
  onItemCreated?: (item: BudgetItem) => void
  onItemDeleted?: (item: BudgetItem) => void
  onItemsDeleted?: (items: BudgetItem[]) => void
  selectionMode?: boolean
  onExitSelectionMode?: () => void
}

export function ItemsList({
  items,
  categoryId,
  budgetId,
  onRefresh,
  onItemCreated,
  onItemDeleted,
  onItemsDeleted,
  selectionMode = false,
  onExitSelectionMode,
}: ItemsListProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const allItemIds = useMemo(() => items.map((i) => i.id), [items])
  const selectedCount = selectedIds.size

  useEffect(() => {
    if (!selectionMode) {
      setSelectedIds(new Set())
    }
  }, [selectionMode])

  useEffect(() => {
    if (!recentlyAddedId) return
    const t = setTimeout(() => setRecentlyAddedId(null), 1600)
    return () => clearTimeout(t)
  }, [recentlyAddedId])

  const handleDelete = async (itemId: string) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return

    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return
    }

    setIsDeleting(itemId)
    setDeletingIds((prev) => new Set(prev).add(itemId))
    try {
      await deleteItem(itemId, budgetId)
      // Let the row fade out before removing from state
      window.setTimeout(() => {
        if (onItemDeleted) {
          onItemDeleted(item)
        } else {
          onRefresh()
        }
      }, 520)
    } catch (error) {
      console.error('Error deleting item:', error)
      alert('Failed to delete item')
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    } finally {
      setIsDeleting(null)
    }
  }

  const toggleSelected = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(allItemIds))
  const clearSelection = () => setSelectedIds(new Set())

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    if (!confirm(`Delete ${ids.length} selected item(s)? This can’t be undone.`)) {
      return
    }

    const selectedItems = items.filter((i) => selectedIds.has(i.id))

    setIsBulkDeleting(true)
    setDeletingIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
    try {
      await deleteItems(ids, budgetId)
      clearSelection()
      window.setTimeout(() => {
        if (onItemsDeleted) {
          onItemsDeleted(selectedItems)
        } else {
          onRefresh()
        }
        onExitSelectionMode?.()
      }, 520)
    } catch (error) {
      console.error('Error deleting items:', error)
      alert('Failed to delete selected items')
      setDeletingIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleCreateModalClose = () => {
    setIsCreateModalOpen(false)
  }

  const handleEditModalClose = () => {
    setEditingItem(null)
    onRefresh()
  }

  return (
    <>
      {selectionMode && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckSquare className="w-4 h-4" />
              <span className="font-medium">Multi-select</span>
              <span className="text-gray-500 dark:text-gray-400">
                ({selectedCount} selected)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectedCount === items.length ? clearSelection : selectAll}
                className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {selectedCount === items.length ? 'Clear' : 'Select all'}
              </button>

              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedCount === 0 || isBulkDeleting}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {isBulkDeleting ? 'Deleting...' : 'Delete selected'}
              </button>

              <button
                type="button"
                onClick={() => onExitSelectionMode?.()}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-0">
        {items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No items in this category yet
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add First Item
            </button>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                budgetId={budgetId}
                onEdit={setEditingItem}
                onDelete={handleDelete}
                selectionMode={selectionMode}
                selected={selectedIds.has(item.id)}
                onToggleSelected={toggleSelected}
                flash={item.id === recentlyAddedId}
                deleting={deletingIds.has(item.id)}
              />
            ))}
            
            {/* Add Item Button */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                disabled={selectionMode}
                className="w-full inline-flex items-center justify-center px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </button>
            </div>
          </>
        )}
      </div>

      {/* Create Modal */}
      <CreateItemModal
        isOpen={isCreateModalOpen}
        onClose={handleCreateModalClose}
        onCreated={(item) => {
          setIsCreateModalOpen(false)
          setRecentlyAddedId(item.id)
          if (onItemCreated) {
            onItemCreated(item)
          } else {
            onRefresh()
          }
        }}
        categoryId={categoryId}
        budgetId={budgetId}
      />

      {/* Edit Modal */}
      {editingItem && (
        <EditItemModal
          isOpen={!!editingItem}
          onClose={handleEditModalClose}
          item={editingItem}
          budgetId={budgetId}
        />
      )}
    </>
  )
}
