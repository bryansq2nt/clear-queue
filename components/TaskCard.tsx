'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Database } from '@/lib/supabase/types'
import { EditTaskModal } from './EditTaskModal'
import { useState } from 'react'
import { Calendar, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface TaskCardProps {
  task: Task
  project: Project | undefined
  projects?: Project[]
  onTaskUpdate: () => void
  isDragging?: boolean
}

export default function TaskCard({ task, project, projects = [], onTaskUpdate, isDragging }: TaskCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const priorityColors = {
    1: 'bg-red-100 text-red-800',
    2: 'bg-orange-100 text-orange-800',
    3: 'bg-yellow-100 text-yellow-800',
    4: 'bg-blue-100 text-blue-800',
    5: 'bg-green-100 text-green-800',
  }

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          'bg-white rounded-lg p-4 shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow',
          (isDragging || isSortableDragging) && 'opacity-50'
        )}
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-slate-900 flex-1">{task.title}</h3>
          <span
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium',
              priorityColors[task.priority as keyof typeof priorityColors] || priorityColors[3]
            )}
          >
            P{task.priority}
          </span>
        </div>
        {project && (
          <div className="flex items-center gap-1 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: project.color || '#94a3b8' }}
            />
            <span className="text-xs text-slate-600">{project.name}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {task.due_date && (
            <div className={cn('flex items-center gap-1', isOverdue && 'text-red-600 font-medium')}>
              <Calendar className="w-3 h-3" />
              {new Date(task.due_date).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
      <EditTaskModal
        task={task}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onTaskUpdate={onTaskUpdate}
        projects={projects}
      />
    </>
  )
}
