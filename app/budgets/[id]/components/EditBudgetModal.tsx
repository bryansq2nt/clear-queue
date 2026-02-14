'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
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
  const { t } = useI18n()
  const [name, setName] = useState(budget.name)
  const [description, setDescription] = useState(budget.description ?? '')
  const [projectId, setProjectId] = useState<string>(budget.project_id ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setName(budget.name)
    setDescription(budget.description ?? '')
    setProjectId(budget.project_id ?? '')
    setError(null)
  }, [isOpen, budget.id, budget.name, budget.description, budget.project_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const nextName = name.trim()
    const nextDescription = description.trim()

    if (!nextName) {
      setError(t('budgets.name_required'))
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
    } catch (err) {
      console.error('Error updating budget:', err)
      setError(t('budgets.update_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

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
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Edit2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              {t('budgets.edit_budget')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div>
            <label htmlFor="edit-budget-name" className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.budget_name_label')}
            </label>
            <input
              id="edit-budget-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="edit-budget-project" className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.project_optional')}
            </label>
            <select
              id="edit-budget-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">{t('budgets.no_project')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-budget-description" className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.description_optional')}
            </label>
            <textarea
              id="edit-budget-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground bg-background hover:bg-accent transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? t('budgets.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
