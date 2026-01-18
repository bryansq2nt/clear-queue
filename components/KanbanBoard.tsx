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
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import Column from './Column'
import TaskCard from './TaskCard'
import { Database } from '@/lib/supabase/types'
import { updateTaskOrder } from '@/app/actions/tasks'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

const STATUSES: Task['status'][] = ['backlog', 'next', 'in_progress', 'blocked', 'done']
const STATUS_LABELS: Record<Task['status'], string> = {
  backlog: 'Backlog',
  next: 'Next',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

interface KanbanBoardProps {
  tasks: Task[]
  projects: Project[]
  onTaskUpdate: () => void
}

export default function KanbanBoard({ tasks, projects, onTaskUpdate }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>(tasks)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Update optimistic tasks when tasks prop changes
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

    // Check if dropped on a column or another task
    const isColumn = STATUSES.includes(over.id as Task['status'])
    const newStatus = isColumn
      ? (over.id as Task['status'])
      : (optimisticTasks.find(t => t.id === over.id)?.status || task.status)

    const columnTasks = optimisticTasks
      .filter(t => t.status === newStatus && t.id !== taskId)
      .sort((a, b) => a.order_index - b.order_index)

    let newOrderIndex: number

    if (isColumn) {
      // Dropped on column - add to end
      newOrderIndex = columnTasks.length
    } else {
      // Dropped on another task - insert at that position
      const targetTask = optimisticTasks.find(t => t.id === over.id)
      if (!targetTask) return

      if (targetTask.status === newStatus) {
        // Same column - insert at target's position
        newOrderIndex = targetTask.order_index
      } else {
        // Different column - add to end
        newOrderIndex = columnTasks.length
      }
    }

    // If dropped in the same column and same position, do nothing
    if (task.status === newStatus && task.order_index === newOrderIndex) return

    // Optimistic update
    const updated = optimisticTasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status: newStatus, order_index: newOrderIndex }
      }
      // Adjust order indices for tasks in the new column
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

    // Server update
    const result = await updateTaskOrder(taskId, newStatus, newOrderIndex, task.status)
    if (result.error) {
      // Revert on error
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
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 p-6 h-full">
        {STATUSES.map(status => {
          const columnTasks = optimisticTasks
            .filter(t => t.status === status)
            .sort((a, b) => a.order_index - b.order_index)

          return (
            <Column
              key={status}
              id={status}
              title={STATUS_LABELS[status]}
              tasks={columnTasks}
              projects={projects}
              onTaskUpdate={onTaskUpdate}
            />
          )
        })}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            project={projects.find(p => p.id === activeTask.project_id)}
            projects={projects}
            onTaskUpdate={onTaskUpdate}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
