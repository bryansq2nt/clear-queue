'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { X, FolderPlus } from 'lucide-react'
import { createCategory } from '../actions'
import { Database } from '@/lib/supabase/types'

type BudgetCategory = Database['public']['Tables']['budget_categories']['Row']

interface CreateCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (category: BudgetCategory) => void
  budgetId: string
}

export function CreateCategoryModal({
  isOpen,
  onClose,
  onCreated,
  budgetId,
}: CreateCategoryModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setName('')
      setDescription('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      alert('Please enter a category name')
      return
    }

    setIsSubmitting(true)
    try {
      const created = await createCategory({
        budget_id: budgetId,
        name: name.trim(),
        description: description.trim() || undefined,
      })
      
      // Reset form
      setName('')
      setDescription('')
      onCreated?.(created as BudgetCategory)
      onClose()
    } catch (error) {
      console.error('Error creating category:', error)
      alert('Failed to create category')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <FolderPlus className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('budgets.add_category')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('budgets.category_name_label')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('budgets.category_name_placeholder')}
              className="w-full h-9 px-3 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('budgets.description_optional')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('budgets.category_description_placeholder')}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? t('budgets.creating_category') : t('budgets.create_category')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
