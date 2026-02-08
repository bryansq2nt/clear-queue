'use client'

import { useState } from 'react'
import { updateTask, deleteTask } from '@/app/actions/tasks'
import { Database } from '@/lib/supabase/types'
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
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

type Task = Database['public']['Tables']['tasks']['Row']

interface EditTaskModalProps {
  task: Task
  isOpen: boolean
  onClose: () => void
  onTaskUpdate: () => void
}

export function EditTaskModal({
  task,
  isOpen,
  onClose,
  onTaskUpdate,
}: EditTaskModalProps) {
  const [title, setTitle] = useState(task.title)
  const [status, setStatus] = useState<Task['status']>(task.status)
  const [priority, setPriority] = useState(task.priority.toString())
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [notes, setNotes] = useState(task.notes || '')
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('title', title)
    formData.append('project_id', task.project_id) // Use task's existing project_id
    formData.append('status', status)
    formData.append('priority', priority)
    formData.append('due_date', dueDate || '')
    formData.append('notes', notes || '')

    const result = await updateTask(task.id, formData)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      onTaskUpdate()
      onClose()
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this task?')) return

    setIsDeleting(true)
    const result = await deleteTask(task.id)

    if (result.error) {
      setError(result.error)
      setIsDeleting(false)
    } else {
      onTaskUpdate()
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update task details</DialogDescription>
          </div>
          <p className="text-xs text-muted-foreground shrink-0 pt-0.5 pr-8">
            Created {new Date(task.created_at).toLocaleDateString()}
            {task.updated_at && (
              <> · Updated {new Date(task.updated_at).toLocaleDateString()}</>
            )}
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Task['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="next">Next</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 (Lowest)</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5 (Highest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
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
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Task'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
