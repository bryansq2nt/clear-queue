'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Database } from '@/lib/supabase/types'
import { EditTaskModal } from './EditTaskModal'
import { useState, useRef, useEffect } from 'react'
import { Calendar, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Task = Database['public']['Tables']['tasks']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface TaskCardProps {
  task: Task
  project: Project | undefined
  onTaskUpdate: () => void
  isDragging?: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelection?: (taskId: string) => void
  onEnterSelectionMode?: (taskId: string) => void
}

export default function TaskCard({
  task,
  project,
  onTaskUpdate,
  isDragging,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  onEnterSelectionMode,
}: TaskCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hasLongPressedRef = useRef(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
    disabled: selectionMode || false // Disable drag when in selection mode
  })

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

  // Long-press handler
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  function handlePointerDown(e: React.PointerEvent) {
    if (selectionMode) return

    // Check if it's a touch device or touch pointer
    const isTouch = e.pointerType === 'touch' || 'ontouchstart' in window

    if (isTouch) {
      hasLongPressedRef.current = false
      longPressTimerRef.current = setTimeout(() => {
        hasLongPressedRef.current = true
        if (onEnterSelectionMode) {
          onEnterSelectionMode(task.id)
        }
      }, 350)
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function handlePointerMove() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    // Prevent text selection when in selection mode or when shift is pressed
    if (selectionMode || e.shiftKey) {
      e.preventDefault()
    }
  }

  function handleClick(e: React.MouseEvent) {
    // Prevent default if long-press was triggered
    if (hasLongPressedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      hasLongPressedRef.current = false
      return
    }

    if (selectionMode) {
      // In selection mode, toggle selection
      e.preventDefault()
      e.stopPropagation()
      if (onToggleSelection) {
        onToggleSelection(task.id)
      }
    } else if (e.shiftKey) {
      // Shift+click: enter selection mode and select this task
      e.preventDefault()
      e.stopPropagation()
      if (onEnterSelectionMode) {
        onEnterSelectionMode(task.id)
      }
    } else {
      // Normal click: open edit modal
      setIsOpen(true)
    }
  }

  // Only apply drag listeners when not in selection mode
  const dragProps = selectionMode ? {} : { ...attributes, ...listeners }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...dragProps}
        className={cn(
          'bg-white rounded-lg p-4 shadow-md hover:shadow-lg transition-all cursor-pointer group relative',
          priorityStyle.bg,
          priorityStyle.border,
          (isDragging || isSortableDragging) && 'opacity-50',
          selectionMode && isSelected && 'ring-2 ring-blue-500 ring-offset-2',
          selectionMode && !isSelected && 'ring-0',
          selectionMode && 'select-none' // Disable text selection in selection mode
        )}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerUp}
      >
        {/* Checkbox for selection mode */}
        {selectionMode && (
          <div className="absolute top-3 left-3 z-10">
            <div className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              isSelected
                ? 'bg-blue-500 border-blue-500'
                : 'bg-white border-slate-300'
            )}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        )}

        <div className={cn('flex items-start justify-between mb-2', selectionMode && 'pl-6')}>
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
      />
    </>
  )
}
