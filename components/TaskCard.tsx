'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Database } from '@/lib/supabase/types'
import { EditTaskModal } from './EditTaskModal'
import { useState } from 'react'
import { Calendar } from 'lucide-react'
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

  // Priority-based styling
  const priorityStyles = {
    5: { bg: 'bg-red-50', border: 'border-l-4 border-red-500', badge: 'bg-red-500' },
    4: { bg: 'bg-orange-50', border: 'border-l-4 border-orange-500', badge: 'bg-orange-500' },
    3: { bg: 'bg-yellow-50', border: 'border-l-4 border-yellow-500', badge: 'bg-yellow-500' },
    2: { bg: 'bg-blue-50', border: 'border-l-4 border-blue-500', badge: 'bg-blue-500' },
    1: { bg: 'bg-green-50', border: 'border-l-4 border-green-500', badge: 'bg-green-500' }
  }

  // Done tasks always use green styling regardless of priority
  const doneStyle = { bg: 'bg-green-50', border: 'border-l-4 border-green-500', badge: 'bg-green-500' }
  // Blocked tasks always use red styling to draw attention
  const blockedStyle = { bg: 'bg-red-50', border: 'border-l-4 border-red-500', badge: 'bg-red-500' }
  const priorityStyle = task.status === 'done'
    ? doneStyle
    : task.status === 'blocked'
      ? blockedStyle
      : (priorityStyles[task.priority as keyof typeof priorityStyles] || priorityStyles[3])
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          'bg-white rounded-lg p-4 shadow-md hover:shadow-lg transition-all cursor-pointer group',
          priorityStyle.bg,
          priorityStyle.border,
          (isDragging || isSortableDragging) && 'opacity-50'
        )}
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-slate-800 text-sm flex-1 leading-tight">{task.title}</h3>
          <span className={cn(
            priorityStyle.badge,
            'text-white text-xs px-2.5 py-1 rounded-full font-bold ml-2 flex-shrink-0'
          )}>
            P{task.priority}
          </span>
        </div>
        {project && (
          <div className="flex items-center gap-1 mb-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color || '#94a3b8' }}
            />
            <span className="text-xs text-slate-600 font-medium">{project.name}</span>
          </div>
        )}
        {task.due_date && (
          <div className={cn(
            'flex items-center gap-1 text-xs',
            isOverdue ? 'text-red-600 font-medium' : 'text-slate-600 font-medium'
          )}>
            <Calendar className="w-3 h-3" />
            {new Date(task.due_date).toLocaleDateString()}
          </div>
        )}
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
