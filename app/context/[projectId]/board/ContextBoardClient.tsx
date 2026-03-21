'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/supabase/types';
import KanbanBoard from '@/components/board/KanbanBoard';
import {
  AddTaskModal,
  type TaskAssignee,
} from '@/components/board/AddTaskModal';
import { MutationErrorDialog } from '@/components/board/MutationErrorDialog';
import { useI18n } from '@/components/shared/I18nProvider';
import {
  getTasksByProjectIdPaginated,
  type BoardPermissions,
} from '@/app/actions/tasks';
import { BOARD_STATUSES, LOAD_MORE_TASKS_PER_COLUMN } from '@/lib/board';
import { Plus } from 'lucide-react';

type Task = Database['public']['Tables']['tasks']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];
type TaskStatus = Task['status'];

type ErrorDialogState = {
  open: boolean;
  title: string;
  message: string;
  onTryAgain: () => void | Promise<void>;
  onCancel: () => void;
  /** When set, cancel should remove this optimistic task from the board */
  optimisticId?: string;
};

function sortTasksByOrder(a: Task[]): Task[] {
  return [...a].sort((x, y) => x.order_index - y.order_index);
}

function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const out = {} as Record<TaskStatus, Task[]>;
  for (const s of BOARD_STATUSES) {
    out[s] = [];
  }
  for (const t of tasks) {
    out[t.status].push(t);
  }
  for (const s of BOARD_STATUSES) {
    out[s] = sortTasksByOrder(out[s]);
  }
  return out;
}

function reconcileStatusCounts(
  prevCounts: Record<TaskStatus, number>,
  prevTasksByStatus: Record<TaskStatus, Task[]>,
  nextTasksByStatus: Record<TaskStatus, Task[]>
): Record<TaskStatus, number> {
  const nextCounts = { ...prevCounts };
  for (const status of BOARD_STATUSES) {
    const delta =
      nextTasksByStatus[status].length - prevTasksByStatus[status].length;
    if (delta !== 0) {
      nextCounts[status] = Math.max(0, (nextCounts[status] ?? 0) + delta);
    }
  }
  return nextCounts;
}

function replaceTaskById(
  prev: Record<TaskStatus, Task[]>,
  realTask: Task,
  optimisticId: string
): Record<TaskStatus, Task[]> {
  const next = {} as Record<TaskStatus, Task[]>;
  for (const status of BOARD_STATUSES) {
    next[status] = prev[status].filter(
      (task) => task.id !== optimisticId && task.id !== realTask.id
    );
  }
  next[realTask.status] = sortTasksByOrder([
    ...next[realTask.status],
    realTask,
  ]);
  return next;
}

interface ContextBoardClientProps {
  projectId: string;
  initialProject: Project;
  initialCounts: Record<TaskStatus, number>;
  initialTasksByStatus: Record<TaskStatus, Task[]>;
  permissions: BoardPermissions;
  /** Project members for the assignee dropdown in add/edit task modals. */
  projectMembers?: TaskAssignee[];
  /** Current user's ID — passed to modals for "Me" label. */
  currentUserId?: string;
}

/**
 * Kanban board for context view — no sidebar, no resources panel.
 * Owns tasks state; updates optimistically without refresh. Shows MutationErrorDialog on server errors.
 */
export default function ContextBoardClient({
  projectId,
  initialProject,
  initialCounts,
  initialTasksByStatus,
  permissions,
  projectMembers,
  currentUserId,
}: ContextBoardClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [tasksByStatus, setTasksByStatus] =
    useState<Record<TaskStatus, Task[]>>(initialTasksByStatus);
  const [counts, setCounts] =
    useState<Record<TaskStatus, number>>(initialCounts);
  const [loadingMore, setLoadingMore] = useState<TaskStatus | null>(null);
  const [selectedTab, setSelectedTab] = useState<TaskStatus>('next');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState | null>(null);
  const tasksByStatusRef = useRef(tasksByStatus);
  const countsRef = useRef(counts);

  const flatTasks = useMemo(
    () => sortTasksByOrder(Object.values(tasksByStatus).flat()),
    [tasksByStatus]
  );

  useEffect(() => {
    tasksByStatusRef.current = tasksByStatus;
  }, [tasksByStatus]);

  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);

  const commitBoardState = useCallback(
    (
      nextTasksByStatus: Record<TaskStatus, Task[]>,
      nextCounts?: Record<TaskStatus, number>
    ) => {
      tasksByStatusRef.current = nextTasksByStatus;
      setTasksByStatus(nextTasksByStatus);
      if (nextCounts) {
        countsRef.current = nextCounts;
        setCounts(nextCounts);
      }
    },
    []
  );

  // ── Realtime subscription slot (empty until Realtime phase) ───────────────
  // useEffect(() => {
  //   const channel = supabase
  //     .channel(`tasks:${projectId}`)
  //     .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks',
  //         filter: `project_id=eq.${projectId}` },
  //       (payload) => { /* reconcile setTasksByStatus */ })
  //     .subscribe();
  //   return () => { supabase.removeChannel(channel); };
  // }, [projectId]);

  // Background sync after optimistic state update — called by KanbanBoard via onTaskUpdate.
  // Board state is already updated via setTasksByStatus before this fires.
  const loadData = useCallback(() => {
    router.refresh();
  }, [router]);

  const loadMoreForStatus = useCallback(
    async (status: TaskStatus) => {
      const currentTasksByStatus = tasksByStatusRef.current;
      const current = currentTasksByStatus[status];
      const offset = current.length;
      setLoadingMore(status);
      try {
        const more = await getTasksByProjectIdPaginated(
          projectId,
          status,
          offset,
          LOAD_MORE_TASKS_PER_COLUMN
        );
        const nextTasksByStatus = {
          ...currentTasksByStatus,
          [status]: sortTasksByOrder([
            ...currentTasksByStatus[status],
            ...more,
          ]),
        };
        const nextCounts =
          more.length === 0
            ? {
                ...countsRef.current,
                [status]: Math.min(countsRef.current[status], current.length),
              }
            : undefined;
        commitBoardState(nextTasksByStatus, nextCounts);
      } finally {
        setLoadingMore(null);
      }
    },
    [commitBoardState, projectId]
  );

  const openMoveErrorDialog = useCallback(
    (params: {
      message: string;
      performRetry: () => Promise<{ error?: string } | undefined>;
      performRevert: () => void;
    }) => {
      setErrorDialog({
        open: true,
        title: t('mutation_error.title'),
        message: params.message,
        onTryAgain: async () => {
          const result = await params.performRetry();
          if (result?.error) throw new Error(result.error);
        },
        onCancel: () => {
          params.performRevert();
        },
      });
    },
    [t]
  );

  const handleTasksChange = useCallback(
    (newTasks: Task[]) => {
      const prevTasksByStatus = tasksByStatusRef.current;
      const nextTasksByStatus = groupTasksByStatus(newTasks);
      const nextCounts = reconcileStatusCounts(
        countsRef.current,
        prevTasksByStatus,
        nextTasksByStatus
      );
      commitBoardState(nextTasksByStatus, nextCounts);
    },
    [commitBoardState]
  );

  const handleTaskUpdated = useCallback(
    (updatedTask: Task) => {
      const prevTasksByStatus = tasksByStatusRef.current;
      const nextTasksByStatus = { ...prevTasksByStatus };
      for (const s of BOARD_STATUSES) {
        const idx = nextTasksByStatus[s].findIndex(
          (t) => t.id === updatedTask.id
        );
        if (idx >= 0) {
          if (updatedTask.status === s) {
            nextTasksByStatus[s] = nextTasksByStatus[s].map((t) =>
              t.id === updatedTask.id ? updatedTask : t
            );
            nextTasksByStatus[s] = sortTasksByOrder(nextTasksByStatus[s]);
          } else {
            nextTasksByStatus[s] = nextTasksByStatus[s].filter(
              (t) => t.id !== updatedTask.id
            );
            nextTasksByStatus[updatedTask.status] = sortTasksByOrder([
              ...nextTasksByStatus[updatedTask.status].filter(
                (t) => t.id !== updatedTask.id
              ),
              updatedTask,
            ]);
          }
          const nextCounts = reconcileStatusCounts(
            countsRef.current,
            prevTasksByStatus,
            nextTasksByStatus
          );
          commitBoardState(nextTasksByStatus, nextCounts);
          return;
        }
      }
    },
    [commitBoardState]
  );

  const handleTaskDeleted = useCallback(
    (taskId: string) => {
      const prevTasksByStatus = tasksByStatusRef.current;
      const nextTasksByStatus = { ...prevTasksByStatus };
      let removed = false;
      for (const s of BOARD_STATUSES) {
        if (nextTasksByStatus[s].some((t) => t.id === taskId)) {
          nextTasksByStatus[s] = nextTasksByStatus[s].filter(
            (t) => t.id !== taskId
          );
          removed = true;
          break;
        }
      }
      if (!removed) {
        return;
      }
      const nextCounts = reconcileStatusCounts(
        countsRef.current,
        prevTasksByStatus,
        nextTasksByStatus
      );
      commitBoardState(nextTasksByStatus, nextCounts);
    },
    [commitBoardState]
  );

  const openEditErrorDialog = useCallback(
    (params: {
      message: string;
      previousTask: Task;
      retry: () => Promise<{ data?: Task; error?: string }>;
    }) => {
      setErrorDialog({
        open: true,
        title: t('mutation_error.title'),
        message: params.message,
        onTryAgain: async () => {
          const result = await params.retry();
          if (result?.error) throw new Error(result.error);
        },
        onCancel: () => {
          const prevTasksByStatus = tasksByStatusRef.current;
          const nextTasksByStatus = { ...prevTasksByStatus };
          const status = params.previousTask.status;
          nextTasksByStatus[status] = nextTasksByStatus[status].map((task) =>
            task.id === params.previousTask.id ? params.previousTask : task
          );
          nextTasksByStatus[status] = sortTasksByOrder(
            nextTasksByStatus[status]
          );
          commitBoardState(nextTasksByStatus);
        },
      });
    },
    [commitBoardState, t]
  );

  return (
    <>
      <div className="h-full">
        <KanbanBoard
          tasks={flatTasks}
          projects={[initialProject]}
          counts={counts}
          onLoadMore={loadMoreForStatus}
          loadingMoreStatus={loadingMore}
          onTaskUpdate={loadData}
          currentProjectId={projectId}
          selectedTab={selectedTab}
          onTabChange={setSelectedTab}
          onAddTask={
            permissions.canCreate ? () => setIsAddTaskOpen(true) : undefined
          }
          canAdd={permissions.canCreate}
          canAssign={permissions.canAssign}
          projectMembers={permissions.canAssign ? projectMembers : undefined}
          currentUserId={currentUserId}
          readScope={permissions.readScope}
          onTasksChange={handleTasksChange}
          onMoveError={openMoveErrorDialog}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
          onEditError={openEditErrorDialog}
          skipRevalidateOnMove
          onTaskAdded={(task) => {
            const prevTasksByStatus = tasksByStatusRef.current;
            const nextTasksByStatus = { ...prevTasksByStatus };
            const status = task.status;
            nextTasksByStatus[status] = sortTasksByOrder([
              ...nextTasksByStatus[status].filter(
                (item) => item.id !== task.id
              ),
              task,
            ]);
            const nextCounts = reconcileStatusCounts(
              countsRef.current,
              prevTasksByStatus,
              nextTasksByStatus
            );
            commitBoardState(nextTasksByStatus, nextCounts);
          }}
          onTaskConfirmed={(realTask, optimisticId) => {
            const prevTasksByStatus = tasksByStatusRef.current;
            if (
              !BOARD_STATUSES.some((status) =>
                prevTasksByStatus[status].some(
                  (task) => task.id === optimisticId
                )
              )
            ) {
              return;
            }
            commitBoardState(
              replaceTaskById(prevTasksByStatus, realTask, optimisticId)
            );
          }}
          onAddTaskError={(params) => {
            setErrorDialog({
              open: true,
              title: t('mutation_error.title'),
              message: params.message,
              optimisticId: params.optimisticId,
              onTryAgain: async () => {
                const result = await params.retry();
                if (result?.error) throw new Error(result.error);
                if (result?.data && params.optimisticId) {
                  const prevTasksByStatus = tasksByStatusRef.current;
                  if (
                    BOARD_STATUSES.some((status) =>
                      prevTasksByStatus[status].some(
                        (task) => task.id === params.optimisticId
                      )
                    )
                  ) {
                    commitBoardState(
                      replaceTaskById(
                        prevTasksByStatus,
                        result.data,
                        params.optimisticId
                      )
                    );
                  }
                }
              },
              onCancel: () => {
                if (params.optimisticId) {
                  handleTaskDeleted(params.optimisticId);
                }
              },
            });
          }}
        />
      </div>
      {permissions.canCreate && (
        <AddTaskModal
          isOpen={isAddTaskOpen}
          onClose={() => setIsAddTaskOpen(false)}
          onTaskAdded={(createdTask) => {
            const prevTasksByStatus = tasksByStatusRef.current;
            const nextTasksByStatus = { ...prevTasksByStatus };
            const status = createdTask.status;
            nextTasksByStatus[status] = sortTasksByOrder([
              ...nextTasksByStatus[status].filter(
                (task) => task.id !== createdTask.id
              ),
              createdTask,
            ]);
            const nextCounts = reconcileStatusCounts(
              countsRef.current,
              prevTasksByStatus,
              nextTasksByStatus
            );
            commitBoardState(nextTasksByStatus, nextCounts);
            setIsAddTaskOpen(false);
          }}
          onTaskConfirmed={(realTask, optimisticId) => {
            const prevTasksByStatus = tasksByStatusRef.current;
            if (
              !BOARD_STATUSES.some((status) =>
                prevTasksByStatus[status].some(
                  (task) => task.id === optimisticId
                )
              )
            ) {
              return;
            }
            commitBoardState(
              replaceTaskById(prevTasksByStatus, realTask, optimisticId)
            );
          }}
          onAddError={(params) => {
            setErrorDialog({
              open: true,
              title: t('mutation_error.title'),
              message: params.message,
              optimisticId: params.optimisticId,
              onTryAgain: async () => {
                const result = await params.retry();
                if (result?.error) throw new Error(result.error);
                if (result?.data && params.optimisticId) {
                  const prevTasksByStatus = tasksByStatusRef.current;
                  if (
                    BOARD_STATUSES.some((status) =>
                      prevTasksByStatus[status].some(
                        (task) => task.id === params.optimisticId
                      )
                    )
                  ) {
                    commitBoardState(
                      replaceTaskById(
                        prevTasksByStatus,
                        result.data,
                        params.optimisticId
                      )
                    );
                  }
                }
              },
              onCancel: () => {
                if (params.optimisticId) {
                  handleTaskDeleted(params.optimisticId);
                }
              },
            });
          }}
          defaultProjectId={projectId}
          defaultStatus={selectedTab}
          canAssign={permissions.canAssign}
          projectMembers={permissions.canAssign ? projectMembers : undefined}
          currentUserId={currentUserId}
        />
      )}
      {errorDialog && (
        <MutationErrorDialog
          open={errorDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              errorDialog.onCancel();
              setErrorDialog(null);
            }
          }}
          title={errorDialog.title}
          message={errorDialog.message}
          onTryAgain={errorDialog.onTryAgain}
          onCancel={errorDialog.onCancel}
        />
      )}
      {/* FAB: Add task — mobile only; desktop uses per-column add at top */}
      {permissions.canCreate && (
        <button
          type="button"
          onClick={() => setIsAddTaskOpen(true)}
          aria-label={t('tasks.add_task')}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:bottom-8 md:right-8 lg:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </>
  );
}
