'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { Plus, ChevronDown } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { Database } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface ColumnProps {
  id: Task['status']
  title: string
  tasks: Task[]
  projects: Project[]
  onTaskUpdate: () => void
  currentProjectId?: string
  accordion?: boolean
  isExpanded?: boolean
  onToggle?: () => void
}

export default function Column({ id, title, tasks, projects, onTaskUpdate, currentProjectId, accordion = false, isExpanded = true, onToggle }: ColumnProps) {
  const { t } = useI18n()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
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
  const tasksLabel = tasks.length === 1 ? t('kanban.tasks_count_one') : t('kanban.tasks_count', { count: tasks.length })
  const showBody = accordion ? isExpanded : !collapsed
  const isCollapsedStrip = !accordion && collapsed && onToggle

  return (
    <>
      <div className={cn('flex flex-col flex-1', accordion ? 'w-full' : 'min-w-[280px]')}>
        {/* Column Container */}
        <div className={cn('rounded-xl flex flex-col flex-1 overflow-hidden shadow-sm', accordion && !isExpanded && 'rounded-b-xl')}>
          {/* Column Header - clickable in accordion mode; has collapse button on desktop */}
          <div
            className={cn(
              columnStyle.header,
              'rounded-t-xl px-4 py-3 shadow-sm flex items-center justify-between gap-2',
              accordion && 'cursor-pointer select-none'
            )}
            role={accordion ? 'button' : undefined}
            onClick={accordion ? onToggle : undefined}
            onKeyDown={accordion && onToggle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } } : undefined}
            tabIndex={accordion ? 0 : undefined}
          >
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-foreground truncate">{title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{tasksLabel}</p>
            </div>
            {accordion && (
              <ChevronDown className={cn('w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform', isExpanded && 'rotate-180')} />
            )}
            {!accordion && onToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c) }}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
                aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
              >
                <ChevronDown className={cn('w-4 h-4 transition-transform', collapsed && '-rotate-90')} />
              </button>
            )}
          </div>

          {/* Collapsed strip (desktop only): narrow strip, still droppable */}
          {isCollapsedStrip && (
            <div
              ref={setNodeRef}
              className={cn(
                columnStyle.bg,
                'rounded-b-xl px-3 py-2 flex items-center justify-between gap-2 min-h-[48px] cursor-pointer',
                isOver && 'bg-opacity-80'
              )}
              onClick={() => setCollapsed(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(false) } }}
            >
              <span className="text-sm font-medium text-foreground truncate">{title}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">{tasks.length}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 -rotate-90" />
            </div>
          )}

          {/* Cards Container - hidden when accordion collapsed or column collapsed */}
          {showBody && (
            <div
              ref={isCollapsedStrip ? undefined : setNodeRef}
              className={cn(
                columnStyle.bg,
                'rounded-b-xl p-3 flex-1 space-y-3 overflow-y-auto shadow-sm min-h-[calc(100vh-250px)]',
                isOver && 'bg-opacity-80'
              )}
            >
              <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {tasks.map(task => {
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
          )}
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
