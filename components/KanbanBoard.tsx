'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'
import Column from './Column'
import { useI18n } from '@/components/I18nProvider'
import { Database } from '@/lib/supabase/types'
import { updateTaskOrder } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

const STATUSES: Task['status'][] = ['backlog', 'next', 'in_progress', 'blocked', 'done']

interface KanbanBoardProps {
  tasks: Task[]
  projects: Project[]
  onTaskUpdate: () => void
  currentProjectId?: string
  selectionMode?: boolean
  selectedTaskIds?: Set<string>
  onToggleSelection?: (taskId: string) => void
  /** Controlled tab (status); if provided, onTabChange is called when user changes tab */
  selectedTab?: Task['status']
  onTabChange?: (status: Task['status']) => void
  /** Called when user clicks "Add task" in the list; parent can open modal with current tab as default status */
  onAddTask?: (status: Task['status']) => void
}

function TaskListForStatus({
  status,
  tasks,
  projects,
  projectId,
  onTaskUpdate,
  selectionMode,
  selectedTaskIds,
  onToggleSelection,
}: {
  status: Task['status']
  tasks: Task[]
  projects: Project[]
  projectId: string
  onTaskUpdate: () => void
  selectionMode: boolean
  selectedTaskIds: Set<string>
  onToggleSelection?: (taskId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const taskIds = tasks.map(t => t.id)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl p-3 flex-1 min-h-[200px] overflow-y-auto space-y-3 bg-card/50 border border-border',
        isOver && 'ring-2 ring-primary/50'
      )}
    >
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
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
    </div>
  )
}

export default function KanbanBoard({
  tasks,
  projects,
  onTaskUpdate,
  currentProjectId,
  selectionMode = false,
  selectedTaskIds = new Set(),
  onToggleSelection,
  selectedTab: selectedTabProp,
  onTabChange,
  onAddTask,
}: KanbanBoardProps) {
  const { t } = useI18n()
  const [selectedTabState, setSelectedTabState] = useState<Task['status']>('next')
  const selectedTab = selectedTabProp ?? selectedTabState
  const setSelectedTab = (v: Task['status']) => {
    if (onTabChange) onTabChange(v)
    else setSelectedTabState(v)
  }

  const projectId = currentProjectId || (tasks.length > 0 ? tasks[0].project_id : '')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>(tasks)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: selectionMode ? 9999 : 8,
      },
    })
  )

  useEffect(() => {
    setOptimisticTasks(tasks)
  }, [tasks])

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const taskId = active.id as string
    const task = optimisticTasks.find(t => t.id === taskId)
    if (!task) return

    const isColumn = STATUSES.includes(over.id as Task['status'])
    const newStatus = isColumn
      ? (over.id as Task['status'])
      : (optimisticTasks.find(t => t.id === over.id)?.status ?? task.status)

    const columnTasks = optimisticTasks
      .filter(t => t.status === newStatus && t.id !== taskId)
      .sort((a, b) => a.order_index - b.order_index)

    let newOrderIndex: number
    if (isColumn) {
      newOrderIndex = columnTasks.length
    } else {
      const targetTask = optimisticTasks.find(t => t.id === over.id)
      if (!targetTask) return
      if (targetTask.status === newStatus) {
        newOrderIndex = targetTask.order_index
      } else {
        newOrderIndex = columnTasks.length
      }
    }

    if (task.status === newStatus && task.order_index === newOrderIndex) return

    const updated = optimisticTasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status: newStatus, order_index: newOrderIndex }
      }
      if (t.status === newStatus && t.order_index >= newOrderIndex && task.status === newStatus && t.order_index < task.order_index) {
        return { ...t, order_index: t.order_index + 1 }
      }
      if (t.status === newStatus && t.order_index >= newOrderIndex && task.status !== newStatus) {
        return { ...t, order_index: t.order_index + 1 }
      }
      if (t.status === task.status && t.order_index > task.order_index && task.status !== newStatus) {
        return { ...t, order_index: t.order_index - 1 }
      }
      return t
    })
    setOptimisticTasks(updated)

    const result = await updateTaskOrder(taskId, newStatus, newOrderIndex, task.status)
    if (result.error) {
      setOptimisticTasks(tasks)
      alert('Failed to update task: ' + result.error)
    } else {
      onTaskUpdate()
    }
  }

  const activeTask = activeId ? optimisticTasks.find(t => t.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={selectionMode ? undefined : handleDragStart}
      onDragEnd={selectionMode ? undefined : handleDragEnd}
    >
      <div className={cn('flex flex-col p-4 md:p-6 min-h-full', selectionMode && 'select-none')}>
        {/* Móvil: chips + una columna */}
        <div className="flex flex-col flex-1 min-h-0 lg:hidden">
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUSES.map(status => {
              const count = optimisticTasks.filter(t => t.status === status).length
              const isSelected = selectedTab === status
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedTab(status)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
                  )}
                >
                  {t(`kanban.${status}`)}
                  <span className={cn('ml-1.5 tabular-nums', isSelected ? 'opacity-90' : 'opacity-80')}>({count})</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col flex-1 min-h-0">
            {(() => {
              const columnTasks = optimisticTasks
                .filter(t => t.status === selectedTab)
                .sort((a, b) => a.order_index - b.order_index)
                .map(task => ({
                  ...task,
                  __selectionProps: {
                    selectionMode,
                    isSelected: selectedTaskIds.has(task.id),
                    onToggleSelection,
                  },
                }))
              return (
                <>
                  <TaskListForStatus
                    status={selectedTab}
                    tasks={columnTasks}
                    projects={projects}
                    projectId={projectId}
                    onTaskUpdate={onTaskUpdate}
                    selectionMode={selectionMode}
                    selectedTaskIds={selectedTaskIds}
                    onToggleSelection={onToggleSelection}
                  />
                  {onAddTask && (
                    <button
                      type="button"
                      onClick={() => onAddTask(selectedTab)}
                      className="mt-3 w-full py-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:bg-accent transition-all flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      {t('kanban.add_task')}
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </div>

        {/* iPad/laptop/PC: Kanban horizontal con columnas colapsables + scroll horizontal */}
        <div className="hidden lg:flex lg:flex-row lg:gap-4 lg:flex-1 lg:min-h-0 lg:overflow-x-auto lg:overflow-y-hidden lg:pb-2 lg:pr-2 lg:scroll-smooth">
          {STATUSES.map(status => {
            const columnTasks = optimisticTasks
              .filter(t => t.status === status)
              .sort((a, b) => a.order_index - b.order_index)
              .map(task => ({
                ...task,
                __selectionProps: {
                  selectionMode,
                  isSelected: selectedTaskIds.has(task.id),
                  onToggleSelection,
                },
              }))
            return (
              <Column
                key={status}
                id={status}
                title={t(`kanban.${status}`)}
                tasks={columnTasks}
                projects={projects}
                onTaskUpdate={onTaskUpdate}
                currentProjectId={projectId}
                accordion={false}
                onToggle={() => {}}
              />
            )
          })}
        </div>
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            project={projects.find(p => p.id === activeTask.project_id)}
            onTaskUpdate={onTaskUpdate}
            isDragging
            selectionMode={false}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
