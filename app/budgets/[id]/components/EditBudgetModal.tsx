'use client'

import { useEffect, useState } from 'react'
import { X, Edit2 } from 'lucide-react'
import { updateBudget } from '../../actions'

interface EditBudgetModalProps {
  isOpen: boolean
  onClose: () => void
  onUpdated: () => void
  projects: { id: string; name: string }[]
  budget: {
    id: string
    name: string
    description: string | null
    project_id: string | null
  }
}

export function EditBudgetModal({
  isOpen,
  onClose,
  onUpdated,
  projects,
  budget,
}: EditBudgetModalProps) {
  const [name, setName] = useState(budget.name)
  const [description, setDescription] = useState(budget.description ?? '')
  const [projectId, setProjectId] = useState<string>(budget.project_id ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset when opening / when budget changes
  useEffect(() => {
    if (!isOpen) return
    setName(budget.name)
    setDescription(budget.description ?? '')
    setProjectId(budget.project_id ?? '')
  }, [isOpen, budget.id, budget.name, budget.description, budget.project_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const nextName = name.trim()
    const nextDescription = description.trim()

    if (!nextName) {
      alert('Please enter a budget name')
      return
    }

    setIsSubmitting(true)
    try {
      await updateBudget(budget.id, {
        name: nextName,
        description: nextDescription,
        project_id: projectId,
      })
      onClose()
      onUpdated()
    } catch (error) {
      console.error('Error updating budget:', error)
      alert('Failed to update budget')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Edit2 className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Edit Budget
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Budget Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              required
              autoFocus
            />
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Project (Optional)
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

