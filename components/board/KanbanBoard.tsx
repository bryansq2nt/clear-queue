'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import TaskCard from './TaskCard';
import Column from './Column';
import { useI18n } from '@/components/shared/I18nProvider';
import { Database } from '@/lib/supabase/types';
import { updateTaskOrder } from '@/app/actions/tasks';
import { cn } from '@/lib/utils';
import { applyOptimisticTaskMove } from '@/lib/kanban/optimistic';
import { toastError } from '@/lib/ui/toast';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

const STATUSES: Task['status'][] = [
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
];

export interface MoveErrorParams {
  message: string;
  performRetry: () => Promise<{ error?: string } | undefined>;
  performRevert: () => void;
}

interface KanbanBoardProps {
  tasks: Task[];
  projects: Project[];
  onTaskUpdate: () => void;
  currentProjectId?: string;
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleSelection?: (taskId: string) => void;
  /** Controlled tab (status); if provided, onTabChange is called when user changes tab */
  selectedTab?: Task['status'];
  onTabChange?: (status: Task['status']) => void;
  /** Called when user clicks "Add task" in the list; parent can open modal with current tab as default status */
  onAddTask?: (status: Task['status']) => void;
  /** When provided, parent owns tasks: board calls this with new list on move (optimistic) and no refresh on success */
  onTasksChange?: (tasks: Task[]) => void;
  /** When provided, move errors show this callback instead of toast; parent can show MutationErrorDialog */
  onMoveError?: (params: MoveErrorParams) => void;
  /** When provided, edit success updates list without refresh */
  onTaskUpdated?: (updatedTask: Task) => void;
  /** When provided, edit errors are reported here for parent to show MutationErrorDialog */
  onEditError?: (params: {
    message: string;
    previousTask: Task;
    retry: () => Promise<{ data?: Task; error?: string }>;
  }) => void;
  /** When true, updateTaskOrder is called with revalidate: false to avoid refetch/refresh (context board uses optimistic UI) */
  skipRevalidateOnMove?: boolean;
  /** Total task count per status (for paginated board); when set, column header shows this count and "Ver más" is shown when count > tasks.length */
  counts?: Record<Task['status'], number>;
  /** Load more tasks for a column (paginated board) */
  onLoadMore?: (status: Task['status']) => void | Promise<void>;
  /** Status of the column currently loading more (for shimmer on "Ver más" button) */
  loadingMoreStatus?: Task['status'] | null;
  /** When provided, add-task from column uses optimistic add (no refresh). */
  onTaskAdded?: (task: Task) => void;
  onTaskConfirmed?: (realTask: Task, optimisticId: string) => void;
  onAddTaskError?: (params: {
    message: string;
    retry: () => Promise<{ data?: Task; error?: string }>;
    optimisticId?: string;
  }) => void;
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
  onTaskUpdated,
  onEditError,
  footer,
}: {
  status: Task['status'];
  tasks: Task[];
  projects: Project[];
  projectId: string;
  onTaskUpdate: () => void;
  selectionMode: boolean;
  selectedTaskIds: Set<string>;
  onToggleSelection?: (taskId: string) => void;
  onTaskUpdated?: (updatedTask: Task) => void;
  onEditError?: (params: {
    message: string;
    previousTask: Task;
    retry: () => Promise<{ data?: Task; error?: string }>;
  }) => void;
  footer?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const taskIds = tasks.map((t) => t.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl p-3 flex-1 min-h-[200px] flex flex-col bg-card/50 border border-border',
        isOver && 'ring-2 ring-primary/50'
      )}
    >
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {tasks.map((task) => {
              const selectionProps = (task as any).__selectionProps || {};
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projects.find((p) => p.id === task.project_id)}
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
      {footer != null ? (
        <div className="flex-shrink-0 pt-1.5">{footer}</div>
      ) : null}
    </div>
  );
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
  onTasksChange,
  onMoveError,
  onTaskUpdated,
  onEditError,
  skipRevalidateOnMove,
  counts,
  onLoadMore,
  loadingMoreStatus,
  onTaskAdded,
  onTaskConfirmed,
  onAddTaskError,
}: KanbanBoardProps) {
  const { t } = useI18n();
  const [selectedTabState, setSelectedTabState] =
    useState<Task['status']>('next');
  const selectedTab = selectedTabProp ?? selectedTabState;
  const setSelectedTab = (v: Task['status']) => {
    if (onTabChange) onTabChange(v);
    else setSelectedTabState(v);
  };

  const projectId =
    currentProjectId || (tasks.length > 0 ? tasks[0].project_id : '');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>(tasks);
  const [mobileListReady, setMobileListReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMobileListReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: selectionMode ? 9999 : 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  useEffect(() => {
    setOptimisticTasks(tasks);
  }, [tasks]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const taskId = active.id as string;
    const task = optimisticTasks.find((t) => t.id === taskId);
    if (!task) return;

    const isColumn = STATUSES.includes(over.id as Task['status']);
    const newStatus = isColumn
      ? (over.id as Task['status'])
      : (optimisticTasks.find((t) => t.id === over.id)?.status ?? task.status);

    const columnTasks = optimisticTasks
      .filter((t) => t.status === newStatus && t.id !== taskId)
      .sort((a, b) => a.order_index - b.order_index);

    let newOrderIndex: number;
    if (isColumn) {
      newOrderIndex = columnTasks.length;
    } else {
      const targetTask = optimisticTasks.find((t) => t.id === over.id);
      if (!targetTask) return;
      if (targetTask.status === newStatus) {
        newOrderIndex = targetTask.order_index;
      } else {
        newOrderIndex = columnTasks.length;
      }
    }

    if (task.status === newStatus && task.order_index === newOrderIndex) return;

    const updated = applyOptimisticTaskMove(
      optimisticTasks,
      taskId,
      newStatus,
      newOrderIndex
    );
    setOptimisticTasks(updated);
    onTasksChange?.(updated);

    const revalidate = skipRevalidateOnMove !== true;
    const result = await updateTaskOrder(
      taskId,
      newStatus,
      newOrderIndex,
      task.status,
      { revalidate }
    );
    if (result.error) {
      if (onMoveError) {
        onMoveError({
          message: result.error,
          performRetry: () =>
            updateTaskOrder(taskId, newStatus, newOrderIndex, task.status, {
              revalidate,
            }),
          performRevert: () => {
            setOptimisticTasks(tasks);
            onTasksChange?.(tasks);
          },
        });
      } else {
        setOptimisticTasks(tasks);
        toastError('Failed to update task: ' + result.error);
      }
    } else if (!onTasksChange) {
      onTaskUpdate();
    }
  }

  const activeTask = activeId
    ? optimisticTasks.find((t) => t.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={selectionMode ? undefined : handleDragStart}
      onDragEnd={selectionMode ? undefined : handleDragEnd}
    >
      <div
        className={cn(
          'flex flex-col p-4 md:p-6 min-h-full',
          selectionMode && 'select-none'
        )}
      >
        {/* Móvil: chips + una columna */}
        <div className="flex flex-col flex-1 min-h-0 lg:hidden">
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUSES.map((status) => {
              const count =
                counts?.[status] ??
                optimisticTasks.filter((t) => t.status === status).length;
              const isSelected = selectedTab === status;
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
                  <span
                    className={cn(
                      'ml-1.5 tabular-nums',
                      isSelected ? 'opacity-90' : 'opacity-80'
                    )}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            {!mobileListReady ? (
              <div
                className="rounded-xl p-3 flex-1 min-h-[200px] bg-card/50 border border-border"
                aria-hidden
              />
            ) : (
              (() => {
                const columnTasks = optimisticTasks
                  .filter((t) => t.status === selectedTab)
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((task) => ({
                    ...task,
                    __selectionProps: {
                      selectionMode,
                      isSelected: selectedTaskIds.has(task.id),
                      onToggleSelection,
                    },
                  }));
                const totalCount = counts?.[selectedTab] ?? columnTasks.length;
                const hasMore =
                  onLoadMore != null && totalCount > columnTasks.length;
                const isLoadingMore = loadingMoreStatus === selectedTab;
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
                      onTaskUpdated={onTaskUpdated}
                      onEditError={onEditError}
                      footer={
                        onLoadMore && hasMore ? (
                          isLoadingMore ? (
                            <div className="w-full py-2 rounded cq-skeleton-shimmer bg-muted/40" />
                          ) : (
                            <button
                              type="button"
                              onClick={() => onLoadMore(selectedTab)}
                              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {t('kanban.view_more')}
                            </button>
                          )
                        ) : undefined
                      }
                    />
                  </>
                );
              })()
            )}
          </div>
        </div>

        {/* iPad/laptop/PC: Kanban horizontal con columnas colapsables + scroll horizontal */}
        <div className="hidden lg:flex lg:flex-row lg:gap-4 lg:flex-1 lg:min-h-0 lg:overflow-x-auto lg:overflow-y-hidden lg:pb-2 lg:pr-2 lg:scroll-smooth">
          {STATUSES.map((status) => {
            const columnTasks = optimisticTasks
              .filter((t) => t.status === status)
              .sort((a, b) => a.order_index - b.order_index)
              .map((task) => ({
                ...task,
                __selectionProps: {
                  selectionMode,
                  isSelected: selectedTaskIds.has(task.id),
                  onToggleSelection,
                },
              }));
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
                onTaskUpdated={onTaskUpdated}
                onEditError={onEditError}
                totalCount={counts?.[status]}
                onLoadMore={onLoadMore ? () => onLoadMore(status) : undefined}
                isLoadingMore={loadingMoreStatus === status}
                onTaskAdded={onTaskAdded}
                onTaskConfirmed={onTaskConfirmed}
                onAddTaskError={onAddTaskError}
              />
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            project={projects.find((p) => p.id === activeTask.project_id)}
            onTaskUpdate={onTaskUpdate}
            onTaskUpdated={onTaskUpdated}
            onEditError={onEditError}
            isDragging
            selectionMode={false}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
