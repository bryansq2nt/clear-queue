'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import TaskCard from './TaskCard';
import { AddTaskModal } from './AddTaskModal';
import type { EditTaskErrorParams } from './EditTaskModal';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useI18n } from '@/components/shared/I18nProvider';
import { Database } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

interface ColumnProps {
  id: Task['status'];
  title: string;
  tasks: Task[];
  projects: Project[];
  onTaskUpdate: () => void;
  currentProjectId?: string;
  accordion?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  onTaskUpdated?: (updatedTask: Task) => void;
  onEditError?: (params: EditTaskErrorParams) => void;
  /** Total task count for this column (when paginated); used for "X tareas" and "Ver más" */
  totalCount?: number;
  /** Load more tasks for this column (paginated board) */
  onLoadMore?: () => void | Promise<void>;
  /** This column is currently loading more tasks */
  isLoadingMore?: boolean;
  /** When provided, add-task uses optimistic add (no loading/refresh). */
  onTaskAdded?: (task: Task) => void;
  onTaskConfirmed?: (realTask: Task, optimisticId: string) => void;
  onAddTaskError?: (params: {
    message: string;
    retry: () => Promise<{ data?: Task; error?: string }>;
    optimisticId?: string;
  }) => void;
}

export default function Column({
  id,
  title,
  tasks,
  projects,
  onTaskUpdate,
  currentProjectId,
  accordion = false,
  isExpanded = true,
  onToggle,
  onTaskUpdated,
  onEditError,
  totalCount,
  onLoadMore,
  isLoadingMore,
  onTaskAdded,
  onTaskConfirmed,
  onAddTaskError,
}: ColumnProps) {
  const { t } = useI18n();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  // Column-specific color scheme (theme-aware surface hierarchy)
  const columnStyles = {
    backlog: { bg: 'bg-surface-2', header: 'bg-surface-3' },
    next: { bg: 'bg-surface-2', header: 'bg-blue-500/20 dark:bg-blue-500/30' },
    in_progress: {
      bg: 'bg-surface-2',
      header: 'bg-purple-500/20 dark:bg-purple-500/30',
    },
    blocked: { bg: 'bg-surface-2', header: 'bg-red-500/20 dark:bg-red-500/30' },
    done: {
      bg: 'bg-surface-2',
      header: 'bg-green-500/20 dark:bg-green-500/30',
    },
  };

  const columnStyle = columnStyles[id] || columnStyles.backlog;
  const displayCount = totalCount ?? tasks.length;
  const tasksLabel =
    displayCount === 1
      ? t('kanban.tasks_count_one')
      : t('kanban.tasks_count', { count: displayCount });
  const hasMore = totalCount != null && totalCount > tasks.length;
  const showBody = accordion ? isExpanded : !collapsed;
  const isCollapsedNarrow = !accordion && collapsed && onToggle;

  return (
    <>
      <div
        className={cn(
          'flex flex-col flex-shrink-0',
          accordion && 'flex-1 w-full',
          !accordion && collapsed && 'w-14',
          !accordion && !collapsed && 'min-w-[280px]'
        )}
      >
        {/* Desktop colapsado: rectángulo vertical con nombre hacia arriba (solo en modo Kanban) */}
        {isCollapsedNarrow && (
          <div
            ref={setNodeRef}
            className={cn(
              columnStyle.header,
              'rounded-xl w-14 flex flex-col flex-1 min-h-[200px] items-center justify-between py-4 px-1 cursor-pointer shadow-sm hover:opacity-90',
              isOver && 'ring-2 ring-primary/50'
            )}
            onClick={() => setCollapsed(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setCollapsed(false);
              }
            }}
            title={`${title} (${displayCount})`}
          >
            <ChevronRight
              className="w-4 h-4 text-muted-foreground flex-shrink-0"
              aria-hidden
            />
            <span
              className="text-xs font-medium text-foreground flex-1 flex items-center justify-center py-2"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                letterSpacing: '0.02em',
                transform: 'rotate(180deg)',
              }}
            >
              {title}
            </span>
            <span className="text-sm font-semibold text-foreground tabular-nums flex-shrink-0">
              {displayCount}
            </span>
          </div>
        )}

        {/* Column completa (accordion o desktop expandido) */}
        {!isCollapsedNarrow && (
          <div
            className={cn(
              'rounded-xl flex flex-col flex-1 overflow-hidden shadow-sm min-h-0',
              accordion && !isExpanded && 'rounded-b-xl'
            )}
          >
            {/* Column Header */}
            <div
              className={cn(
                columnStyle.header,
                'rounded-t-xl px-4 py-3 shadow-sm flex items-center justify-between gap-2',
                accordion && 'cursor-pointer select-none'
              )}
              role={accordion ? 'button' : undefined}
              onClick={accordion ? onToggle : undefined}
              onKeyDown={
                accordion && onToggle
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle();
                      }
                    }
                  : undefined
              }
              tabIndex={accordion ? 0 : undefined}
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-foreground truncate">
                  {title}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tasksLabel}
                </p>
              </div>
              {accordion && (
                <ChevronDown
                  className={cn(
                    'w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              )}
              {!accordion && onToggle && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => !c);
                  }}
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
                  aria-label={
                    collapsed ? t('sidebar.expand') : t('sidebar.collapse')
                  }
                >
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 transition-transform',
                      collapsed && '-rotate-90'
                    )}
                  />
                </button>
              )}
            </div>

            {/* Cards Container - hidden when accordion collapsed or column collapsed */}
            {showBody && (
              <div
                ref={setNodeRef}
                className={cn(
                  columnStyle.bg,
                  'rounded-b-xl p-3 flex-1 flex flex-col shadow-sm min-h-[calc(100vh-250px)]',
                  isOver && 'bg-opacity-80'
                )}
              >
                {/* Add Task — at top of column (desktop); status = this column */}
                {currentProjectId && (
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex-shrink-0 w-full py-3 mb-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:bg-accent transition-all flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    {t('kanban.add_task')}
                  </button>
                )}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                  <SortableContext
                    items={tasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {tasks.map((task) => {
                        const selectionProps =
                          (task as any).__selectionProps || {};
                        return (
                          <TaskCard
                            key={task.id}
                            task={task}
                            project={projects.find(
                              (p) => p.id === task.project_id
                            )}
                            onTaskUpdate={onTaskUpdate}
                            onTaskUpdated={onTaskUpdated}
                            onEditError={onEditError}
                            {...selectionProps}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </div>
                {/* Ver más (load more) — pegado al fondo del recuadro */}
                {onLoadMore && hasMore && (
                  <div className="flex-shrink-0 pt-1.5">
                    {isLoadingMore ? (
                      <div className="w-full py-2 rounded cq-skeleton-shimmer bg-muted/40" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onLoadMore()}
                        className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t('kanban.view_more')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {currentProjectId && (
        <AddTaskModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onTaskAdded={
            onTaskAdded ??
            ((task) => {
              void task;
              onTaskUpdate();
            })
          }
          onTaskConfirmed={onTaskConfirmed}
          onAddError={onAddTaskError}
          defaultProjectId={currentProjectId}
          defaultStatus={id}
        />
      )}
    </>
  );
}
