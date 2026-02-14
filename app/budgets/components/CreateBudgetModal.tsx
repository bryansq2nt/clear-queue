'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { X, DollarSign } from 'lucide-react'
import { createBudget, getProjects } from '../actions'

interface CreateBudgetModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateBudgetModal({ isOpen, onClose }: CreateBudgetModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      getProjects().then(setProjects)
      setError(null)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError(t('budgets.name_required'))
      return
    }

    setIsSubmitting(true)
    try {
      await createBudget({
        name: name.trim(),
        description: description.trim() || undefined,
        project_id: projectId || undefined,
      })

      setName('')
      setDescription('')
      setProjectId('')
      onClose()
    } catch (err) {
      console.error('Error creating budget:', err)
      setError(t('budgets.create_error'))
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
              <DollarSign className="w-6 h-6 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              {t('budgets.create_budget')}
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
            <label htmlFor="budget-name" className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.budget_name_label')}
            </label>
            <input
              id="budget-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('budgets.budget_name_placeholder')}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="budget-description" className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.description_label')}
            </label>
            <textarea
              id="budget-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('budgets.optional_description')}
              rows={3}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label htmlFor="budget-project" className="block text-sm font-medium text-foreground mb-2">
              {t('budgets.associated_project_optional')}
            </label>
            <select
              id="budget-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">{t('budgets.no_project')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
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
              {isSubmitting ? t('budgets.creating') : t('budgets.create_budget')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
