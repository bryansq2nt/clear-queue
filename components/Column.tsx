'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { Plus } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
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
  currentProjectId?: string
}

export default function Column({ id, title, tasks, projects, onTaskUpdate, currentProjectId }: ColumnProps) {
  const { t } = useI18n()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({
    id,
  })

  // Column-specific color scheme (theme-aware surface hierarchy)
  const columnStyles = {
    backlog: { bg: 'bg-surface-2', header: 'bg-surface-3' },
    next: { bg: 'bg-surface-2', header: 'bg-blue-500/20 dark:bg-blue-500/30' },
    in_progress: { bg: 'bg-surface-2', header: 'bg-purple-500/20 dark:bg-purple-500/30' },
    blocked: { bg: 'bg-surface-2', header: 'bg-red-500/20 dark:bg-red-500/30' },
    done: { bg: 'bg-surface-2', header: 'bg-green-500/20 dark:bg-green-500/30' }
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
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('kanban.tasks_count', { count: tasks.length })}</p>
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
                {tasks.map(task => {
                  // Get selection props from parent if available
                  const selectionProps = (task as any).__selectionProps || {}
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      project={projects.find(p => p.id === task.project_id)}
                      onTaskUpdate={onTaskUpdate}
                      {...selectionProps}
                    />
                  )
                })}
              </div>
            </SortableContext>
            {/* Add Task Button */}
            <button
              className="w-full py-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:bg-accent transition-all flex items-center justify-center gap-2 text-sm font-medium mt-3"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
              {t('kanban.add_task')}
            </button>
          </div>
        </div>
      </div>
      {currentProjectId && (
        <AddTaskModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onTaskAdded={onTaskUpdate}
          defaultProjectId={currentProjectId}
          defaultStatus={id}
        />
      )}
    </>
  )
}
