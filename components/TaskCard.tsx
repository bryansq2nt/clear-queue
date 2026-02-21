'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Database } from '@/lib/supabase/types';
import { useI18n } from '@/components/I18nProvider';
import { EditTaskModal, type EditTaskErrorParams } from './EditTaskModal';
import { useState } from 'react';
import { Calendar, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

interface TaskCardProps {
  task: Task;
  project: Project | undefined;
  onTaskUpdate: () => void;
  isDragging?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (taskId: string) => void;
  onTaskUpdated?: (updatedTask: Task) => void;
  onEditError?: (params: EditTaskErrorParams) => void;
}

export default function TaskCard({
  task,
  project,
  onTaskUpdate,
  isDragging,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  onTaskUpdated,
  onEditError,
}: TaskCardProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
    disabled: selectionMode || false, // Disable drag when in selection mode
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Priority-based styling (theme-aware)
  const priorityStyles = {
    5: {
      bg: 'bg-red-500/10 dark:bg-red-500/20',
      border: 'border-l-4 border-red-500',
      badge: 'bg-red-500',
    },
    4: {
      bg: 'bg-orange-500/10 dark:bg-orange-500/20',
      border: 'border-l-4 border-orange-500',
      badge: 'bg-orange-500',
    },
    3: {
      bg: 'bg-yellow-500/10 dark:bg-yellow-500/20',
      border: 'border-l-4 border-yellow-500',
      badge: 'bg-yellow-500',
    },
    2: {
      bg: 'bg-blue-500/10 dark:bg-blue-500/20',
      border: 'border-l-4 border-blue-500',
      badge: 'bg-blue-500',
    },
    1: {
      bg: 'bg-green-500/10 dark:bg-green-500/20',
      border: 'border-l-4 border-green-500',
      badge: 'bg-green-500',
    },
  };

  // Done tasks always use green styling regardless of priority
  const doneStyle = {
    bg: 'bg-green-500/10 dark:bg-green-500/20',
    border: 'border-l-4 border-green-500',
    badge: 'bg-green-500',
  };
  // Blocked tasks always use red styling to draw attention
  const blockedStyle = {
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    border: 'border-l-4 border-red-500',
    badge: 'bg-red-500',
  };
  const priorityStyle =
    task.status === 'done'
      ? doneStyle
      : task.status === 'blocked'
        ? blockedStyle
        : priorityStyles[task.priority as keyof typeof priorityStyles] ||
          priorityStyles[3];
  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date() &&
    task.status !== 'done';

  function handleClick(e: React.MouseEvent) {
    if (selectionMode) {
      // In selection mode, toggle selection
      e.preventDefault();
      e.stopPropagation();
      if (onToggleSelection) {
        onToggleSelection(task.id);
      }
    } else {
      // Normal click: open edit modal
      setIsOpen(true);
    }
  }

  // Only apply drag listeners when not in selection mode
  const dragProps = selectionMode ? {} : { ...attributes, ...listeners };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...dragProps}
        className={cn(
          'bg-card rounded-lg p-4 shadow-md hover:shadow-lg transition-all cursor-pointer group relative border border-border',
          priorityStyle.bg,
          priorityStyle.border,
          (isDragging || isSortableDragging) && 'opacity-50',
          selectionMode && isSelected && 'ring-2 ring-blue-500 ring-offset-2',
          selectionMode && !isSelected && 'ring-0',
          selectionMode && 'select-none' // Disable text selection in selection mode only
        )}
        onClick={handleClick}
      >
        {/* Checkbox for selection mode */}
        {selectionMode && (
          <div className="absolute top-3 left-3 z-10">
            <div
              className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                isSelected
                  ? 'bg-blue-500 border-blue-500'
                  : 'bg-card border-border'
              )}
            >
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex items-start justify-between mb-2',
            selectionMode && 'pl-6'
          )}
        >
          <h3 className="font-semibold text-foreground text-sm flex-1 leading-tight">
            {task.title}
          </h3>
          <span
            className={cn(
              priorityStyle.badge,
              'text-white text-xs px-2.5 py-1 rounded-full font-bold ml-2 flex-shrink-0'
            )}
          >
            P{task.priority}
          </span>
        </div>

        {task.due_date && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              isOverdue
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
            )}
          >
            {t('tasks.due_on')} <Calendar className="w-3 h-3" />
            {new Date(task.due_date).toLocaleDateString()}
          </div>
        )}
      </div>
      <EditTaskModal
        task={task}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onTaskUpdate={onTaskUpdate}
        onTaskUpdated={onTaskUpdated}
        onEditError={onEditError}
      />
    </>
  );
}
