'use client'

import { useState, useEffect } from 'react'
import { updateProject, deleteProject } from '@/app/actions/projects'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { PROJECT_CATEGORIES } from '@/lib/constants'
import { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']

interface EditProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onProjectUpdated: () => void
  project: Project | null
}

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#94a3b8', '#64748b', '#475569',
]

export function EditProjectModal({ isOpen, onClose, onProjectUpdated, project }: EditProjectModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('business')
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (project) {
      setName(project.name)
      setCategory(project.category || 'business')
      setSelectedColor(project.color)
      setError(null)
      setShowDeleteConfirm(false)
    }
  }, [project, isOpen])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return

    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('id', project.id)
    formData.append('name', name)
    formData.append('category', category)
    if (selectedColor !== null) formData.append('color', selectedColor || '')

    const result = await updateProject(formData)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      onProjectUpdated()
      onClose()
    }
  }

  async function handleDelete() {
    if (!project) return

    setIsLoading(true)
    setError(null)

    const result = await deleteProject(project.id)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
      setShowDeleteConfirm(false)
    } else {
      onProjectUpdated()
      onClose()
    }
  }

  if (!project) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project details or delete the project</DialogDescription>
        </DialogHeader>
        {!showDeleteConfirm ? (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Project"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_CATEGORIES.filter(c => c.key !== 'archived').map(cat => (
                      <SelectItem key={cat.key} value={cat.key}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color (optional)</Label>
                <div className="grid grid-cols-10 gap-2">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selectedColor === color
                          ? 'border-slate-900 scale-110'
                          : 'border-slate-300 hover:border-slate-500'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
              >
                Delete Project
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-4">
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              <p className="font-semibold mb-2">Warning: This action cannot be undone</p>
              <p>Deleting this project will also delete all associated tasks.</p>
            </div>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setError(null)
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
              >
                {isLoading ? 'Deleting...' : 'Delete Project and All Tasks'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
