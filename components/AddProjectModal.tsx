'use client'

import { useState, useEffect } from 'react'
import { createProject } from '@/app/actions/projects'
import { getClients, getBusinessesByClientId } from '@/app/clients/actions'
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
import type { Database } from '@/lib/supabase/types'

type Client = Database['public']['Tables']['clients']['Row']
type Business = Database['public']['Tables']['businesses']['Row']

interface AddProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onProjectAdded: () => void
}

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#94a3b8', '#64748b', '#475569',
]

export function AddProjectModal({ isOpen, onClose, onProjectAdded }: AddProjectModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('business')
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string>('')
  const [businessId, setBusinessId] = useState<string>('')
  const [clients, setClients] = useState<Client[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) getClients().then(setClients)
  }, [isOpen])

  useEffect(() => {
    if (!clientId) {
      setBusinesses([])
      setBusinessId('')
      return
    }
    getBusinessesByClientId(clientId).then((list) => {
      setBusinesses(list)
      setBusinessId((prev) => (list.some((b) => b.id === prev) ? prev : ''))
    })
  }, [clientId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('category', category)
    if (selectedColor) formData.append('color', selectedColor)
    if (clientId) formData.append('client_id', clientId)
    if (businessId) formData.append('business_id', businessId)

    const result = await createProject(formData)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      setName('')
      setCategory('business')
      setSelectedColor(null)
      setClientId('')
      setBusinessId('')
      onProjectAdded()
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
          <DialogDescription>Create a new project to organize your tasks</DialogDescription>
        </DialogHeader>
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
              <Label htmlFor="client">Client (optional)</Label>
              <Select value={clientId || 'none'} onValueChange={(v) => setClientId(v === 'none' ? '' : v)}>
                <SelectTrigger id="client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {clientId && (
              <div className="space-y-2">
                <Label htmlFor="business">Business (optional)</Label>
                <Select value={businessId || 'none'} onValueChange={(v) => setBusinessId(v === 'none' ? '' : v)}>
                  <SelectTrigger id="business">
                    <SelectValue placeholder="Select business" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No business</SelectItem>
                    {businesses.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
