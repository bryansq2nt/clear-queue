'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ItemRow } from './ItemRow'
import { CreateItemModal } from './CreateItemModal'
import { EditItemModal } from './EditItemModal'
import { deleteItem } from '../actions'
import { Database } from '@/lib/supabase/types'

type BudgetItem = Database['public']['Tables']['budget_items']['Row']

interface ItemsListProps {
  items: BudgetItem[]
  categoryId: string
  budgetId: string
  onRefresh: () => void
}

export function ItemsList({ items, categoryId, budgetId, onRefresh }: ItemsListProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  const handleDelete = async (itemId: string) => {
    setIsDeleting(itemId)
    try {
      await deleteItem(itemId, budgetId)
      onRefresh()
    } catch (error) {
      console.error('Error deleting item:', error)
      alert('Failed to delete item')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleCreateModalClose = () => {
    setIsCreateModalOpen(false)
    onRefresh()
  }

  const handleEditModalClose = () => {
    setEditingItem(null)
    onRefresh()
  }

  return (
    <>
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
              />
            ))}
            
            {/* Add Item Button */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setIsCreateModalOpen(true)}
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
