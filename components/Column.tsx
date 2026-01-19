'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { Plus } from 'lucide-react'
import { Database } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { getStatusColumnClasses } from '@/lib/ui/statusStyles'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface ColumnProps {
  id: Task['status']
  title: string
  tasks: Task[]
  projects: Project[]
  onTaskUpdate: () => void
}

export default function Column({ id, title, tasks, projects, onTaskUpdate }: ColumnProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({
    id,
  })

  // Column-specific color scheme
  const columnStyles = {
    backlog: { bg: 'bg-slate-100', header: 'bg-slate-200' },
    next: { bg: 'bg-blue-50', header: 'bg-blue-100' },
    in_progress: { bg: 'bg-purple-50', header: 'bg-purple-100' },
    blocked: { bg: 'bg-red-50', header: 'bg-red-100' },
    done: { bg: 'bg-green-50', header: 'bg-green-100' }
  }

  const columnStyle = columnStyles[id] || columnStyles.backlog

  return (
    <>
      <div className="flex-1 flex flex-col min-w-[280px]">
        {/* Column Container */}
        <div className="rounded-xl flex flex-col flex-1 overflow-hidden shadow-sm">
          {/* Column Header */}
          <div className={cn(
            columnStyle.header,
            'rounded-t-xl px-4 py-3 shadow-sm'
          )}>
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            <p className="text-xs text-slate-600 mt-0.5">{tasks.length} tasks</p>
          </div>
          
          {/* Cards Container */}
          <div
            ref={setNodeRef}
            className={cn(
              columnStyle.bg,
              'rounded-b-xl p-3 flex-1 space-y-3 overflow-y-auto shadow-sm min-h-[calc(100vh-250px)]',
              isOver && 'bg-opacity-80'
            )}
          >
            <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projects.find(p => p.id === task.project_id)}
                  projects={projects}
                  onTaskUpdate={onTaskUpdate}
                />
              ))}
              </div>
            </SortableContext>
            {/* Add Task Button */}
            <button
              className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-slate-400 hover:bg-white transition-all flex items-center justify-center gap-2 text-sm font-medium mt-3"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          </div>
        </div>
      </div>
      <AddTaskModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onTaskAdded={onTaskUpdate}
        projects={projects}
        defaultStatus={id}
      />
    </>
  )
}
